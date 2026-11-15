# 🗺️ PROD-1_CONTEXT.md — Maps & Geo Engineering

**Project:** NASA Space Apps Challenge — *Be An Earth System Trend Detective!*

**Hierarchy:** Operational context specific to **PROD-1**. Complements (and does not replace) the project's main context window.

  

> **🎯 Decision North Star (Priority Order):**

> `Functional MVP` > `Scientifically Defensible Data` > `Reliable Integration` > `Sufficient Performance` > `Polish` > `Sophistication`

  

---

  

## 1. Scope, Boundaries, and Stack

  

PROD-1 visually answers: **Where is it changing?**, **In what direction/intensity?**, and **Is it statistically significant?**, while also enabling region selection.

  

| ✅ What PROD-1 DOES                                     | ❌ What PROD-1 DOES NOT DO                                    |
| ------------------------------------------------------ | ------------------------------------------------------------ |
| Render global map (`Leaflet`) and legend               | Compute Sen slope, FDR, or statistical tests                 |
| Distinguish direction, magnitude, and significance     | Process heavy NetCDF files in the browser                    |
| Allow selection and highlighting of up to 2 regions (A/B) | Build time-series charts or analytical prose (`PROD-2`)    |
| Communicate selected IDs/geometries to global state    | Call NASA APIs directly from the map component               |
| Guarantee performance (Canvas) and local fallback      | Perform a full frontend redesign                             |

  

### Stack & Implementation Rules

* **Official Stack:** `Leaflet (Canvas) + React + TypeScript + Vite` (with static deployment on Vercel and strict TypeScript).
* **Map Library:** `Leaflet` (`L.map`, `L.tileLayer`, `L.circleMarker`, `L.geoJSON`, `L.layerGroup`, `L.polyline`, click events, layer control) with mandatory `Canvas` renderer to maintain high performance with thousands of global grid points/cells.
* **Forbidden to add:** Deck.gl, Mapbox, 3D maps, complex animations, in-browser spatial interpolation, or libraries without a real MVP problem.
* **⚠️ Critical Coordinate Rule:**
  * **Leaflet & Map Payload (`cells_a`, `cells_b`):** `[latitude, longitude]` *(mandatory order)*
  * **GeoJSON:** `[longitude, latitude]` *(Never invert if converting to GeoJSON!)*

  

---

  

## 2. Data Architecture (2 Distinct Flows)

  

### Flow A: Global Map (Static / Precomputed)

Fast loading from precomputed files in `{var_id}_grid.json` format. **The map never recalculates these values.**

* **Expected schema:** `lat`, `lon`, `slope_sen_decade` (trend/decade), `q_value_fdr` (FDR-corrected significance), and `is_sig` (boolean/indicator).

  

### Flow B: Selected Regions (Dynamic On-Demand)

> **🔄 Architectural Update:** The old approach of 20–30 fixed "sentinel regions" (`regions.json`) was replaced by dynamic API/service queries for any user-chosen region with flexible adjacent-cell composition.

```text
[User selects Area A/B in MapView] ──▶ [MapView emits MapSelectionPayload] ──▶ [Frontend: getRegionData(payload)]
                                                                                           │
[PROD-2 receives series and stats] ◀── [Scientific Layer / Backend API] ◀── [NASA POWER / Subsetting]
```

### Map Output Payload Specification (`MapSelectionPayload`)

When interacting with the map, the user selects and composes areas A and B by clicking native grid cells. The map operates with **flexible adjacent-cell composition** (sharing at least one vertex or edge on the discrete grid, e.g., $1\times 1$, $1\times 3$, $2\times 1$, $2\times 2$, up to the cap of 9 cells per area).

The `MapView` component emits the following standardized TypeScript payload to the application's global state:

```typescript
export interface MapSelectionPayload {
  variable_x: string;               // Primary variable (Area A)
  variable_y?: string;              // Secondary variable (Area B) - optional for univariate or bivariate comparison
  grid_resolution: {
    dlat: number;                   // Native grid latitude step (e.g., 0.5)
    dlon: number;                   // Native grid longitude step (e.g., 0.625)
  };
  cells_a: [number, number][];      // Area A cells: 1 <= cells_a.length <= 9, coordinates in [lat, lon]
  cells_b?: [number, number][];     // Area B cells: 1 <= cells_b.length <= 9, coordinates in [lat, lon] (optional)
  start_year: number;               // Common start year of the time series (e.g., 1981)
  end_year: number;                 // Common end year of the time series (e.g., 2023)
}
```

Real JSON example emitted by the map:

