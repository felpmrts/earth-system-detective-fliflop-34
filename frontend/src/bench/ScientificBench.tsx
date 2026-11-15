import { type ComponentProps, type FormEvent, useEffect, useState } from 'react';
import createPlotlyComponent from 'react-plotly.js/factory';
import Plotly from 'plotly.js-basic-dist-min';
import { getVariableMetadata, VARIABLE_LIST } from '../contracts/catalog';
import type {
  CopilotHistoryTurn,
  CopilotResponse,
  RegionAnalysisResponse,
  RegionSelection,
  VariableStatistics,
} from '../contracts/types';
import { exportAnalysisAsCsv, exportAnalysisAsJson } from '../services/dataExporter';
import { CopilotRichText } from './CopilotRichText';
import { askStatisticalCopilot, buildClientCopilotResponse } from '../services/regionDataAdapter';
import {
  auditAnalysisInvariants,
  buildMethodologicalSummaryText,
  computeClientLaggedCrossCorrelation,
  computeClientSeasonalStratifiedTrends,
  MATHEMATICAL_FORMULATIONS,
  type SeasonCode,
} from '../services/scientificInsights';
import {
  computeMahalanobisContourAndFit,
  CONFIDENCE_LABELS,
  countMissingValues,
  formatPValue,
  formatSignedNumber,
  type MetricMode,
  REGIME_LABELS,
  type ScaleMode,
  SCIENTIFIC_GLOSSARY,
  summarizeRegionCoords,
  transformRegionSeries,
  type TrendMode,
  type ViewMode,
} from './benchMeta';

const Plot = createPlotlyComponent(Plotly);
type PlotTraces = NonNullable<ComponentProps<typeof Plot>['data']>;

interface ScientificBenchProps {
  readonly analysis: RegionAnalysisResponse | undefined;
  readonly variableA: string;
  readonly variableB: string;
  readonly regionA: RegionSelection | null;
  readonly regionB: RegionSelection | null;
  readonly start: string;
  readonly end: string;
  readonly periodReady: boolean;
  readonly analyzedAt: string | null;
  readonly anomaly: boolean;
  readonly separate: boolean;
  readonly dual: boolean;
  readonly trendMode: TrendMode;
  readonly onAnomalyChange: (value: boolean) => void;
  readonly onSeparateChange: (value: boolean) => void;
  readonly onDualChange: (value: boolean) => void;
  readonly onTrendModeChange: (value: TrendMode) => void;
  readonly onBackToMap: () => void;
}

const COPILOT_CHIP_ICONS = ['∿', 'σ', '⇄', '⚑', '◎'] as const;

function formatPointValue(val: number | null | undefined, digits = 3): string {
  return val !== null && val !== undefined && Number.isFinite(val) ? val.toFixed(digits) : '—';
}

function BenchExportActions({
  disabled,
  onExportCsv,
  onExportJson,
}: {
  readonly disabled: boolean;
  readonly onExportCsv: () => void;
  readonly onExportJson: () => void;
}) {
  return (
    <>
      <button
        type="button"
        className="glossary-toggle export-action"
        disabled={disabled}
        onClick={onExportCsv}
        title={
          disabled
            ? 'Realize uma análise para habilitar a exportação em CSV'
            : 'Exportar séries temporais e resumo estatístico em CSV científico'
        }
      >
        Exportar CSV
      </button>
      <button
        type="button"
        className="glossary-toggle export-action"
        disabled={disabled}
        onClick={onExportJson}
        title={
          disabled
            ? 'Realize uma análise para habilitar a exportação em JSON'
            : 'Exportar análise completa e metadados estruturados em JSON'
        }
      >
        Exportar JSON
      </button>
    </>
  );
}

function StatSummaryCard({
  slot,
  stats,
  region,
}: {
  readonly slot: 'A' | 'B';
  readonly stats: VariableStatistics;
  readonly region: RegionSelection | null;
}) {
  const confidence =
    CONFIDENCE_LABELS[stats.significance.confidence_tier] ?? CONFIDENCE_LABELS.INSUFFICIENT_SIGNAL;
  const regime = REGIME_LABELS[stats.regression.regime_shape] ?? stats.regression.regime_shape ?? '—';
  const topOutlier = stats.outliers_mahalanobis[0];

  return (
    <article className={`discovery-card discovery-card-${slot.toLowerCase()}`}>
      <div className="discovery-card-head">
        <span className={`slot-label slot-${slot.toLowerCase()}`}>
          <b>{slot}</b> {stats.variable_name}
        </span>
        <span className={`confidence-badge tone-${confidence.tone}`}>{confidence.label}</span>
      </div>
      <p className="discovery-location">{summarizeRegionCoords(region)}</p>
      <dl className="discovery-metrics">
        <div>
          <dt>Taxa Theil–Sen</dt>
          <dd>
            <strong>{formatSignedNumber(stats.regression.slope_per_decade_sen)}</strong>{' '}
            <span>{stats.trend_unit}</span>
          </dd>
        </div>
        <div>
          <dt>Taxa OLS</dt>
          <dd>
            <strong>{formatSignedNumber(stats.regression.slope_per_decade_ols)}</strong>{' '}
            <span>{stats.trend_unit}</span>
          </dd>
        </div>
        <div>
          <dt>Regime GAM</dt>
          <dd>{regime}</dd>
        </div>
        <div>
          <dt>Significância</dt>
          <dd>
            q = {formatPValue(stats.significance.fdr_q_value)} · p<sub>AR(1)</sub> ={' '}
            {formatPValue(stats.significance.p_value_ar1_corrected)}
          </dd>
        </div>
      </dl>
      {topOutlier && (
        <p className="discovery-outlier">
          Extremo (D<sub>M</sub> = {formatPointValue(topOutlier.mahalanobis_d, 2)}): {topOutlier.date} —{' '}
          {topOutlier.diagnostic_hint}
        </p>
      )}
    </article>
  );
}

