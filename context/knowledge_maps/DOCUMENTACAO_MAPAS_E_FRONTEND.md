# Documentação de Contexto — `mapasparte1/` e `frontend/` (PROD-1: Núcleo de Mapas)

**Desafio:** NASA Space Apps 2026 — *Be An Earth System Trend Detective!*  
**Escopo:** Documentação técnica de contexto de todos os arquivos do módulo estático **`mapasparte1/`** e da implementação TypeScript + Vite em **`frontend/`**, respeitando as fronteiras descritas em `00_MASTER_CONTEXT_AND_ROUTER.md`, `CONTRATO_DE_DADOS.md` e `context/knowledge_maps/prod1_context.md`.

---

## 1. Visão Geral Arquitetural

O repositório mantém duas entregas complementares na camada geoespacial (**PROD-1**):

1. **`mapasparte1/` (Protótipo Estático ES Modules sem Bundler):**
   - Executa diretamente em qualquer servidor HTTP estático (ex.: `python -m http.server 8080`), carregando Leaflet via CDN e módulos JS nativos (`<script type="module">`).
   - Serve como ambiente isolado de demonstração e validação rápida do núcleo geoespacial.

2. **`frontend/` (Aplicação Oficial React 19 + TypeScript + Plotly + Vitest + Leaflet):**
   - Base oficial herdada de `origin/frontend` com **PROD-2** (`App.tsx`, `bench.css`, Plotly, `regionDataAdapter.ts`, `contractValidator.ts`, `idbCache.ts`) integrada ao núcleo e contrato **PROD-1** (`MapView.ts`, `MapCanvas.tsx`, `map.css`, `mapStyles.ts`, `legendConfig.ts`, `gridGeometry.ts`, `mapIntegration.ts`, 6 suítes Vitest / 33 testes).

### Fronteiras de Escopo (PROD-1)
- **Responsabilidade de PROD-1:** mapa Leaflet com `preferCanvas: true`, renderização de grade global (Fluxo A) em 3 dimensões independentes (Direção por cor, Magnitude por raio, Significância por opacidade/traço), snapping nativo NASA (`MERRA-2` e `CERES_SYN1deg`), composição conexa em 8-vizinhos (`1 <= K <= 9`), alternância de basemaps/modo offline e emissão do `MapSelectionPayload`.
- **Fora do escopo de PROD-1:** gráficos temporais e vereditos narrativos (`PROD-2`), chamadas diretas às APIs NASA (`DADOS-1`) e cálculo estatístico de OLS/Theil-Sen, GAM, p-valores ou FDR no navegador (`DADOS-2`).

---

## 2. Inventário Detalhado — `mapasparte1/` (9 arquivos)