```json
{
  "variable_x": "T2M",
  "variable_y": "PRECTOTCORR",
  "grid_resolution": {
    "dlat": 0.5,
    "dlon": 0.625
  },
  "cells_a": [
    [-3.0, -60.0],
    [-3.0, -59.375],
    [-3.5, -60.0]
  ],
  "cells_b": [
    [14.0, 30.0],
    [14.0, 30.625]
  ],
  "start_year": 1981,
  "end_year": 2023
}
```

#### Non-Negotiable Payload Rules:
1. **Coordinates `[lat, lon]`:** Every cell is a `[latitude, longitude]` pair, exactly as required by the Leaflet API. Inverting to `[lon, lat]` in the payload is forbidden.
2. **Cell Constraint ($1 \le \text{cells.length} \le 9$):** Each area (`cells_a` and `cells_b`) supports 1 to 9 adjacent cells. Isolated or disconnected cells within the same area are invalid.
3. **MVP Variable Scope:** The MVP starts with 1 variable per area (`variable_x` for Area A and optional `variable_y` for Area B, enabling same-variable comparison across two regions or bivariate correlation between distinct variables), paving the way for future environmental families with multiple simultaneous variables.
4. **Explicit Grid Resolution:** `grid_resolution: { dlat, dlon }` binds the selection to the source's native geometry (e.g., MERRA-2 $0.5^\circ \times 0.625^\circ$), allowing the backend to compose the request via `/point` or `/regional`.

### ⚠️ Golden Rule About NASA Earthdata

**NASA API ≠ Ready-Made Statistics.** NASA provides raw/subsetted data, not `slope_sen_decade` or `q_value_fdr`.

1. **Acquisition Layer:** Obtains variable, temporal values, and spatial/temporal subset from NASA using `MapSelectionPayload`.

2. **Scientific Layer (Backend/Data):** Aggregates the selected cells (weighted spatial mean), computes time series, anomalies, trend ($B_{\text{Sen}}, B_{\text{OLS}}$), significance ($\text{AR}(1)$ + FDR), and multiscale correlation ($r_{\text{global}}, r_{\text{local}}$).

3. **Frontend Abstraction:** The `MapView` component only emits the selection via `MapSelectionPayload`. Fetching uses a decoupled typed interface:

   ```typescript
   getRegionData(payload: MapSelectionPayload): Promise<AnalysisResponse>;
   ```

  

---

  

## 3. Visual, Scientific, and Performance Rules

  

* **3-Dimensional Visualization:**

  1. **Direction:** Positive vs. Negative.

  2. **Magnitude:** Proportional to `abs(slope)`, respecting the variable's unit.

  3. **Significance:** Based on `is_sig` / `q_value_fdr`. **Never conflate with magnitude** ("stronger ≠ more significant").

* **Scientific Rigor:** Differentiate `TREND` from `STATISTICAL SIGNIFICANCE`. Never imply causality from correlation, nor treat a historical trend as a future forecast.

* **Selection Integrity:** Do not invent `region_id` on the frontend. If using geometry, clearly define *bounding box*, polygon, center, resolution, and aggregation method.

* **`PROD-1` ↔ `PROD-2` Contract (React + TypeScript Component):**

  ```tsx
  export interface MapViewProps {
    gridData?: GlobalGridData;
    selection: MapSelectionPayload;
    onSelectionChange: (payload: MapSelectionPayload) => void;
    activeTarget?: 'A' | 'B';
  }

  export const MapView: React.FC<MapViewProps> = ({
    gridData,
    selection,
    onSelectionChange,
    activeTarget = 'A'
  }) => {
    // Renders Leaflet with Canvas renderer
    // Handles native grid click [lat, lon] and composition of up to 9 adjacent cells (1 <= cells.length <= 9)
    // Emits structured MapSelectionPayload to global state
  };
  ```

* **Performance & Caching:** Use `Canvas` for many points. Trigger requests only after explicit selection (with debounce/confirmation) and cache by key: `variable + region_id + startDate + endDate`.

* **Mandatory Fallback:** Do not assume the NASA API will work flawlessly before testing (CORS, auth, latency, subsetting limits). Keep a local/precomputed fallback ready for demonstration.

  

---

  

## 4. Execution Plan and Team Split

  

### Task Split (Zero Duplication)

* **Core Map Dev:** `MapView`, `Leaflet` setup, grid rendering, layers, click/selection events, and communication with main state.

* **Partner Dev:** Data contract and coordinate validation, style helpers, legend, `region ↔ data` association, API adapter (`getRegionData`), fallback/mock, and performance/edge-case tests.

  

### Implementation Roadmap (Strict Order)

1. **Minimal Map:** `Leaflet (Canvas) + React + TypeScript + Vite` stack with `tileLayer` and mocked points rendering on the frontend.

2. **Real Global Data:** Replace mock with `{var_id}_grid.json` + Canvas trend and significance styling.

