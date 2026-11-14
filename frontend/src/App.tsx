import environmentalFamilies from './contracts/environmentalFamilies.json';
import { Select } from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { type ComponentProps, useEffect, useRef, useState } from 'react';
import createPlotlyComponent from 'react-plotly.js/factory';
import Plotly from 'plotly.js-basic-dist-min';
import type {
  ConfidenceTier,
  RegionAnalysisResponse,
  RegionSelection,
  RegionSlot,
  RegimeShape,
  VariableId,
  VariableStatistics,
} from './contracts/types';
import { isValidVariableId, VARIABLE_LIST } from './contracts/catalog';
import { buildRegionSelection, snapCoordToCell } from './geo/gridGeometry';
import { MapWorkspace } from './map/MapWorkspace';
import { getBackendCatalog, getRegionData } from './services/regionDataAdapter';
import './bench.css';

const Plot = createPlotlyComponent(Plotly);
type PlotTraces = NonNullable<ComponentProps<typeof Plot>['data']>;
type MetricMode = 'anomaly' | 'raw' | 'zscore';
type ScaleMode = 'linear' | 'symlog';
type ViewMode = 'timeseries' | 'scatter' | 'both';

interface StoryPreset {
  readonly id: string;
  readonly label: string;
  readonly summary: string;
  readonly variableA: VariableId;
  readonly variableB: VariableId;
  readonly startDate: string;
  readonly endDate: string;
  readonly coordsA: readonly (readonly [number, number])[];
  readonly coordsB: readonly (readonly [number, number])[];
}

const STORY_PRESETS: readonly StoryPreset[] = [
  {
    id: 'caso-1',
    label: 'Caso 1 · Cerrado vs. Amazônia',
    summary: 'Umidade radicular (GWETROOT): MATOPIBA vs. Amazônia Central (1981–2024)',
    variableA: 'GWETROOT',
    variableB: 'GWETROOT',
    startDate: '1981-01',
    endDate: '2024-12',
    coordsA: [[-12.0, -45.625], [-12.0, -45.0], [-11.5, -45.625], [-11.5, -45.0]],
    coordsB: [[-3.0, -60.0], [-3.0, -59.375], [-2.5, -60.0], [-2.5, -59.375]],
  },
  {
    id: 'caso-2',
    label: 'Caso 2 · Calor & Seca (MG)',
    summary: 'Acoplamento local (A = B): T2M_MAX vs. GWETROOT em Minas Gerais (1981–2024)',
    variableA: 'T2M_MAX',
    variableB: 'GWETROOT',
    startDate: '1981-01',
    endDate: '2024-12',
    coordsA: [[-19.5, -48.125], [-19.5, -47.5], [-19.0, -48.125], [-19.0, -47.5]],
    coordsB: [[-19.5, -48.125], [-19.5, -47.5], [-19.0, -48.125], [-19.0, -47.5]],
  },
  {
    id: 'caso-3',
    label: 'Caso 3 · Teleconexão Equatorial',
    summary: 'Paradoxo multiescala: T2M (Foz Amazônica) vs. PRECTOTCORR (Bacia Xingu/Tapajós)',
    variableA: 'T2M',
    variableB: 'PRECTOTCORR',
    startDate: '1981-01',
    endDate: '2024-12',
    coordsA: [[-1.5, -51.25], [-1.5, -50.625], [-1.0, -51.25], [-1.0, -50.625]],
    coordsB: [[-3.5, -52.5], [-3.5, -51.875], [-3.0, -52.5], [-3.0, -51.875]],
  },
];

function buildPresetRegion(
  slot: RegionSlot,
  variableId: VariableId,
  coords: readonly (readonly [number, number])[],
): RegionSelection {
  const uniqueCells = new Map<string, ReturnType<typeof snapCoordToCell>>();
  for (const [lat, lon] of coords) {
    const cell = snapCoordToCell(lat, lon, variableId);
    uniqueCells.set(cell.cell_id, cell);
  }
  return buildRegionSelection(slot, variableId, [...uniqueCells.values()]);
}

function toSymlog(val: number): number {
  return Math.sign(val) * Math.log1p(Math.abs(val));
}

function applyScale(val: number | null, scaleMode: ScaleMode): number | null {
  if (val === null || !Number.isFinite(val)) return null;
  return scaleMode === 'symlog' ? toSymlog(val) : val;
}

function computeMeanStd(values: readonly (number | null)[]): { mean: number; std: number } {
  const valid = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (valid.length === 0) return { mean: 0, std: 1 };
  const mean = valid.reduce((acc, v) => acc + v, 0) / valid.length;
  if (valid.length < 2) return { mean, std: 1 };
  const variance = valid.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (valid.length - 1);
  const std = Math.sqrt(variance);
  return { mean, std: std > 1e-12 ? std : 1 };
}

interface TransformedRegionSeries {
  readonly dates: readonly string[];
  readonly xDates: readonly string[];
  readonly yMain: readonly (number | null)[];
  readonly rawHoverValues: readonly (number | null)[];
  readonly yOls: readonly (number | null)[];
  readonly ySen: readonly (number | null)[] | null;
  readonly yGam: readonly (number | null)[];
  readonly outliers: readonly {
    readonly xDate: string;
    readonly date: string;
    readonly yPlot: number;
    readonly observedDisplay: number;
    readonly mahalanobisD: number;
    readonly diagnosticHint: string;
  }[];
  readonly unitLabel: string;
}