| Arquivo | Papel no Contexto | Principais Exportações / Responsabilidades |
| :--- | :--- | :--- |
| `mapasparte1/index.html` | Host HTML do protótipo PROD-1 | Carrega Leaflet (`1.9.4`) via CDN, barra lateral com seletor de variáveis (`#select-variable`), abas A/B (`#tab-slot-a`, `#tab-slot-b`), cards espaciais (`#card-region-a`, `#card-region-b`), inspetor `#payload-inspector` (`#payload-json`), toolbar de basemaps (`#btn-dark`, `#btn-satellite`, `#btn-osm`, `#btn-reset`), legenda em 3 dimensões e entrypoint `./js/app.js`. |
| `mapasparte1/css/style.css` | Tema base e layout da barra lateral | Define variáveis CSS (`--bg-primary`, `--bg-secondary`, `--color-cyan`, `--color-magenta`), layout flex `sidebar` (`400px`) + área principal, estilo de botões, abas e cards de seleção espacial. |
| `mapasparte1/css/map.css` | Estilos do canvas do mapa e overlays | Estiliza `#map`, `.map-container`, toolbar flutuante `.spatial-toolbar` (z-index `1000`) e controles/legenda do mapa. |
| `mapasparte1/data/mock_grid.json` | Mock oficial do Fluxo A (`T2M`) | JSON aderente ao contrato `{ variable_id, unit, trend_unit, period, points }` com `15` pontos globais (`lat`, `lon`, `slope_sen_decade`, `q_value_fdr`, `is_sig`). |
| `mapasparte1/js/catalog.js` | Catálogo oficial das 12 variáveis NASA POWER | Exporta `VARIABLE_CATALOG`, `VARIABLE_LIST`, `isValidVariableId`, `getVariableMetadata` e `getIntersectingDateBounds(varA, varB, maxYear)`. Contém todas as 12 variáveis (`T2M`, `T2M_MAX`, `T2M_MIN`, `PRECTOTCORR`, `GWETTOP`, `GWETROOT`, `RH2M`, `WS10M`, `PS`, `ALLSKY_SFC_SW_DWN`, `CLDTOT`, `ALLSKY_SFC_LW_DWN`) com `source_model`, `resolution`, `start_year`, `scale_type`, `unit`, `trend_unit`, `allow_percentage_change` e `land_only_mask`. |
| `mapasparte1/js/utils/geoUtils.js` | Geometria espacial e codificação visual | Exporta `MAX_CELLS_PER_REGION = 9`, `assertValidLatLon`, `snapCoordToCell` (MERRA-2 `0.5° × 0.625°` por arredondamento e CERES `1.0° × 1.0°` com `Math.floor(coord) + 0.5` e clamp em `89.9999`/`179.9999`), `isAdjacent8`, `isConnectedComponent` (BFS), `toggleCellInSelection` (`NOT_ADJACENT`, `MAX_CELLS_EXCEEDED`, `WOULD_DISCONNECT`), `buildRegionSelection` (com `region_id` determinístico lexicográfico), `calculateTrendColor` e `calculatePointRadius`. |
| `mapasparte1/js/map/SelectionLayer.js` | Camada vetorial das células selecionadas | Classe `SelectionLayer`: gerencia dois `L.layerGroup` separados (`layerA` em ciano `#00e5ff`, `layerB` em magenta `#ff007f`), desenhando `L.rectangle(cell.bounds_leaflet, ...)` e limpando slots via `clearSlot(slot)`. |
| `mapasparte1/js/map/MapView.js` | Núcleo Leaflet 2D | Classe `MapView`: inicializa o mapa com `preferCanvas: true`, registra basemaps (`dark`, `satellite` com URL corrigida `{z}/{y}/{x}`, `osm`) + listener `tileerror` para modo offline, renderiza Fluxo A via `setGridData(gridFile)` com tooltips dinâmicas de `trend_unit`/`q_value_fdr`, executa `handleMapClick` -> `snapCoordToCell` -> `toggleCellInSelection` e emite `payload` completo em `emitSelection()`. |
| `mapasparte1/js/app.js` | Controlador do host de teste PROD-1 | Popula `#select-variable`, carrega `./data/{var_id}_grid.json` com fallback para `./data/mock_grid.json`, alterna slots A/B e basemaps, escuta `onSelectionChange(payload)` para atualizar os cards espaciais e o inspetor JSON `#payload-json` (sem lógica estatística/veredito de PROD-2). |

---

## 3. Inventário Detalhado — `frontend/` (Base `origin/frontend` + Adições PROD-1)

### 3.1 Configuração e Entrypoints
| Arquivo | Função |
| :--- | :--- |
| `frontend/package.json` | Define scripts Vite/TS/Vitest (`dev`, `build: "tsc --noEmit && vite build"`, `preview`, `typecheck`, `test: "vitest run"`), dependências (`react@^19`, `react-dom@^19`, `plotly.js-basic-dist-min`, `react-plotly.js`, `leaflet@^1.9.4`) e `vitest@^3`. |
| `frontend/.gitignore` | Ignora `node_modules/`, `dist/`, `.env`, `.env.local` e `.vite/`. |
| `frontend/tsconfig.json` | TypeScript estrito (`strict: true`, `noUncheckedIndexedAccess: true`, `noUnusedLocals: true`, `noUnusedParameters: true`, `jsx: "react-jsx"`, `allowImportingTsExtensions: true`, `include: ["src"]`). |
| `frontend/vite.config.ts` | Configura `@vitejs/plugin-react` e runner Vitest (`environment: 'node'`, `include: ['src/**/*.test.ts']`). |
| `frontend/.env.example` | Documenta `VITE_DATA_MODE=offline` e `VITE_API_BASE_URL=http://localhost:8000`. |
| `frontend/index.html` | Shell HTML da aplicação React/Vite (`<div id="root">`, entrypoint `/src/main.tsx`). |
| `frontend/src/vite-env.d.ts` | Declara tipos `vite/client` e módulo `plotly.js-basic-dist-min`. |
| `frontend/src/main.tsx` | Entrypoint React 19: renderiza `<App />` em `<StrictMode>`. |