export function ScientificBench({
  analysis,
  variableA,
  variableB,
  regionA,
  regionB,
  start,
  end,
  periodReady,
  analyzedAt,
  anomaly,
  separate,
  dual,
  trendMode,
  onAnomalyChange,
  onSeparateChange,
  onDualChange,
  onTrendModeChange,
  onBackToMap,
}: ScientificBenchProps) {
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [useZScore, setUseZScore] = useState(false);
  const [scaleMode, setScaleMode] = useState<ScaleMode>('linear');
  const [viewMode, setViewMode] = useState<ViewMode>('timeseries');
  const [showGam, setShowGam] = useState(true);
  const [showMahalanobis, setShowMahalanobis] = useState(true);
  const [showDiagnostics, setShowDiagnostics] = useState(true);
  const [showCopilot, setShowCopilot] = useState(true);
  const [showMethodologyModal, setShowMethodologyModal] = useState(false);
  const [copiedMethodology, setCopiedMethodology] = useState(false);
  const [copilotLang, setCopilotLang] = useState<'pt' | 'en'>('pt');
  const [copilotQuestion, setCopilotQuestion] = useState('');
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [copilotElapsedSec, setCopilotElapsedSec] = useState(0);

  useEffect(() => {
    if (!showMethodologyModal) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.stopPropagation();
        setShowMethodologyModal(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showMethodologyModal]);

  useEffect(() => {
    if (!copilotLoading) {
      setCopilotElapsedSec(0);
      return;
    }
    setCopilotElapsedSec(0);
    const timer = window.setInterval(() => {
      setCopilotElapsedSec(prev => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [copilotLoading]);
  const [copilotHistory, setCopilotHistory] = useState<readonly CopilotHistoryTurn[]>([]);
  const [copilotMeta, setCopilotMeta] = useState<{
    readonly mode: CopilotResponse['mode'];
    readonly model: string;
    readonly warnings?: readonly string[];
  } | null>(null);

  useEffect(() => {
    setCopilotHistory([]);
    setCopilotQuestion('');
    setCopilotMeta(null);
  }, [analysis]);

  const exportOptions = {
    regionA,
    regionB,
    startMonth: periodReady ? start : undefined,
    endMonth: periodReady ? end : undefined,
    analyzedAt,
  };

  if (!analysis) {
    return (
      <section className="bench-panel" aria-label="Séries temporais">
        <div className="bench-empty-bar">
          <div className="bench-header-actions" role="group" aria-label="Exportação científica">
            <BenchExportActions disabled onExportCsv={() => {}} onExportJson={() => {}} />
          </div>
        </div>
        <div className="bench-empty" role="status">
          <div className="bench-empty-icon" aria-hidden="true">⌁</div>
          <h2>Nenhuma análise realizada</h2>
          <p>Escolha duas variáveis, defina o período e selecione as regiões A e B no mapa.</p>
          <button type="button" onClick={onBackToMap}>Voltar ao mapa</button>
        </div>
      </section>
    );
  }

  const copilotSynthesis = buildClientCopilotResponse({ analysis, language: copilotLang });

  async function submitCopilotQuestion(rawQuestion: string) {
    const trimmed = rawQuestion.trim();
    if (!trimmed || copilotLoading || !analysis) return;

    const nextHistory: CopilotHistoryTurn[] = [...copilotHistory, { role: 'user', content: trimmed }];
    setCopilotHistory(nextHistory);
    setCopilotQuestion('');
    setCopilotLoading(true);
    try {
      const response = await askStatisticalCopilot({
        analysis,
        question: trimmed,
        language: copilotLang,
        history: nextHistory,
      });
      setCopilotMeta({
        mode: response.mode,
        model: response.model,
        warnings: response.invariant_warnings,
      });
      setCopilotHistory(prev => [
        ...prev,
        {
          role: 'assistant',
          content: response.answer ?? response.reply_markdown,
          tools_used: response.tools_used,
        },
      ]);
    } catch {
      const fallback = buildClientCopilotResponse({
        analysis,
        question: trimmed,
        language: copilotLang,
      });
      setCopilotMeta({ mode: fallback.mode, model: fallback.model });
      setCopilotHistory(prev => [
        ...prev,
        { role: 'assistant', content: fallback.answer ?? fallback.reply_markdown },
      ]);
    } finally {
      setCopilotLoading(false);
    }
  }

  function handleCopilotFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitCopilotQuestion(copilotQuestion);
  }

  const isEn = copilotLang === 'en';
  const copilotIsAi = copilotMeta?.mode === 'llm_gemini';
  const copilotIsPython = copilotMeta?.mode === 'heuristic_fallback';

  const metricMode: MetricMode = useZScore ? 'zscore' : anomaly ? 'anomaly' : 'raw';
  const isZScore = metricMode === 'zscore';

  // Positional matching guarantees A and B map to their own regions even when variableA === variableB
  const available = [analysis.region_a_analysis, analysis.region_b_analysis];
  const selections = [
    { slot: 'A' as const, id: variableA, regionSel: regionA, candidate: analysis.region_a_analysis },
    { slot: 'B' as const, id: variableB, regionSel: regionB, candidate: analysis.region_b_analysis },
  ];

  const resolveSlotStats = (
    id: string,
    candidate: VariableStatistics | null | undefined,
  ): VariableStatistics | undefined => {
    if (!id) return undefined;
    if (candidate?.variable_id === id) return candidate;
    if (variableA !== variableB) {
      return available.find(item => item?.variable_id === id) ?? undefined;
    }
    return undefined;
  };

  const regions = selections.flatMap(({ slot, id, regionSel, candidate }) => {
    const region = resolveSlotStats(id, candidate);
    return region ? [{ ...region, slot, regionSel }] : [];
  });
  const missing = selections.filter(({ id, candidate }) => id && !resolveSlotStats(id, candidate));

  const mixed = !isZScore && regions.length > 1 && regions[0]?.unit !== regions[1]?.unit;
  const effectiveDual = !isZScore && dual;
  const stacked = separate || (mixed && !effectiveDual);

  const months = regions.flatMap(region => region.series.dates).sort();
  const inRangeMonths = periodReady ? months.filter(month => month >= start && month <= end) : months;
  const firstMonth = inRangeMonths[0] ?? (periodReady ? start : undefined);
  const lastMonth = inRangeMonths.at(-1) ?? (periodReady ? end : undefined);
  const isYearMonth = (val: string | undefined): val is string =>
    Boolean(val && /^\d{4}-(0[1-9]|1[0-2])$/.test(val));
  const firstDate = isYearMonth(firstMonth) ? `${firstMonth}-01` : undefined;
  const lastDate = isYearMonth(lastMonth)
    ? new Date(Date.UTC(Number(lastMonth.slice(0, 4)), Number(lastMonth.slice(5, 7)), 0)).toISOString().slice(0, 10)
    : undefined;
  const hasPoints = inRangeMonths.length > 0;
  const periodTrimmed = Boolean(
    periodReady &&
    hasPoints &&
    ((firstMonth && firstMonth > start) || (lastMonth && lastMonth < end)),
  );
  const isOfflineAnalysis = analysis.request_meta.source === 'offline_fallback';

  const showOls = trendMode === 'ols' || trendMode === 'both';
  const showSen = trendMode === 'sen' || trendMode === 'both';

  const transformedByRegion = regions.map((region, index) => {
    const indices = region.series.dates.flatMap((month, i) =>
      !periodReady || (month >= start && month <= end) ? [i] : [],
    );
    return {
      region,
      index,
      indices,
      transformed: transformRegionSeries(region, indices, metricMode, scaleMode),
    };
  });

  const timeSeriesTraces: PlotTraces = transformedByRegion.flatMap(({ region, index, indices, transformed }) => {
    const color = region.slot === 'A' ? '#67e8f9' : '#fb923c';
    const fitColor = region.slot === 'A' ? '#22d3ee' : '#fbbf24';
    const name = `${region.slot} · ${region.variable_name}`;
    const axis: 'y' | 'y2' = index === 1 && !isZScore && (effectiveDual || stacked) ? 'y2' : 'y';

    const customdata = indices.map((origIdx, pos) => [
      formatPointValue(region.series.raw_values[origIdx]),
      formatPointValue(region.series.anomaly_values[origIdx]),
      formatPointValue(transformed.rawHoverValues[pos]),
      formatPointValue(region.series.linear_fit[origIdx]),
      region.unit,
      `Região ${region.slot}`,
      region.variable_name,
    ]);
    const hovertemplate =
      '<b>%{customdata[5]} · %{customdata[6]}</b><br>' +
      'Mês: %{x|%b/%Y}<br>' +
      'Bruto: %{customdata[0]} %{customdata[4]}<br>' +
      'Anomalia: %{customdata[1]} %{customdata[4]}<br>' +
      'Valor exibido: %{customdata[2]}<br>' +
      'OLS (anom.): %{customdata[3]} %{customdata[4]}<extra></extra>';

    const base = {
      x: [...transformed.xDates],
      type: 'scatter' as const,
      mode: 'lines' as const,
      yaxis: axis,
      customdata,
      hovertemplate,
    };

    const result: PlotTraces = [
      {
        ...base,
        name,
        y: [...transformed.yMain],
        line: { color, width: 2, dash: region.slot === 'A' ? 'solid' : 'longdash' },
      },
    ];

    if (showOls) {
      result.push({
        ...base,
        name: `${region.slot} · OLS`,
        y: [...transformed.yOls],
        line: { color: fitColor, width: 1.75, dash: 'dot' },
      });
    }

    if (showSen && transformed.ySen) {
      result.push({
        ...base,
        name: `${region.slot} · Theil–Sen`,
        y: [...transformed.ySen],
        line: { color: fitColor, width: 1.85, dash: 'dash' },
      });
    }

    if (showGam) {
      result.push({
        ...base,
        name: `${region.slot} · GAM`,
        y: [...transformed.yGam],
        line: { color: region.slot === 'A' ? '#34d399' : '#e879f9', width: 2.3 },
      });
    }

    if (showMahalanobis && transformed.outliers.length > 0) {
      result.push({
        x: transformed.outliers.map(o => o.xDate),
        y: transformed.outliers.map(o => o.yPlot),
        customdata: transformed.outliers.map(o => [
          o.date,
          formatPointValue(o.observedDisplay, 3),
          formatPointValue(o.mahalanobisD, 2),
          o.diagnosticHint,
        ]),
        name: `${region.slot} · Extremos (D_M > 2,5)`,
        type: 'scatter' as const,
        mode: 'markers' as const,
        yaxis: axis,
        marker: { color: '#f87171', size: 9, symbol: 'diamond', line: { color: '#0a1422', width: 1.2 } },
        hovertemplate:
          '<b>%{customdata[0]}</b> · D_M=%{customdata[2]}<br>' +
          'Valor: %{customdata[1]}<br>%{customdata[3]}<extra></extra>',
      });
    }

    return result;
  });

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
      outlierHintsByDate.set(
        o.date,
        `Outlier A (D_M=${formatPointValue(o.mahalanobis_d, 2)}): ${o.diagnostic_hint}`,
      );
    }
    for (const o of itemB.region.outliers_mahalanobis) {
      const prev = outlierHintsByDate.get(o.date);
      const msg = `Outlier B (D_M=${formatPointValue(o.mahalanobis_d, 2)}): ${o.diagnostic_hint}`;
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
      ...(showMahalanobis && outlierPts.length > 0
        ? [
            {
              x: outlierPts.map(p => p.x),
              y: outlierPts.map(p => p.y),
              customdata: outlierPts.map(p => [p.date, p.hint]),
              name: 'Extremos Bivariados (D_M > 2,5)',
              type: 'scatter' as const,
              mode: 'markers' as const,
              marker: { color: '#f87171', size: 10, symbol: 'diamond', line: { color: '#0a1422', width: 1.2 } },
              hovertemplate: '<b>%{customdata[0]}</b><br>X: %{x:.4f} | Y: %{y:.4f}<br>%{customdata[1]}<extra></extra>',
            },
          ]
        : []),
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

  const sourceLabel =
    analysis.request_meta.source === 'backend_api'
      ? 'NASA POWER via backend'
      : analysis.request_meta.source === 'idb_cache'
        ? 'Cache local (IndexedDB)'
        : 'Dados de demonstração (fallback offline)';

  const totalMissing = regions.reduce(
    (sum, r) => sum + countMissingValues(metricMode === 'raw' ? r.series.raw_values : r.series.anomaly_values),
    0,
  );

  const primaryUnitLabel = transformedByRegion[0]?.transformed.unitLabel ?? '';
  const secondaryUnitLabel = transformedByRegion[1]?.transformed.unitLabel ?? '';

  const invariantsReport = auditAnalysisInvariants(analysis);
  const lagLeadResult = computeClientLaggedCrossCorrelation(analysis, 12);
  const seasonalResult = computeClientSeasonalStratifiedTrends(analysis);

  const lagX = lagLeadResult.lag_profile.map(r => r.lag_months);
  const lagLeadTraces: PlotTraces = [
    {
      x: lagX,
      y: lagLeadResult.lag_profile.map(r => r.ci95_threshold),
      name: 'Limiar Significância 95% AR(1) (+r_crit)',
      type: 'scatter',
      mode: 'lines',
      line: { color: '#fb923c', width: 1.5, dash: 'dot' },
      hoverinfo: 'skip',
    },
    {
      x: lagX,
      y: lagLeadResult.lag_profile.map(r => -r.ci95_threshold),
      name: 'Banda Nula AR(1) 95% (±r_crit)',
      type: 'scatter',
      mode: 'lines',
      fill: 'tonexty',
      fillcolor: 'rgba(251, 146, 60, 0.08)',
      line: { color: '#fb923c', width: 1.5, dash: 'dot' },
      hovertemplate: 'Defasagem τ = %{x}m<br>Limiar 95% AR(1): ±%{y:.3f}<extra></extra>',
    },
    {
      x: lagX,
      y: lagLeadResult.lag_profile.map(r => r.r_raw_anomalies),
      name: 'r(τ) Anomalias Brutas',
      type: 'scatter',
      mode: 'lines',
      line: { color: '#94a3b8', width: 1.8, dash: 'dash' },
      hovertemplate: 'Defasagem τ = %{x} meses<br>r_bruto(τ): %{y:.4f}<extra></extra>',
    },
    {
      x: lagX,
      y: lagLeadResult.lag_profile.map(r => r.r_detrended),
      customdata: lagLeadResult.lag_profile.map(r => [
        r.p_detrended_ar1.toFixed(4),
        r.q_fdr.toFixed(4),
        r.n_effective_ar1.toFixed(1),
        r.ci95_threshold.toFixed(3),
      ]),
      name: 'r(τ) Dessazonalizado e Detrended',
      type: 'scatter',
      mode: 'lines+markers',
      marker: { color: '#38bdf8', size: 6 },
      line: { color: '#38bdf8', width: 2.6 },
      hovertemplate:
        '<b>Correlação com defasagem τ = %{x} meses</b><br>r_detrended(τ): %{y:.4f}<br>p_AR1: %{customdata[0]} · q_FDR (25 lags): %{customdata[1]}<br>N_eff: %{customdata[2]} · Limiar AR(1) 95%: ±%{customdata[3]}<extra></extra>',
    },
    {
      x: [lagLeadResult.best_detrended_lag.lag_months],
      y: [lagLeadResult.best_detrended_lag.r_detrended],
      name: `Pico τ* = ${lagLeadResult.best_detrended_lag.lag_months >= 0 ? '+' : ''}${lagLeadResult.best_detrended_lag.lag_months}m (r = ${lagLeadResult.best_detrended_lag.r_detrended.toFixed(3)}, q_FDR = ${lagLeadResult.best_detrended_lag.q_fdr.toFixed(4)})`,
      type: 'scatter',
      mode: 'markers',
      marker: {
        color: '#fbbf24',
        size: 13,
        symbol: 'diamond',
        line: { color: '#0a1422', width: 1.8 },
      },
      hovertemplate:
        '<b>Pico de Precedência Temporal τ* = %{x} meses</b><br>r_detrended(τ*): %{y:.4f}<br>Correlação com defasagem (sem implicação determinística)<extra></extra>',
    },
  ];

  const seasonCodes: SeasonCode[] = ['DJF', 'MAM', 'JJA', 'SON'];
  const seasonA = seasonalResult.region_a;
  const seasonB = seasonalResult.region_b;
  const seasonalTraces: PlotTraces = [
    {
      x: seasonCodes,
      y: seasonCodes.map(s => seasonA.seasons[s].slope_per_decade_sen),
      name: `A · ${seasonA.variable_id} Theil–Sen (${seasonA.trend_unit})`,
      type: 'bar',
      marker: { color: '#38bdf8', opacity: 0.86 },
      error_y: {
        type: 'data',
        symmetric: false,
        array: seasonCodes.map(
          s => seasonA.seasons[s].slope_ci95_high - seasonA.seasons[s].slope_per_decade_sen
        ),
        arrayminus: seasonCodes.map(
          s => seasonA.seasons[s].slope_per_decade_sen - seasonA.seasons[s].slope_ci95_low
        ),
        color: '#bae6fd',
        thickness: 1.6,
        width: 5,
      },
      customdata: seasonCodes.map(s => [
        seasonA.seasons[s].slope_ci95_low.toFixed(3),
        seasonA.seasons[s].slope_ci95_high.toFixed(3),
        seasonA.seasons[s].p_value_ar1_corrected.toFixed(4),
        seasonA.seasons[s].n_effective_ar1.toFixed(1),
      ]),
      hovertemplate:
        '<b>%{x} · Região A</b><br>B_Sen: %{y:.4f}<br>IC 95%: [%{customdata[0]}, %{customdata[1]}]<br>p_AR1: %{customdata[2]} (N_eff=%{customdata[3]})<extra></extra>',
    },
    ...(seasonB
      ? [
          {
            x: seasonCodes,
            y: seasonCodes.map(s => seasonB.seasons[s].slope_per_decade_sen),
            name: `B · ${seasonB.variable_id} Theil–Sen (${seasonB.trend_unit})`,
            type: 'bar' as const,
            marker: { color: '#f59e0b', opacity: 0.84 },
            error_y: {
              type: 'data' as const,
              symmetric: false,
              array: seasonCodes.map(
                s =>
                  seasonB.seasons[s].slope_ci95_high -
                  seasonB.seasons[s].slope_per_decade_sen
              ),
              arrayminus: seasonCodes.map(
                s =>
                  seasonB.seasons[s].slope_per_decade_sen -
                  seasonB.seasons[s].slope_ci95_low
              ),
              color: '#fde68a',
              thickness: 1.6,
              width: 5,
            },
            customdata: seasonCodes.map(s => [
              seasonB.seasons[s].slope_ci95_low.toFixed(3),
              seasonB.seasons[s].slope_ci95_high.toFixed(3),
              seasonB.seasons[s].p_value_ar1_corrected.toFixed(4),
              seasonB.seasons[s].n_effective_ar1.toFixed(1),
            ]),
            hovertemplate:
              '<b>%{x} · Região B</b><br>B_Sen: %{y:.4f}<br>IC 95%: [%{customdata[0]}, %{customdata[1]}]<br>p_AR1: %{customdata[2]} (N_eff=%{customdata[3]})<extra></extra>',
          },
        ]
      : []),
    {
      x: seasonCodes,
      y: seasonCodes.map(s => seasonA.seasons[s].slope_per_decade_ols),
      name: `A · ${seasonA.variable_id} Inclinação OLS`,
      type: 'scatter',
      mode: 'markers',
      marker: {
        color: '#c084fc',
        size: 10,
        symbol: 'diamond',
        line: { color: '#0a1422', width: 1.2 },
      },
      hovertemplate: '<b>%{x} · OLS A</b><br>B_OLS: %{y:.4f}<extra></extra>',
    },
  ];

  async function handleCopyMethodology() {
    if (!analysis) return;
    const summaryText = buildMethodologicalSummaryText(analysis, invariantsReport);
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(summaryText);
      }
    } catch {
      // Fallback silencioso para ambientes de teste sem permissão de clipboard
    }
    setCopiedMethodology(true);
    window.setTimeout(() => setCopiedMethodology(false), 2500);
  }

  return (
    <section className="bench-panel" data-tour="bench-panel" aria-label="Séries temporais e diagnóstico">
      <header className="discovery-header" data-tour="bench-discovery">
        <div className="discovery-title-row">
          <div>
            <h2>Resumo da descoberta</h2>
            <p className="discovery-subtitle">
              Período: <strong>{firstMonth ?? '—'}</strong> a <strong>{lastMonth ?? '—'}</strong>
              {regions[0] &&
                ` · ${regions[0].period.n_observations} meses (N efetivo AR(1): ${formatPointValue(regions[0].period.n_effective_ar1, 1)})`}
            </p>
          </div>
          <div className="bench-header-actions">
            <button
              type="button"
              data-testid="invariants-badge-btn"
              className={
                invariantsReport.allPassed
                  ? 'glossary-toggle invariants-badge invariants-badge-pass'
                  : 'glossary-toggle invariants-badge invariants-badge-warn'
              }
              aria-expanded={showMethodologyModal}
              onClick={() => setShowMethodologyModal(prev => !prev)}
            >
              <span className="invariants-badge-dot" aria-hidden="true" />
              <span className="invariants-badge-score">
                {invariantsReport.passedCount}/{invariantsReport.totalCount}
              </span>{' '}
              <span className="invariants-badge-label">Invariantes Auditados</span>
            </button>
            <BenchExportActions
              disabled={!analysis}
              onExportCsv={() => exportAnalysisAsCsv(analysis, exportOptions)}
              onExportJson={() => exportAnalysisAsJson(analysis, exportOptions)}
            />
            <button
              type="button"
              className={
                showCopilot
                  ? 'glossary-toggle copilot-toggle copilot-toggle-active'
                  : 'glossary-toggle copilot-toggle'
              }
              aria-expanded={showCopilot}
              onClick={() => setShowCopilot(prev => !prev)}
            >
              <span className="copilot-toggle-dot" aria-hidden="true" />
              {showCopilot ? 'Ocultar Co-Piloto IA' : 'Co-Piloto Estatístico'}
            </button>
            <button
              type="button"
              className="glossary-toggle"
              aria-expanded={showDiagnostics}
              onClick={() => setShowDiagnostics(prev => !prev)}
            >
              {showDiagnostics ? 'Ocultar 4 Respostas do Detetive' : '4 Respostas do Detetive'}
            </button>
            <button
              type="button"
              className="glossary-toggle"
              aria-expanded={glossaryOpen}
              onClick={() => setGlossaryOpen(prev => !prev)}
            >
              {glossaryOpen ? 'Ocultar ajuda científica' : 'Ajuda científica (?)'}
            </button>
          </div>
        </div>

        <div className="discovery-cards">
          {regions.map(region => (
            <StatSummaryCard key={region.slot} slot={region.slot} stats={region} region={region.regionSel} />
          ))}
        </div>

        {analysis.comparison_pair && (
          <div className="comparison-banner" role="region" aria-label="Comparação multiescala A e B">
            <div className="comparison-metrics">
              <span>
                Paradoxo / regime: <strong>{analysis.comparison_pair.multiscale_correlation.paradox_type}</strong>
              </span>
              <span>
                Correlação secular (r<sub>global</sub>):{' '}
                <strong>{formatSignedNumber(analysis.comparison_pair.multiscale_correlation.long_term_secular_r, 2)}</strong>
              </span>
              <span>
                Curto prazo sem tendência (r<sub>detrended</sub>):{' '}
                <strong>{formatSignedNumber(analysis.comparison_pair.multiscale_correlation.short_term_detrended_r, 2)}</strong>
              </span>
              {analysis.comparison_pair.spatial_divergence_detected && (
                <span className="divergence-pill">Divergência espacial detectada</span>
              )}
            </div>
            <p>{analysis.comparison_pair.multiscale_correlation.interpretation}</p>
          </div>
        )}
      </header>

      {glossaryOpen && (
        <aside className="glossary-panel" aria-label="Glossário estatístico">
          <h3>Como interpretar os indicadores</h3>
          <dl>
            {SCIENTIFIC_GLOSSARY.map(entry => (
              <div key={entry.term}>
                <dt>{entry.term}</dt>
                <dd>{entry.summary}</dd>
              </div>
            ))}
          </dl>
        </aside>
      )}

      <div className="controls-bar" data-tour="bench-controls" aria-label="Controles do gráfico">
        <div className="segmented-group" role="group" aria-label="Normalização da série">
          <button
            type="button"
            aria-pressed={metricMode === 'raw'}
            className={metricMode === 'raw' ? 'active' : ''}
            onClick={() => {
              setUseZScore(false);
              onAnomalyChange(false);
            }}
          >
            Bruto
          </button>
          <button
            type="button"
            aria-pressed={metricMode === 'anomaly'}
            className={metricMode === 'anomaly' ? 'active' : ''}
            onClick={() => {
              setUseZScore(false);
              onAnomalyChange(true);
            }}
          >
            Anomalia
          </button>
          <button
            type="button"
            aria-pressed={metricMode === 'zscore'}
            className={metricMode === 'zscore' ? 'active' : ''}
            onClick={() => {
              setUseZScore(true);
              if (!anomaly) onAnomalyChange(true);
            }}
          >
            Z-Score (σ)
          </button>
        </div>

        <div className="segmented-group" role="group" aria-label="Escala vertical">
          <button
            type="button"
            aria-pressed={scaleMode === 'linear'}
            className={scaleMode === 'linear' ? 'active' : ''}
            onClick={() => setScaleMode('linear')}
          >
            Linear
          </button>
          <button
            type="button"
            aria-pressed={scaleMode === 'symlog'}
            className={scaleMode === 'symlog' ? 'active' : ''}
            onClick={() => setScaleMode('symlog')}
          >
            Symlog
          </button>
        </div>

        <div className="segmented-group view-mode-group" role="group" aria-label="Tipo de visualização">
          <button
            type="button"
            aria-pressed={viewMode === 'timeseries'}
            className={viewMode === 'timeseries' ? 'active' : ''}
            onClick={() => setViewMode('timeseries')}
          >
            Série Temporal
          </button>
          <button
            type="button"
            aria-pressed={viewMode === 'scatter'}
            className={viewMode === 'scatter' ? 'active' : ''}
            disabled={!scatterBundle}
            onClick={() => setViewMode('scatter')}
          >
            Dispersão X vs Y
          </button>
          <button
            type="button"
            aria-pressed={viewMode === 'both'}
            className={viewMode === 'both' ? 'active' : ''}
            disabled={!scatterBundle}
            onClick={() => setViewMode('both')}
          >
            Visão Dupla
          </button>
          <button
            type="button"
            data-testid="view-mode-lag"
            aria-pressed={viewMode === 'lag'}
            className={viewMode === 'lag' ? 'active' : ''}
            onClick={() => setViewMode('lag')}
          >
            Defasagem (Lag-Lead)
          </button>
          <button
            type="button"
            data-testid="view-mode-seasonal"
            aria-pressed={viewMode === 'seasonal'}
            className={viewMode === 'seasonal' ? 'active' : ''}
            onClick={() => setViewMode('seasonal')}
          >
            Sazonal (DJF–SON)
          </button>
        </div>

        <div className="segmented-group" role="group" aria-label="Disposição das curvas">
          <button
            type="button"
            aria-pressed={!separate}
            className={!separate ? 'active' : ''}
            onClick={() => onSeparateChange(false)}
          >
            Juntas
          </button>
          <button
            type="button"
            aria-pressed={separate}
            className={separate ? 'active' : ''}
            onClick={() => onSeparateChange(true)}
          >
            Separadas
          </button>
        </div>

        <div className="segmented-group" role="group" aria-label="Eixo vertical">
          <button
            type="button"
            aria-pressed={!effectiveDual}
            className={!effectiveDual ? 'active' : ''}
            disabled={separate || regions.length < 2 || isZScore}
            onClick={() => onDualChange(false)}
          >
            Eixo único
          </button>
          <button
            type="button"
            aria-pressed={effectiveDual}
            className={effectiveDual ? 'active' : ''}
            disabled={separate || regions.length < 2 || isZScore}
            onClick={() => onDualChange(true)}
          >
            Eixo Y duplo
          </button>
        </div>

        <div className="segmented-group" role="group" aria-label="Linhas de tendência">
          {(
            [
              { id: 'none', label: 'Sem reta' },
              { id: 'ols', label: 'OLS' },
              { id: 'sen', label: 'Theil–Sen' },
              { id: 'both', label: 'OLS + Sen' },
            ] as const
          ).map(option => (
            <button
              key={option.id}
              type="button"
              aria-pressed={trendMode === option.id}
              className={trendMode === option.id ? 'active' : ''}
              onClick={() => onTrendModeChange(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="segmented-group" role="group" aria-label="Sobreposições avançadas">
          <button
            type="button"
            aria-pressed={showGam}
            className={showGam ? 'active' : ''}
            onClick={() => setShowGam(prev => !prev)}
          >
            Curva GAM
          </button>
          <button
            type="button"
            aria-pressed={showMahalanobis}
            className={showMahalanobis ? 'active' : ''}
            onClick={() => setShowMahalanobis(prev => !prev)}
          >
            Outliers D_M &gt; 2,5
          </button>
        </div>
      </div>

      {missing.map(({ slot, id }) => (
        <p className="note" role="status" key={slot}>
          Variável {slot} · {VARIABLE_LIST.find(variable => variable.variable_id === id)?.variable_name}
          {isOfflineAnalysis ? ' não tem série no conjunto offline.' : ' não está presente no resultado atual.'}
        </p>
      ))}
      {regions.length === 0 && missing.length === 0 && <p className="note">Selecione uma variável para ver a série.</p>}
      {regions.length > 0 && !hasPoints && (
        <p className="note" role="status">O resultado atual não contém dados no período selecionado.</p>
      )}

      {periodTrimmed && (
        <p className="note" role="status">
          Cobertura efetiva com dados: <strong>{firstMonth}</strong> a <strong>{lastMonth}</strong>{' '}
          (recorte automático sobre o período selecionado de {start} a {end}).
        </p>
      )}
      {hasPoints && (
        <div className={viewMode === 'both' && scatterBundle ? 'charts-grid dual-charts' : 'charts-grid'}>
          {(viewMode === 'timeseries' || viewMode === 'both') && (
            <div className="plot-frame chart-box">
              <Plot
                key={`ts-${firstDate}-${lastDate}-${metricMode}-${scaleMode}-${stacked}-${effectiveDual}`}
                data={timeSeriesTraces}
                useResizeHandler
                style={{ width: '100%', height: '100%', minHeight: stacked && regions.length > 1 ? 500 : 350 }}
                config={{ responsive: true, displaylogo: false }}
                layout={{
                  autosize: true,
                  paper_bgcolor: '#121e30',
                  plot_bgcolor: '#121e30',
                  font: { color: '#e1edf8' },
                  hovermode: 'closest',
                  margin: { l: 48, t: 28, r: 44, b: 85 },
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
                  legend: { orientation: 'h', y: -0.2 },
                }}
              />
            </div>
          )}

          {(viewMode === 'scatter' || viewMode === 'both') && scatterBundle && (
            <div className="plot-frame chart-box">
              <Plot
                key={`sc-${metricMode}-${scaleMode}-${regions.map(r => `${r.slot}:${r.variable_id}`).join('-')}`}
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
                  hovermode: 'closest',
                  margin: { l: 48, t: 42, r: 20, b: 78 },
                  xaxis: { title: { text: scatterBundle.xTitle }, automargin: true },
                  yaxis: { title: { text: scatterBundle.yTitle }, automargin: true },
                  legend: { orientation: 'h', y: -0.24 },
                }}
              />
            </div>
          )}

          {viewMode === 'lag' && (
            <div className="plot-frame chart-box lag-lead-chart-box" data-testid="lag-lead-chart-container">
              <div className="chart-insight-strip">
                <div className="chart-insight-badge">
                  <span className="chart-insight-kicker">PRECEDÊNCIA TEMPORAL AR(1) · BH-FDR</span>
                  <strong>
                    τ* = {lagLeadResult.best_detrended_lag.lag_months >= 0 ? '+' : ''}
                    {lagLeadResult.best_detrended_lag.lag_months} meses
                  </strong>
                </div>
                <p className="chart-insight-text">{lagLeadResult.precedence_interpretation}</p>
                <div className="chart-insight-pills">
                  <span className="chart-insight-pill">
                    r_detrended(τ*) = {lagLeadResult.best_detrended_lag.r_detrended.toFixed(3)}
                  </span>
                  <span className="chart-insight-pill">
                    p_AR1 = {formatPValue(lagLeadResult.best_detrended_lag.p_detrended_ar1)}
                  </span>
                  <span className="chart-insight-pill" data-testid="lag-peak-fdr-value">
                    q_FDR ({lagLeadResult.fdr_family_size} lags) ={' '}
                    {formatPValue(lagLeadResult.best_detrended_lag.q_fdr)}
                  </span>
                  <span className="chart-insight-pill">
                    N_eff = {lagLeadResult.best_detrended_lag.n_effective_ar1.toFixed(1)}
                  </span>
                  <span className="chart-insight-pill">
                    Limiar AR(1) 95% = ±{lagLeadResult.best_detrended_lag.ci95_threshold.toFixed(3)}
                  </span>
                  <span
                    data-testid="lag-peak-fdr-status"
                    className={
                      lagLeadResult.best_fdr_status === 'FDR_SIGNIFICANT'
                        ? 'chart-insight-pill is-fdr-pass'
                        : lagLeadResult.best_fdr_status === 'LOCAL_AR1_ONLY'
                          ? 'chart-insight-pill is-fdr-warn'
                          : 'chart-insight-pill is-fdr-null'
                    }
                  >
                    {lagLeadResult.best_fdr_status === 'FDR_SIGNIFICANT'
                      ? `✓ BH-FDR (${lagLeadResult.fdr_family_size} lags): q_FDR < 0,05 (${lagLeadResult.fdr_significant_lags_count}/${lagLeadResult.fdr_family_size})`
                      : lagLeadResult.best_fdr_status === 'LOCAL_AR1_ONLY'
                        ? `△ BH-FDR (${lagLeadResult.fdr_family_size} lags): supera banda AR(1) local, mas q_FDR ≥ 0,05`
                        : `○ BH-FDR (${lagLeadResult.fdr_family_size} lags): q_FDR ≥ 0,05 (na banda nula AR(1))`}
                  </span>
                </div>
              </div>
              <Plot
                key={`lag-${lagLeadResult.variable_a}-${lagLeadResult.variable_b}`}
                data={lagLeadTraces}
                useResizeHandler
                style={{ width: '100%', height: '100%', minHeight: 350 }}
                config={{ responsive: true, displaylogo: false }}
                layout={{
                  autosize: true,
                  title: {
                    text: `Correlação Cruzada Defasada r_detrended(τ) · ${lagLeadResult.variable_a} (A) vs. ${lagLeadResult.variable_b} (B) · τ ∈ [-12, +12] meses`,
                    font: { size: 13 },
                  },
                  paper_bgcolor: '#121e30',
                  plot_bgcolor: '#121e30',
                  font: { color: '#e1edf8' },
                  hovermode: 'closest',
                  margin: { l: 52, t: 44, r: 24, b: 82 },
                  xaxis: {
                    title: {
                      text: 'Defasagem τ (meses) · τ < 0: B antecede A | τ = 0: síncrono | τ > 0: A antecede B',
                    },
                    dtick: 2,
                    zeroline: true,
                    zerolinecolor: 'rgba(148, 163, 184, 0.35)',
                    automargin: true,
                  },
                  yaxis: {
                    title: { text: 'Correlação de Pearson r_detrended(τ)' },
                    range: [-1.05, 1.05],
                    zeroline: true,
                    zerolinecolor: 'rgba(148, 163, 184, 0.35)',
                    automargin: true,
                  },
                  legend: { orientation: 'h', y: -0.24 },
                }}
              />
            </div>
          )}

          {viewMode === 'seasonal' && (
            <div className="plot-frame chart-box seasonal-chart-box" data-testid="seasonal-chart-container">
              <div className="chart-insight-strip">
                <div className="chart-insight-badge">
                  <span className="chart-insight-kicker">ESTRATIFICAÇÃO SAZONAL · ANOMALIAS Y′(a,m)</span>
                  <strong>Estação Dominante: {seasonA.dominant_season}</strong>
                </div>
                <p className="chart-insight-text">{seasonalResult.summary_interpretation}</p>
                <div className="chart-insight-pills">
                  <span className="chart-insight-pill">
                    Base: anomalias mensais dessazonalizadas Y′(a,m) · zero % em escala interval
                  </span>
                  <span className="chart-insight-pill">
                    {seasonA.has_seasonal_sign_reversal
                      ? '⇄ Inversão Sazonal de Sinal Detectada'
                      : '✓ Coerência Sazonal Direcional'}
                  </span>
                  {seasonB && (
                    <span className="chart-insight-pill">
                      B ({seasonB.variable_id}): dom. {seasonB.dominant_season} (p_AR1 ={' '}
                      {formatPValue(seasonB.seasons[seasonB.dominant_season].p_value_ar1_corrected)})
                    </span>
                  )}
                </div>
              </div>
              <Plot
                key={`seasonal-${seasonA.variable_id}-${seasonB?.variable_id ?? 'single'}`}
                data={seasonalTraces}
                useResizeHandler
                style={{ width: '100%', height: '100%', minHeight: 350 }}
                config={{ responsive: true, displaylogo: false }}
                layout={{
                  autosize: true,
                  barmode: 'group',
                  title: {
                    text: `Inclinação Secular de Theil–Sen (B_Sen ± IC 95%) sobre Anomalias Mensais Y′(a,m) · DJF, MAM, JJA, SON`,
                    font: { size: 13 },
                  },
                  paper_bgcolor: '#121e30',
                  plot_bgcolor: '#121e30',
                  font: { color: '#e1edf8' },
                  hovermode: 'closest',
                  margin: { l: 54, t: 44, r: 24, b: 82 },
                  xaxis: {
                    title: { text: 'Estação Climatológica (Trimestre Austral)' },
                    automargin: true,
                  },
                  yaxis: {
                    title: { text: `Taxa Secular (${seasonA.trend_unit})` },
                    zeroline: true,
                    zerolinecolor: 'rgba(148, 163, 184, 0.4)',
                    automargin: true,
                  },
                  legend: { orientation: 'h', y: -0.24 },
                }}
              />
              <div className="seasonal-cards-grid">
                {seasonCodes.map(code => {
                  const s = seasonA.seasons[code];
                  const sB = seasonB?.seasons[code] ?? null;
                  return (
                    <div
                      key={code}
                      data-testid={`seasonal-card-${code}`}
                      className={
                        code === seasonA.dominant_season
                          ? 'seasonal-mini-card seasonal-mini-card-dominant'
                          : 'seasonal-mini-card'
                      }
                    >
                      <div className="seasonal-mini-head">
                        <strong>{code}</strong>
                        <span className={s.significant_ar1 ? 'seasonal-sig-pass' : 'seasonal-sig-ns'}>
                          p_AR1 = {formatPValue(s.p_value_ar1_corrected)} ·{' '}
                          {s.significant_ar1 ? 'sig.' : 'n.s.'}
                        </span>
                      </div>
                      <div className="seasonal-mini-slope">
                        {formatSignedNumber(s.slope_per_decade_sen, 3)}{' '}
                        <small>{seasonA.trend_unit}</small>
                      </div>
                      <div className="seasonal-mini-meta">
                        IC 95%: [{formatPointValue(s.slope_ci95_low, 3)},{' '}
                        {formatPointValue(s.slope_ci95_high, 3)}] · N={s.n_months} · N_eff=
                        {formatPointValue(s.n_effective_ar1, 1)}
                      </div>
                      {sB && seasonB && (
                        <div className="seasonal-mini-sub">
                          B ({seasonB.variable_id}): {formatSignedNumber(sB.slope_per_decade_sen, 3)}{' '}
                          {seasonB.trend_unit} · p_AR1 = {formatPValue(sB.p_value_ar1_corrected)} (
                          {sB.significant_ar1 ? 'sig.' : 'n.s.'})
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {showDiagnostics && (
        <section className="diagnostic-drawer" data-tour="bench-answers" aria-label="As 4 Respostas do Detetive e Diagnóstico Multiescala">
          <div className="diag-grid">
            <article className="diag-card">
              <h4>1. O QUE muda &amp; Regime Físico (GAM)</h4>
              {regions.map(region => (
                <div key={region.slot} className="diag-row">
                  <span className={`slot-tag slot-${region.slot.toLowerCase()}`}>Região {region.slot}</span>
                  <strong>{region.variable_name}</strong>{' '}
                  <small>({region.variable_id} · {region.unit})</small>
                  <div className="diag-meta">
                    Regime GAM: <b>{REGIME_LABELS[region.regression.regime_shape] ?? region.regression.regime_shape ?? '—'}</b> · Aceleração B₂:{' '}
                    <code>{formatSignedNumber(region.regression.quadratic_acceleration_B2, 5)}</code>
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
                    Theil–Sen: <b>{formatSignedNumber(region.regression.slope_per_decade_sen, 4)} {region.trend_unit}</b>{' '}
                    <small>
                      (IC 95%: [{formatSignedNumber(region.regression.slope_ci95_low, 4)},{' '}
                      {formatSignedNumber(region.regression.slope_ci95_high, 4)}])
                    </small>
                  </div>
                  <div className="diag-meta">
                    OLS: <b>{formatSignedNumber(region.regression.slope_per_decade_ols, 4)} {region.trend_unit}</b> · A₀:{' '}
                    <code>{formatPointValue(region.regression.intercept_at_start_A0)} {region.unit}</code> · Δ Modelo:{' '}
                    <b>{formatSignedNumber(region.regression.cumulative_model_change, 4)} {region.unit}</b>
                  </div>
                  {!region.allow_percentage_change && (
                    <small className="invariant-note">
                      Invariante #3: variação em % bloqueada para {region.variable_id} ({region.scale_type}).
                    </small>
                  )}
                </div>
              ))}
            </article>

            <article className="diag-card">
              <h4>3. É SIGNIFICATIVO? (AR(1) + FDR + Acoplamento)</h4>
              {regions.map(region => {
                const badge =
                  CONFIDENCE_LABELS[region.significance.confidence_tier] ?? CONFIDENCE_LABELS.INSUFFICIENT_SIGNAL;
                return (
                  <div key={region.slot} className="diag-row">
                    <div className="badge-line">
                      <span className={`slot-tag slot-${region.slot.toLowerCase()}`}>Região {region.slot}</span>
                      <span className={`confidence-badge tone-${badge.tone}`}>{badge.label}</span>
                      <span
                        className={
                          region.significance.is_significant_fdr05 ? 'fdr-chip fdr-pass' : 'fdr-chip fdr-fail'
                        }
                      >
                        {region.significance.is_significant_fdr05
                          ? 'q_FDR < 0,05'
                          : 'q_FDR ≥ 0,05 · possível ruído natural'}
                      </span>
                    </div>
                    <div className="diag-meta">
                      N<sub>bruto</sub> = <b>{region.period.n_observations}</b> → N<sub>efetivo</sub>(AR1) ={' '}
                      <b>{formatPointValue(region.period.n_effective_ar1, 1)}</b>
                      <br />
                      p<sub>naive</sub> = <code>{formatPValue(region.significance.p_value_naive)}</code> · p<sub>AR1</sub> ={' '}
                      <code>{formatPValue(region.significance.p_value_ar1_corrected)}</code> · q<sub>FDR</sub> ={' '}
                      <code>{formatPValue(region.significance.fdr_q_value)}</code>
                      <br />
                      r = <b>{formatSignedNumber(region.correlation_and_coupling.pearson_r, 3)}</b> · τ ={' '}
                      <b>{formatSignedNumber(region.correlation_and_coupling.kendall_tau, 3)}</b> · R² ={' '}
                      <b>{formatPointValue(region.correlation_and_coupling.r_squared, 3)}</b> · Elipse ={' '}
                      <b>{formatPointValue(region.correlation_and_coupling.ellipse_aspect_ratio, 3)}</b>
                      <br />
                      Outliers Mahalanobis (D<sub>M</sub> &gt; 2,5): <b>{region.outliers_mahalanobis.length}</b>
                      {region.outliers_mahalanobis[0] && (
                        <>
                          {' '}— pico em <code>{region.outliers_mahalanobis[0].date}</code> (D<sub>M</sub>=
                          {formatPointValue(region.outliers_mahalanobis[0].mahalanobis_d, 2)})
                        </>
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
                    A: <code>{analysis.comparison_pair.region_a_id}</code> ({analysis.request_meta.cells_count_a} cél.)
                    <br />
                    B: <code>{analysis.comparison_pair.region_b_id}</code> (
                    {analysis.request_meta.cells_count_b || analysis.request_meta.cells_count_a} cél.)
                    <br />
                    r<sub>global</sub> (secular) ={' '}
                    <b>{formatSignedNumber(analysis.comparison_pair.multiscale_correlation.long_term_secular_r, 3)}</b> ·
                    r<sub>detrended</sub> (curto prazo) ={' '}
                    <b>{formatSignedNumber(analysis.comparison_pair.multiscale_correlation.short_term_detrended_r, 3)}</b>
                    {analysis.comparison_pair.slope_difference_per_decade !== null && (
                      <>
                        {' '}· Δ Declive (A − B) ={' '}
                        <b>
                          {formatSignedNumber(analysis.comparison_pair.slope_difference_per_decade, 4)}
                          {regions[0]?.trend_unit ? ` ${regions[0].trend_unit}` : ''}
                        </b>
                      </>
                    )}
                  </div>
                  <p className="interpretation-box">{analysis.comparison_pair.multiscale_correlation.interpretation}</p>
                </div>
              ) : (
                <p className="diag-meta">
                  Selecione Região A e Região B (ou 2 variáveis no mesmo local) para análise multiescala comparativa.
                </p>
              )}
            </article>
          </div>
        </section>
      )}

      {showCopilot && (
        <section className="copilot-drawer" aria-label="Co-Piloto Estatístico Interativo">
          <div className="copilot-header">
            <div className="copilot-title-block">
              <div className="copilot-title-group">
                <span
                  className={`copilot-status-dot ${copilotLoading ? 'is-busy' : copilotIsAi ? 'is-ai' : 'is-local'}`}
                  aria-hidden="true"
                />
                <h3>{isEn ? 'Statistical Co-Pilot' : 'Co-Piloto Estatístico'}</h3>
                <span
                  className={`copilot-badge ${
                    copilotIsAi ? 'copilot-badge-ai' : copilotIsPython ? 'copilot-badge-python' : 'copilot-badge-local'
                  }`}
                  title={copilotMeta ? `${copilotMeta.mode} · ${copilotMeta.model}` : undefined}
                >
                  {copilotIsAi
                    ? isEn
                      ? 'Generative AI + Function Calling'
                      : 'IA Generativa + Function Calling'
                    : copilotIsPython
                      ? isEn
                        ? 'Backend Deterministic + Python Tools'
                        : 'Motor Python + Engines Científicas'
                      : isEn
                        ? 'Local Deterministic Engine · Zero Numeric Hallucination'
                        : 'Motor Determinístico Local · Zero Alucinação Numérica'}
                </span>
              </div>
              <div className="copilot-telemetry" role="list" aria-label={isEn ? 'Analysis context' : 'Contexto da análise'}>
                <span role="listitem" className="copilot-telemetry-pill">
                  {analysis.comparison_pair ? 'Local A vs B' : 'Local A'}
                </span>
                {regions.map(r => (
                  <span
                    key={r.slot}
                    role="listitem"
                    className={`copilot-telemetry-pill pill-${r.slot.toLowerCase()}`}
                  >
                    {r.slot} · {r.variable_id}
                  </span>
                ))}
                <span role="listitem" className="copilot-telemetry-pill">
                  {firstMonth ?? '—'} → {lastMonth ?? '—'}
                </span>
                <span role="listitem" className="copilot-telemetry-pill">
                  {isEn ? '7 invariants audited' : '7 invariantes auditados'}
                </span>
                {copilotMeta && (
                  <span role="listitem" className="copilot-telemetry-pill pill-model">
                    {copilotMeta.model}
                  </span>
                )}
              </div>
            </div>
            <div className="copilot-lang-switch" role="group" aria-label="Idioma do Co-Piloto">
              <button
                type="button"
                className={copilotLang === 'pt' ? 'active' : ''}
                aria-pressed={copilotLang === 'pt'}
                onClick={() => setCopilotLang('pt')}
              >
                PT
              </button>
              <button
                type="button"
                className={copilotLang === 'en' ? 'active' : ''}
                aria-pressed={copilotLang === 'en'}
                onClick={() => setCopilotLang('en')}
              >
                EN
              </button>
              <button
                type="button"
                className="copilot-clear"
                disabled={copilotHistory.length === 0 || copilotLoading}
                onClick={() => {
                  setCopilotHistory([]);
                  setCopilotMeta(null);
                }}
              >
                {isEn ? 'Clear chat' : 'Limpar conversa'}
              </button>
            </div>
          </div>

          <div className="copilot-synthesis-grid">
            <article className="copilot-card copilot-card-math">
              <h4>
                <span className="copilot-card-index" aria-hidden="true">
                  01
                </span>
                {isEn ? 'Mathematical Evidence' : 'Evidência Matemática'}
              </h4>
              <CopilotRichText text={copilotSynthesis.synthesis.mathematical_evidence} />
            </article>
            <article className="copilot-card copilot-card-phys">
              <h4>
                <span className="copilot-card-index" aria-hidden="true">
                  02
                </span>
                {isEn ? 'Physical Meaning' : 'Significado Físico'}
              </h4>
              <CopilotRichText text={copilotSynthesis.synthesis.physical_meaning} />
            </article>
            <article className="copilot-card copilot-card-risk">
              <h4>
                <span className="copilot-card-index" aria-hidden="true">
                  03
                </span>
                {isEn ? 'Risk of False Conclusion' : 'Risco de Falsa Conclusão'}
              </h4>
              <CopilotRichText text={copilotSynthesis.synthesis.false_conclusion_risk} />
            </article>
          </div>

          <div className="copilot-chips-block">
            <span className="copilot-section-label">{isEn ? 'Quick investigations' : 'Investigações rápidas'}</span>
            <div className="copilot-chips" role="group" aria-label="Perguntas sugeridas ao Co-Piloto">
              {copilotSynthesis.suggested_questions.map((suggested, chipIdx) => (
                <button
                  key={suggested}
                  type="button"
                  className="copilot-chip"
                  disabled={copilotLoading}
                  onClick={() => void submitCopilotQuestion(suggested)}
                >
                  <span className="copilot-chip-icon" aria-hidden="true">
                    {COPILOT_CHIP_ICONS[chipIdx % COPILOT_CHIP_ICONS.length]}
                  </span>
                  <span className="copilot-chip-text">{suggested}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="copilot-chat-box">
            {copilotMeta?.warnings && copilotMeta.warnings.length > 0 && (
              <p className="copilot-invariant-alert" role="status">
                {copilotMeta.warnings.join(' · ')}
              </p>
            )}
            {copilotHistory.length > 0 && (
              <div className="copilot-messages" aria-live="polite">
                {copilotHistory.map((turn, idx) => (
                  <div
                    key={`${turn.role}-${idx}`}
                    className={`copilot-msg ${turn.role === 'user' ? 'copilot-msg-user' : 'copilot-msg-assistant'}`}
                  >
                    <strong className="copilot-msg-role">
                      {turn.role === 'user' ? (isEn ? 'You: ' : 'Você: ') : 'Co-Piloto: '}
                    </strong>
                    {turn.role === 'assistant' ? (
                      <CopilotRichText text={turn.content} />
                    ) : (
                      <span className="copilot-msg-text">{turn.content}</span>
                    )}
                    {turn.role === 'assistant' && turn.tools_used && turn.tools_used.length > 0 && (
                      <div className="copilot-tools-audit" aria-label="Engines científicas executadas">
                        <span className="copilot-tools-title">{isEn ? 'Executed telemetry' : 'Telemetria executada'}</span>
                        {turn.tools_used.map((tool, tIdx) => (
                          <span
                            key={`${tool.name}-${tIdx}`}
                            className={`copilot-tool-pill copilot-tool-${tool.status}`}
                            title={`${tool.name} (${tool.duration_ms.toFixed(1)} ms)`}
                          >
                            <span className="copilot-tool-name">{tool.name}</span>
                            <span className="copilot-tool-label">
                              {tool.label} · {tool.summary}
                            </span>
                            <span className="copilot-tool-ms">{tool.duration_ms.toFixed(0)} ms</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {copilotLoading && (
                  <div className="copilot-msg copilot-msg-assistant copilot-msg-thinking" role="status" aria-live="polite">
                    <span className="copilot-typing-dots" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </span>
                    <span className="copilot-thinking-body">
                      <span className="copilot-thinking-text">
                        {isEn
                          ? copilotElapsedSec < 5
                            ? 'Reading statistical metrics and time series...'
                            : copilotElapsedSec < 15
                              ? 'Running scientific tools and consulting AI...'
                              : 'Synthesizing diagnosis & validating invariants...'
                          : copilotElapsedSec < 5
                            ? 'Lendo séries e métricas estatísticas...'
                            : copilotElapsedSec < 15
                              ? 'Executando ferramentas científicas e consultando a IA...'
                              : 'Refinando diagnóstico e validando invariantes...'}
                      </span>
                      <span className="copilot-scan" aria-hidden="true" />
                    </span>
                    <span className="copilot-thinking-elapsed">T+{copilotElapsedSec}s</span>
                  </div>
                )}
              </div>
            )}

            <form className="copilot-form" onSubmit={handleCopilotFormSubmit}>
              <span className="copilot-prompt-glyph" aria-hidden="true">
                ›_
              </span>
              <input
                type="text"
                className="copilot-input"
                value={copilotQuestion}
                onChange={e => setCopilotQuestion(e.target.value)}
                placeholder={
                  isEn
                    ? 'Ask about trends, AR(1) significance, Mahalanobis extremes, or A vs B...'
                    : 'Pergunte sobre tendências, AR(1), extremos de Mahalanobis ou comparação A × B...'
                }
                aria-label={isEn ? 'Ask the Statistical Co-Pilot' : 'Pergunte ao Co-Piloto Estatístico'}
                disabled={copilotLoading}
              />
              <button
                type="submit"
                className="copilot-submit"
                disabled={copilotLoading || !copilotQuestion.trim()}
              >
                {copilotLoading ? (isEn ? 'Thinking...' : 'Pensando...') : isEn ? 'Ask' : 'Perguntar'}
              </button>
            </form>
          </div>
        </section>
      )}

      <footer className="data-provenance" aria-label="Origem e qualidade dos dados">
        <h3>Origem e qualidade dos dados</h3>
        <dl className="provenance-grid">
          <div>
            <dt>Fonte</dt>
            <dd>{sourceLabel}</dd>
          </div>
          <div>
            <dt>Modelo e resolução</dt>
            <dd>
              {regions
                .map(r => {
                  const meta = getVariableMetadata(r.variable_id);
                  return `${r.slot}: ${meta.source_model} (${meta.resolution.dLat}° × ${meta.resolution.dLon}°)`;
                })
                .join(' · ') || '—'}
            </dd>
          </div>
          <div>
            <dt>Cobertura</dt>
            <dd>
              {firstMonth ?? '—'} a {lastMonth ?? '—'} ({regions[0]?.period.n_observations ?? 0} meses)
            </dd>
          </div>
          <div>
            <dt>Células agregadas</dt>
            <dd>
              A: {analysis.request_meta.cells_count_a} · B: {analysis.request_meta.cells_count_b} (
              {analysis.request_meta.spatial_aggregation})
            </dd>
          </div>
          <div>
            <dt>Valores ausentes</dt>
            <dd>{totalMissing} ponto(s)</dd>
          </div>
          <div>
            <dt>Horário da consulta</dt>
            <dd>{analyzedAt ?? '—'}</dd>
          </div>
        </dl>
        {metricMode === 'raw' && (
          <p className="note">
            Na série bruta, as tendências (OLS / Theil–Sen / GAM) são transladadas para a média histórica para isolar o
            efeito sazonal.
          </p>
        )}
        {isZScore && <p className="note">Modo Z-Score (σ) unifica variáveis de unidades distintas no mesmo eixo vertical.</p>}
        {showSen && regions.some(region => !region.series.sen_fit) && (
          <p className="note">A curva Theil–Sen depende da série ajustada fornecida pelo backend.</p>
        )}
      </footer>

      {showMethodologyModal && (
        <div
          className="methodology-modal-backdrop"
          data-testid="methodology-modal-backdrop"
          onClick={() => setShowMethodologyModal(false)}
        >
          <section
            className="methodology-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Metodologia e Rigor Científico"
            data-testid="methodology-modal"
            onClick={e => e.stopPropagation()}
          >
            <header className="methodology-modal-header">
              <div>
                <span className="methodology-kicker">DOSSIÊ TÉCNICO PARA AVALIADORES · RIGOR ESTATÍSTICO NASA POWER</span>
                <h3>Metodologia &amp; Auditoria ao Vivo dos 7 Invariantes Estatísticos</h3>
              </div>
              <div className="methodology-header-actions">
                <button
                  type="button"
                  data-testid="copy-methodology-btn"
                  className={copiedMethodology ? 'methodology-copy-btn is-copied' : 'methodology-copy-btn'}
                  data-copied={copiedMethodology ? 'true' : 'false'}
                  onClick={() => void handleCopyMethodology()}
                >
                  {copiedMethodology ? '✓ Resumo Copiado!' : 'Copiar Resumo Metodológico'}
                </button>
                <button
                  type="button"
                  data-testid="close-methodology-btn"
                  className="methodology-close-btn"
                  aria-label="Fechar Metodologia e Rigor Científico"
                  onClick={() => setShowMethodologyModal(false)}
                >
                  ✕ Fechar
                </button>
              </div>
            </header>

            <div className="methodology-modal-body">
              <div className="methodology-audit-summary">
                <span className="methodology-audit-pill">
                  ✓ {invariantsReport.passedCount}/{invariantsReport.totalCount} Invariantes Auditados em Tempo Real
                </span>
                <div className="methodology-audit-meta">
                  <CopilotRichText
                    text={`**Variáveis Ativas:** \`${analysis.region_a_analysis.variable_id}\`${
                      analysis.region_b_analysis ? ` × \`${analysis.region_b_analysis.variable_id}\`` : ''
                    } · **Janela:** ${analysis.region_a_analysis.period.start} a ${
                      analysis.region_a_analysis.period.end
                    } (**N_eff** = ${analysis.region_a_analysis.period.n_effective_ar1.toFixed(1)})`}
                  />
                </div>
              </div>

              <h4 className="methodology-section-title">1. Checklist Auditado em Tempo Real da Análise Aberta</h4>
              <div className="methodology-invariants-grid">
                {invariantsReport.items.map(item => (
                  <article
                    key={item.id}
                    data-testid={`invariant-audit-${item.id}`}
                    className={
                      item.passed
                        ? 'methodology-invariant-card invariant-pass'
                        : 'methodology-invariant-card invariant-warn'
                    }
                  >
                    <div className="methodology-invariant-head">
                      <span className="methodology-invariant-status">
                        {item.passed ? '✓ AUDITADO' : '⚠ VERIFICAR'}
                      </span>
                      <strong>{item.title}</strong>
                    </div>
                    <code className="methodology-formula-chip">{item.formulaDisplay}</code>
                    <div className="methodology-live-evidence">
                      <CopilotRichText text={`**Evidência Ativa:** ${item.liveEvidence}`} />
                    </div>
                    <div className="methodology-rationale">
                      <CopilotRichText text={item.scientificRationale} />
                    </div>
                  </article>
                ))}
              </div>

              <h4 className="methodology-section-title">
                2. Formulações Matemáticas do Motor &amp; Grades Nativas NASA POWER
              </h4>
              <div className="methodology-formulas-grid">
                {MATHEMATICAL_FORMULATIONS.map(doc => (
                  <article key={doc.id} className="methodology-formula-card">
                    <div className="methodology-formula-top">
                      <span className="methodology-formula-badge">{doc.badge}</span>
                      <h5>{doc.title}</h5>
                    </div>
                    <pre className="methodology-equation-block">
                      <code>{doc.equation}</code>
                    </pre>
                    <div className="methodology-formula-desc">
                      <CopilotRichText text={doc.description} />
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
