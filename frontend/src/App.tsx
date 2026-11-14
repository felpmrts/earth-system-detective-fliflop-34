import { VARIABLE_LIST } from './contracts/catalog.ts';
import { buildMapLegendConfig } from './map/legendConfig.ts';

export default function App() {
  const legend = buildMapLegendConfig('T2M');

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '1.5rem', maxWidth: 800 }}>
      <h1>Earth System Trend Detective</h1>
      <p>
        Camada de contrato de dados, geometria NASA (K ≤ 9) e adapter carregada ({VARIABLE_LIST.length} variáveis).
      </p>
      <p>
        <strong>Legenda padrão:</strong> {legend.title} ({legend.trendUnit}) — {legend.statisticalNote}
      </p>
    </main>
  );
}
