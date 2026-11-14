import environmentalFamilies from './contracts/environmentalFamilies.json';
import { Select } from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { useEffect, useRef, useState } from 'react';
import createPlotlyComponent from 'react-plotly.js/factory';
import Plotly from 'plotly.js-basic-dist-min';
import type {
  MapSelectionPayload,
  RegionAnalysisResponse,
  VariableId,
} from './contracts/types';
import { VARIABLE_LIST } from './contracts/catalog';
import { getRegionData } from './services/regionDataAdapter';
import { MapCanvas } from './components/MapCanvas';
import './bench.css';

const Plot = createPlotlyComponent(Plotly);

const supportedVariables = new Set<string>(VARIABLE_LIST.map(variable => variable.variable_id));
const variableOptions = environmentalFamilies.map(({ group, items }) => ({
  group,
  items: items.map(option => ({
    ...option,
    disabled: !supportedVariables.has(option.value),
  })),
}));

export default function App() {
  const [analysis, setAnalysis] = useState<RegionAnalysisResponse>();
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<'map' | 'bench'>('map');
  const [variableA, setVariableA] = useState('GWETTOP');
  const [variableB, setVariableB] = useState('T2M_MAX');
  const [startMonth, setStartMonth] = useState('');
  const [endMonth, setEndMonth] = useState('');
  const metadataA = VARIABLE_LIST.find(variable => variable.variable_id === variableA);
  const metadataB = VARIABLE_LIST.find(variable => variable.variable_id === variableB);
  const minimumMonth = metadataA && metadataB
    ? Math.max(metadataA.min_year, metadataB.min_year) + '-01'
    : '';
  const maximumMonth = new Date().toISOString().slice(0, 7);
  const start = startMonth >= minimumMonth && startMonth <= maximumMonth ? startMonth : '';
  const end = endMonth >= (start || minimumMonth) && endMonth <= maximumMonth ? endMonth : '';
  const periodReady = Boolean(minimumMonth && start && end);

  const [anomaly, setAnomaly] = useState(false);
  const [separate, setSeparate] = useState(false);
  const [dual, setDual] = useState(true);
  const [trend, setTrend] = useState(true);
  const selectionAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(import.meta.env.BASE_URL + 'data/mock_analysis.json', { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('Fixture indisponível');
        return response.json();
      })
      .then(setAnalysis)
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => {
      controller.abort();
      selectionAbortRef.current?.abort();
    };
  }, []);

  const handleMapSelectionChange = (payload: MapSelectionPayload) => {
    if (!payload.regionA) return;

    selectionAbortRef.current?.abort();
    const controller = new AbortController();
    selectionAbortRef.current = controller;

    getRegionData({
      variable: payload.variable_x,
      variableB: payload.variable_y,
      region: payload.regionA,
      regionB: payload.regionB,
      startDate: start || undefined,
      endDate: end || undefined,
      signal: controller.signal,
    })
      .then((res) => {
        if (!controller.signal.aborted) {
          setAnalysis(res);
          setError(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError(true);
        }
      });
  };

  const available = [analysis?.region_a_analysis, analysis?.region_b_analysis];
  const selections = [{ slot: 'A', id: variableA }, { slot: 'B', id: variableB }];
  const regions = selections.flatMap(({ slot, id }) => {
    const region = available.find(item => item?.variable_id === id);
    return region ? [{ ...region, slot }] : [];
  });
  const missing = selections.filter(({ id }) => id && !available.some(item => item?.variable_id === id));
  const mixed = regions.length > 1 && regions[0]?.unit !== regions[1]?.unit;
  const stacked = separate || (mixed && !dual);
  const months = regions.flatMap(region => region.series.dates).sort();
  const firstMonth = periodReady ? start : months[0];
  const lastMonth = periodReady ? end : months.at(-1);
  const firstDate = firstMonth ? firstMonth + '-01' : undefined;
  const lastDate = lastMonth
    ? new Date(Date.UTC(Number(lastMonth.slice(0, 4)), Number(lastMonth.slice(5, 7)), 0)).toISOString().slice(0, 10)
    : undefined;
  const hasPoints = months.some(month => !periodReady || (month >= start && month <= end));
  const traces = regions.flatMap((region, index) => {
    const { series } = region;
    const color = region.slot === 'A' ? '#67e8f9' : '#fbbf24';
    const name = region.slot + ' · ' + region.variable_name;
    const axis = index === 1 && (dual || stacked) ? 'y2' : 'y';
    const indices = series.dates.flatMap((month, i) => !periodReady || (month >= start && month <= end) ? [i] : []);
    const valuesInRange = (values: readonly (number | null)[]) => indices.map(i => values[i] ?? null);
    const base = { x: indices.map(i => series.dates[i] + '-01'), type: 'scatter' as const, mode: 'lines' as const, yaxis: axis };
    const fitted = series as typeof series & { sen_fit?: number[] };
    return [
      { ...base, name, y: valuesInRange(anomaly ? series.anomaly_values : series.raw_values), line: { color } },
      ...(anomaly && trend ? [
        { ...base, name: region.slot + ' · OLS', y: valuesInRange(series.linear_fit), line: { color, dash: 'dot' as const } },
        ...(fitted.sen_fit ? [{ ...base, name: region.slot + ' · Sen', y: valuesInRange(fitted.sen_fit), line: { color, dash: 'dash' as const } }] : []),
      ] : []),
    ];
  });

  return (
    <main>
      <header><h1>Earth System Trend Detective</h1></header>
      <div className="workspace">
        <aside aria-label="Catálogo de variáveis">
          <h2>Variáveis</h2>
          {([
            { slot: 'A', value: variableA, onChange: setVariableA },
            { slot: 'B', value: variableB, onChange: setVariableB },
          ]).map(({ slot, value, onChange }) => (
            <Select key={slot} className="variable-picker"
              classNames={{ input: 'selection-input', dropdown: 'selection-dropdown', option: 'selection-option' }}
              label={'Variável ' + slot} placeholder="Buscar variável"
              data={variableOptions} searchable clearable clearSectionMode="clear"
              clearButtonProps={{ 'aria-label': 'Limpar variável ' + slot }} nothingFoundMessage="Nenhuma variável encontrada"
              value={value || null} onChange={id => onChange(id ?? '')}
              comboboxProps={{ width: 310, position: 'bottom-start', withinPortal: true }}
              maxDropdownHeight={340} />
          ))}
          <fieldset className="period-picker" disabled={!minimumMonth}>
            <legend>Período</legend>
            <MonthPickerInput className="variable-picker" classNames={{ input: 'selection-input' }} label="Mês inicial" placeholder="Selecione o mês"
              locale="pt-br" valueFormat="MMMM [de] YYYY" clearable disabled={!minimumMonth}
              minDate={minimumMonth ? minimumMonth + '-01' : undefined} maxDate={maximumMonth + '-01'}
              value={start ? start + '-01' : null} onChange={value => setStartMonth(value?.slice(0, 7) ?? '')} />
            <MonthPickerInput className="variable-picker" classNames={{ input: 'selection-input' }} label="Mês final" placeholder="Selecione o mês"
              locale="pt-br" valueFormat="MMMM [de] YYYY" clearable disabled={!minimumMonth}
              minDate={minimumMonth ? (start || minimumMonth) + '-01' : undefined} maxDate={maximumMonth + '-01'}
              value={end ? end + '-01' : null} onChange={value => setEndMonth(value?.slice(0, 7) ?? '')} />
          </fieldset>
        </aside>
        <div className="exploration">
          <nav aria-label="Área de trabalho">
            <button aria-current={tab === 'map' ? 'page' : undefined} onClick={() => setTab('map')}>Mapa</button>
            <button aria-current={tab === 'bench' ? 'page' : undefined} onClick={() => setTab('bench')}>Bancada científica</button>
          </nav>
          {tab === 'map' ? (
            <MapCanvas
              activeVariable={(variableA || variableB || 'GWETTOP') as VariableId}
              secondaryVariable={(variableB || null) as VariableId | null}
              periodLabel={
                periodReady
                  ? 'Período: ' + start + ' a ' + end
                  : 'Defina o período ao lado ou use o intervalo completo NASA'
              }
              onSelectionChange={handleMapSelectionChange}
              onOpenBench={() => setTab('bench')}
            />
          ) : (
      <section className="bench-panel" aria-label="Séries temporais">
        <div className="controls">
          <label><input type="checkbox" checked={anomaly} onChange={event => setAnomaly(event.target.checked)} /> Anomalia</label>
          <label><input type="checkbox" checked={separate} onChange={event => setSeparate(event.target.checked)} /> Curvas separadas</label>
          <label><input type="checkbox" checked={dual} disabled={separate || regions.length < 2} onChange={event => setDual(event.target.checked)} /> Eixo Y duplo</label>
          <label><input type="checkbox" checked={trend} disabled={!anomaly} onChange={event => setTrend(event.target.checked)} /> OLS e Theil–Sen</label>
        </div>
        {error && <p role="alert">Não foi possível carregar os dados de demonstração.</p>}
        {!analysis && !error && <p role="status">Carregando séries…</p>}
                {analysis && missing.map(({ slot, id }) => (
          <p className="note" role="status" key={slot}>
            Variável {slot} · {VARIABLE_LIST.find(variable => variable.variable_id === id)?.variable_name}
            {' ainda não tem série no mock.'}
          </p>
        ))}
        {analysis && regions.length === 0 && missing.length === 0 && <p>Selecione uma variável para ver a série.</p>}
        {analysis && regions.length > 0 && !hasPoints && <p role="status">O mock não contém dados no período selecionado.</p>}
        {analysis && hasPoints && <>
          <Plot key={firstDate + "/" + lastDate} data={traces} useResizeHandler style={{ width: '100%', height: '100%', minHeight: stacked && regions.length > 1 ? 520 : 340 }} config={{ responsive: true, displaylogo: false }} layout={{
            autosize: true,
            paper_bgcolor: '#121e30', plot_bgcolor: '#121e30', font: { color: '#e1edf8' },
            margin: { l: 75, t: 28, r: 75, b: 95 },
            xaxis: { type: 'date', range: [firstDate, lastDate], minallowed: firstDate, maxallowed: lastDate, anchor: stacked && regions.length > 1 ? 'y2' : 'y' },
            yaxis: { title: { text: regions[0]?.unit }, automargin: true, domain: stacked && regions.length > 1 ? [0.55, 1] : [0, 1] },
            yaxis2: stacked
              ? { title: { text: regions[1]?.unit }, automargin: true, domain: [0, 0.45], anchor: 'x' }
              : { title: { text: regions[1]?.unit }, automargin: true, overlaying: 'y', side: 'right' },
            legend: { orientation: 'h', y: -0.18 },
          }} />
          <p className="note">Dados de demonstração. As tendências são exibidas na visão de anomalia.</p>
          {anomaly && trend && regions.some(region => !('sen_fit' in region.series)) && <p className="note">A curva Theil–Sen depende da série ajustada fornecida pelo backend.</p>}
        </>}
      </section>
          )}
        </div>
      </div>
    </main>
  );
}
