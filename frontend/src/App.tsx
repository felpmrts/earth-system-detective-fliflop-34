import { useEffect, useState } from 'react';
import createPlotlyComponent from 'react-plotly.js/factory';
import Plotly from 'plotly.js-basic-dist-min';
import type { RegionAnalysisResponse } from './contracts/types';
import { VARIABLE_LIST } from './contracts/catalog';
import './bench.css';

const Plot = createPlotlyComponent(Plotly);

export default function App() {
  const [analysis, setAnalysis] = useState<RegionAnalysisResponse>();
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<'map' | 'bench'>('map');
  const [selected, setSelected] = useState('');
  const [anomaly, setAnomaly] = useState(false);
  const [separate, setSeparate] = useState(false);
  const [dual, setDual] = useState(true);
  const [trend, setTrend] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch(import.meta.env.BASE_URL + 'data/mock_analysis.json', { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('Fixture indisponível');
        return response.json();
      })
      .then(setAnalysis)
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, []);

  const regions = analysis ? [analysis.region_a_analysis, analysis.region_b_analysis].filter(region => region != null) : [];
  const mixed = regions.length > 1 && regions[0]?.unit !== regions[1]?.unit;
  const stacked = separate || (mixed && !dual);
  const traces = regions.flatMap((region, index) => {
    const { series } = region;
    const color = index === 0 ? '#67e8f9' : '#fbbf24';
    const name = (index === 0 ? 'A · ' : 'B · ') + region.variable_name;
    const axis = index === 1 && (dual || stacked) ? 'y2' : 'y';
    const base = { x: [...series.dates], type: 'scatter' as const, mode: 'lines' as const, yaxis: axis };
    const fitted = series as typeof series & { sen_fit?: number[] };
    return [
      { ...base, name, y: [...(anomaly ? series.anomaly_values : series.raw_values)], line: { color } },
      ...(anomaly && trend ? [
        { ...base, name: (index ? 'B' : 'A') + ' · OLS', y: [...series.linear_fit], line: { color, dash: 'dot' as const } },
        ...(fitted.sen_fit ? [{ ...base, name: (index ? 'B' : 'A') + ' · Sen', y: fitted.sen_fit, line: { color, dash: 'dash' as const } }] : []),
      ] : []),
    ];
  });

  return (
    <main>
      <header><h1>Earth System Trend Detective</h1></header>
      <div className="workspace">
        <aside aria-label="Catálogo de variáveis">
          <h2>Variáveis</h2>
          {[...new Set(VARIABLE_LIST.map(variable => variable.domain))].map(domain => (
            <details key={domain} open={domain === VARIABLE_LIST[0]?.domain}>
              <summary>{domain}</summary>
              {VARIABLE_LIST.filter(variable => variable.domain === domain).map(variable => (
                <button key={variable.variable_id} aria-pressed={selected === variable.variable_id}
                  onClick={() => setSelected(variable.variable_id)}>{variable.variable_name}</button>
              ))}
            </details>
          ))}
        </aside>
        <div className="exploration">
          <nav aria-label="Área de trabalho">
            <button aria-current={tab === 'map' ? 'page' : undefined} onClick={() => setTab('map')}>Mapa</button>
            <button aria-current={tab === 'bench' ? 'page' : undefined} onClick={() => setTab('bench')}>Bancada científica</button>
          </nav>
          {tab === 'map' ? <section className="map-preview" aria-label="Área reservada para o mapa">
            <div className="map-caption">
              <h2>{VARIABLE_LIST.find(variable => variable.variable_id === selected)?.variable_name ?? 'Selecione uma variável'}</h2>
              <p>O mapa interativo será integrado aqui.</p>
              <button onClick={() => setTab('bench')}>Abrir análise de demonstração</button>
            </div>
          </section> : (
      <section className="bench-panel" aria-label="Séries temporais">
        <div className="controls">
          <label><input type="checkbox" checked={anomaly} onChange={event => setAnomaly(event.target.checked)} /> Anomalia</label>
          <label><input type="checkbox" checked={separate} onChange={event => setSeparate(event.target.checked)} /> Curvas separadas</label>
          <label><input type="checkbox" checked={dual} disabled={separate || regions.length < 2} onChange={event => setDual(event.target.checked)} /> Eixo Y duplo</label>
          <label><input type="checkbox" checked={trend} disabled={!anomaly} onChange={event => setTrend(event.target.checked)} /> OLS e Theil–Sen</label>
        </div>
        {error && <p role="alert">Não foi possível carregar os dados de demonstração.</p>}
        {!analysis && !error && <p role="status">Carregando séries…</p>}
        {analysis && <>
          <Plot data={traces} useResizeHandler style={{ width: '100%', height: '100%', minHeight: stacked && regions.length > 1 ? 520 : 340 }} config={{ responsive: true, displaylogo: false }} layout={{
            autosize: true,
            paper_bgcolor: '#121e30', plot_bgcolor: '#121e30', font: { color: '#e1edf8' },
            margin: { l: 75, t: 28, r: 75, b: 95 },
            xaxis: { type: 'date', anchor: stacked && regions.length > 1 ? 'y2' : 'y' },
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