### 3.2 Contratos e Catálogo (`frontend/src/contracts/`)
| Arquivo | Função |
| :--- | :--- |
| `frontend/src/contracts/types.ts` | Tipagem estrita compartilhada (`VariableId` com 12 canônicas + `CLOUD_AMT`, `VisualPolarity`, `ScaleType`, `RegionSlot`, `LeafletLatLng`, `LeafletBounds`, `GeoJsonLonLat`, `GridResolution`, `GridCell`, `BackendCellRef`, `RegionSelection`, **`MapSelectionPayload`**, **`MapViewContractProps`**, **`MapNotification`**, **`SemanticApiErrorPayload`**, `GlobalGridFile`, `RegionAnalysisRequest`, `RegionAnalysisResponse` com `sen_fit?` opcional). |
| `frontend/src/contracts/catalog.ts` | Catálogo oficial das 12 variáveis NASA POWER + alias `CLOUD_AMT` (`is_alias_of: 'CLDTOT'`, `CERES_SYN1deg` `1.0° × 1.0°`), `visual_polarity`, `resolveCanonicalGridVariableId()` e `getIntersectingDateBounds(varA, varB, maxYear)`. |
| `frontend/src/contracts/contractValidator.ts` | Validador de runtime dos 7 invariantes estatísticos (`validateGlobalGrid`, `validateVariableStatistics` incl. `sen_fit?`, `validateComparisonPair`, `validateAnalysisResponse`, `isSemanticErrorPayload`). |

### 3.3 Núcleo Geoespacial e Visualização (`frontend/src/geo/`, `src/map/`, `src/components/`)
| Arquivo | Função |
| :--- | :--- |
| `frontend/src/geo/gridGeometry.ts` | Implementa `assertValidLatLon`, `snapCoordToCell` alinhado ao backend (`MERRA-2`: `Math.round(lat/0.5)*0.5` e `Math.round(lon/0.625)*0.625`, compatível com `snap_merra2`; `CERES_SYN1deg`: `Math.floor + 0.5`), `isAdjacent8`, `isConnectedComponent` (BFS), `toggleCellInSelection` (`MAX_CELLS_EXCEEDED`, `NOT_ADJACENT`, `WOULD_DISCONNECT`), `reconcileCellsOnVariableChange`, `buildRegionSelection` e `toBackendCells`. |
| `frontend/src/map/mapStyles.ts` | Exporta `getPolarityPalette`, `getGlobalPointStyle` (3 dimensões independentes guiadas por `visual_polarity`: `thermal` `#d9480f`/`#1864ab`, `hydrological` `#1864ab`/`#d9480f`, `neutral` `#0f766e`/`#6d28d9`) e `getSelectedCellStyle` (Região A em Ciano `#00e5ff`, Região B em Magenta `#ff007f`). |
| `frontend/src/map/legendConfig.ts` | Exporta `buildMapLegendConfig(variableId)` preservando `MapLegendConfig` e gerando rótulos/cores de direção a partir de `meta.visual_polarity` (`Aquecendo/Resfriando`, `Umedecendo/Secando`, `Aumento/Queda`). |
| `frontend/src/map/MapView.ts` | **[NOVO — PROD-1]** Núcleo Leaflet 2D com `preferCanvas: true`, basemaps `dark`, `satellite` (`/{z}/{y}/{x}`) e `osm`, listener `tileerror` para modo offline, troca segura de variável (`land_only_mask` + limpeza ao trocar resolução), `renderGlobalGrid`, seleção A/B em 8-vizinhos (`K <= 9`) e emissão de `MapSelectionPayload`. |
| `frontend/src/map/map.css` | **[NOVO — PROD-1]** Estilos do host Leaflet, toolbar de slots A/B, basemaps, toast offline, legenda 3D, cards espaciais e inspetor de payload JSON. |
| `frontend/src/map/mapIntegration.ts` | **[NOVO — PROD-1 Parceria]** Reducer puro (`applyCellToggle`, `applyClearSlot`, `applySlotVariableChange`, `buildAnalyzeRequestInput`), `executeStateAnalysis` e hook `useMapSelectionController` retornando `UseMapSelectionControllerResult` (`mapProps`, `analysisData`, `isLoading`, `notification`, `runAnalysis`). |
| `frontend/src/components/MapCanvas.tsx` | **[NOVO — PROD-1]** Componente React que monta `MapView` (`useEffect`/`useRef`), carrega `{var_id}_grid.json` via `getGlobalGrid` (com fallback visual `T2M`), exibe controles A/B, basemaps, legenda dinâmica e inspetor de payload emitido. |