function transformRegionSeries(
  region: VariableStatistics,
  indices: readonly number[],
  metricMode: MetricMode,
  scaleMode: ScaleMode,
): TransformedRegionSeries {
  const { series } = region;
  const rawStats = computeMeanStd(series.raw_values);
  const anomStats = computeMeanStd(series.anomaly_values);

  const convertVal = (anomOrRawVal: number | null, isRawMain = false): number | null => {
    if (anomOrRawVal === null || !Number.isFinite(anomOrRawVal)) return null;
    if (metricMode === 'raw') {
      return isRawMain ? anomOrRawVal : anomOrRawVal - anomStats.mean + rawStats.mean;
    }
    if (metricMode === 'zscore') {
      return (anomOrRawVal - anomStats.mean) / anomStats.std;
    }
    return anomOrRawVal;
  };

  const mapIndices = (arr: readonly (number | null)[], isRawMain = false) =>
    indices.map(i => convertVal(arr[i] ?? null, isRawMain));

  const mainDisplay = metricMode === 'raw'
    ? mapIndices(series.raw_values, true)
    : metricMode === 'zscore' && series.z_scores
      ? indices.map(i => series.z_scores?.[i] ?? null)
      : mapIndices(series.anomaly_values, false);

  const olsDisplay = mapIndices(series.linear_fit, false);
  const senDisplay = series.sen_fit ? mapIndices(series.sen_fit, false) : null;
  const gamDisplay = mapIndices(series.gam_smooth_fit, false);

  const dateIndexMap = new Map<string, number>();
  indices.forEach((origIdx, pos) => {
    const d = series.dates[origIdx];
    if (d) dateIndexMap.set(d, pos);
  });

  const outliers = region.outliers_mahalanobis.flatMap(outlier => {
    const pos = dateIndexMap.get(outlier.date);
    if (pos === undefined) return [];
    const obsDisplay = metricMode === 'raw'
      ? (mainDisplay[pos] ?? convertVal(outlier.observed_anomaly, false) ?? 0)
      : (convertVal(outlier.observed_anomaly, false) ?? 0);
    const yPlot = applyScale(obsDisplay, scaleMode);
    if (yPlot === null) return [];
    return [{
      xDate: `${outlier.date}-01`,
      date: outlier.date,
      yPlot,
      observedDisplay: obsDisplay,
      mahalanobisD: outlier.mahalanobis_d,
      diagnosticHint: outlier.diagnostic_hint,
    }];
  });

  const baseUnit = metricMode === 'zscore'
    ? 'Desvios-Padrão (σ)'
    : metricMode === 'anomaly'
      ? `${region.unit} (anomalia)`
      : region.unit;

  return {
    dates: indices.map(i => series.dates[i] ?? ''),
    xDates: indices.map(i => `${series.dates[i] ?? ''}-01`),
    yMain: mainDisplay.map(v => applyScale(v, scaleMode)),
    rawHoverValues: mainDisplay,
    yOls: olsDisplay.map(v => applyScale(v, scaleMode)),
    ySen: senDisplay ? senDisplay.map(v => applyScale(v, scaleMode)) : null,
    yGam: gamDisplay.map(v => applyScale(v, scaleMode)),
    outliers,
    unitLabel: scaleMode === 'symlog' ? `symlog(${baseUnit})` : baseUnit,
  };
}

function computeMahalanobisContourAndFit(
  pairs: readonly { readonly x: number; readonly y: number }[],
  threshold = 2.5,
): { ellipseX: number[]; ellipseY: number[]; fitX: number[]; fitY: number[] } | null {
  const n = pairs.length;
  if (n < 3) return null;

  let mx = 0;
  let my = 0;
  for (const p of pairs) {
    mx += p.x;
    my += p.y;
  }
  mx /= n;
  my /= n;

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  let xMin = Infinity;
  let xMax = -Infinity;
  for (const p of pairs) {
    const dx = p.x - mx;
    const dy = p.y - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
    if (p.x < xMin) xMin = p.x;
    if (p.x > xMax) xMax = p.x;
  }
  sxx /= n - 1;
  syy /= n - 1;
  sxy /= n - 1;

  const trace = sxx + syy;
  const disc = Math.sqrt(Math.max(0, (sxx - syy) ** 2 + 4 * sxy * sxy));
  const lambda1 = Math.max(1e-12, 0.5 * (trace + disc));
  const lambda2 = Math.max(1e-12, 0.5 * (trace - disc));
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  const ellipseX: number[] = [];
  const ellipseY: number[] = [];
  const steps = 120;
  for (let i = 0; i <= steps; i += 1) {
    const theta = (2 * Math.PI * i) / steps;
    const u = threshold * Math.sqrt(lambda1) * Math.cos(theta);
    const v = threshold * Math.sqrt(lambda2) * Math.sin(theta);
    ellipseX.push(mx + u * cosA - v * sinA);
    ellipseY.push(my + u * sinA + v * cosA);
  }

  const slope = sxx > 1e-12 ? sxy / sxx : 0;
  const intercept = my - slope * mx;
  return {
    ellipseX,
    ellipseY,
    fitX: [xMin, xMax],
    fitY: [intercept + slope * xMin, intercept + slope * xMax],
  };
}

function translateRegimeShape(shape: RegimeShape): string {
  switch (shape) {
    case 'accelerating_rise':
      return 'Aceleração Positiva (subida não-linear agravada)';
    case 'accelerating_decline':
      return 'Declínio Acelerado (perda não-linear agravada)';
    case 'saturating':
      return 'Saturação / Desaceleração (platô assintótico)';
    case 'non_monotonic':
      return 'Regime Não-Monotônico / Oscilatório';
    case 'linear':
    default:
      return 'Tendência Linear Estável';
  }
}

