# Contrato Frontend `PROD-1` (Camada de Parceria — `frontend/`)

> **Objetivo:** Guia rápido de integração para o **Dev Núcleo (`MapView` Leaflet)** e para **`PROD-2` (Gráficos/Comparador)** consumirem os contratos, geometria $K \le 9$, estilos e adapter de dados em `frontend/`.
> **Referência completa:** [`CONTRATO_DE_DADOS.md`](../../CONTRATO_DE_DADOS.md) | **Branch:** `develop`

---

## 1. Árvore de Arquivos Criados (`frontend/`)

```text
frontend/
├── .env.example                 # VITE_DATA_MODE=offline|api, VITE_API_BASE_URL
├── public/data/
│   ├── mock_analysis.json       # Payload auditado (GWETTOP + T2M_MAX + comparison_pair)
│   └── T2M_grid.json            # Amostra Fluxo A (Canvas global)
└── src/
    ├── contracts/
    │   ├── types.ts             # Tipagem estrita (LeafletLatLng, GridCell, RegionSelection, etc.)
    │   ├── catalog.ts           # Catálogo das 12 variáveis NASA POWER + interseção temporal
    │   └── contractValidator.ts # Validadores runtime + trava dos 7 Invariantes
    ├── geo/
    │   └── gridGeometry.ts      # Snapping nativo, BFS 8-vizinhos (1 <= K <= 9) e region_id
    ├── map/
    │   ├── mapStyles.ts         # Estilos Canvas (direção/magnitude/significância) e seleção A/B
    │   └── legendConfig.ts      # Configuração reativa de legenda por variável
    ├── services/
    │   ├── idbCache.ts          # Cache IndexedDB com fallback em memória
    │   └── regionDataAdapter.ts # getGlobalGrid() e getRegionData() + AbortController + fallback
    └── __tests__/               # 4 suítes Vitest (18 testes)
```

---

## 2. Exports e Assinaturas Principais

| Módulo | Principais Exports & Assinaturas | Consumidor |
| :--- | :--- | :--- |
| **`contracts/types.ts`** | `VariableId`, `GridCell`, `RegionSelection`, `GlobalGridFile`, `GlobalGridPoint`, `RegionAnalysisRequest`, `RegionAnalysisResponse`, `VariableStatistics`, `ComparisonPair`, `SemanticErrorCode` | `PROD-1`, `PROD-2` |
| **`contracts/catalog.ts`** | `VARIABLE_CATALOG`, `VARIABLE_LIST`, `getVariableMetadata(variableId)`, `isValidVariableId(value)`, `getIntersectingDateBounds(varA, varB?, maxYear?)` | `PROD-1`, `PROD-2` |
| **`contracts/contractValidator.ts`** | `ContractValidationError`, `validateGlobalGrid(data)`, `validateVariableStatistics(data, prefix?)`, `validateComparisonPair(data)`, `validateAnalysisResponse(data)` | Adapter, Testes |
| **`geo/gridGeometry.ts`** | `MAX_CELLS_PER_REGION` (`9`), `assertValidLatLon(lat, lon)`, `snapCoordToCell(lat, lon, variableId)`, `isAdjacent8(a, b)`, `isConnectedComponent(cells)`, `toggleCellInSelection(current, target, maxCells?)`, `buildRegionSelection(slot, variableId, cells)`, `toBackendCells(cells)` | `MapView` (`PROD-1`) |
| **`map/mapStyles.ts`** | `getGlobalPointStyle(point, variableId): CircleMarkerVisualStyle`, `getSelectedCellStyle(slot): RegionPolygonVisualStyle` | `MapView` (`PROD-1`) |
| **`map/legendConfig.ts`** | `buildMapLegendConfig(variableId): MapLegendConfig` | Legenda (`PROD-1`) |
| **`services/idbCache.ts`** | `RegionAnalysisCache`, `defaultRegionCache` | Adapter |
| **`services/regionDataAdapter.ts`** | `getGlobalGrid(variableId, signal?)`, `getRegionData({ variable, variableB?, region, regionB?, startDate?, endDate?, signal? })`, `createRegionDataAdapter(overrides?)`, `buildRegionCacheKey(...)` | `PROD-1`, `PROD-2` |

