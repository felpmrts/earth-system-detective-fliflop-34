import { useState } from 'react';
import createPlotlyComponent from 'react-plotly.js/factory';
import Plotly from 'plotly.js-basic-dist-min';
import { getVariableMetadata, VARIABLE_LIST } from '../contracts/catalog';
import type { RegionAnalysisResponse, RegionSelection, VariableStatistics } from '../contracts/types';
import {
  CONFIDENCE_LABELS,
  countMissingValues,
  formatPValue,
  formatSignedNumber,
  REGIME_LABELS,
  SCIENTIFIC_GLOSSARY,
  summarizeRegionCoords,
  type TrendMode,
} from './benchMeta';

const Plot = createPlotlyComponent(Plotly);

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
          <dt>Regime</dt>
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

  const available = [analysis.region_a_analysis, analysis.region_b_analysis];
  const selections = [
    { slot: 'A' as const, id: variableA, regionSel: regionA },
    { slot: 'B' as const, id: variableB, regionSel: regionB },
  ];
  const regions = selections.flatMap(({ slot, id, regionSel }) => {
    const region = available.find(item => item?.variable_id === id);
    return region ? [{ ...region, slot, regionSel }] : [];
  });
  const missing = selections.filter(({ id }) => id && !available.some(item => item?.variable_id === id));
  const mixed = regions.length > 1 && regions[0]?.unit !== regions[1]?.unit;
  const stacked = separate || (mixed && !dual);
  const months = regions.flatMap(region => region.series.dates).sort();
  const firstMonth = periodReady ? start : months[0];
  const lastMonth = periodReady ? end : months.at(-1);
  const firstDate = firstMonth ? `${firstMonth}-01` : undefined;
  const lastDate = lastMonth
    ? new Date(Date.UTC(Number(lastMonth.slice(0, 4)), Number(lastMonth.slice(5, 7)), 0)).toISOString().slice(0, 10)
    : undefined;
  const hasPoints = months.some(month => !periodReady || (month >= start && month <= end));
  const isOfflineAnalysis = analysis.request_meta.source === 'offline_fallback';

  const showOls = anomaly && (trendMode === 'ols' || trendMode === 'both');
  const showSen = anomaly && (trendMode === 'sen' || trendMode === 'both');

  const traces = regions.flatMap((region, index) => {
    const { series } = region;
    const color = region.slot === 'A' ? '#67e8f9' : '#fbbf24';
    const name = `${region.slot} · ${region.variable_name}`;
    const axis = index === 1 && (dual || stacked) ? 'y2' : 'y';
    const indices = series.dates.flatMap((month, i) =>
      !periodReady || (month >= start && month <= end) ? [i] : [],
    );
    const valuesInRange = (values: readonly (number | null)[]) => indices.map(i => values[i] ?? null);
    const customdata = indices.map(i => [
      formatPointValue(series.raw_values[i]),
      formatPointValue(series.anomaly_values[i]),
      formatPointValue(series.linear_fit[i]),
      region.unit,
      `Região ${region.slot}`,
      region.variable_name,
    ]);
    const hovertemplate =
      '<b>%{customdata[4]} · %{customdata[5]}</b><br>' +
      'Mês: %{x|%b/%Y}<br>' +
      'Bruto: %{customdata[0]} %{customdata[3]}<br>' +
      'Anomalia: %{customdata[1]} %{customdata[3]}<br>' +
      'Tendência OLS: %{customdata[2]} %{customdata[3]}<extra></extra>';

    const base = {
      x: indices.map(i => `${series.dates[i]}-01`),
      type: 'scatter' as const,
      mode: 'lines' as const,
      yaxis: axis,
      customdata,
      hovertemplate,
    };
    const fitted = series as typeof series & { sen_fit?: number[] };

    return [
      {
        ...base,
        name,
        y: valuesInRange(anomaly ? series.anomaly_values : series.raw_values),
        line: { color, width: 2, dash: region.slot === 'A' ? ('solid' as const) : ('longdash' as const) },
      },
      ...(showOls
        ? [
            {
              ...base,
              name: `${region.slot} · OLS`,
              y: valuesInRange(series.linear_fit),
              line: { color, width: 1.75, dash: 'dot' as const },
            },
          ]
        : []),
      ...(showSen && fitted.sen_fit
        ? [
            {
              ...base,
              name: `${region.slot} · Theil–Sen`,
              y: valuesInRange(fitted.sen_fit),
              line: { color, width: 1.75, dash: 'dash' as const },
            },
          ]
        : []),
    ];
  });

  const sourceLabel =
    analysis.request_meta.source === 'backend_api'
      ? 'NASA POWER via backend'
      : analysis.request_meta.source === 'idb_cache'
        ? 'Cache local (IndexedDB)'
        : 'Dados de demonstração (fallback offline)';

  const totalMissing = regions.reduce(
    (sum, r) => sum + countMissingValues(anomaly ? r.series.anomaly_values : r.series.raw_values),
    0,
  );

  return (
    <section className="bench-panel" aria-label="Séries temporais e diagnóstico">
      <header className="discovery-header">
        <div className="discovery-title-row">
          <div>
            <h2>Resumo da descoberta</h2>
            <p className="discovery-subtitle">
              Período: <strong>{firstMonth ?? '—'}</strong> a <strong>{lastMonth ?? '—'}</strong>
              {regions[0] && ` · ${regions[0].period.n_observations} meses (N efetivo AR(1): ${regions[0].period.n_effective_ar1.toFixed(1)})`}
            </p>
          </div>
          <button
            type="button"
            className="glossary-toggle"
            aria-expanded={glossaryOpen}
            onClick={() => setGlossaryOpen(prev => !prev)}
          >
            {glossaryOpen ? 'Ocultar ajuda científica' : 'Ajuda científica (?)'}
          </button>
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
        <div className="segmented-group" role="group" aria-label="Escala da série">
          <button type="button" aria-pressed={!anomaly} className={!anomaly ? 'active' : ''} onClick={() => onAnomalyChange(false)}>
            Bruto
          </button>
          <button type="button" aria-pressed={anomaly} className={anomaly ? 'active' : ''} onClick={() => onAnomalyChange(true)}>
            Anomalia
          </button>
        </div>

        <div className="segmented-group" role="group" aria-label="Disposição das curvas">
          <button type="button" aria-pressed={!separate} className={!separate ? 'active' : ''} onClick={() => onSeparateChange(false)}>
            Juntas
          </button>
          <button type="button" aria-pressed={separate} className={separate ? 'active' : ''} onClick={() => onSeparateChange(true)}>
            Separadas
          </button>
        </div>

        <div className="segmented-group" role="group" aria-label="Eixo vertical">
          <button
            type="button"
            aria-pressed={!dual}
            className={!dual ? 'active' : ''}
            disabled={separate || regions.length < 2}
            onClick={() => onDualChange(false)}
          >
            Eixo único
          </button>
          <button
            type="button"
            aria-pressed={dual}
            className={dual ? 'active' : ''}
            disabled={separate || regions.length < 2}
            onClick={() => onDualChange(true)}
          >
            Eixo Y duplo
          </button>
        </div>

        <div className="segmented-group" role="group" aria-label="Linhas de tendência">
          {(
            [
              { id: 'none', label: 'Sem tendência' },
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
              disabled={!anomaly}
              onClick={() => onTrendModeChange(option.id)}
              title={!anomaly ? 'Disponível na visão de anomalia' : undefined}
            >
              {option.label}
            </button>
          ))}
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

      {hasPoints && (
        <div className="plot-frame">
          <Plot
            key={`${firstDate}/${lastDate}/${stacked}/${dual}`}
            data={traces}
            useResizeHandler
            style={{ width: '100%', height: '100%', minHeight: stacked && regions.length > 1 ? 500 : 340 }}
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
                title: { text: regions[0]?.unit },
                automargin: true,
                domain: stacked && regions.length > 1 ? [0.55, 1] : [0, 1],
              },
              yaxis2: stacked
                ? { title: { text: regions[1]?.unit }, automargin: true, domain: [0, 0.45], anchor: 'x' }
                : { title: { text: regions[1]?.unit }, automargin: true, overlaying: 'y', side: 'right' },
              legend: { orientation: 'h', y: -0.18 },
            }}
          />
        </div>
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
        {anomaly && (showSen) && regions.some(region => !('sen_fit' in region.series)) && (
          <p className="note">A curva Theil–Sen depende da série ajustada fornecida pelo backend.</p>
        )}
      </footer>
    </section>
  );
}