function getConfidenceBadge(tier: ConfidenceTier): { emoji: string; label: string; badgeClass: string } {
  switch (tier) {
    case 'CONFIRMED_HIGH':
      return { emoji: '🟢', label: 'Confirmada (Alta Confiança)', badgeClass: 'tier-high' };
    case 'CONFIRMED_MODERATE':
      return { emoji: '🟡', label: 'Moderada (AR1 + FDR)', badgeClass: 'tier-moderate' };
    case 'INSUFFICIENT_SIGNAL':
      return { emoji: '⚪', label: 'Sinal Insuficiente', badgeClass: 'tier-low' };
    case 'NO_TREND':
    default:
      return { emoji: '⚪', label: 'Ruído / Sem Tendência', badgeClass: 'tier-low' };
  }
}

function formatSigned(val: number, digits = 3): string {
  const fixed = val.toFixed(digits);
  return val > 0 ? `+${fixed}` : fixed;
}

function formatPValue(val: number): string {
  if (val < 0.0001) return '< 0.0001';
  return val.toFixed(4);
}

const supportedVariables = new Set<string>(VARIABLE_LIST.map(variable => variable.variable_id));
const fallbackVariableOptions = environmentalFamilies.map(({ group, items }) => ({
  group,
  items: items.map(option => ({
    ...option,
    disabled: !supportedVariables.has(option.value),
  })),
}));

