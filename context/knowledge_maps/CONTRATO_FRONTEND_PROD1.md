# Contrato Frontend `PROD-1` (Camada de Parceria — `frontend/`)

> **Objetivo:** Guia rápido de integração para o **Dev Núcleo (`MapView` Leaflet)** e para **`PROD-2` (Gráficos/Comparador)** consumirem os contratos, geometria $K \le 9$, estilos e adapter de dados em `frontend/`.
> **Referência completa:** [`CONTRATO_DE_DADOS.md`](../../CONTRATO_DE_DADOS.md) | **Branch:** `mapa`

---

## 1. Árvore de Arquivos Criados (`frontend/`)

```text
frontend/
├── .env.example                 # VITE_DATA_MODE=offline|api, VITE_API_BASE_URL
├── public/data/
│   ├── mock_analysis.json         # Payload auditado (120 meses, GWETTOP + T2M_MAX + comparison_pair)
│   ├── T2M_grid.json              # Fluxo A MERRA-2 térmica (15 pontos sentinela)
│   ├── GWETTOP_grid.json          # Fluxo A MERRA-2 hidrológica (15 pontos sentinela)
│   ├── T2M_MAX_grid.json          # Fluxo A MERRA-2 temp. máxima (15 pontos sentinela)
│   ├── PRECTOTCORR_grid.json      # Fluxo A MERRA-2 precipitação (15 pontos sentinela)
│   ├── ALLSKY_SFC_SW_DWN_grid.json # Fluxo A CERES irradiância solar (15 pontos sentinela)
│   └── CLDTOT_grid.json           # Fluxo A CERES nuvens / alias CLOUD_AMT (15 pontos sentinela)
└── src/
    ├── contracts/
    │   ├── types.ts             # Tipagem estrita (LeafletLatLng, GridCell, MapViewContractProps, sen_fit?, etc.)
    │   ├── catalog.ts           # Catálogo das 12 variáveis canônicas + alias CLOUD_AMT + interseção temporal
    │   └── contractValidator.ts # Validadores runtime + trava dos 7 Invariantes + isSemanticErrorPayload
    ├── components/
    │   └── MapCanvas.tsx        # Host React de MapView.ts + Story Presets + toasts/loading + inspetor A/B
    ├── geo/
    │   └── gridGeometry.ts      # Snapping exato NASA POWER, BFS 8-vizinhos (1 <= K <= 9), reconcileCellsOnVariableChange
    ├── map/
    │   ├── MapView.ts           # Núcleo Leaflet Canvas 2D (basemaps, Seleção A/B, applyPresetSelection, emitSelection)
    │   ├── map.css              # Estilos do container Leaflet, controles A/B, Story Presets e legenda flutuante
    │   ├── mapStyles.ts         # Estilos Canvas cientes de polaridade + Seleção A (#00e5ff) / B (#ff007f)
    │   ├── legendConfig.ts      # Configuração reativa de legenda por variável e polaridade
    │   └── mapIntegration.ts    # Reducer puro + useMapSelectionController + mapErrorToNotification
    ├── services/
    │   ├── idbCache.ts          # Cache IndexedDB com fallback em memória
    │   └── regionDataAdapter.ts # getGlobalGrid() (com alias CLOUD_AMT) + getRegionData() + SemanticApiError
    └── __tests__/               # 6 suítes Vitest (33 testes, incl. walkingSkeletonIntegration.test.ts e 6 *_grid.json)
```

---

## 2. Exports e Assinaturas Principais

| Módulo | Principais Exports & Assinaturas | Consumidor |
| :--- | :--- | :--- |
| **`contracts/types.ts`** | `VariableId` (12 + `CLOUD_AMT`), `VisualPolarity`, `MapSelectionPayload`, `MapViewContractProps`, `MapNotification`, `SemanticApiErrorPayload`, `GridCell`, `RegionSelection`, `GlobalGridFile`, `RegionAnalysisResponse` | `PROD-1`, `PROD-2` |
| **`contracts/catalog.ts`** | `VARIABLE_CATALOG`, `VARIABLE_LIST`, `getVariableMetadata(variableId)`, `resolveCanonicalGridVariableId(variableId)`, `isValidVariableId(value)`, `getIntersectingDateBounds(varA, varB?, maxYear?)` | `PROD-1`, `PROD-2` |
| **`contracts/contractValidator.ts`** | `ContractValidationError`, `isSemanticErrorPayload(data)`, `validateGlobalGrid(data)`, `validateVariableStatistics(data, prefix?)`, `validateComparisonPair(data)`, `validateAnalysisResponse(data)` | Adapter, Testes |
| **`geo/gridGeometry.ts`** | `MAX_CELLS_PER_REGION` (`9`), `assertValidLatLon(lat, lon)`, `snapCoordToCell(lat, lon, variableId)`, `isAdjacent8(a, b)`, `isConnectedComponent(cells)`, `toggleCellInSelection(current, target, maxCells?)`, `reconcileCellsOnVariableChange(prev, next, cells)`, `buildRegionSelection(slot, variableId, cells)`, `toBackendCells(cells)` | `MapView` (`PROD-1`) |
| **`map/mapStyles.ts`** | `getPolarityPalette(polarity)`, `getGlobalPointStyle(point, variableId)`, `getSelectedCellStyle(slot)` (`A`: `#00e5ff`, `B`: `#ff007f`) | `MapView` (`PROD-1`) |
| **`map/legendConfig.ts`** | `buildMapLegendConfig(variableId): MapLegendConfig` | Legenda (`PROD-1`) |
| **`map/MapView.ts` & `components/MapCanvas.tsx`** | `MapView` (Leaflet Canvas 2D, `applyPresetSelection`), `StoryPresetId`, `<MapCanvas activeVariable secondaryVariable? periodLabel? externalNotification? isAnalyzing? onSelectionChange? onOpenBench? onSelectPreset? />` | `App.tsx` (`PROD-2`) |
| **`map/mapIntegration.ts`** | `UseMapSelectionControllerResult` (`mapProps`, `analysisData`, `isLoading`, `notification`, `runAnalysis`), `useMapSelectionController(options?)`, `executeStateAnalysis`, `applyCellToggle`, `applySlotVariableChange`, `buildAnalyzeRequestInput`, `mapErrorToNotification(err)` | `MapView` (`PROD-1`), `MapCanvas`, `App.tsx` |
| **`services/idbCache.ts`** | `RegionAnalysisCache`, `defaultRegionCache` | Adapter |
| **`services/regionDataAdapter.ts`** | `SemanticApiError`, `getGlobalGrid(variableId, signal?)`, `getRegionData(...)`, `createRegionDataAdapter(overrides?)`, `buildRegionCacheKey(...)` | `PROD-1`, `PROD-2` |

