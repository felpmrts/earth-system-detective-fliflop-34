# DATA CONTRACT — Earth System Trend Detective (NASA Space Apps 2026)

> **Status:** Version 1.0 (Milestone 0 — Partnership Track / `PROD-1` Data Contract Analysis)
> **Scope:** Single contract decoupling `DADOS-1` (NASA POWER Ingestion), `DADOS-2` (`stats_engine.py`), `PROD-1` (Leaflet Map & $K \le 9$ Geometry), and `PROD-2` (Charts Bench & A/B Comparator).
> **Inviolable Rules:**
> 1. The frontend **never** calls the NASA POWER API / Earthdata directly and **never** computes statistics in the browser.
> 2. Leaflet uses **`[lat, lon]`**; GeoJSON uses **`[lon, lat]`**.
> 3. All payloads must obey the **7 Statistical Invariants** ($Y_{\text{end}} - Y_{\text{start}}$ is forbidden, and `%` is forbidden on interval variables like $^\circ\text{C}$).

---

## 1. Official Catalog of the 12 NASA POWER Variables

| `variable_id` | Physical Name | Source / Model | Native Resolution (`dLat × dLon`) | Start Year | `scale_type` | `unit` | `trend_unit` | `allow_percentage_change` | `land_only_mask` |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `T2M` | 2m Mean Air Temperature | `MERRA-2` | `0.5° × 0.625°` | `1981` | `interval` | `°C` | `°C/decade` | `false` | `false` |
| `T2M_MAX` | 2m Daily Maximum Temperature | `MERRA-2` | `0.5° × 0.625°` | `1981` | `interval` | `°C` | `°C/decade` | `false` | `false` |
| `T2M_MIN` | 2m Daily Minimum Temperature | `MERRA-2` | `0.5° × 0.625°` | `1981` | `interval` | `°C` | `°C/decade` | `false` | `false` |
| `PRECTOTCORR` | Bias-Corrected Total Precipitation | `MERRA-2` | `0.5° × 0.625°` | `1981` | `ratio` | `mm/month` | `mm/month/decade` | `true` | `false` |
| `GWETTOP` | Surface Soil Wetness (0–5 cm) | `MERRA-2` | `0.5° × 0.625°` | `1981` | `ratio` | `fraction (0–1)` | `fraction/decade` | `false` | `true` |
| `GWETROOT` | Root-Zone Soil Wetness (0–100 cm) | `MERRA-2` | `0.5° × 0.625°` | `1981` | `ratio` | `fraction (0–1)` | `fraction/decade` | `false` | `true` |
| `RH2M` | 2m Relative Humidity | `MERRA-2` | `0.5° × 0.625°` | `1981` | `ratio` | `%` | `p.p./decade` | `false` | `false` |
| `WS10M` | 10m Wind Speed | `MERRA-2` | `0.5° × 0.625°` | `1981` | `ratio` | `m/s` | `m/s/decade` | `true` | `false` |
| `PS` | Surface Pressure | `MERRA-2` | `0.5° × 0.625°` | `1981` | `interval` | `kPa` | `kPa/decade` | `false` | `false` |
| `ALLSKY_SFC_SW_DWN` | All-Sky Surface Shortwave Downward Irradiance | `CERES_SYN1deg` | `1.0° × 1.0°` | `1984` | `ratio` | `MJ/m²/day` | `MJ/m²/day/decade` | `true` | `false` |
| `CLDTOT` | Total Cloud Cover | `CERES_SYN1deg` | `1.0° × 1.0°` | `1984` | `ratio` | `%` | `p.p./decade` | `false` | `false` |
| `ALLSKY_SFC_LW_DWN` | All-Sky Surface Longwave Downward Irradiance | `CERES_SYN1deg` | `1.0° × 1.0°` | `1984` | `ratio` | `MJ/m²/day` | `MJ/m²/day/decade` | `true` | `false` |

> **Temporal Intersection Rule:** When comparing `(variable_a, variable_b)`, the minimum valid start date is `max(min_year_a, min_year_b)` (e.g., `T2M` 1981 + `CLDTOT` 1984 $\implies$ start locked at `1984-01`).

---

## 2. Flow A — Precomputed Global Layer (`public/data/{var_id}_grid.json`)

Rendered via `Canvas` in Leaflet as a global overview and guaranteed offline fallback. The frontend **never** recalculates these values.

