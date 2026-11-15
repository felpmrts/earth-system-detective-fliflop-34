# `PROD-1` Frontend Contract (Partnership Layer — `frontend/`)

> **Goal:** Quick integration guide for the **Core Dev (`MapView` Leaflet)** and **`PROD-2` (Charts/Comparator)** to consume the contracts, $K \le 9$ geometry, styles, and data adapter in `frontend/`.
> **Full reference:** [`CONTRATO_DE_DADOS.md`](../../CONTRATO_DE_DADOS.md) | **Branch:** `develop`

---

## 1. Created File Tree (`frontend/`)

```text
frontend/
├── .env.example                 # VITE_DATA_MODE=offline|api, VITE_API_BASE_URL
├── public/data/
│   ├── mock_analysis.json       # Audited payload (GWETTOP + T2M_MAX + comparison_pair)
│   └── T2M_grid.json            # Flow A sample (Global Canvas)
└── src/
    ├── contracts/
    │   ├── types.ts             # Strict typing (LeafletLatLng, GridCell, RegionSelection, etc.)
    │   ├── catalog.ts           # Catalog of the 12 NASA POWER variables + temporal intersection
    │   └── contractValidator.ts # Runtime validators + 7 Invariants guard
    ├── geo/
    │   └── gridGeometry.ts      # Native snapping, 8-neighbor BFS (1 <= K <= 9), and region_id
    ├── map/
    │   ├── mapStyles.ts         # Canvas styles (direction/magnitude/significance) and A/B selection
    │   └── legendConfig.ts      # Reactive per-variable legend configuration
    ├── services/
    │   ├── idbCache.ts          # IndexedDB cache with in-memory fallback
    │   └── regionDataAdapter.ts # getGlobalGrid() and getRegionData() + AbortController + fallback
    └── __tests__/               # 4 Vitest suites (18 tests)
```

---

## 2. Main Exports and Signatures

| Module | Main Exports & Signatures | Consumer |
| :--- | :--- | :--- |
| **`contracts/types.ts`** | `VariableId`, `GridCell`, `RegionSelection`, `GlobalGridFile`, `GlobalGridPoint`, `RegionAnalysisRequest`, `RegionAnalysisResponse`, `VariableStatistics`, `ComparisonPair`, `SemanticErrorCode` | `PROD-1`, `PROD-2` |
| **`contracts/catalog.ts`** | `VARIABLE_CATALOG`, `VARIABLE_LIST`, `getVariableMetadata(variableId)`, `isValidVariableId(value)`, `getIntersectingDateBounds(varA, varB?, maxYear?)` | `PROD-1`, `PROD-2` |
| **`contracts/contractValidator.ts`** | `ContractValidationError`, `validateGlobalGrid(data)`, `validateVariableStatistics(data, prefix?)`, `validateComparisonPair(data)`, `validateAnalysisResponse(data)` | Adapter, Tests |
| **`geo/gridGeometry.ts`** | `MAX_CELLS_PER_REGION` (`9`), `assertValidLatLon(lat, lon)`, `snapCoordToCell(lat, lon, variableId)`, `isAdjacent8(a, b)`, `isConnectedComponent(cells)`, `toggleCellInSelection(current, target, maxCells?)`, `buildRegionSelection(slot, variableId, cells)`, `toBackendCells(cells)` | `MapView` (`PROD-1`) |
| **`map/mapStyles.ts`** | `getGlobalPointStyle(point, variableId): CircleMarkerVisualStyle`, `getSelectedCellStyle(slot): RegionPolygonVisualStyle` | `MapView` (`PROD-1`) |
| **`map/legendConfig.ts`** | `buildMapLegendConfig(variableId): MapLegendConfig` | Legend (`PROD-1`) |
| **`services/idbCache.ts`** | `RegionAnalysisCache`, `defaultRegionCache` | Adapter |
| **`services/regionDataAdapter.ts`** | `getGlobalGrid(variableId, signal?)`, `getRegionData({ variable, variableB?, region, regionB?, startDate?, endDate?, signal? })`, `createRegionDataAdapter(overrides?)`, `buildRegionCacheKey(...)` | `PROD-1`, `PROD-2` |

---

## 3. Critical Integration Rules

1. **Coordinate Convention (Zero Inversion):**
   - **Leaflet:** always **`[lat, lon]`** (`LeafletLatLng`, `cell.bounds_leaflet` = `[[south, west], [north, east]]`).
   - **GeoJSON:** always **`[lon, lat]`** (`GeoJsonLonLat`, `cell.geojson_ring` = closed 5-vertex ring).
   - `assertValidLatLon(lat, lon)` validates `lat ∈ [-90, 90]` and `lon ∈ [-180, 180]`.
2. **Native NASA Grid Snapping (`catalog.ts` + `gridGeometry.ts`):**
   - **MERRA-2** (`T2M`, `T2M_MAX`, `T2M_MIN`, `PRECTOTCORR`, `GWETTOP`, `GWETROOT`, `RH2M`, `WS10M`, `PS`): **`0.5° × 0.625°`**, start `1981`.
   - **CERES_SYN1deg** (`ALLSKY_SFC_SW_DWN`, `CLDTOT`, `ALLSKY_SFC_LW_DWN`): **`1.0° × 1.0°`**, start `1984`.
   - When comparing variables from different models, use `getIntersectingDateBounds(varA, varB)` (locks at `1984-01`).
3. **Free Composition with BFS Validation ($1 \le K \le 9$):**
   - Use `snapCoordToCell(lat, lon, variableId)` on Leaflet click and pass the result to `toggleCellInSelection(currentCells, targetCell)`.
   - The function validates **8-neighbor** adjacency (`NOT_ADJACENT`), **`K <= 9`** cap (`MAX_CELLS_EXCEEDED`), and connectivity via BFS when removing cells (`WOULD_DISCONNECT`).
   - `buildRegionSelection(slot, variableId, cells)` sorts `cell_id`s to produce a deterministic `region_id`.
4. **7 Invariants Guard & Independent Styles:**
   - `validateVariableStatistics` blocks `allow_percentage_change: true` on `scale_type: "interval"` variables (`T2M`, `T2M_MAX`, `T2M_MIN`, `PS`) and validates all p-values (`p_value_naive`, `p_value_ar1_corrected`, `fdr_q_value`) in `[0, 1]`.
   - `validateComparisonPair` validates `long_term_secular_r` (`r_global`) and `short_term_detrended_r` (`r_detrended`) in `[-1, 1]`, requiring `cells_count_b ∈ [1, 9]` when `region_b_id` is present.
   - `getGlobalPointStyle` keeps **Direction** (`color`), **Magnitude** (`radius`), and **Significance** (`fillOpacity` / `dashArray`) independent.
5. **`getRegionData` Flow (Single Backend — Never Direct NASA):**
   - **`api` mode:** `POST ${VITE_API_BASE_URL}/api/analyze` with `AbortController` (`5000 ms` timeout + external signal) $\to$ validates response $\to$ persists in **IndexedDB** (`idbCache.ts`). On HTTP/network/timeout error, triggers automatic fallback to `/data/mock_analysis.json`.
   - **`offline` mode:** reads `/data/mock_analysis.json` and caches in IndexedDB/memory.

---

## 4. Tests and Build (`frontend/`)

```bash
cd frontend
npx vitest run        # 4 files, 18 unit tests (geometry, contract, styles, adapter)
npx tsc --noEmit      # Strict TypeScript (0 errors)
npm run build         # tsc --noEmit && vite build (outputs offline-ready dist/)
```