---

## 3. Regras Críticas de Integração

1. **Convenção de Coordenadas (Zero Inversão):**
   - **Leaflet:** sempre **`[lat, lon]`** (`LeafletLatLng`, `cell.bounds_leaflet` = `[[south, west], [north, east]]`).
   - **GeoJSON:** sempre **`[lon, lat]`** (`GeoJsonLonLat`, `cell.geojson_ring` = anel fechado de 5 vértices).
   - `assertValidLatLon(lat, lon)` valida `lat ∈ [-90, 90]` e `lon ∈ [-180, 180]`.
2. **Snapping Nativo Alinhado ao Backend Python (`catalog.ts` + `gridGeometry.ts`):**
   - **MERRA-2** (`0.5° × 0.625°`, início `1981`): centro em `Math.round(lat / 0.5) * 0.5` e `Math.round(lon / 0.625) * 0.625` (paridade exata com `snap_merra2`).
   - **CERES_SYN1deg** (`1.0° × 1.0°`, início `1984`, incl. `CLDTOT` e alias `CLOUD_AMT`): centro em `Math.floor(lat) + 0.5` e `Math.floor(lon) + 0.5` (paridade exata com `snap_ceres`).
   - Use `reconcileCellsOnVariableChange` / `applySlotVariableChange`: preserva células na mesma grade e limpa apenas se mudar entre `0.5°×0.625°` e `1.0°×1.0°`.
3. **Composição Livre com Validação BFS ($1 \le K \le 9$):**
   - Plugue `MapView` diretamente via `MapViewContractProps` (`useMapSelectionController`), sem wrapper Vanilla JS e sem estatística no browser.
   - A validação impõe **8 vizinhos** (`NOT_ADJACENT`), teto **`K <= 9`** (`MAX_CELLS_EXCEEDED`) e conexidade BFS (`WOULD_DISCONNECT`).
4. **Trava dos 7 Invariantes & Polaridade Visual Independente:**
   - `validateVariableStatistics` bloqueia `%` em `scale_type: "interval"`, aceita `series.sen_fit?` opcional validando mesmo tamanho de `dates`, e `validateComparisonPair` exige `r ∈ [-1, 1]` e `cells_count_b ∈ [1, 9]`.
   - `getGlobalPointStyle` + `buildMapLegendConfig` aplicam `visual_polarity`: `thermal` (`+` `#d9480f` / `-` `#1864ab`), `hydrological` (`+` `#1864ab` / `-` `#d9480f`), `neutral` (`+` `#0f766e` / `-` `#6d28d9`).
5. **Fluxo `getRegionData` e Erros Semânticos `4xx`:**
   - **Modo `api`:** `POST ${VITE_API_BASE_URL}/api/analyze` com `AbortController`. Erros **`4xx` semânticos** (`OCEAN_MASK_NO_DATA`, etc.) lançam `SemanticApiError` diretamente para a UI **sem** acionar fallback `mock_analysis.json`. Apenas erros de rede/`5xx`/timeout caem no fallback offline.
   - `getGlobalGrid('CLOUD_AMT')` resolve automaticamente para `/data/CLDTOT_grid.json` via `resolveCanonicalGridVariableId`.

---

## 4. Testes e Build (`frontend/`)

```bash
cd frontend
npx vitest run        # 6 arquivos, 33 testes unitários e de integração (geometria, snapping, polaridade, mapIntegration, adapter, Walking Skeleton)
npx tsc --noEmit      # TypeScript strict (0 erros)
npm run build         # tsc --noEmit && vite build (gera dist/ offline-ready)
```