```json
{
  "variable_id": "T2M",
  "unit": "°C",
  "trend_unit": "°C/decade",
  "period": { "start": "1981-01", "end": "2025-12" },
  "points": [
    {
      "lat": -18.75,
      "lon": -48.125,
      "slope_sen_decade": 0.34,
      "q_value_fdr": 0.0041,
      "is_sig": true
    }
  ]
}
```

- **Visual Invariants (3 Independent Dimensions):**
  1. **Direction:** sign of `slope_sen_decade` (`> 0` vs `< 0`).
  2. **Magnitude:** proportional to `Math.abs(slope_sen_decade)`.
  3. **Significance:** controlled exclusively by `is_sig` / `q_value_fdr < 0.05`. Never conflate magnitude with significance.
- **Alias and Homologation in `frontend/`:** `CLOUD_AMT` resolves via `is_alias_of: 'CLDTOT'` to `CLDTOT_grid.json` without triggering a false fallback. The 12 real `{var_id}_grid.json` files are homologated before deployment with `npm run validate:grids -- --strict` in `frontend/` (checking schema in `validateGlobalGrid`, `variable_id`/`trend_unit` alignment, `points >= 100`, and alias resolution).

---

## 3. Flow B — Dynamic Native Grid Selection ($K \le 9$, 8-Neighbor Connectivity)

When clicking on the map, the frontend snaps to the selected variable's native cell and allows freely composing up to **$K \le 9$ adjacent cells** (8-neighbor connectivity — shared edge or vertex, allowing `1x1`, `1x3`, `2x1`, `2x2`, `3x3`, `L`-shape, etc.) for **Location A** and **Location B**.

### 3.1 Client Validation Rules (`gridGeometry.ts`)
1. `1 <= cells.length <= 9` ($K \le 9$ cap).
2. When adding a cell (when `cells.length >= 1`), the new cell must be an 8-neighbor of at least one already selected cell (`|row_a - row_b| <= 1 && |col_a - col_b| <= 1`).
3. When removing a cell, the remaining set must stay a single 8-connected component (preventing disconnected "islands").
4. `region_id` is deterministic: cells sorted lexicographically by `cell_id`, guaranteeing the same IndexedDB cache key regardless of click order.
5. **`"Same Location (A=B)"` mirroring across distinct grids (`mirrorRegionSelection`):** when `variable_a` and `variable_b` belong to the same `source_model`, `region_b` mirrors `region_a.cells` identically; when they cross distinct native models (`MERRA-2` `0.5°×0.625°` $\leftrightarrow$ `CERES_SYN1deg` `1.0°×1.0°`), the centroids of `region_a.cells` are automatically re-snapped onto `variable_b`'s native grid with deduplication by `cell_id`, midpoint filling if there is a step gap, and selection of an 8-connected core up to $K \le 9$, maintaining full compliance with backend grid validation.

### 3.2 Frontend Request (`POST /api/analyze`)

```json
{
  "variable_a": "GWETTOP",
  "variable_b": "T2M_MAX",
  "region_a": {
    "slot": "A",
    "region_id": "MERRA-2__r142_c210+r142_c211",
    "source_model": "MERRA-2",
    "grid_resolution": { "dLat": 0.5, "dLon": 0.625 },
    "cells": [
      { "cell_id": "r142_c210", "row": 142, "col": 210, "lat": -18.75, "lon": -48.4375 },
      { "cell_id": "r142_c211", "row": 142, "col": 211, "lat": -18.75, "lon": -47.8125 }
    ]
  },
  "region_b": null,
  "start_date": "1981-01",
  "end_date": "2025-12"
}
```

- The Python backend (`stats_engine.py`) fetches/reads each `(cell.lat, cell.lon)` from cache, computes the spatial mean $\bar{Y}(t) = \text{nanmean}(Y_i(t))$ over the $K$ submitted cells, and runs the full statistical engine.

---

## 4. Flow B — Backend Response (`RegionAnalysisResponse`)