---

## 3. Regras Críticas de Integração

1. **Convenção de Coordenadas (Zero Inversão):**
   - **Leaflet:** sempre **`[lat, lon]`** (`LeafletLatLng`, `cell.bounds_leaflet` = `[[south, west], [north, east]]`).
   - **GeoJSON:** sempre **`[lon, lat]`** (`GeoJsonLonLat`, `cell.geojson_ring` = anel fechado de 5 vértices).
   - `assertValidLatLon(lat, lon)` valida `lat ∈ [-90, 90]` e `lon ∈ [-180, 180]`.
2. **Snapping Nativo da Grade NASA (`catalog.ts` + `gridGeometry.ts`):**
   - **MERRA-2** (`T2M`, `T2M_MAX`, `T2M_MIN`, `PRECTOTCORR`, `GWETTOP`, `GWETROOT`, `RH2M`, `WS10M`, `PS`): **`0.5° × 0.625°`**, início `1981`.
   - **CERES_SYN1deg** (`ALLSKY_SFC_SW_DWN`, `CLDTOT`, `ALLSKY_SFC_LW_DWN`): **`1.0° × 1.0°`**, início `1984`.
   - Ao comparar variáveis de modelos distintos, usar `getIntersectingDateBounds(varA, varB)` (trava em `1984-01`).
3. **Composição Livre com Validação BFS ($1 \le K \le 9$):**
   - Use `snapCoordToCell(lat, lon, variableId)` no clique do Leaflet e passe o resultado para `toggleCellInSelection(currentCells, targetCell)`.
   - A função valida adjacência de **8 vizinhos** (`NOT_ADJACENT`), teto **`K <= 9`** (`MAX_CELLS_EXCEEDED`) e conexidade via BFS ao remover células (`WOULD_DISCONNECT`).
   - `buildRegionSelection(slot, variableId, cells)` ordena os `cell_id` para gerar `region_id` determinístico.
4. **Trava dos 7 Invariantes & Estilos Independentes:**
   - `validateVariableStatistics` bloqueia `allow_percentage_change: true` em variáveis `scale_type: "interval"` (`T2M`, `T2M_MAX`, `T2M_MIN`, `PS`) e valida todos os p-valores (`p_value_naive`, `p_value_ar1_corrected`, `fdr_q_value`) em `[0, 1]`.
   - `validateComparisonPair` valida `long_term_secular_r` (`r_global`) e `short_term_detrended_r` (`r_detrended`) em `[-1, 1]`, exigindo `cells_count_b ∈ [1, 9]` quando `region_b_id` está presente.
   - `getGlobalPointStyle` mantém **Direção** (`color`), **Magnitude** (`radius`) e **Significância** (`fillOpacity` / `dashArray`) independentes.
5. **Fluxo `getRegionData` (Backend Único — Nunca NASA Direto):**
   - **Modo `api`:** `POST ${VITE_API_BASE_URL}/api/analyze` com `AbortController` (timeout `5000 ms` + sinal externo) $\to$ valida resposta $\to$ persiste em **IndexedDB** (`idbCache.ts`). Em erro HTTP/rede/timeout, aciona fallback automático para `/data/mock_analysis.json`.
   - **Modo `offline`:** lê `/data/mock_analysis.json` e cacheia em IndexedDB/memória.

---

## 4. Testes e Build (`frontend/`)

```bash
cd frontend
npx vitest run        # 4 arquivos, 18 testes unitários (geometria, contrato, estilos, adapter)
npx tsc --noEmit      # TypeScript strict (0 erros)
npm run build         # tsc --noEmit && vite build (gera dist/ offline-ready)
```