### 3.4 Aplicação React, Serviços, Testes e Mocks (`frontend/`)
| Arquivo | Função |
| :--- | :--- |
| `frontend/src/App.tsx` e `bench.css` | Interface principal React 19 (**PROD-2** + integração **PROD-1**): sidebar das variáveis por domínio, aba `Mapa` renderizando `<MapCanvas />` e conectando `onSelectionChange` a `getRegionData(...)` com `AbortController`, e aba `Bancada científica` com Plotly. |
| `frontend/src/services/regionDataAdapter.ts` e `idbCache.ts` | Adapter de dados (`offline` / `api` com `AbortController`), resolução de alias `CLOUD_AMT -> /data/CLDTOT_grid.json` em `getGlobalGrid`, classe `SemanticApiError` para propagar erros `4xx` semânticos (`OCEAN_MASK_NO_DATA`, etc.) sem fallback falso, fallback offline em falhas de rede/`5xx`/timeout e cache IndexedDB. |
| `frontend/src/__tests__/*.test.ts` | **6 suítes Vitest (33 testes)**: `gridGeometry.test.ts` (7), `mapStylesAndLegend.test.ts` (3), `contractValidator.test.ts` (9), `mapIntegration.test.ts` (3), `regionDataAdapter.test.ts` (5) e `walkingSkeletonIntegration.test.ts` (6). |
| `frontend/public/data/*.json` | Fixtures offline: `T2M_grid.json`, `GWETTOP_grid.json` e `mock_analysis.json` (120 meses). |

---

## 4. Contrato do Payload Emitido pelo Mapa (`MapSelectionPayload`)

Sempre que o usuário adiciona/remove uma célula ou troca a variável ativa, `MapView.emitSelection()` emite:

```json
{
  "variable_x": "T2M",
  "variable_y": null,
  "grid_resolution": { "dLat": 0.5, "dLon": 0.625 },
  "start_year": 1981,
  "end_year": 2025,
  "cells_a": [[-18.5, -48.125]],
  "cells_b": [],
  "regionA": {
    "slot": "A",
    "region_id": "MERRA-2__r143_c211",
    "variable_id": "T2M",
    "source_model": "MERRA-2",
    "grid_resolution": { "dLat": 0.5, "dLon": 0.625 },
    "cells": [
      {
        "cell_id": "r143_c211",
        "row": 143,
        "col": 211,
        "lat": -18.5,
        "lon": -48.125,
        "bounds_leaflet": [[-18.75, -48.4375], [-18.25, -47.8125]],
        "geojson_ring": [[-48.4375, -18.75], [-47.8125, -18.75], [-47.8125, -18.25], [-48.4375, -18.25], [-48.4375, -18.75]]
      }
    ]
  },
  "regionB": null
}
```

### Regras Geométricas Garantidas
1. **Coordenadas:** `cells_a`, `cells_b` e `bounds_leaflet` usam `[latitude, longitude]`; `geojson_ring` usa `[longitude, latitude]` em anel fechado de 5 vértices.
2. **Snapping Nativo:**
   - `MERRA-2` (`frontend/`): `row = round((lat - lat0) / 0.5)`, `col = round((lon - lon0) / 0.625)`, centros em `lat0 + row * 0.5` e `lon0 + col * 0.625`.
   - `CERES_SYN1deg` (`frontend/`): `row = floor((lat - lat0) / 1.0)`, `col = floor((lon - lon0) / 1.0)`, centros em `.5`.
3. **Conectividade e Limite:** máximo `9` células (`MAX_CELLS_EXCEEDED`), inserção em 8-vizinhos (`NOT_ADJACENT`) e remoção protegida por BFS (`WOULD_DISCONNECT`).

---

## 5. Como Executar e Validar

### Protótipo Estático (`mapasparte1/`)
```powershell
cd c:\Users\Usuario\Desktop\teste_hackthon\earth-system-detective-fliflop-34\mapasparte1
python -m http.server 8080
```
Acesse `http://localhost:8080/`.

### Aplicação React + Vite + Vitest (`frontend/`)
```powershell
cd c:\Users\Usuario\Desktop\teste_hackthon\earth-system-detective-fliflop-34\frontend
npm install
npm run typecheck  # tsc --noEmit
npm test           # vitest run
npm run build      # tsc --noEmit && vite build
npm run dev        # http://localhost:5173/
```