3. **A/B Selection with Composition:** Clicking highlights Area A and Area B with up to 9 adjacent cells ($1 \le \text{cells.length} \le 9$, `[lat, lon]` coordinates) and emits `{ variable_x, variable_y?, grid_resolution: { dlat, dlon }, cells_a, cells_b?, start_year, end_year }` to global state.

4. **Dynamic Data:** Connect `getRegionData(payload)` to the scientific/backend API with local IndexedDB fallback *(only after validating API feasibility)*.

5. **Performance & Fallback:** Test point volume, request caching, and offline/error behavior.

6. **Polish:** Final legend, loading states, error messages, and accessibility.

  

### Pre-Implementation NASA API Checklist (Investigate Before Coding)

Before spending time integrating a dataset, answer:

1. What are the exact dataset and variable?

2. Which API/service provides access to it?

3. Can it be subsetted spatially and temporally?

4. Is authentication required or is there a CORS block?

5. Are format, volume, and response time viable for a web demo?

6. Is the returned data sufficient to compute series/trend/significance on the backend?

7. Is there a simple fallback?

  

---

  

## 5. Ready-to-Use AI Prompts (Token Savings)

  

Use AI as an **implementer/reviewer** by sending this file + one of the prompts below:

  

<details>

<summary><b>🔍 1. Initial Inspection Prompt (Before Coding)</b></summary>

  

```text

Read PROD1_CONTEXT.md and inspect the repository. Do not implement anything.

Identify only: (1) current frontend structure; (2) where MapView should live; (3) how data is loaded; (4) actual format of geographic data; (5) existing dependencies; (6) how selection state reaches the rest of the app; (7) files that need to be modified.

Do not create files, do not install dependencies, and do not propose a new architecture.

```

</details>

  

<details>

<summary><b>🗺️ 2. Map Implementation Prompt</b></summary>

  

```text

Use PROD1_CONTEXT.md as the rulebook. Implement only the minimal Leaflet map in the existing frontend.

Goal: render the grid, distinguish positive/negative trends, represent significance, and keep the interface compatible with the project.

Do not implement statistics, NASA processing, or PROD-2 changes. Do not create a new app or add dependencies without justification.

```

</details>

  

<details>

<summary><b>📍 3. Region Selection Prompt</b></summary>

  

```text

Use PROD1_CONTEXT.md. Implement only the selection of up to two regions in MapView.

The selection must: highlight Region A/B, preserve existing geographic data, and emit identifiers/geometries to main state.

Do not invent region-to-time-series associations. Do not implement charts or NASA calls yet.

```

</details>

  

<details>

<summary><b>🛡️ 4. Code Audit Prompt</b></summary>

  

```text

Audit the PROD-1 implementation against PROD1_CONTEXT.md. Make no changes.

List only: (1) bugs; (2) architecture violations; (3) coordinate issues; (4) performance issues; (5) integration issues; (6) scientific risks; (7) unnecessary complexity.

For each issue, specify the file and snippet/cause.

```

</details>

  

---

  

## 6. Validation & Definition of Done (DoD)

  

### Minimum Mandatory Tests

* **Geographic:** Cell points and polygons land on exact `[lat, lon]` coordinates (Leaflet order, no inversion).

* **Payload:** The payload emitted by the map validates `MapSelectionPayload` with $1 \le \text{cells.length} \le 9$, `{ dlat, dlon }`, and start/end years.

* **Visual:** Direction, magnitude, and significance are clearly distinct and match the Canvas legend.

* **Selection & Integration:** Selecting/swapping/removing A and B cells updates `MapSelectionPayload` in global state and feeds `PROD-2`.

* **Failure:** Simulate API down, slowness, network error, and no-data region (must trigger fallback/clean notice via IndexedDB cache).

  

### Final Checklist (MVP Ready)

- [ ] **Validated Stack:** `Leaflet (Canvas) + React + TypeScript + Vite` running with clean build and strict typing.

- [ ] **Map & Data:** Leaflet integrated with Canvas renderer, loads real `{var_id}_grid.json`, and coordinates validated in `[lat, lon]`.

- [ ] **Selection Payload:** Functional emission of `{ variable_x, variable_y?, grid_resolution: { dlat, dlon }, cells_a, cells_b?, start_year, end_year }` respecting $1 \le \text{cells.length} \le 9$.

- [ ] **Visualization:** Direction, magnitude (`abs(slope)`), and significance (`is_sig`/`q_value_fdr`) distinguishable + coherent legend.

- [ ] **Interaction:** Flexible selection of up to 2 areas (A/B) with up to 9 adjacent cells feeding the `PROD-2` comparator.

- [ ] **Architecture:** Zero statistical calculation in the map; decoupled API receiving `MapSelectionPayload`.

- [ ] **Resilience:** Request control (cache/debounce), functional local IndexedDB fallback, and zero unnecessary dependencies.
