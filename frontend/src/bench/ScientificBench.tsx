import { type ComponentProps, useState } from 'react';
import createPlotlyComponent from 'react-plotly.js/factory';
import Plotly from 'plotly.js-basic-dist-min';
import { getVariableMetadata, VARIABLE_LIST } from '../contracts/catalog';
import type { RegionAnalysisResponse, RegionSelection, VariableStatistics } from '../contracts/types';
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

function formatPointValue(val: number | null | undefined): string {
  return val !== null && val !== undefined && Number.isFinite(val) ? val.toFixed(3) : '—';
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
  const confidence = CONFIDENCE_LABELS[stats.significance.confidence_tier];
  const regime = REGIME_LABELS[stats.regression.regime_shape];
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
          Extremo (D<sub>M</sub> = {topOutlier.mahalanobis_d.toFixed(2)}): {topOutlier.date} —{' '}
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

  if (!analysis) {
    return (
      <section className="bench-panel" aria-label="Séries temporais">
        <div className="bench-empty" role="status">
          <div className="bench-empty-icon" aria-hidden="true">⌁</div>
          <h2>Nenhuma análise realizada</h2>
          <p>Escolha duas variáveis, defina o período e selecione as regiões A e B no mapa.</p>
          <button type="button" onClick={onBackToMap}>Voltar ao mapa</button>
        </div>
      </section>
    );
  }

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
  const firstDate = firstMonth ? `${firstMonth}-01` : undefined;
  const lastDate = lastMonth
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
          o.observedDisplay.toFixed(3),
          o.mahalanobisD.toFixed(2),
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

  return (
    <section className="bench-panel" aria-label="Séries temporais e diagnóstico">
      <header className="discovery-header">
        <div className="discovery-title-row">
          <div>
            <h2>Resumo da descoberta</h2>
            <p className="discovery-subtitle">
              Período: <strong>{firstMonth ?? '—'}</strong> a <strong>{lastMonth ?? '—'}</strong>
              {regions[0] &&
                ` · ${regions[0].period.n_observations} meses (N efetivo AR(1): ${regions[0].period.n_effective_ar1.toFixed(1)})`}
            </p>
          </div>
          <div className="bench-header-actions">
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
                <strong>{analysis.comparison_pair.multiscale_correlation.long_term_secular_r.toFixed(2)}</strong>
              </span>
              <span>
                Curto prazo sem tendência (r<sub>detrended</sub>):{' '}
                <strong>{analysis.comparison_pair.multiscale_correlation.short_term_detrended_r.toFixed(2)}</strong>
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

      <div className="controls-bar" aria-label="Controles do gráfico">
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

        <div className="segmented-group" role="group" aria-label="Tipo de visualização">
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
                  margin: { l: 75, t: 28, r: 75, b: 95 },
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
                  margin: { l: 75, t: 42, r: 28, b: 85 },
                  xaxis: { title: { text: scatterBundle.xTitle }, automargin: true },
                  yaxis: { title: { text: scatterBundle.yTitle }, automargin: true },
                  legend: { orientation: 'h', y: -0.24 },
                }}
              />
            </div>
          )}
        </div>
      )}

      {showDiagnostics && (
        <section className="diagnostic-drawer" aria-label="As 4 Respostas do Detetive e Diagnóstico Multiescala">
          <div className="diag-grid">
            <article className="diag-card">
              <h4>1. O QUE muda &amp; Regime Físico (GAM)</h4>
              {regions.map(region => (
                <div key={region.slot} className="diag-row">
                  <span className={`slot-tag slot-${region.slot.toLowerCase()}`}>Região {region.slot}</span>
                  <strong>{region.variable_name}</strong>{' '}
                  <small>({region.variable_id} · {region.unit})</small>
                  <div className="diag-meta">
                    Regime GAM: <b>{REGIME_LABELS[region.regression.regime_shape]}</b> · Aceleração B₂:{' '}
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
                    OLS: <b>{formatSignedNumber(region.regression.slope_per_decade_ols, 4)}</b> · A₀:{' '}
                    <code>{region.regression.intercept_at_start_A0.toFixed(3)}</code> · Δ Modelo:{' '}
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
                const badge = CONFIDENCE_LABELS[region.significance.confidence_tier];
                return (
                  <div key={region.slot} className="diag-row">
                    <div className="badge-line">
                      <span className={`slot-tag slot-${region.slot.toLowerCase()}`}>Região {region.slot}</span>
                      <span className={`confidence-badge tone-${badge.tone}`}>{badge.label}</span>
                    </div>
                    <div className="diag-meta">
                      N<sub>bruto</sub> = <b>{region.period.n_observations}</b> → N<sub>efetivo</sub>(AR1) ={' '}
                      <b>{region.period.n_effective_ar1.toFixed(1)}</b>
                      <br />
                      p<sub>naive</sub> = <code>{formatPValue(region.significance.p_value_naive)}</code> · p<sub>AR1</sub> ={' '}
                      <code>{formatPValue(region.significance.p_value_ar1_corrected)}</code> · q<sub>FDR</sub> ={' '}
                      <code>{formatPValue(region.significance.fdr_q_value)}</code>
                      <br />
                      r = <b>{formatSignedNumber(region.correlation_and_coupling.pearson_r, 3)}</b> · τ ={' '}
                      <b>{formatSignedNumber(region.correlation_and_coupling.kendall_tau, 3)}</b> · R² ={' '}
                      <b>{region.correlation_and_coupling.r_squared.toFixed(3)}</b> · Elipse ={' '}
                      <b>{region.correlation_and_coupling.ellipse_aspect_ratio.toFixed(3)}</b>
                      <br />
                      Outliers Mahalanobis (D<sub>M</sub> &gt; 2,5): <b>{region.outliers_mahalanobis.length}</b>
                      {region.outliers_mahalanobis[0] && (
                        <>
                          {' '}— pico em <code>{region.outliers_mahalanobis[0].date}</code> (D<sub>M</sub>=
                          {region.outliers_mahalanobis[0].mahalanobis_d.toFixed(2)})
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
                        <b>{formatSignedNumber(analysis.comparison_pair.slope_difference_per_decade, 4)}</b>
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
    </section>
  );
}
