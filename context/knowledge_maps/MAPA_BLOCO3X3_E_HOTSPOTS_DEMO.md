# Technical Guide — 3×3 Block Selection and Global Extremes Navigation (`MAPA_BLOCO3X3_E_HOTSPOTS_DEMO.md`)

**Reference branch:** `mapa`
**Track:** Maps & Geospatial Visualization (`PROD-1`)
**Main files:**
- `frontend/src/geo/gridGeometry.ts`
- `frontend/src/map/mapStyles.ts`
- `frontend/src/map/MapWorkspace.tsx`
- `frontend/src/bench.css`
- `frontend/src/__tests__/gridGeometry.test.ts`
- `frontend/src/__tests__/mapStylesAndLegend.test.ts`

---

## 1. Goal of the Updates

Prepare the interactive map module for live demonstration with two high-productivity enhancements without altering the Data Contract or the 7 Statistical Invariants:

1. **Connected 3×3 Block (`Alt + Click` and `"3×3 Block"` toggle):** select up to 9 contiguous native cells around a clicked point in a single click.
2. **Global Extremes (`Extreme +` and `Extreme −`):** jump directly to the global hotspots with the strongest positive and negative trends for the active variable at regional zoom (`7`) with an explicit visual target.

---

## 2. 3×3 Block Selection (`buildCellBlock3x3`)

### 2.1 Pure Function in `frontend/src/geo/gridGeometry.ts`
- **Signature:** `buildCellBlock3x3(lat: number, lon: number, variableId: VariableId): GridCell[]`
- **Behavior:**
  1. Validates `(lat, lon)` and snaps the center cell via `snapCoordToCell(lat, lon, variableId)` (respecting `MERRA-2` `0.5° × 0.625°`, `CERES_SYN1deg` `1.0° × 1.0°`, and `0.5° × 0.5°` grids).
  2. Generates offsets `dr, dc ∈ {-1, 0, 1}` around `(center.row, center.col)` via `buildCellFromRowCol`.
  3. Discards cells outside the model's geographic/regional bounds (`candidate.lat ∈ [grid_origin.lat0, 90]`, `candidate.lon ∈ [grid_origin.lon0, 180]`, `bounds_leaflet` contained in `[-90, 90] × [-180, 180]`, `south < north` and `west < east`).
  4. Deduplicates `cell_id` via `deduplicateCells`, guaranteeing an 8-connected component with:
     - **9 cells** (`3×3`) at interior points;
     - **6 cells** (`2×3` or `3×2`) on polar edges (`±90°`) or the antimeridian (`±180°`);
     - **4 cells** (`2×2`) at the four extreme corners of the globe.

### 2.2 UI Integration (`MapWorkspace.tsx` + `bench.css`)
- **`"3×3 Block"` button in `.map-toolbar`:** toggles `blockSelectMode` in a **mutually exclusive** way with **`"Drag Select"`** (`dragSelectMode`). Enabling one automatically disables the other.
- **`"Alt + Click"` shortcut:** works anytime (`Boolean(event.originalEvent?.altKey)`) even when the toggle button is off.
- **Supported targets:** works both when clicking directly on the map and directly on a circular marker of the global grid (`L.CircleMarker`, with `L.DomEvent.stopPropagation` preventing duplicate triggers).
- **Preview and slots:** displays a *preview* of the 3×3 block cells on `mousemove`, respects `activeSlot` (`A` or `B`), feeds the **`Undo`** stack, and triggers **`Same Location (A=B)`** mirroring (`mirrorRegionSelection`) across different resolutions (e.g., `MERRA-2` ↔ `CERES_SYN1deg`).

---

## 3. Global Extremes Navigation (`findGlobalTrendHotspots`)

### 3.1 Deterministic Selection in `frontend/src/map/mapStyles.ts`
- **Signature:** `findGlobalTrendHotspots(points: readonly GlobalGridPoint[]): GlobalTrendHotspots`
- **Selection rule (`selectExtremeHotspot`):**
  1. Filters finite values with matching sign (`slope_sen_decade > 0` for `+`; `slope_sen_decade < 0` for `−`).
  2. **Prioritizes points with FDR significance (`q_value_fdr < 0.05`)** when available in that direction — preventing noise with `q ≥ 0.05` from masking a statistically validated hotspot.
  3. If no point has `q_value_fdr < 0.05` in the requested direction, falls back to the point with largest magnitude in that direction (e.g., single non-significant negative point in `T2M_grid.json`).
  4. If no point exists in that direction (e.g., `ALLSKY_SFC_LW_DWN_grid.json`, with no negative points), returns `null` and keeps the corresponding button disabled.
  5. On an exact tie in `slope_sen_decade`, chooses the smaller `q_value_fdr`.

### 3.2 Visual Feedback on the Map (`MapWorkspace.tsx`)
- Compact **`Extreme +`** and **`Extreme −`** buttons in `.map-toolbar`.
- On click:
  1. Executes `map.flyTo([point.lat, point.lon], 7, { animate: true, duration: 0.65 })` (regional zoom aligned with `focusRegions` `maxZoom: 7` and below NASA Blue Marble's `maxNativeZoom: 8`).
  2. Draws a non-interactive visual target in `hotspotHighlightLayer` (outer dashed orange/blue halo + inner yellow ring) around `[point.lat, point.lon]`.
  3. Opens the tooltip with slope, FDR status, and coordinates as soon as the `moveend` animation finishes (cleaning up prior listeners if the user switches rapidly or changes variables).
  4. Updates `.map-message` with the variable, unit-formatted magnitude, `q_value_fdr`, and `(lat, lon)` coordinates.

---

## 4. Verification and Local Execution

- **Unit tests:**
  - `frontend/src/__tests__/gridGeometry.test.ts` (central 3×3 block, poles, antimeridian, corners, and heterogeneous `MERRA-2` ↔ `CERES_SYN1deg` re-snap).
  - `frontend/src/__tests__/mapStylesAndLegend.test.ts` (`q_value_fdr < 0.05` priority, non-significant fallback, missing direction, and tie-breaking).
- **Validated commands in `frontend/`:**
  - `npx tsc --noEmit`
  - `npx vitest run` (9 files, 49 tests)
  - `npm run validate:grids -- --strict` (12/12 homologated grids + `CLOUD_AMT -> CLDTOT_grid.json` alias)
  - `npm run build`
  - `npm run verify:offline`