export default function App() {
  const [analysis, setAnalysis] = useState<RegionAnalysisResponse>();
  const [variableOptions, setVariableOptions] = useState(fallbackVariableOptions);
  const [catalogError, setCatalogError] = useState('');
  const [tab, setTab] = useState<'map' | 'bench'>('map');
  const [variableA, setVariableA] = useState('GWETTOP');
  const [variableB, setVariableB] = useState('T2M_MAX');
  const [regionA, setRegionA] = useState<RegionSelection | null>(null);
  const [regionB, setRegionB] = useState<RegionSelection | null>(null);
  const [startMonth, setStartMonth] = useState('');
  const [endMonth, setEndMonth] = useState('');
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const analysisControllerRef = useRef<AbortController | null>(null);

  const metadataA = VARIABLE_LIST.find(variable => variable.variable_id === variableA);
  const metadataB = VARIABLE_LIST.find(variable => variable.variable_id === variableB);
  const minimumMonth = metadataA && metadataB
    ? `${Math.max(metadataA.min_year, metadataB.min_year)}-01`
    : '';
  const maximumMonth = `${new Date().getUTCFullYear()}-12`;
  const start = startMonth >= minimumMonth && startMonth <= maximumMonth ? startMonth : '';
  const end = endMonth >= (start || minimumMonth) && endMonth <= maximumMonth ? endMonth : '';
  const periodReady = Boolean(minimumMonth && start && end);

  // Controles completos de visualização da Bancada Científica (liberdade para o cientista)
  const [metricMode, setMetricMode] = useState<MetricMode>('anomaly');
  const [scaleMode, setScaleMode] = useState<ScaleMode>('linear');
  const [viewMode, setViewMode] = useState<ViewMode>('timeseries');
  const [separate, setSeparate] = useState(false);
  const [dual, setDual] = useState(true);
  const [showOls, setShowOls] = useState(true);
  const [showSen, setShowSen] = useState(true);
  const [showGam, setShowGam] = useState(true);
  const [showMahalanobis, setShowMahalanobis] = useState(true);
  const [showDiagnostics, setShowDiagnostics] = useState(true);

  function handleSelectVariableA(nextVar: string) {
    setVariableA(nextVar);
    setActivePresetId(null);
    setRegionA(prev => (prev && prev.variable_id === nextVar ? prev : null));
  }

  function handleSelectVariableB(nextVar: string) {
    setVariableB(nextVar);
    setActivePresetId(null);
    setRegionB(prev => (prev && prev.variable_id === nextVar ? prev : null));
  }

  // Qualquer mudança no formulário espacial/temporal invalida a análise anterior.
  useEffect(() => {
    setAnalysis(undefined);
    setAnalysisError('');
  }, [variableA, variableB, start, end, regionA, regionB]);

  useEffect(() => {
    const controller = new AbortController();
    getBackendCatalog(controller.signal)
      .then(catalog => setVariableOptions(catalog.families.map(family => ({
        group: family.name,
        items: family.variables.map(variable => ({
          value: variable.code,
          label: variable.ui_name,
          disabled: variable.connector_id !== 'nasa_power' || variable.mode !== 'realtime' || !isValidVariableId(variable.code),
        })),
      }))))
      .catch(catalogRequestError => {
        if (!controller.signal.aborted) {
          setCatalogError(catalogRequestError instanceof Error ? catalogRequestError.message : 'Catálogo indisponível.');
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => () => analysisControllerRef.current?.abort(), []);

  async function runAnalysisRequest(params: {
    varA: VariableId;
    varB: VariableId;
    regA: RegionSelection;
    regB: RegionSelection;
    startDate: string;
    endDate: string;
  }) {
    analysisControllerRef.current?.abort();
    const controller = new AbortController();
    analysisControllerRef.current = controller;
    setIsAnalyzing(true);
    setAnalysisError('');

    try {
      const result = await getRegionData({
        variable: params.varA,
        variableB: params.varB,
        region: params.regA,
        regionB: params.regB,
        startDate: params.startDate,
        endDate: params.endDate,
        signal: controller.signal,
      });
      setAnalysis(result);
      setTab('bench');
    } catch (requestError) {
      if (!controller.signal.aborted) {
        setAnalysisError(requestError instanceof Error ? requestError.message : 'Não foi possível analisar a seleção.');
      }
    } finally {
      if (analysisControllerRef.current === controller) {
        analysisControllerRef.current = null;
        setIsAnalyzing(false);
      }
    }
  }

  async function analyzeSelection() {
    if (!variableA || !variableB || !regionA || !regionB || !periodReady) return;
    await runAnalysisRequest({
      varA: variableA as VariableId,
      varB: variableB as VariableId,
      regA: regionA,
      regB: regionB,
      startDate: start,
      endDate: end,
    });
  }

  async function handleApplyPreset(preset: StoryPreset) {
    const nextRegA = buildPresetRegion('A', preset.variableA, preset.coordsA);
    const nextRegB = buildPresetRegion('B', preset.variableB, preset.coordsB);
    setActivePresetId(preset.id);
    setVariableA(preset.variableA);
    setVariableB(preset.variableB);
    setStartMonth(preset.startDate);
    setEndMonth(preset.endDate);
    setRegionA(nextRegA);
    setRegionB(nextRegB);

    await runAnalysisRequest({
      varA: preset.variableA,
      varB: preset.variableB,
      regA: nextRegA,
      regB: nextRegB,
      startDate: preset.startDate,
      endDate: preset.endDate,
    });
  }

  // Associação posicional garante suporte correto quando Região A e B usam a mesma variável (Caso 1)
  const regions: readonly (VariableStatistics & { readonly slot: 'A' | 'B' })[] = [
    analysis?.region_a_analysis && analysis.region_a_analysis.variable_id === variableA
      ? { ...analysis.region_a_analysis, slot: 'A' as const }
      : null,
    analysis?.region_b_analysis && analysis.region_b_analysis.variable_id === variableB
      ? { ...analysis.region_b_analysis, slot: 'B' as const }
      : null,
  ].filter((item): item is VariableStatistics & { readonly slot: 'A' | 'B' } => item !== null);

  const missing = [
    { slot: 'A', id: variableA, found: analysis?.region_a_analysis?.variable_id === variableA },
    { slot: 'B', id: variableB, found: analysis?.region_b_analysis?.variable_id === variableB },
  ].filter(item => Boolean(item.id) && !item.found);

  const isZScore = metricMode === 'zscore';
  const effectiveDual = !isZScore && dual;
  const mixed = !isZScore && regions.length > 1 && regions[0]?.unit !== regions[1]?.unit;
  const stacked = separate || (mixed && !effectiveDual);
  const months = regions.flatMap(region => region.series.dates).sort();
  const firstMonth = periodReady ? start : months[0];
  const lastMonth = periodReady ? end : months.at(-1);
  const firstDate = firstMonth ? `${firstMonth}-01` : undefined;
  const lastDate = lastMonth
    ? new Date(Date.UTC(Number(lastMonth.slice(0, 4)), Number(lastMonth.slice(5, 7)), 0)).toISOString().slice(0, 10)
    : undefined;
  const hasPoints = months.some(month => !periodReady || (month >= start && month <= end));
  const isOfflineAnalysis = analysis?.request_meta.source === 'offline_fallback';

  const transformedByRegion = regions.map(region => {
    const indices = region.series.dates.flatMap((month, i) =>
      !periodReady || (month >= start && month <= end) ? [i] : [],
    );
    return {
      region,
      transformed: transformRegionSeries(region, indices, metricMode, scaleMode),
    };
  });

  const timeSeriesTraces: PlotTraces = transformedByRegion.flatMap(({ region, transformed }, index) => {
    const color = region.slot === 'A' ? '#67e8f9' : '#fbbf24';
    const gamColor = region.slot === 'A' ? '#22d3ee' : '#fb923c';
    const outlierColor = region.slot === 'A' ? '#f87171' : '#f472b6';
    const name = `${region.slot} · ${region.variable_name}`;
    const axis = index === 1 && (effectiveDual || stacked) ? 'y2' : 'y';

    const traces: PlotTraces[number][] = [
      {
        x: [...transformed.xDates],
        y: [...transformed.yMain],
        customdata: [...transformed.rawHoverValues],
        name,
        type: 'scatter',
        mode: 'lines',
        yaxis: axis,
        line: { color, width: 1.6 },
        hovertemplate: `${name}<br>%{x|%Y-%m}: %{customdata:.4f}<extra></extra>`,
      },
    ];

    if (showOls) {
      traces.push({
        x: [...transformed.xDates],
        y: [...transformed.yOls],
        name: `${region.slot} · OLS (${formatSigned(region.regression.slope_per_decade_ols)}/déc)`,
        type: 'scatter',
        mode: 'lines',
        yaxis: axis,
        line: { color, dash: 'dot', width: 2 },
      });
    }

    if (showSen && transformed.ySen) {
      traces.push({
        x: [...transformed.xDates],
        y: [...transformed.ySen],
        name: `${region.slot} · Theil–Sen (${formatSigned(region.regression.slope_per_decade_sen)}/déc)`,
        type: 'scatter',
        mode: 'lines',
        yaxis: axis,
        line: { color, dash: 'dash', width: 2.2 },
      });
    }

    if (showGam) {
      traces.push({
        x: [...transformed.xDates],
        y: [...transformed.yGam],
        name: `${region.slot} · GAM / Spline`,
        type: 'scatter',
        mode: 'lines',
        yaxis: axis,
        line: { color: gamColor, width: 2.6 },
      });
    }

    if (showMahalanobis && transformed.outliers.length > 0) {
      traces.push({
        x: transformed.outliers.map(o => o.xDate),
        y: transformed.outliers.map(o => o.yPlot),
        customdata: transformed.outliers.map(o => [o.mahalanobisD, o.observedDisplay, o.diagnosticHint]),
        name: `${region.slot} · Outliers Mahalanobis (D_M > 2,5)`,
        type: 'scatter',
        mode: 'markers',
        yaxis: axis,
        marker: {
          color: outlierColor,
          size: 9,
          symbol: 'diamond',
          line: { color: '#0a1422', width: 1.2 },
        },
        hovertemplate:
          `<b>Outlier ${region.slot} (%{x|%Y-%m})</b><br>` +
          'D_M = %{customdata[0]:.2f}<br>' +
          'Valor observado = %{customdata[1]:.4f}<br>' +
          '%{customdata[2]}<extra></extra>',
      });
    }

    return traces;
  });

  // Gráfico de Dispersão Bivariada (X vs. Y) + Elipse de Contorno de Mahalanobis (D_M = 2,5)
  const scatterBundle = (() => {
    if (transformedByRegion.length < 2) return null;
    const itemA = transformedByRegion[0];
    const itemB = transformedByRegion[1];
    if (!itemA || !itemB) return null;

    const mapB = new Map<string, number>();
    itemB.transformed.dates.forEach((d, pos) => {
      const yVal = itemB.transformed.yMain[pos];
      if (d && yVal !== null && yVal !== undefined) mapB.set(d, yVal);
    });

    const outlierHintsByDate = new Map<string, string>();
    for (const o of itemA.region.outliers_mahalanobis) {
      outlierHintsByDate.set(o.date, `Outlier A (D_M=${o.mahalanobis_d.toFixed(2)}): ${o.diagnostic_hint}`);
    }
    for (const o of itemB.region.outliers_mahalanobis) {
      const prev = outlierHintsByDate.get(o.date);
      const msg = `Outlier B (D_M=${o.mahalanobis_d.toFixed(2)}): ${o.diagnostic_hint}`;
      outlierHintsByDate.set(o.date, prev ? `${prev}<br>${msg}` : msg);
    }

    const normalPts: { date: string; x: number; y: number }[] = [];
    const outlierPts: { date: string; x: number; y: number; hint: string }[] = [];
    const allPairs: { x: number; y: number }[] = [];

    itemA.transformed.dates.forEach((d, pos) => {
      const xVal = itemA.transformed.yMain[pos];
      const yVal = mapB.get(d);
      if (xVal === null || xVal === undefined || yVal === undefined) return;
      allPairs.push({ x: xVal, y: yVal });
      const hint = outlierHintsByDate.get(d);
      if (hint) {
        outlierPts.push({ date: d, x: xVal, y: yVal, hint });
      } else {
        normalPts.push({ date: d, x: xVal, y: yVal });
      }
    });

    const geometry = computeMahalanobisContourAndFit(allPairs, 2.5);
    if (!geometry) return null;

    const scatterTraces: PlotTraces = [
      {
        x: normalPts.map(p => p.x),
        y: normalPts.map(p => p.y),
        text: normalPts.map(p => p.date),
        name: `Observações (${allPairs.length} meses)`,
        type: 'scatter',
        mode: 'markers',
        marker: { color: '#67e8f9', size: 6, opacity: 0.72 },
        hovertemplate: 'Mês: %{text}<br>X (A): %{x:.4f}<br>Y (B): %{y:.4f}<extra></extra>',
      },
      ...(showMahalanobis && outlierPts.length > 0 ? [{
        x: outlierPts.map(p => p.x),
        y: outlierPts.map(p => p.y),
        customdata: outlierPts.map(p => [p.date, p.hint]),
        name: `Extremos Bivariados (D_M > 2,5)`,
        type: 'scatter' as const,
        mode: 'markers' as const,
        marker: { color: '#f87171', size: 10, symbol: 'diamond', line: { color: '#0a1422', width: 1.2 } },
        hovertemplate: '<b>%{customdata[0]}</b><br>X: %{x:.4f} | Y: %{y:.4f}<br>%{customdata[1]}<extra></extra>',
      }] : []),
      {
        x: geometry.ellipseX,
        y: geometry.ellipseY,
        name: 'Elipse de Mahalanobis (D_M = 2,5)',
        type: 'scatter',
        mode: 'lines',
        line: { color: '#fb923c', width: 2, dash: 'dash' },
      },
      {
        x: geometry.fitX,
        y: geometry.fitY,
        name: 'Acoplamento Linear OLS (X vs. Y)',
        type: 'scatter',
        mode: 'lines',
        line: { color: '#fbbf24', width: 2 },
      },
    ];

    return {
      traces: scatterTraces,
      xTitle: `A · ${itemA.region.variable_id} [${itemA.transformed.unitLabel}]`,
      yTitle: `B · ${itemB.region.variable_id} [${itemB.transformed.unitLabel}]`,
    };
  })();

  const primaryUnitLabel = transformedByRegion[0]?.transformed.unitLabel ?? '';
  const secondaryUnitLabel = transformedByRegion[1]?.transformed.unitLabel ?? '';

  return (
    <main>
      <header className="brand-header">
        <img className="brand-logo" src="/flipflop-34-logo.jpeg" alt="" aria-hidden="true" />
        <h1>Project Flipflop 34</h1>
      </header>
      <div className="workspace">
        <aside aria-label="Catálogo de variáveis">
          <h2>Variáveis</h2>
          {catalogError && <p className="catalog-warning" role="alert">{catalogError} Usando catálogo local.</p>}
          {([
            { slot: 'A', value: variableA, onChange: handleSelectVariableA },
            { slot: 'B', value: variableB, onChange: handleSelectVariableB },
          ]).map(({ slot, value, onChange }) => (
            <Select key={slot} className="variable-picker"
              classNames={{ input: 'selection-input', dropdown: 'selection-dropdown', option: 'selection-option' }}
              label={`Variável ${slot}`} placeholder="Buscar variável"
              data={variableOptions} searchable clearable clearSectionMode="clear"
              clearButtonProps={{ 'aria-label': `Limpar variável ${slot}` }} nothingFoundMessage="Nenhuma variável encontrada"
              value={value || null} onChange={id => onChange(id ?? '')}
              comboboxProps={{ width: 310, position: 'bottom-start', withinPortal: true, zIndex: 1100 }}
              maxDropdownHeight={340} />
          ))}
          <fieldset className="period-picker" disabled={!minimumMonth}>
            <legend>Período</legend>
            <MonthPickerInput className="variable-picker" classNames={{ input: 'selection-input' }} label="Mês inicial" placeholder="Selecione o mês"
              locale="pt-br" valueFormat="MMMM [de] YYYY" clearable disabled={!minimumMonth}
              popoverProps={{ withinPortal: true, zIndex: 1100 }}
              minDate={minimumMonth ? `${minimumMonth}-01` : undefined} maxDate={`${maximumMonth}-01`}
              value={start ? `${start}-01` : null} onChange={value => { setActivePresetId(null); setStartMonth(value?.slice(0, 7) ?? ''); }} />
            <MonthPickerInput className="variable-picker" classNames={{ input: 'selection-input' }} label="Mês final" placeholder="Selecione o mês"
              locale="pt-br" valueFormat="MMMM [de] YYYY" clearable disabled={!minimumMonth}
              popoverProps={{ withinPortal: true, zIndex: 1100 }}
              minDate={minimumMonth ? `${start || minimumMonth}-01` : undefined} maxDate={`${maximumMonth}-01`}
              value={end ? `${end}-01` : null} onChange={value => { setActivePresetId(null); setEndMonth(value?.slice(0, 7) ?? ''); }} />
          </fieldset>
          <section className="preset-picker" aria-label="Casos Clássicos de Demonstração">
            <h3>Casos Clássicos (1 clique)</h3>
            <div className="preset-list">
              {STORY_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  type="button"
                  className={activePresetId === preset.id ? 'preset-btn active' : 'preset-btn'}
                  title={preset.summary}
                  disabled={isAnalyzing}
                  onClick={() => void handleApplyPreset(preset)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </section>
        </aside>
        <div className="exploration">
          <nav aria-label="Área de trabalho">
            <button aria-current={tab === 'map' ? 'page' : undefined} onClick={() => setTab('map')}>Mapa</button>
            <button aria-current={tab === 'bench' ? 'page' : undefined} onClick={() => setTab('bench')}>Bancada científica</button>
          </nav>
          {tab === 'map' ? <MapWorkspace
            variableA={variableA ? variableA as VariableId : null}
            variableB={variableB ? variableB as VariableId : null}
            periodReady={periodReady}
            regionA={regionA}
            regionB={regionB}
            onRegionAChange={setRegionA}
            onRegionBChange={setRegionB}
            isAnalyzing={isAnalyzing}
            analysisError={analysisError}
            onAnalyze={analyzeSelection}
          /> : (
      <section className="bench-panel" aria-label="Séries temporais e diagnóstico científico">
        <div className="bench-toolbar">
          <div className="segmented-group" role="group" aria-label="Grandeza de exibição">
            <span className="group-label">Grandeza</span>
            <button type="button" className={metricMode === 'anomaly' ? 'seg-btn active' : 'seg-btn'} onClick={() => setMetricMode('anomaly')}>
              Anomalia
            </button>
            <button type="button" className={metricMode === 'raw' ? 'seg-btn active' : 'seg-btn'} onClick={() => setMetricMode('raw')}>
              Dado Bruto
            </button>
            <button type="button" className={metricMode === 'zscore' ? 'seg-btn active' : 'seg-btn'} onClick={() => setMetricMode('zscore')}>
              Z-Score (σ)
            </button>
          </div>

          <div className="segmented-group" role="group" aria-label="Escala vertical">
            <span className="group-label">Escala</span>
            <button type="button" className={scaleMode === 'linear' ? 'seg-btn active' : 'seg-btn'} onClick={() => setScaleMode('linear')}>
              Linear
            </button>
            <button type="button" className={scaleMode === 'symlog' ? 'seg-btn active' : 'seg-btn'} onClick={() => setScaleMode('symlog')}>
              Symlog
            </button>
          </div>

          <div className="segmented-group" role="group" aria-label="Tipo de gráfico">
            <span className="group-label">Visualização</span>
            <button type="button" className={viewMode === 'timeseries' ? 'seg-btn active' : 'seg-btn'} onClick={() => setViewMode('timeseries')}>
              Série Temporal
            </button>
            <button type="button" className={viewMode === 'scatter' ? 'seg-btn active' : 'seg-btn'} disabled={!scatterBundle} onClick={() => setViewMode('scatter')}>
              Dispersão X vs Y
            </button>
            <button type="button" className={viewMode === 'both' ? 'seg-btn active' : 'seg-btn'} disabled={!scatterBundle} onClick={() => setViewMode('both')}>
              Visão Dupla
            </button>
          </div>

          <button
            type="button"
            className="diag-toggle-btn"
            onClick={() => setShowDiagnostics(prev => !prev)}
            aria-expanded={showDiagnostics}
          >
            {showDiagnostics ? 'Ocultar 4 Respostas do Detetive' : 'Mostrar 4 Respostas do Detetive'}
          </button>
        </div>

        <div className="controls">
          <label><input type="checkbox" checked={separate} onChange={event => setSeparate(event.target.checked)} /> Curvas separadas</label>
          <label><input type="checkbox" checked={effectiveDual} disabled={separate || regions.length < 2 || isZScore} onChange={event => setDual(event.target.checked)} /> Eixo Y duplo</label>
          <label><input type="checkbox" checked={showOls} onChange={event => setShowOls(event.target.checked)} /> Reta OLS</label>
          <label><input type="checkbox" checked={showSen} onChange={event => setShowSen(event.target.checked)} /> Reta Theil–Sen</label>
          <label><input type="checkbox" checked={showGam} onChange={event => setShowGam(event.target.checked)} /> Curva GAM / Spline</label>
          <label><input type="checkbox" checked={showMahalanobis} onChange={event => setShowMahalanobis(event.target.checked)} /> Outliers Mahalanobis (D_M &gt; 2,5)</label>
        </div>

        {analysisError && <p className="map-error" role="alert">{analysisError}</p>}
        {!analysis && (
          <p role="status">
            Defina variáveis, período e regiões no mapa ou escolha um dos <b>Casos Clássicos</b> à esquerda para consultar o motor estatístico.
          </p>
        )}
        {analysis && missing.map(({ slot, id }) => (
          <p className="note" role="status" key={slot}>
            Variável {slot} · {VARIABLE_LIST.find(variable => variable.variable_id === id)?.variable_name}
            {isOfflineAnalysis ? ' não tem série no conjunto offline.' : ' não está presente no resultado atual.'}
          </p>
        ))}
        {analysis && regions.length === 0 && missing.length === 0 && <p>Selecione uma variável para ver a série.</p>}
        {analysis && regions.length > 0 && !hasPoints && <p role="status">O resultado atual não contém dados no período selecionado.</p>}

        {analysis && hasPoints && <>
          <div className={viewMode === 'both' && scatterBundle ? 'charts-grid dual-charts' : 'charts-grid'}>
            {(viewMode === 'timeseries' || viewMode === 'both') && (
              <div className="chart-box">
                <Plot
                  key={`ts-${firstDate}-${lastDate}-${metricMode}-${scaleMode}-${stacked}`}
                  data={timeSeriesTraces}
                  useResizeHandler
                  style={{ width: '100%', height: '100%', minHeight: stacked && regions.length > 1 ? 500 : 350 }}
                  config={{ responsive: true, displaylogo: false }}
                  layout={{
                    autosize: true,
                    paper_bgcolor: '#121e30',
                    plot_bgcolor: '#121e30',
                    font: { color: '#e1edf8' },
                    margin: { l: 75, t: 30, r: 75, b: 95 },
                    xaxis: {
                      type: 'date',
                      range: [firstDate, lastDate],
                      minallowed: firstDate,
                      maxallowed: lastDate,
                      anchor: stacked && regions.length > 1 ? 'y2' : 'y',
                    },
                    yaxis: {
                      title: { text: primaryUnitLabel },
                      automargin: true,
                      domain: stacked && regions.length > 1 ? [0.55, 1] : [0, 1],
                    },
                    yaxis2: stacked
                      ? { title: { text: secondaryUnitLabel }, automargin: true, domain: [0, 0.45], anchor: 'x' }
                      : { title: { text: secondaryUnitLabel }, automargin: true, overlaying: 'y', side: 'right' },
                    legend: { orientation: 'h', y: -0.22 },
                  }}
                />
              </div>
            )}

            {(viewMode === 'scatter' || viewMode === 'both') && scatterBundle && (
              <div className="chart-box">
                <Plot
                  key={`sc-${metricMode}-${scaleMode}-${regions.map(r => r.variable_id).join('-')}`}
                  data={scatterBundle.traces}
                  useResizeHandler
                  style={{ width: '100%', height: '100%', minHeight: 350 }}
                  config={{ responsive: true, displaylogo: false }}
                  layout={{
                    autosize: true,
                    title: { text: 'Dispersão Bivariada & Elipse de Mahalanobis (D_M = 2,5)', font: { size: 13 } },
                    paper_bgcolor: '#121e30',
                    plot_bgcolor: '#121e30',
                    font: { color: '#e1edf8' },
                    margin: { l: 75, t: 42, r: 28, b: 85 },
                    xaxis: { title: { text: scatterBundle.xTitle }, automargin: true },
                    yaxis: { title: { text: scatterBundle.yTitle }, automargin: true },
                    legend: { orientation: 'h', y: -0.24 },
                  }}
                />
              </div>
            )}
          </div>

          <p className="note">
            Fonte: {analysis.request_meta.source === 'backend_api' ? 'NASA POWER via backend (stats_engine estado da arte)' : analysis.request_meta.source === 'idb_cache' ? 'cache local (IndexedDB)' : 'dados de demonstração (fallback offline)'}.
            {metricMode === 'raw' && ' Na série bruta, as tendências (OLS / Theil–Sen / GAM) são transladadas para a média histórica para isolar o efeito sazonal.'}
            {isZScore && ' Modo Z-Score (σ) unifica variáveis de unidades distintas no mesmo eixo vertical.'}
          </p>
          {showSen && regions.some(region => !region.series.sen_fit) && (
            <p className="note">A curva Theil–Sen depende do vetor sen_fit fornecido pelo backend.</p>
          )}

          {showDiagnostics && (
            <section className="diagnostic-drawer" aria-label="As 4 Respostas do Detetive e Diagnóstico Multiescala">
              <div className="diag-grid">
                <article className="diag-card">
                  <h4>1. O QUE muda &amp; Regime Físico (GAM)</h4>
                  {regions.map(region => (
                    <div key={region.slot} className="diag-row">
                      <span className={`slot-tag slot-${region.slot.toLowerCase()}`}>Região {region.slot}</span>
                      <strong>{region.variable_name}</strong> <small>({region.variable_id} · {region.unit})</small>
                      <div className="diag-meta">
                        Regime GAM: <b>{translateRegimeShape(region.regression.regime_shape)}</b> · Aceleração B₂: <code>{formatSigned(region.regression.quadratic_acceleration_B2, 5)}</code>
                      </div>
                    </div>
                  ))}
                </article>

                <article className="diag-card">
                  <h4>2. QUANTO muda (Taxa Decadal)</h4>
                  {regions.map(region => (
                    <div key={region.slot} className="diag-row">
                      <span className={`slot-tag slot-${region.slot.toLowerCase()}`}>Região {region.slot}</span>
                      <div>
                        Theil–Sen: <b>{formatSigned(region.regression.slope_per_decade_sen, 4)} {region.trend_unit}</b>{' '}
                        <small>(IC 95%: [{formatSigned(region.regression.slope_ci95_low, 4)}, {formatSigned(region.regression.slope_ci95_high, 4)}])</small>
                      </div>
                      <div className="diag-meta">
                        OLS: <b>{formatSigned(region.regression.slope_per_decade_ols, 4)}</b> · A₀: <code>{region.regression.intercept_at_start_A0.toFixed(3)}</code> · Δ Modelo: <b>{formatSigned(region.regression.cumulative_model_change, 4)} {region.unit}</b>
                      </div>
                      {!region.allow_percentage_change && (
                        <small className="invariant-note">Invariante #3: variação em % bloqueada para {region.variable_id} ({region.scale_type}).</small>
                      )}
                    </div>
                  ))}
                </article>

                <article className="diag-card">
                  <h4>3. É SIGNIFICATIVO? (AR(1) + FDR + Acoplamento)</h4>
                  {regions.map(region => {
                    const badge = getConfidenceBadge(region.significance.confidence_tier);
                    return (
                      <div key={region.slot} className="diag-row">
                        <div className="badge-line">
                          <span className={`slot-tag slot-${region.slot.toLowerCase()}`}>Região {region.slot}</span>
                          <span className={`confidence-badge ${badge.badgeClass}`}>{badge.emoji} {badge.label}</span>
                        </div>
                        <div className="diag-meta">
                          N_bruto = <b>{region.period.n_observations}</b> → N_efetivo(AR1) = <b>{region.period.n_effective_ar1.toFixed(1)}</b><br />
                          p_naive = <code>{formatPValue(region.significance.p_value_naive)}</code> · p_AR1 = <code>{formatPValue(region.significance.p_value_ar1_corrected)}</code> · q_FDR = <code>{formatPValue(region.significance.fdr_q_value)}</code><br />
                          r = <b>{formatSigned(region.correlation_and_coupling.pearson_r, 3)}</b> · τ = <b>{formatSigned(region.correlation_and_coupling.kendall_tau, 3)}</b> · R² = <b>{region.correlation_and_coupling.r_squared.toFixed(3)}</b> · Razão Elipse = <b>{region.correlation_and_coupling.ellipse_aspect_ratio.toFixed(3)}</b><br />
                          Outliers Mahalanobis (D_M &gt; 2,5): <b>{region.outliers_mahalanobis.length}</b>
                          {region.outliers_mahalanobis[0] && (
                            <> — pico em <code>{region.outliers_mahalanobis[0].date}</code> (D_M={region.outliers_mahalanobis[0].mahalanobis_d.toFixed(2)})</>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </article>

                <article className="diag-card">
                  <h4>4. ONDE &amp; Paradoxo Multiescala (A × B)</h4>
                  {analysis.comparison_pair ? (
                    <div className="diag-row">
                      <div className="badge-line">
                        <span className="paradox-badge">{analysis.comparison_pair.multiscale_correlation.paradox_type}</span>
                        {analysis.comparison_pair.spatial_divergence_detected && (
                          <span className="divergence-pill">Divergência Espacial Detectada</span>
                        )}
                      </div>
                      <div className="diag-meta">
                        A: <code>{analysis.comparison_pair.region_a_id}</code> ({analysis.request_meta.cells_count_a} cél.)<br />
                        B: <code>{analysis.comparison_pair.region_b_id}</code> ({analysis.request_meta.cells_count_b || analysis.request_meta.cells_count_a} cél.)<br />
                        r_global (secular) = <b>{formatSigned(analysis.comparison_pair.multiscale_correlation.long_term_secular_r, 3)}</b> ·{' '}
                        r_detrended (curto prazo) = <b>{formatSigned(analysis.comparison_pair.multiscale_correlation.short_term_detrended_r, 3)}</b>
                        {analysis.comparison_pair.slope_difference_per_decade !== null && (
                          <> · Δ Declive (A − B) = <b>{formatSigned(analysis.comparison_pair.slope_difference_per_decade, 4)}</b></>
                        )}
                      </div>
                      <p className="interpretation-box">{analysis.comparison_pair.multiscale_correlation.interpretation}</p>
                    </div>
                  ) : (
                    <p className="diag-meta">Selecione Região A e Região B (ou 2 variáveis no mesmo local) para análise multiescala comparativa.</p>
                  )}
                </article>
              </div>
            </section>
          )}
        </>}
      </section>
          )}
        </div>
      </div>
    </main>
  );
}