```json
{
  "request_meta": {
    "variable_a": "GWETTOP",
    "variable_b": "T2M_MAX",
    "region_a_id": "MERRA-2__r142_c210+r142_c211",
    "region_b_id": null,
    "cells_count_a": 2,
    "cells_count_b": 0,
    "spatial_aggregation": "nanmean",
    "source": "backend_api"
  },
  "region_a_analysis": {
    "variable_id": "GWETTOP",
    "variable_name": "Surface Soil Wetness (0–5 cm)",
    "scale_type": "ratio",
    "unit": "fraction (0–1)",
    "trend_unit": "fraction/decade",
    "allow_percentage_change": false,
    "period": {
      "start": "1981-01",
      "end": "2025-12",
      "n_observations": 540,
      "n_effective_ar1": 118.4
    },
    "regression": {
      "intercept_at_start_A0": 0.642,
      "slope_per_decade_ols": -0.028,
      "slope_per_decade_sen": -0.026,
      "slope_ci95_low": -0.035,
      "slope_ci95_high": -0.017,
      "cumulative_model_change": -0.117,
      "quadratic_acceleration_B2": -0.0014,
      "regime_shape": "accelerating_decline"
    },
    "correlation_and_coupling": {
      "pearson_r": -0.68,
      "kendall_tau": -0.51,
      "r_squared": 0.46,
      "ellipse_aspect_ratio": 0.44
    },
    "significance": {
      "p_value_naive": 1.1e-18,
      "p_value_ar1_corrected": 0.00042,
      "fdr_q_value": 0.0012,
      "is_significant_fdr05": true,
      "confidence_tier": "CONFIRMED_HIGH"
    },
    "outliers_mahalanobis": [
      {
        "date": "2015-11",
        "observed_anomaly": -0.145,
        "expected_regression": -0.062,
        "mahalanobis_d": 3.08,
        "direction": "below_ellipse",
        "diagnostic_hint": "Extreme water stress (2015–2016 El Niño)"
      }
    ],
    "series": {
      "dates": ["1981-01", "1981-02"],
      "raw_values": [0.65, 0.67],
      "anomaly_values": [0.01, 0.02],
      "linear_fit": [0.0, -0.0002],
      "gam_smooth_fit": [0.005, 0.003]
    }
  },
  "region_b_analysis": null,
  "comparison_pair": {
    "region_a_id": "MERRA-2__r142_c210+r142_c211",
    "region_b_id": "MERRA-2__r142_c210+r142_c211",
    "spatial_divergence_detected": false,
    "slope_difference_per_decade": null,
    "multiscale_correlation": {
      "long_term_secular_r": -0.74,
      "short_term_detrended_r": -0.61,
      "paradox_type": "LOCAL_PHYSICAL_COUPLING",
      "interpretation": "Increase in T2M_MAX is associated with declining surface soil moisture (GWETTOP) in both the secular trend and interannual variability."
    }
  }
}
```

> **Note on `comparison_pair`:** Whenever 2 series are active (whether $A \neq B$ or $A = B$ with $X \neq Y$), `region_b_analysis` carries the second series (from Location B or from Variable Y at Location A) and `comparison_pair` carries the multiscale correlation ($r_{\text{global}}$ vs. $r_{\text{detrended}}$).

---

## 5. Standardized Semantic Errors and Adapter Modes

The `getRegionData()` adapter operates in two modes toggled by `VITE_DATA_MODE`:
- `api`: queries `POST ${VITE_API_BASE_URL}/api/analyze` using `AbortController` and caches results in **IndexedDB**. On network failure/timeout (`> 5000 ms`), triggers fallback to `public/data/`.
- `offline`: reads precomputed bundles directly from `public/data/`.

| Error Code | When It Occurs | Expected UI Action |
| :--- | :--- | :--- |
| `OCEAN_MASK_NO_DATA` | All selected cells fell over the ocean for `GWETTOP`/`GWETROOT` | Display a clean notice advising the user to click a continental area |
| `MAX_CELLS_EXCEEDED` | User attempts to select a 10th cell ($K > 9$) | Block selection and inform about the 9-cell maximum |
| `NOT_ADJACENT` | Clicked cell is not an 8-neighbor of the current block | Inform or start a clean new selection (per `MapView` UX) |
| `WOULD_DISCONNECT` | Removing a cell would split the block into 2 islands | Prevent removal of the bridge cell |
| `INVALID_DATE_INTERSECTION` | `start_date > end_date` or outside valid intersection | Automatically adjust to the valid intersection |
| `BACKEND_UNAVAILABLE` | HTTP failure/timeout with no matching preset | Display recoverable error state with a retry button |
