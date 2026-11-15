import { type ComponentProps, type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import createPlotlyComponent from 'react-plotly.js/factory';
import Plotly from 'plotly.js-basic-dist-min';
import { getVariableMetadata, VARIABLE_LIST } from '../contracts/catalog';
import type {
  CopilotHistoryTurn,
  CopilotResponse,
  DiscoveryResponse,
  RegionAnalysisResponse,
  RegionSelection,
  VariableStatistics,
} from '../contracts/types';
import { exportAnalysisAsCsv, exportAnalysisAsJson } from '../services/dataExporter';
import { CopilotRichText } from './CopilotRichText';
import {
  askStatisticalCopilot,
  buildClientCopilotResponse,
  discoverDynamicPatterns,
} from '../services/regionDataAdapter';
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
  readonly isUpdating?: boolean;
  readonly isJustUpdated?: boolean;
  readonly updateSeq?: number;
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

/** Card retrátil: corpo permanece montado no DOM (classe `is-collapsed`), preservando testes e âncoras do tutorial. */
function BenchCollapsible({
  id,
  icon,
  title,
  badges,
  open,
  onToggle,
  children,
}: {
  readonly id: string;
  readonly icon: string;
  readonly title: string;
  readonly badges: readonly string[];
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly children: ReactNode;
}) {
  const bodyId = `bench-card-body-${id}`;
  return (
    <div className={open ? 'bench-collapsible-card is-open' : 'bench-collapsible-card'} data-card-id={id}>
      <button
        type="button"
        className="bench-card-toggle"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
      >
        <span className="bench-card-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="bench-card-title">{title}</span>
        <span className="bench-card-badges">
          {badges.slice(0, 3).map(badge => (
            <span key={badge} className="bench-card-badge">
              {badge}
            </span>
          ))}
        </span>
        <span className="bench-card-action">
          {open ? 'Collapse ' : 'Expand '}
          <span className="bench-card-chevron" aria-hidden="true">
            {open ? '▴' : '▾'}
          </span>
        </span>
      </button>
      <div id={bodyId} className={open ? 'bench-collapsible-body' : 'bench-collapsible-body is-collapsed'}>
        {children}
      </div>
    </div>
  );
}

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
            ? 'Run an analysis to enable CSV export'
            : 'Export time series and statistical summary as scientific CSV'
        }
      >
        Export CSV
      </button>
      <button
        type="button"
        className="glossary-toggle export-action"
        disabled={disabled}
        onClick={onExportJson}
        title={
          disabled
            ? 'Run an analysis to enable JSON export'
            : 'Export full analysis and structured metadata as JSON'
        }
      >
        Export JSON
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
          <dt>Theil–Sen Rate</dt>
          <dd>
            <strong>{formatSignedNumber(stats.regression.slope_per_decade_sen)}</strong>{' '}
            <span>{stats.trend_unit}</span>
          </dd>
        </div>
        <div>
          <dt>OLS Rate</dt>
          <dd>
            <strong>{formatSignedNumber(stats.regression.slope_per_decade_ols)}</strong>{' '}
            <span>{stats.trend_unit}</span>
          </dd>
        </div>
        <div>
          <dt>GAM Regime</dt>
          <dd>{regime}</dd>
        </div>
        <div>
          <dt>Significance</dt>
          <dd>
            q = {formatPValue(stats.significance.fdr_q_value)} · p<sub>AR(1)</sub> ={' '}
            {formatPValue(stats.significance.p_value_ar1_corrected)}
          </dd>
        </div>
      </dl>
      {topOutlier && (
        <p className="discovery-outlier">
          Extreme (D<sub>M</sub> = {formatPointValue(topOutlier.mahalanobis_d, 2)}): {topOutlier.date} —{' '}
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
  isUpdating = false,
  isJustUpdated = false,
  updateSeq = 0,
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
  const benchSectionRef = useRef<HTMLElement>(null);
  const copilotDrawerRef = useRef<HTMLElement>(null);
  const shouldScrollCopilotRef = useRef(false);
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [useZScore, setUseZScore] = useState(false);
  const [scaleMode, setScaleMode] = useState<ScaleMode>('linear');
  const [viewMode, setViewMode] = useState<ViewMode>('timeseries');
  const [showGam, setShowGam] = useState(true);
  const [showMahalanobis, setShowMahalanobis] = useState(true);
  const [showCusumBreak, setShowCusumBreak] = useState(true);
  const [discoveryResult, setDiscoveryResult] = useState<DiscoveryResponse | null>(null);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [discoveryOpen, setDiscoveryOpen] = useState(true);
  const [showCopilot, setShowCopilot] = useState(true);
  const [openCards, setOpenCards] = useState({
    diagnostic: false,
    'insight-lag': false,
    'insight-seasonal': false,
    'seasonal-cards': false,
    provenance: false,
  });

  useEffect(() => {
    if (!showCopilot || !shouldScrollCopilotRef.current) return;
    shouldScrollCopilotRef.current = false;
    const copilotEl = copilotDrawerRef.current;
    if (typeof copilotEl?.scrollIntoView === 'function') {
      copilotEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [showCopilot]);

  useEffect(() => {
    if (!analysis || analysis.request_meta.source === 'offline_fallback') {
      setDiscoveryResult(null);
      setDiscoveryLoading(false);
      return;
    }
    const controller = new AbortController();
    setDiscoveryLoading(true);
    void discoverDynamicPatterns({ analysis, signal: controller.signal })
      .then(res => {
        if (!controller.signal.aborted) {
          setDiscoveryResult(res);
          setDiscoveryLoading(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setDiscoveryResult(null);
          setDiscoveryLoading(false);
        }
      });
    return () => controller.abort();
  }, [analysis]);

  async function handleRunMlDiscovery() {
    if (!analysis || discoveryLoading) return;
    setDiscoveryLoading(true);
    try {
      const res = await discoverDynamicPatterns({ analysis });
      setDiscoveryResult(res);
      if (res) setDiscoveryOpen(true);
    } finally {
      setDiscoveryLoading(false);
    }
  }

  function handleExplainMlWithCopilot() {
    if (!showCopilot) {
      shouldScrollCopilotRef.current = true;
      setShowCopilot(true);
    } else if (typeof copilotDrawerRef.current?.scrollIntoView === 'function') {
      copilotDrawerRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    const promptText =
      copilotLang === 'en'
        ? 'Run ML discovery and explain the Layer 2 findings: AR(1) CUSUM regime break, partial ENSO/Atlantic ocean teleconnections (BH-FDR), detrended Ridge GCV + purged CV driver attribution, and ocean phases of Mahalanobis extremes.'
        : 'Execute a descoberta dinâmica ML e explique os achados da Camada 2: quebra de regime CUSUM AR(1), teleconexões oceânicas parciais (ENSO/Atlântico com BH-FDR), atribuição física Ridge GCV + purged CV e fases oceânicas dos extremos de Mahalanobis.';
    void submitCopilotQuestion(promptText);
  }

  function toggleCard(key: keyof typeof openCards) {
    setOpenCards(prev => ({ ...prev, [key]: !prev[key] }));
  }
  function selectViewMode(mode: ViewMode) {
    setViewMode(mode);
  }
  function handleToggleCopilot() {
    setShowCopilot(prev => {
      const next = !prev;
      if (next) {
        shouldScrollCopilotRef.current = true;
      }
      return next;
    });
  }
  const [showMethodologyModal, setShowMethodologyModal] = useState(false);
  const [copiedMethodology, setCopiedMethodology] = useState(false);
  const [copilotLang, setCopilotLang] = useState<'pt' | 'en'>('en');
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
      <section className="bench-panel" aria-label="Time series">
        <div className="bench-empty-bar">
          <div className="bench-header-actions" role="group" aria-label="Scientific export">
            <BenchExportActions disabled onExportCsv={() => {}} onExportJson={() => {}} />
          </div>
        </div>
        <div className="bench-empty" role="status">
          <div className="bench-empty-icon" aria-hidden="true">⌁</div>
          <h2>No analysis run yet</h2>
          <p>Choose two variables, set the period, and select regions A and B on the map.</p>
          <button type="button" onClick={onBackToMap}>Back to map</button>
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
      `Region ${region.slot}`,
      region.variable_name,
    ]);
    const hovertemplate =
      '<b>%{customdata[5]} · %{customdata[6]}</b><br>' +
      'Month: %{x|%b/%Y}<br>' +
      'Raw: %{customdata[0]} %{customdata[4]}<br>' +
      'Anomaly: %{customdata[1]} %{customdata[4]}<br>' +
      'Displayed value: %{customdata[2]}<br>' +
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
        name: `${region.slot} · Extremes (D_M > 2.5)`,
        type: 'scatter' as const,
        mode: 'markers' as const,
        yaxis: axis,
        marker: { color: '#f87171', size: 9, symbol: 'diamond', line: { color: '#0a1422', width: 1.2 } },
        hovertemplate:
          '<b>%{customdata[0]}</b> · D_M=%{customdata[2]}<br>' +
          'Value: %{customdata[1]}<br>%{customdata[3]}<extra></extra>',
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

    const matchedPairs: { date: string; x: number; y: number }[] = [];

    itemA.transformed.dates.forEach((d, pos) => {
      const xVal = itemA.transformed.yMain[pos];
      const yVal = mapB.get(d);
      if (xVal === null || xVal === undefined || yVal === undefined) return;
      matchedPairs.push({ date: d, x: xVal, y: yVal });
    });

    const geometry = computeMahalanobisContourAndFit(matchedPairs, 2.5);
    if (!geometry) return null;

    const outlierSet = new Set<number>(geometry.outlierIndices);
    const normalPts: { date: string; x: number; y: number; hint: string }[] = [];
    const outlierPts: { date: string; x: number; y: number; hint: string }[] = [];
    matchedPairs.forEach((p, idx) => {
      const dm = geometry.distances[idx] ?? 0;
      const tempHint = outlierHintsByDate.get(p.date);
      const biHint = `Bivariate D_M (X_A×Y_B) = ${formatPointValue(dm, 2)}`;
      const fullHint = tempHint ? `${biHint}<br>${tempHint}` : biHint;
      if (outlierSet.has(idx)) {
        outlierPts.push({ ...p, hint: fullHint });
      } else {
        normalPts.push({ ...p, hint: fullHint });
      }
    });

    const scatterTraces: PlotTraces = [
      {
        x: normalPts.map(p => p.x),
        y: normalPts.map(p => p.y),
        customdata: normalPts.map(p => [p.date, p.hint]),
        name: `Observations (${matchedPairs.length} months)`,
        type: 'scatter',
        mode: 'markers',
        marker: { color: '#67e8f9', size: 6, opacity: 0.72 },
        hovertemplate: 'Month: %{customdata[0]}<br>X (A): %{x:.4f}<br>Y (B): %{y:.4f}<br>%{customdata[1]}<extra></extra>',
      },
      ...(showMahalanobis && outlierPts.length > 0
        ? [
            {
              x: outlierPts.map(p => p.x),
              y: outlierPts.map(p => p.y),
              customdata: outlierPts.map(p => [p.date, p.hint]),
              name: 'Bivariate Extremes (D_M > 2.5)',
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
        name: 'Mahalanobis Ellipse (D_M = 2.5)',
        type: 'scatter',
        mode: 'lines',
        line: { color: '#fb923c', width: 2, dash: 'dash' },
      },
      {
        x: geometry.fitX,
        y: geometry.fitY,
        name: 'OLS Linear Coupling (X vs. Y)',
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
        ? 'Local cache (IndexedDB)'
        : 'Demo data (offline fallback)';

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
      name: '95% AR(1) Significance Threshold (+r_crit)',
      type: 'scatter',
      mode: 'lines',
      line: { color: '#fb923c', width: 1.5, dash: 'dot' },
      hoverinfo: 'skip',
    },
    {
      x: lagX,
      y: lagLeadResult.lag_profile.map(r => -r.ci95_threshold),
      name: '95% AR(1) Null Band (±r_crit)',
      type: 'scatter',
      mode: 'lines',
      fill: 'tonexty',
      fillcolor: 'rgba(251, 146, 60, 0.08)',
      line: { color: '#fb923c', width: 1.5, dash: 'dot' },
      hovertemplate: 'Lag τ = %{x}m<br>95% AR(1) threshold: ±%{y:.3f}<extra></extra>',
    },
    {
      x: lagX,
      y: lagLeadResult.lag_profile.map(r => r.r_raw_anomalies),
      name: 'r(τ) Raw Anomalies',
      type: 'scatter',
      mode: 'lines',
      line: { color: '#94a3b8', width: 1.8, dash: 'dash' },
      hovertemplate: 'Lag τ = %{x} months<br>r_raw(τ): %{y:.4f}<extra></extra>',
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
      name: 'r(τ) Deseasonalized & Detrended',
      type: 'scatter',
      mode: 'lines+markers',
      marker: { color: '#38bdf8', size: 6 },
      line: { color: '#38bdf8', width: 2.6 },
      hovertemplate:
        '<b>Lagged correlation τ = %{x} months</b><br>r_detrended(τ): %{y:.4f}<br>p_AR1: %{customdata[0]} · q_FDR (25 lags): %{customdata[1]}<br>N_eff: %{customdata[2]} · 95% AR(1) threshold: ±%{customdata[3]}<extra></extra>',
    },
    {
      x: [lagLeadResult.best_detrended_lag.lag_months],
      y: [lagLeadResult.best_detrended_lag.r_detrended],
      name: `Peak τ* = ${lagLeadResult.best_detrended_lag.lag_months >= 0 ? '+' : ''}${lagLeadResult.best_detrended_lag.lag_months}m (r = ${lagLeadResult.best_detrended_lag.r_detrended.toFixed(3)}, q_FDR = ${lagLeadResult.best_detrended_lag.q_fdr.toFixed(4)})`,
      type: 'scatter',
      mode: 'markers',
      marker: {
        color: '#fbbf24',
        size: 13,
        symbol: 'diamond',
        line: { color: '#0a1422', width: 1.8 },
      },
      hovertemplate:
        '<b>Temporal Precedence Peak τ* = %{x} months</b><br>r_detrended(τ*): %{y:.4f}<br>Lagged correlation (no deterministic causation implied)<extra></extra>',
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
        '<b>%{x} · Region A</b><br>B_Sen: %{y:.4f}<br>95% CI: [%{customdata[0]}, %{customdata[1]}]<br>p_AR1: %{customdata[2]} (N_eff=%{customdata[3]})<extra></extra>',
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
              '<b>%{x} · Region B</b><br>B_Sen: %{y:.4f}<br>95% CI: [%{customdata[0]}, %{customdata[1]}]<br>p_AR1: %{customdata[2]} (N_eff=%{customdata[3]})<extra></extra>',
          },
        ]
      : []),
    {
      x: seasonCodes,
      y: seasonCodes.map(s => seasonA.seasons[s].slope_per_decade_ols),
      name: `A · ${seasonA.variable_id} OLS Slope`,
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
      // Silent fallback for test environments without clipboard permission
    }
    setCopiedMethodology(true);
    window.setTimeout(() => setCopiedMethodology(false), 2500);
  }

  const sectionPills = [
    ...(hasPoints && viewMode === 'lag'
      ? [
          {
            id: 'insight-lag',
            label: 'Lag-Lead',
            isOpen: openCards['insight-lag'],
            onToggle: () => toggleCard('insight-lag'),
          },
        ]
      : []),
    ...(hasPoints && viewMode === 'seasonal'
      ? [
          {
            id: 'insight-seasonal',
            label: 'Seasonal Curve',
            isOpen: openCards['insight-seasonal'],
            onToggle: () => toggleCard('insight-seasonal'),
          },
          {
            id: 'seasonal-cards',
            label: 'DJF–SON Seasons',
            isOpen: openCards['seasonal-cards'],
            onToggle: () => toggleCard('seasonal-cards'),
          },
        ]
      : []),
    {
      id: 'diagnostic',
      label: '4 Answers',
      isOpen: openCards.diagnostic,
      onToggle: () => toggleCard('diagnostic'),
    },
    {
      id: 'provenance',
      label: 'Audit & Source',
      isOpen: openCards.provenance,
      onToggle: () => toggleCard('provenance'),
    },
  ] as const;

  const openSectionsCount = sectionPills.filter(pill => pill.isOpen).length;
  const totalVisibleCards = sectionPills.length;
  const allCardsOpen = sectionPills.every(pill => pill.isOpen);

  function toggleAllCards() {
    const next = !allCardsOpen;
    setOpenCards({
      diagnostic: next,
      'insight-lag': next,
      'insight-seasonal': next,
      'seasonal-cards': next,
      provenance: next,
    });
  }

  function handleSectionPillClick(pill: (typeof sectionPills)[number]) {
    const willOpen = !pill.isOpen;
    pill.onToggle();
    if (willOpen) {
      const targetCard = benchSectionRef.current?.querySelector(`[data-card-id="${pill.id}"]`);
      if (typeof targetCard?.scrollIntoView === 'function') {
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }

  return (
    <section
      ref={benchSectionRef}
      className={`bench-panel${isUpdating ? ' is-updating' : ''}${isJustUpdated ? ' is-just-updated' : ''}`}
      data-tour="bench-panel"
      data-updated-seq={updateSeq > 0 ? updateSeq : undefined}
      aria-busy={isUpdating || undefined}
      aria-label="Time series and diagnostics"
    >
      {isJustUpdated && updateSeq > 0 && (
        <div key={`sweep-${updateSeq}`} className="bench-update-sweep" aria-hidden="true" />
      )}
      <header className="discovery-header" data-tour="bench-discovery">
        <div className="discovery-title-row">
          <div>
            <div className="discovery-heading-line">
              <h2>Discovery Summary</h2>
              {isJustUpdated && updateSeq > 0 && (
                <span
                  key={`badge-${updateSeq}`}
                  className="bench-updated-badge"
                  data-testid="bench-updated-badge"
                  role="status"
                  aria-live="polite"
                >
                  <span className="bench-updated-dot" aria-hidden="true" />
                  Bench updated
                </span>
              )}
            </div>
            <p className="discovery-subtitle">
              Period: <strong>{firstMonth ?? '—'}</strong> to <strong>{lastMonth ?? '—'}</strong>
              {regions[0] &&
                ` · ${regions[0].period.n_observations} months (Effective N AR(1): ${formatPointValue(regions[0].period.n_effective_ar1, 1)})`}
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
              <span className="invariants-badge-label">Audited Invariants</span>
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
              onClick={handleToggleCopilot}
            >
              <span className="copilot-toggle-dot" aria-hidden="true" />
              {showCopilot ? 'Hide AI Co-Pilot' : 'Statistical Co-Pilot'}
            </button>
            <button
              type="button"
              className="glossary-toggle"
              aria-expanded={glossaryOpen}
              onClick={() => setGlossaryOpen(prev => !prev)}
            >
              {glossaryOpen ? 'Hide scientific help' : 'Scientific help (?)'}
            </button>
          </div>
        </div>

        <div className="discovery-cards">
          {regions.map(region => (
            <StatSummaryCard key={region.slot} slot={region.slot} stats={region} region={region.regionSel} />
          ))}
        </div>

        {analysis.comparison_pair && (
          <div className="comparison-banner" role="region" aria-label="Multiscale comparison A and B">
            <div className="comparison-metrics">
              <span>
                Paradox / regime: <strong>{analysis.comparison_pair.multiscale_correlation.paradox_type}</strong>
              </span>
              <span>
                Secular correlation (r<sub>global</sub>):{' '}
                <strong>{formatSignedNumber(analysis.comparison_pair.multiscale_correlation.long_term_secular_r, 2)}</strong>
              </span>
              <span>
                Short-term detrended (r<sub>detrended</sub>):{' '}
                <strong>{formatSignedNumber(analysis.comparison_pair.multiscale_correlation.short_term_detrended_r, 2)}</strong>
              </span>
              {analysis.comparison_pair.spatial_divergence_detected && (
                <span className="divergence-pill">Spatial divergence detected</span>
              )}
            </div>
            <p>{analysis.comparison_pair.multiscale_correlation.interpretation}</p>
          </div>
        )}
      </header>

      {glossaryOpen && (
        <aside className="glossary-panel" aria-label="Statistical glossary">
          <h3>How to interpret the indicators</h3>
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

      <div className="controls-bar" data-tour="bench-controls" aria-label="Chart controls">
        <div className="segmented-group" role="group" aria-label="Series normalization">
          <button
            type="button"
            aria-pressed={metricMode === 'raw'}
            className={metricMode === 'raw' ? 'active' : ''}
            onClick={() => {
              setUseZScore(false);
              onAnomalyChange(false);
            }}
          >
            Raw
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
            Anomaly
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

        <div className="segmented-group" role="group" aria-label="Vertical scale">
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

        <div className="segmented-group view-mode-group" role="group" aria-label="Visualization mode">
          <button
            type="button"
            aria-pressed={viewMode === 'timeseries'}
            className={viewMode === 'timeseries' ? 'active' : ''}
            onClick={() => selectViewMode('timeseries')}
          >
            Time Series
          </button>
          <button
            type="button"
            aria-pressed={viewMode === 'scatter'}
            className={viewMode === 'scatter' ? 'active' : ''}
            disabled={!scatterBundle}
            onClick={() => selectViewMode('scatter')}
          >
            Scatter X vs Y
          </button>
          <button
            type="button"
            aria-pressed={viewMode === 'both'}
            className={viewMode === 'both' ? 'active' : ''}
            disabled={!scatterBundle}
            onClick={() => selectViewMode('both')}
          >
            Dual View
          </button>
          <button
            type="button"
            data-testid="view-mode-lag"
            aria-pressed={viewMode === 'lag'}
            className={viewMode === 'lag' ? 'active' : ''}
            onClick={() => selectViewMode('lag')}
          >
            Lag-Lead
          </button>
          <button
            type="button"
            data-testid="view-mode-seasonal"
            aria-pressed={viewMode === 'seasonal'}
            className={viewMode === 'seasonal' ? 'active' : ''}
            onClick={() => selectViewMode('seasonal')}
          >
            Seasonal (DJF–SON)
          </button>
        </div>

        <div className="segmented-group" role="group" aria-label="Curve layout">
          <button
            type="button"
            aria-pressed={!separate}
            className={!separate ? 'active' : ''}
            onClick={() => onSeparateChange(false)}
          >
            Combined
          </button>
          <button
            type="button"
            aria-pressed={separate}
            className={separate ? 'active' : ''}
            onClick={() => onSeparateChange(true)}
          >
            Separate
          </button>
        </div>

        <div className="segmented-group" role="group" aria-label="Vertical axis">
          <button
            type="button"
            aria-pressed={!effectiveDual}
            className={!effectiveDual ? 'active' : ''}
            disabled={separate || regions.length < 2 || isZScore}
            onClick={() => onDualChange(false)}
          >
            Single axis
          </button>
          <button
            type="button"
            aria-pressed={effectiveDual}
            className={effectiveDual ? 'active' : ''}
            disabled={separate || regions.length < 2 || isZScore}
            onClick={() => onDualChange(true)}
          >
            Dual Y-axis
          </button>
        </div>

        <div className="segmented-group" role="group" aria-label="Trend lines">
          {(
            [
              { id: 'none', label: 'No line' },
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

        <div className="segmented-group" role="group" aria-label="Advanced overlays">
          <button
            type="button"
            aria-pressed={showGam}
            className={showGam ? 'active' : ''}
            onClick={() => setShowGam(prev => !prev)}
          >
            GAM Curve
          </button>
          <button
            type="button"
            aria-pressed={showMahalanobis}
            className={showMahalanobis ? 'active' : ''}
            onClick={() => setShowMahalanobis(prev => !prev)}
          >
            Outliers D_M &gt; 2.5
          </button>
          {discoveryResult?.regime_and_gam_geometry.cusum_break_detected &&
            discoveryResult.regime_and_gam_geometry.break_date && (
              <button
                type="button"
                data-testid="toggle-cusum-break-btn"
                aria-pressed={showCusumBreak}
                className={showCusumBreak ? 'active' : ''}
                onClick={() => setShowCusumBreak(prev => !prev)}
              >
                CUSUM Break ({discoveryResult.regime_and_gam_geometry.break_date})
              </button>
            )}
        </div>
      </div>

      {missing.map(({ slot, id }) => (
        <p className="note" role="status" key={slot}>
          Variable {slot} · {VARIABLE_LIST.find(variable => variable.variable_id === id)?.variable_name}
          {isOfflineAnalysis ? ' has no series in the offline bundle.' : ' is not present in the current result.'}
        </p>
      ))}
      {regions.length === 0 && missing.length === 0 && <p className="note">Select a variable to view the series.</p>}
      {regions.length > 0 && !hasPoints && (
        <p className="note" role="status">The current result contains no data in the selected period.</p>
      )}

      {periodTrimmed && (
        <p className="note" role="status">
          Effective data coverage: <strong>{firstMonth}</strong> to <strong>{lastMonth}</strong>{' '}
          (automatically trimmed from selected period {start} to {end}).
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
                  ...(showCusumBreak &&
                  discoveryResult?.regime_and_gam_geometry.cusum_break_detected &&
                  discoveryResult.regime_and_gam_geometry.break_date
                    ? {
                        shapes: [
                          {
                            type: 'line' as const,
                            xref: 'x' as const,
                            yref: 'paper' as const,
                            x0: discoveryResult.regime_and_gam_geometry.break_date,
                            x1: discoveryResult.regime_and_gam_geometry.break_date,
                            y0: 0,
                            y1: 1,
                            line: { color: '#fb7185', width: 2, dash: 'dash' as const },
                          },
                        ],
                        annotations: [
                          {
                            xref: 'x' as const,
                            yref: 'paper' as const,
                            x: discoveryResult.regime_and_gam_geometry.break_date,
                            y: 1.0,
                            yanchor: 'bottom' as const,
                            showarrow: false,
                            font: { size: 11, color: '#fda4af' },
                            bgcolor: 'rgba(15, 23, 42, 0.85)',
                            bordercolor: '#fb7185',
                            borderwidth: 1,
                            text: `CUSUM AR(1): ${discoveryResult.regime_and_gam_geometry.break_date}`,
                          },
                        ],
                      }
                    : {}),
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
                  title: { text: 'Bivariate Scatter & Mahalanobis Ellipse (D_M = 2.5)', font: { size: 13 } },
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
              <BenchCollapsible
                id="insight-lag"
                icon="⇄"
                title="Lag-Lead Panel"
                badges={[
                  `τ* ${lagLeadResult.best_detrended_lag.lag_months >= 0 ? '+' : ''}${lagLeadResult.best_detrended_lag.lag_months}m`,
                  `r ${lagLeadResult.best_detrended_lag.r_detrended.toFixed(2)}`,
                  `BH-FDR ${lagLeadResult.fdr_significant_lags_count}/${lagLeadResult.fdr_family_size}`,
                ]}
                open={openCards['insight-lag']}
                onToggle={() => toggleCard('insight-lag')}
              >
              <div className="chart-insight-strip">
                <div className="chart-insight-badge">
                  <span className="chart-insight-kicker">AR(1) TEMPORAL PRECEDENCE · BH-FDR</span>
                  <strong>
                    τ* = {lagLeadResult.best_detrended_lag.lag_months >= 0 ? '+' : ''}
                    {lagLeadResult.best_detrended_lag.lag_months} months
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
                    95% AR(1) Threshold = ±{lagLeadResult.best_detrended_lag.ci95_threshold.toFixed(3)}
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
                      ? `✓ BH-FDR (${lagLeadResult.fdr_family_size} lags): q_FDR < 0.05 (${lagLeadResult.fdr_significant_lags_count}/${lagLeadResult.fdr_family_size})`
                      : lagLeadResult.best_fdr_status === 'LOCAL_AR1_ONLY'
                        ? `△ BH-FDR (${lagLeadResult.fdr_family_size} lags): exceeds local AR(1) band, but q_FDR ≥ 0.05`
                        : `○ BH-FDR (${lagLeadResult.fdr_family_size} lags): q_FDR ≥ 0.05 (within AR(1) null band)`}
                  </span>
                </div>
              </div>
              </BenchCollapsible>
              <Plot
                key={`lag-${lagLeadResult.variable_a}-${lagLeadResult.variable_b}`}
                data={lagLeadTraces}
                useResizeHandler
                style={{ width: '100%', height: '100%', minHeight: 350 }}
                config={{ responsive: true, displaylogo: false }}
                layout={{
                  autosize: true,
                  title: {
                    text: `Lagged Cross-Correlation r_detrended(τ) · ${lagLeadResult.variable_a} (A) vs. ${lagLeadResult.variable_b} (B) · τ ∈ [-12, +12] months`,
                    font: { size: 13 },
                  },
                  paper_bgcolor: '#121e30',
                  plot_bgcolor: '#121e30',
                  font: { color: '#e1edf8' },
                  hovermode: 'closest',
                  margin: { l: 52, t: 44, r: 24, b: 82 },
                  xaxis: {
                    title: {
                      text: 'Lag τ (months) · τ < 0: B leads A | τ = 0: synchronous | τ > 0: A leads B',
                    },
                    dtick: 2,
                    zeroline: true,
                    zerolinecolor: 'rgba(148, 163, 184, 0.35)',
                    automargin: true,
                  },
                  yaxis: {
                    title: { text: 'Pearson Correlation r_detrended(τ)' },
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
              <BenchCollapsible
                id="insight-seasonal"
                icon="❄"
                title="Seasonal Panel DJF–SON"
                badges={[
                  `Dominant ${seasonA.dominant_season}`,
                  seasonA.has_seasonal_sign_reversal ? 'Sign reversal' : 'Coherent sign',
                ]}
                open={openCards['insight-seasonal']}
                onToggle={() => toggleCard('insight-seasonal')}
              >
              <div className="chart-insight-strip">
                <div className="chart-insight-badge">
                  <span className="chart-insight-kicker">SEASONAL STRATIFICATION · ANOMALIES Y′(a,m)</span>
                  <strong>Dominant Season: {seasonA.dominant_season}</strong>
                </div>
                <p className="chart-insight-text">{seasonalResult.summary_interpretation}</p>
                <div className="chart-insight-pills">
                  <span className="chart-insight-pill">
                    Base: deseasonalized monthly anomalies Y′(a,m) · zero % on interval scale
                  </span>
                  <span className="chart-insight-pill">
                    {seasonA.has_seasonal_sign_reversal
                      ? '⇄ Seasonal Sign Reversal Detected'
                      : '✓ Directional Seasonal Coherence'}
                  </span>
                  {seasonB && (
                    <span className="chart-insight-pill">
                      B ({seasonB.variable_id}): dom. {seasonB.dominant_season} (p_AR1 ={' '}
                      {formatPValue(seasonB.seasons[seasonB.dominant_season].p_value_ar1_corrected)})
                    </span>
                  )}
                </div>
              </div>
              </BenchCollapsible>
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
                    text: `Secular Theil–Sen Slope (B_Sen ± 95% CI) on Monthly Anomalies Y′(a,m) · DJF, MAM, JJA, SON`,
                    font: { size: 13 },
                  },
                  paper_bgcolor: '#121e30',
                  plot_bgcolor: '#121e30',
                  font: { color: '#e1edf8' },
                  hovermode: 'closest',
                  margin: { l: 54, t: 44, r: 24, b: 82 },
                  xaxis: {
                    title: { text: 'Climatological Season (DJF · MAM · JJA · SON)' },
                    automargin: true,
                  },
                  yaxis: {
                    title: { text: `Secular Rate (${seasonA.trend_unit})` },
                    zeroline: true,
                    zerolinecolor: 'rgba(148, 163, 184, 0.4)',
                    automargin: true,
                  },
                  legend: { orientation: 'h', y: -0.24 },
                }}
              />
              <BenchCollapsible
                id="seasonal-cards"
                icon="◐"
                title="Seasons DJF · MAM · JJA · SON"
                badges={seasonCodes.map(code => `${code} ${formatSignedNumber(seasonA.seasons[code].slope_per_decade_sen, 1)}`)}
                open={openCards['seasonal-cards']}
                onToggle={() => toggleCard('seasonal-cards')}
              >
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
                        95% CI: [{formatPointValue(s.slope_ci95_low, 3)},{' '}
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
              </BenchCollapsible>
            </div>
          )}
        </div>
      )}

      <div
        className="bench-sections-toolbar"
        data-testid="bench-sections-toolbar"
        role="region"
        aria-label="Collapsible bench sections control"
      >
        <div className="bench-sections-summary">
          <span className="bench-sections-label">ANALYTICAL PANELS</span>
          <span className="bench-sections-count" data-testid="bench-sections-count">
            {openSectionsCount}/{totalVisibleCards} open
          </span>
        </div>
        <div className="bench-sections-pills" role="group" aria-label="Collapsible panels status">
          {sectionPills.map(pill => (
            <button
              key={pill.id}
              type="button"
              data-testid={`bench-section-pill-${pill.id}`}
              className={`bench-section-pill ${pill.isOpen ? 'is-open' : 'is-closed'}`}
              aria-pressed={pill.isOpen}
              onClick={() => handleSectionPillClick(pill)}
            >
              <span className="bench-section-pill-chevron" aria-hidden="true">
                {pill.isOpen ? '▾' : '▸'}
              </span>
              {pill.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="glossary-toggle bench-toggle-all"
          data-testid="bench-toggle-all-cards"
          aria-pressed={allCardsOpen}
          onClick={toggleAllCards}
        >
          {allCardsOpen ? 'Collapse Panels' : 'Expand All'}
        </button>
      </div>

      {/* diagnostic */}
      <section
        className="diagnostic-drawer"
        data-tour="bench-answers"
        aria-label="The 4 Detective Answers and Multiscale Diagnosis"
      >
        <BenchCollapsible
          id="diagnostic"
          icon="◈"
          title="4-Answer Diagnostic"
          badges={[
            `${regions.length} region(s)`,
            analysis.comparison_pair ? 'A × B comparison' : 'Single series',
            '7 invariants',
          ]}
          open={openCards.diagnostic}
          onToggle={() => toggleCard('diagnostic')}
        >
          <div className="diag-grid">
            <article className="diag-card">
              <h4>1. WHAT changes &amp; Physical Regime (GAM)</h4>
              {regions.map(region => (
                <div key={region.slot} className="diag-row">
                  <span className={`slot-tag slot-${region.slot.toLowerCase()}`}>Region {region.slot}</span>
                  <strong>{region.variable_name}</strong>{' '}
                  <small>({region.variable_id} · {region.unit})</small>
                  <div className="diag-meta">
                    GAM Regime: <b>{REGIME_LABELS[region.regression.regime_shape] ?? region.regression.regime_shape ?? '—'}</b> · Acceleration B₂:{' '}
                    <code>{formatSignedNumber(region.regression.quadratic_acceleration_B2, 5)}</code>
                  </div>
                </div>
              ))}
            </article>

            <article className="diag-card">
              <h4>2. HOW MUCH it changes (Decadal Rate)</h4>
              {regions.map(region => (
                <div key={region.slot} className="diag-row">
                  <span className={`slot-tag slot-${region.slot.toLowerCase()}`}>Region {region.slot}</span>
                  <div>
                    Theil–Sen: <b>{formatSignedNumber(region.regression.slope_per_decade_sen, 4)} {region.trend_unit}</b>{' '}
                    <small>
                      (95% CI: [{formatSignedNumber(region.regression.slope_ci95_low, 4)},{' '}
                      {formatSignedNumber(region.regression.slope_ci95_high, 4)}])
                    </small>
                  </div>
                  <div className="diag-meta">
                    OLS: <b>{formatSignedNumber(region.regression.slope_per_decade_ols, 4)} {region.trend_unit}</b> · A₀:{' '}
                    <code>{formatPointValue(region.regression.intercept_at_start_A0)} {region.unit}</code> · Model Δ:{' '}
                    <b>{formatSignedNumber(region.regression.cumulative_model_change, 4)} {region.unit}</b>
                  </div>
                  {!region.allow_percentage_change && (
                    <small className="invariant-note">
                      Invariant #3: % change blocked for {region.variable_id} ({region.scale_type}).
                    </small>
                  )}
                </div>
              ))}
            </article>

            <article className="diag-card">
              <h4>3. IS IT SIGNIFICANT? (AR(1) + FDR + Coupling)</h4>
              {regions.map(region => {
                const badge =
                  CONFIDENCE_LABELS[region.significance.confidence_tier] ?? CONFIDENCE_LABELS.INSUFFICIENT_SIGNAL;
                return (
                  <div key={region.slot} className="diag-row">
                    <div className="badge-line">
                      <span className={`slot-tag slot-${region.slot.toLowerCase()}`}>Region {region.slot}</span>
                      <span className={`confidence-badge tone-${badge.tone}`}>{badge.label}</span>
                      <span
                        className={
                          region.significance.is_significant_fdr05 ? 'fdr-chip fdr-pass' : 'fdr-chip fdr-fail'
                        }
                      >
                        {region.significance.is_significant_fdr05
                          ? 'q_FDR < 0.05'
                          : 'q_FDR ≥ 0.05 · possible natural noise'}
                      </span>
                    </div>
                    <div className="diag-meta">
                      N<sub>raw</sub> = <b>{region.period.n_observations}</b> → N<sub>effective</sub>(AR1) ={' '}
                      <b>{formatPointValue(region.period.n_effective_ar1, 1)}</b>
                      <br />
                      p<sub>naive</sub> = <code>{formatPValue(region.significance.p_value_naive)}</code> · p<sub>AR1</sub> ={' '}
                      <code>{formatPValue(region.significance.p_value_ar1_corrected)}</code> · q<sub>FDR</sub> ={' '}
                      <code>{formatPValue(region.significance.fdr_q_value)}</code>
                      <br />
                      r = <b>{formatSignedNumber(region.correlation_and_coupling.pearson_r, 3)}</b> · τ ={' '}
                      <b>{formatSignedNumber(region.correlation_and_coupling.kendall_tau, 3)}</b> · R² ={' '}
                      <b>{formatPointValue(region.correlation_and_coupling.r_squared, 3)}</b> · Ellipse ={' '}
                      <b>{formatPointValue(region.correlation_and_coupling.ellipse_aspect_ratio, 3)}</b>
                      <br />
                      Mahalanobis Outliers (D<sub>M</sub> &gt; 2.5): <b>{region.outliers_mahalanobis.length}</b>
                      {region.outliers_mahalanobis[0] && (
                        <>
                          {' '}— peak at <code>{region.outliers_mahalanobis[0].date}</code> (D<sub>M</sub>=
                          {formatPointValue(region.outliers_mahalanobis[0].mahalanobis_d, 2)})
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </article>

            <article className="diag-card">
              <h4>4. WHERE &amp; Multiscale Paradox (A × B)</h4>
              {analysis.comparison_pair ? (
                <div className="diag-row">
                  <div className="badge-line">
                    <span className="paradox-badge">{analysis.comparison_pair.multiscale_correlation.paradox_type}</span>
                    {analysis.comparison_pair.spatial_divergence_detected && (
                      <span className="divergence-pill">Spatial Divergence Detected</span>
                    )}
                  </div>
                  <div className="diag-meta">
                    A: <code>{analysis.comparison_pair.region_a_id}</code> ({analysis.request_meta.cells_count_a} cells)
                    <br />
                    B: <code>{analysis.comparison_pair.region_b_id}</code> (
                    {analysis.request_meta.cells_count_b || analysis.request_meta.cells_count_a} cells)
                    <br />
                    r<sub>global</sub> (secular) ={' '}
                    <b>{formatSignedNumber(analysis.comparison_pair.multiscale_correlation.long_term_secular_r, 3)}</b> ·
                    r<sub>detrended</sub> (short-term) ={' '}
                    <b>{formatSignedNumber(analysis.comparison_pair.multiscale_correlation.short_term_detrended_r, 3)}</b>
                    {analysis.comparison_pair.slope_difference_per_decade !== null && (
                      <>
                        {' '}· Δ Slope (A − B) ={' '}
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
                  Select Region A and Region B (or 2 variables at the same location) for comparative multiscale analysis.
                </p>
              )}
            </article>
          </div>
        </BenchCollapsible>
      </section>

      <section
        className="ml-discovery-bench-panel"
        data-testid="ml-discovery-bench-panel"
        aria-label="Dynamic Discoveries and ML Attribution (Layer 2)"
      >
        <div className="ml-bench-header">
          <div className="ml-bench-title-group">
            <span className="ml-bench-kicker">ML ENGINE · LAYER 2</span>
            <h3>Dynamic Discoveries &amp; Physical Attribution</h3>
            {discoveryResult && (
              <span className="ml-bench-timing-pill">
                {discoveryResult.discovery_meta.execution_time_ms.toFixed(1)} ms ·{' '}
                {discoveryResult.regime_and_gam_geometry.forensic_regime_diagnosis}
              </span>
            )}
          </div>
          <div className="ml-bench-actions">
            {!isOfflineAnalysis && (
              <button
                type="button"
                className="glossary-toggle"
                data-testid="ml-run-discovery-btn"
                disabled={discoveryLoading}
                onClick={() => void handleRunMlDiscovery()}
              >
                {discoveryLoading ? 'Running ML...' : discoveryResult ? 'Re-run ML' : 'Run ML Discovery'}
              </button>
            )}
            <button
              type="button"
              className="ml-copilot-cta"
              data-testid="ml-ask-copilot-btn"
              disabled={copilotLoading}
              onClick={handleExplainMlWithCopilot}
            >
              Interpret ML Findings with Co-Pilot
            </button>
            {discoveryResult && (
              <button
                type="button"
                className="glossary-toggle ml-panel-toggle"
                data-testid="ml-panel-collapse-btn"
                aria-expanded={discoveryOpen}
                onClick={() => setDiscoveryOpen(prev => !prev)}
              >
                {discoveryOpen ? 'Collapse' : 'Expand'}
              </button>
            )}
          </div>
        </div>

        {!discoveryResult && !discoveryLoading && (
          <p className="ml-bench-empty-note">
            {isOfflineAnalysis
              ? 'Offline mode active: use "Interpret ML Findings with Co-Pilot" or start the Python backend for real-time partial ocean teleconnections and CUSUM.'
              : 'Click "Run ML Discovery" for AR(1) CUSUM scan, partial ocean teleconnections (ENSO/Atlantic with FDR), and Purged CV Ridge attribution.'}
          </p>
        )}

        {discoveryResult && discoveryOpen && (
          <div className="ml-bench-grid">
            <article className="ml-bench-card">
              <h4>1. Forensic Regime &amp; AR(1) CUSUM Break</h4>
              <div className="ml-metric-row">
                <span>Diagnosis:</span>
                <code>{discoveryResult.regime_and_gam_geometry.forensic_regime_diagnosis}</code>
              </div>
              <div className="ml-metric-row">
                <span>Structural break (B⁽²⁾ Bridges):</span>
                <strong>
                  {discoveryResult.regime_and_gam_geometry.cusum_break_detected
                    ? `${discoveryResult.regime_and_gam_geometry.break_date} · CUSUM=${discoveryResult.regime_and_gam_geometry.cusum_max_stat?.toFixed(3)} (p=${formatPValue(discoveryResult.regime_and_gam_geometry.p_value_ar1_bridge ?? 1)})`
                    : `No break (CUSUM=${discoveryResult.regime_and_gam_geometry.cusum_max_stat?.toFixed(3) ?? '—'}, p=${formatPValue(discoveryResult.regime_and_gam_geometry.p_value_ar1_bridge ?? 1)})`}
                </strong>
              </div>
              <div className="ml-metric-row">
                <span>Curvature B₂ / Hinge AR(1):</span>
                <span>
                  p_B2={formatPValue(discoveryResult.regime_and_gam_geometry.quadratic_b2_p_ar1 ?? 1)} · p_hinge=
                  {formatPValue(discoveryResult.regime_and_gam_geometry.hinge_p_ar1 ?? 1)}
                </span>
              </div>
              {discoveryResult.regime_and_gam_geometry.pre_break_gam_slope_decade !== undefined &&
                discoveryResult.regime_and_gam_geometry.post_break_gam_slope_decade !== undefined && (
                  <div className="ml-metric-row">
                    <span>Pre vs. post GAM slope:</span>
                    <span>
                      {formatSignedNumber(discoveryResult.regime_and_gam_geometry.pre_break_gam_slope_decade, 3)} →{' '}
                      {formatSignedNumber(discoveryResult.regime_and_gam_geometry.post_break_gam_slope_decade, 3)}{' '}
                      {regions[0]?.trend_unit ?? ''}
                    </span>
                  </div>
                )}
            </article>

            <article className="ml-bench-card">
              <h4>2. Partial Ocean Teleconnections (BH-FDR 5%)</h4>
              <div className="ml-metric-row">
                <span>Strict couplings (detrend + partial FDR &lt; 0.05):</span>
                <strong>
                  {discoveryResult.partial_teleconnections.significant_strict_both_fdr05_count ??
                    discoveryResult.partial_teleconnections.significant_partial_fdr05_count}{' '}
                  / {discoveryResult.partial_teleconnections.total_tests}
                </strong>
              </div>
              {discoveryResult.partial_teleconnections.top_teleconnections.length > 0 ? (
                <table className="ml-bench-table">
                  <thead>
                    <tr>
                      <th>Box / Var</th>
                      <th>Lag</th>
                      <th>r_partial</th>
                      <th>q_FDR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {discoveryResult.partial_teleconnections.top_teleconnections.slice(0, 4).map(row => (
                      <tr key={`${row.ocean_box_id}-${row.ocean_var}-${row.lag_months}`}>
                        <td>
                          <code>
                            {row.ocean_box_id}.{row.ocean_var}
                          </code>
                        </td>
                        <td>{row.lag_months}m</td>
                        <td>{formatSignedNumber(row.partial_r, 3)}</td>
                        <td className={row.is_strictly_coupled_fdr05 ? 'ml-fdr-sig' : ''}>
                          {formatPValue(row.partial_fdr_q)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="ml-bench-empty-note">No cached ocean overlap for this period.</p>
              )}
            </article>

            <article className="ml-bench-card">
              <h4>3. Detrended Ridge Attribution (Purged CV)</h4>
              {discoveryResult.fast_gcv_physical_attribution.status === 'OK' ? (
                <>
                  <div className="ml-metric-row">
                    <span>R² Purged CV / GCV:</span>
                    <strong>
                      {formatPointValue(discoveryResult.fast_gcv_physical_attribution.detrended_purged_cv_r2, 3)} /{' '}
                      {formatPointValue(discoveryResult.fast_gcv_physical_attribution.detrended_gcv_r2, 3)} (p_F_AR1=
                      {formatPValue(discoveryResult.fast_gcv_physical_attribution.p_value_f_ar1 ?? 1)})
                    </strong>
                  </div>
                  {(discoveryResult.fast_gcv_physical_attribution.drivers_ranked ?? []).slice(0, 3).map(drv => (
                    <div key={drv.predictor} className="ml-metric-row">
                      <span>
                        <code>{drv.predictor}</code>
                      </span>
                      <span>
                        β={formatSignedNumber(drv.standardized_beta, 3)} · Δ(Q4−Q1)=
                        {formatSignedNumber(drv.quartile_jump_q4_minus_q1, 3)}
                      </span>
                    </div>
                  ))}
                </>
              ) : (
                <p className="ml-bench-empty-note">
                  Select a second variable (Region B) to rank local physical predictors via Purged CV Ridge.
                </p>
              )}
            </article>

            <article className="ml-bench-card">
              <h4>4. Ocean Phase at Extremes (D_M &gt; 2.5)</h4>
              {discoveryResult.attributed_mahalanobis_outliers.length > 0 ? (
                <ul className="ml-outlier-tags">
                  {discoveryResult.attributed_mahalanobis_outliers.slice(0, 4).map(o => (
                    <li key={o.date}>
                      <code>{o.date}</code> (D_M={formatPointValue(o.mahalanobis_d, 2)}):{' '}
                      <strong>{o.ocean_phase_tag || 'REGIONAL / NEUTRAL'}</strong> · Niño3.4 Z={formatSignedNumber(o.nino34_ts_z, 2)} · Atl Z=
                      {formatSignedNumber(o.atl_grad_ts_z, 2)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ml-bench-empty-note">No extreme outliers (D_M &gt; 2.5) detected in the primary series.</p>
              )}
            </article>
          </div>
        )}
      </section>

      {showCopilot && (
        <section ref={copilotDrawerRef} className="copilot-drawer" aria-label="Interactive Statistical Co-Pilot">
          <div className="copilot-header">
            <div className="copilot-title-block">
              <div className="copilot-chat-identity">
                <span className="copilot-avatar" aria-hidden="true">
                  <svg viewBox="0 0 32 32" width="30" height="30" focusable="false">
                    <rect x="6" y="9" width="20" height="15" rx="5" fill="none" stroke="currentColor" strokeWidth="1.8" />
                    <circle cx="12" cy="16.5" r="2" fill="currentColor" />
                    <circle cx="20" cy="16.5" r="2" fill="currentColor" />
                    <path d="M16 9V5M13 5h6M11 24v2M21 24v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                  <span className="copilot-avatar-pulse" />
                </span>
                <div className="copilot-chat-identity-text">
                  <span className="copilot-online-label">● Online · AI Assistant</span>
                  <h3>{isEn ? 'Statistical Co-Pilot Chatbot' : 'Chatbot Co-Piloto Estatístico'}</h3>
                  <p className="copilot-chat-subtitle">
                    {isEn
                      ? 'Ask questions in natural language about this region’s data and tests'
                      : 'Tire dúvidas em linguagem natural sobre os dados e testes desta região'}
                  </p>
                </div>
              </div>
              <div className="copilot-title-group">
                <span
                  className={`copilot-badge ${
                    copilotIsAi ? 'copilot-badge-ai' : copilotIsPython ? 'copilot-badge-python' : 'copilot-badge-local'
                  }`}
                  title={copilotMeta ? `${copilotMeta.mode} · ${copilotMeta.model}` : undefined}
                >
                  <span
                    className={`copilot-status-dot ${copilotLoading ? 'is-busy' : copilotIsAi ? 'is-ai' : 'is-local'}`}
                    aria-hidden="true"
                  />
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
                  {analysis.comparison_pair ? 'Location A vs B' : 'Location A'}
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
            <div className="copilot-lang-switch" role="group" aria-label="Co-Pilot Language">
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

          <div className="copilot-chat-box copilot-chat-window">
            {copilotMeta?.warnings && copilotMeta.warnings.length > 0 && (
              <p className="copilot-invariant-alert" role="status">
                {copilotMeta.warnings.join(' · ')}
              </p>
            )}
            <div className="copilot-messages copilot-chat-viewport" aria-live="polite">
                <div className="copilot-msg copilot-msg-assistant chat-bubble chat-bubble-assistant chat-bubble-welcome" data-testid="copilot-welcome-bubble">
                  <span className="chat-avatar" aria-hidden="true">AI</span>
                  <div className="chat-bubble-body">
                    <strong className="copilot-msg-role">{isEn ? 'AI Co-Pilot' : 'Co-Piloto IA'}</strong>
                    <p className="chat-welcome-text">
                      {isEn
                        ? '👋 Hi! I am your Statistical Co-Pilot. I can explain whether a trend is real or AR(1) noise, detail the lags (BH-FDR) and seasons (DJF–SON), or analyze the open data. Click a suggestion below or send your question!'
                        : '👋 Olá! Sou o seu Co-Piloto Estatístico. Posso explicar se há tendência real ou ruído AR(1), detalhar os lags (BH-FDR) e estações (DJF–SON), ou analisar os dados abertos. Clique em uma sugestão abaixo ou envie sua pergunta!'}
                    </p>
                  </div>
                </div>
                {copilotHistory.map((turn, idx) => (
                  <div
                    key={`${turn.role}-${idx}`}
                    className={`copilot-msg chat-bubble ${
                      turn.role === 'user'
                        ? 'copilot-msg-user chat-bubble-user'
                        : 'copilot-msg-assistant chat-bubble-assistant'
                    }`}
                  >
                    {turn.role === 'assistant' && (
                      <span className="chat-avatar" aria-hidden="true">
                        AI
                      </span>
                    )}
                    <div className="chat-bubble-body">
                    <strong className="copilot-msg-role">
                      {turn.role === 'user' ? (isEn ? 'You' : 'Você') : isEn ? 'AI Co-Pilot' : 'Co-Piloto IA'}
                    </strong>
                    {turn.role === 'assistant' ? (
                      <CopilotRichText text={turn.content} />
                    ) : (
                      <span className="copilot-msg-text">{turn.content}</span>
                    )}
                    {turn.role === 'assistant' && turn.tools_used && turn.tools_used.length > 0 && (
                      <div className="copilot-tools-audit" aria-label="Executed scientific engines">
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
                  </div>
                ))}
                {copilotLoading && (
                  <div className="copilot-msg copilot-msg-assistant chat-bubble chat-bubble-assistant copilot-msg-thinking" role="status" aria-live="polite">
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

            <div className="copilot-chips-block copilot-chat-suggestions">
              <span className="copilot-section-label">{isEn ? 'Quick investigations' : 'Investigações rápidas'}</span>
              <div className="copilot-chips" role="group" aria-label="Suggested Co-Pilot questions">
                {copilotSynthesis.suggested_questions.map(suggested => (
                  <button
                    key={suggested}
                    type="button"
                    className="copilot-chip"
                    disabled={copilotLoading}
                    onClick={() => void submitCopilotQuestion(suggested)}
                  >
                    <span className="copilot-chip-icon" aria-hidden="true">
                      ✦
                    </span>
                    <span className="copilot-chip-text">{suggested}</span>
                  </button>
                ))}
              </div>
            </div>

            <form className="copilot-form copilot-chat-inputbar" onSubmit={handleCopilotFormSubmit}>
              <span className="copilot-prompt-glyph" aria-hidden="true">
                ›_
              </span>
              <input
                type="text"
                className="copilot-input"
                value={copilotQuestion}
                onChange={e => setCopilotQuestion(e.target.value)}
                placeholder={
                  isEn ? 'Ask the Statistical Co-Pilot something...' : 'Pergunte algo ao Co-Piloto Estatístico...'
                }
                aria-label={isEn ? 'Ask the Statistical Co-Pilot' : 'Pergunte ao Co-Piloto Estatístico'}
                disabled={copilotLoading}
              />
              <button
                type="submit"
                className="copilot-submit"
                disabled={copilotLoading || !copilotQuestion.trim()}
              >
                {copilotLoading ? (isEn ? 'Thinking...' : 'Pensando...') : isEn ? 'Ask' : 'Perguntar'}{' '}
                <span className="copilot-send-icon" aria-hidden="true">
                  ➤
                </span>
              </button>
            </form>
          </div>
        </section>
      )}

      <BenchCollapsible
        id="provenance"
        icon="⌗"
        title="Audit · Data Provenance and Quality"
        badges={[
          analysis.request_meta.source === 'backend_api'
            ? 'Mode: Backend API'
            : analysis.request_meta.source === 'idb_cache'
              ? 'Mode: IndexedDB Cache'
              : 'Mode: Offline demo',
          `${regions.length} series`,
        ]}
        open={openCards.provenance}
        onToggle={() => toggleCard('provenance')}
      >
      <footer className="data-provenance" aria-label="Data provenance and quality">
        <h3>Data provenance and quality</h3>
        <dl className="provenance-grid">
          <div>
            <dt>Source</dt>
            <dd>{sourceLabel}</dd>
          </div>
          <div>
            <dt>Model and resolution</dt>
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
            <dt>Coverage</dt>
            <dd>
              {firstMonth ?? '—'} to {lastMonth ?? '—'} ({regions[0]?.period.n_observations ?? 0} months)
            </dd>
          </div>
          <div>
            <dt>Aggregated cells</dt>
            <dd>
              A: {analysis.request_meta.cells_count_a} · B: {analysis.request_meta.cells_count_b} (
              {analysis.request_meta.spatial_aggregation})
            </dd>
          </div>
          <div>
            <dt>Missing values</dt>
            <dd>{totalMissing} point(s)</dd>
          </div>
          <div>
            <dt>Query timestamp</dt>
            <dd>{analyzedAt ?? '—'}</dd>
          </div>
        </dl>
        {metricMode === 'raw' && (
          <p className="note">
            In the raw series, trends (OLS / Theil–Sen / GAM) are shifted to the historical mean to isolate the
            seasonal effect.
          </p>
        )}
        {isZScore && <p className="note">Z-Score (σ) mode unifies variables with different units on the same vertical axis.</p>}
        {showSen && regions.some(region => !region.series.sen_fit) && (
          <p className="note">The Theil–Sen curve depends on the fitted series provided by the backend.</p>
        )}
      </footer>
      </BenchCollapsible>

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
            aria-label="Methodology and Scientific Rigor"
            data-testid="methodology-modal"
            onClick={e => e.stopPropagation()}
          >
            <header className="methodology-modal-header">
              <div>
                <span className="methodology-kicker">TECHNICAL DOSSIER FOR REVIEWERS · NASA POWER STATISTICAL RIGOR</span>
                <h3>Methodology &amp; Live Audit of the 7 Statistical Invariants</h3>
              </div>
              <div className="methodology-header-actions">
                <button
                  type="button"
                  data-testid="copy-methodology-btn"
                  className={copiedMethodology ? 'methodology-copy-btn is-copied' : 'methodology-copy-btn'}
                  data-copied={copiedMethodology ? 'true' : 'false'}
                  onClick={() => void handleCopyMethodology()}
                >
                  {copiedMethodology ? '✓ Summary Copied!' : 'Copy Methodological Summary'}
                </button>
                <button
                  type="button"
                  data-testid="close-methodology-btn"
                  className="methodology-close-btn"
                  aria-label="Close Methodology and Scientific Rigor"
                  onClick={() => setShowMethodologyModal(false)}
                >
                  ✕ Close
                </button>
              </div>
            </header>

            <div className="methodology-modal-body">
              <div className="methodology-audit-summary">
                <span className="methodology-audit-pill">
                  ✓ {invariantsReport.passedCount}/{invariantsReport.totalCount} Invariants Audited in Real Time
                </span>
                <div className="methodology-audit-meta">
                  <CopilotRichText
                    text={`**Active Variables:** \`${analysis.region_a_analysis.variable_id}\`${
                      analysis.region_b_analysis ? ` × \`${analysis.region_b_analysis.variable_id}\`` : ''
                    } · **Window:** ${analysis.region_a_analysis.period.start} to ${
                      analysis.region_a_analysis.period.end
                    } (**N_eff** = ${analysis.region_a_analysis.period.n_effective_ar1.toFixed(1)})`}
                  />
                </div>
              </div>

              <h4 className="methodology-section-title">1. Live Audited Checklist of the Open Analysis</h4>
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
                        {item.passed ? '✓ AUDITED' : '⚠ CHECK'}
                      </span>
                      <strong>{item.title}</strong>
                    </div>
                    <code className="methodology-formula-chip">{item.formulaDisplay}</code>
                    <div className="methodology-live-evidence">
                      <CopilotRichText text={`**Active Evidence:** ${item.liveEvidence}`} />
                    </div>
                    <div className="methodology-rationale">
                      <CopilotRichText text={item.scientificRationale} />
                    </div>
                  </article>
                ))}
              </div>

              <h4 className="methodology-section-title">
                2. Engine Mathematical Formulations &amp; Native NASA POWER Grids
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
