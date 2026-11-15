# Modular Data Backend Architecture (`data/`)

This directory implements the modular multi-API ingestion, disk caching, climate statistics, and REST API backend for **Earth System Trend Detective**, driven by the official catalog of the **7 Environmental Families** ([`environmental_family.md`](../context/knowledge_data/environmental_family.md)).

> **Data flow philosophy:**
> 1. **Current MVP (1 variable per location):** the user chooses **Location A** + **1 variable** (`var_a`) and **Location B** + **1 variable** (`var_b`). The backend automatically identifies the right connector in the catalog, downloads the data (or reads from local cache), aligns common months `[t_0, t_f]`, and returns complete statistical blocks (`location_a`, `location_b`, `comparison_pair`).
> 2. **Future extension (N variables per location):** contracts (`LocationQuery`) and services (`fetch_location_multiple_variables`, `compare_locations_multi_variable`) already accept multiple variables per location (`variables=[...]`), batching calls per connector and returning the `N × M` cross matrix (`cross_comparison_matrix`) without refactoring connectors or the statistical engine.

---

## 1. Layered Structure (`data/`)

| Layer / Folder | Educational Responsibility | Main Files |
| :--- | :--- | :--- |
| **`catalog/`** | Single source of truth mapping the **7 Environmental Families** and **42 variable codes** to their connectors, modes (`realtime`, `queue_cache`, `validation_demo`), units, grids, and scales (`interval` vs. `ratio`). | [`environmental_catalog.py`](catalog/environmental_catalog.py) |
| **`models/`** | Input/validation contracts: `CellCoord` (`lat`, `lon`) and `LocationQuery` (validates `1` up to `MAX_CELLS_PER_REGION` adjacent cells — default `25`, configurable — and normalizes `variable` or `variables`). | [`contracts.py`](models/contracts.py) |
| **`cache/`** | Disk-persisted JSON cache (`data/cache/storage/`, git-ignored) indexed by connector, variable, snapped coordinate, time window, and extra parameters. | [`store.py`](cache/store.py) |
| **`connectors/`** | Isolated adapters for the 5 external APIs, sharing [`data/.env`](.env.example) loading, grid snapping (MERRA-2 `0.5°×0.625°` and CERES `1.0°×1.0°`), `-999` cleaning, automatic 10-year chunk loop with pagination on NOAA CDO (`split_into_10_year_chunks` + `GHCND -> monthly` fallback for `SNWD`), AppEEARS/CMR resolution (`granules.json`, `LAADS` + `GES_DISC`), and explicit logging of the queried API. | [`base.py`](connectors/base.py), [`nasa_power.py`](connectors/nasa_power.py), [`open_meteo_flood.py`](connectors/open_meteo_flood.py), [`noaa_cdo.py`](connectors/noaa_cdo.py), [`nasa_appeears.py`](connectors/nasa_appeears.py), [`nasa_giovanni.py`](connectors/nasa_giovanni.py) |
| **`services/`** | **Orchestration & Math:** routes variables to connectors (`ingestion_service.py` with batching in `_BATCH_CONNECTORS`) and runs all statistical invariants (`comparison_service.py`: monthly anomalies, OLS + Theil–Sen 95% CI, Gaussian curve, `AR(1)` `N_eff` + FDR, Mahalanobis `D_M > 2.5` + `diagnostic_hint`, `r_global` vs. `r_detrended` correlation, and `analyze_regions_contract` adapter 100% compatible with [`CONTRATO_DE_DADOS.md`](../CONTRATO_DE_DADOS.md)). | [`ingestion_service.py`](services/ingestion_service.py), [`comparison_service.py`](services/comparison_service.py) |
| **`api/`** | Stdlib HTTP REST server (`ThreadingHTTPServer` + `BackendRouter`) with CORS headers ready for `regionDataAdapter.ts` on branch `frontend` (`POST /api/analyze`, `POST /api/compare`, `POST /api/location/fetch`, `GET /api/catalog`, `GET /api/health`). | [`server.py`](api/server.py) |
| **Config (`.env`)** | Environment variable template, configurable cell limit (`MAX_CELLS_PER_REGION`, default `25`), and credentials (`NOAA_CDO_TOKEN`, `EARTHDATA_USERNAME`, `EARTHDATA_PASSWORD`, `EARTHDATA_TOKEN`), loaded automatically by `data/connectors/base.py`. | [`data/.env.example`](.env.example) |

---

## 2. Routing via the 7 Environmental Families Catalog

Querying `get_variable_spec(code)` in [`environmental_catalog.py`](catalog/environmental_catalog.py) automatically defines for each code:

- **Which connector to invoke** (`nasa_power`, `open_meteo_flood`, `noaa_cdo`, `nasa_appeears`, or `nasa_giovanni`);
- **Which grid to use** (e.g., `merra2` -> `snap_merra2`, `ceres` -> `snap_ceres`);
- **Which statistical scale to apply** (`allow_percentage_change=False` for interval variables like `°C`, `NDVI`, `EVI`; `True` for ratio variables like `PRECTOTCORR` or `river_discharge`).

---

## 3. How the `1 Variable` -> `N Variables` Extension Works

The extensibility secret lies in [`LocationQuery`](models/contracts.py#L20-L73) and [`ingestion_service.py`](services/ingestion_service.py#L72-L152):

### Current Flow (MVP: 1 variable per location)

```json
{
  "start_year": 2001,
  "end_year": 2023,
  "location_a": {
    "name": "Central Amazon (Manaus)",
    "variable": "PRECTOTCORR",
    "cells": [{ "lat": -3.12, "lon": -60.02 }]
  },
  "location_b": {
    "name": "Rio Negro / Amazon (Manaus)",
    "variable": "river_discharge",
    "cells": [{ "lat": -3.13, "lon": -60.02 }]
  }
}
```

### Future Flow (Extension: multiple variables per location)

Simply replace `"variable"` with `"variables": [...]` in the same JSON contract:

```json
{
  "start_year": 2001,
  "end_year": 2023,
  "location_a": {
    "name": "Central Amazon (Manaus)",
    "variables": ["T2M", "PRECTOTCORR", "RH2M"],
    "cells": [{ "lat": -3.12, "lon": -60.02 }]
  },
  "location_b": {
    "name": "Semi-arid (Petrolina)",
    "variables": ["T2M", "PRECTOTCORR"],
    "cells": [{ "lat": -9.39, "lon": -40.50 }]
  }
}
```

When `POST /api/compare` (or `BackendRouter.handle_post`) detects more than 1 variable:
1. [`ingestion_service.py`](services/ingestion_service.py#L98-L152) groups variables from the same connector via `_BATCH_CONNECTORS` (e.g., up to 20 variables per request on NASA POWER `/point`, 4 on GloFAS, and 7 on NOAA CDO with automatic 10-year chunk loops), querying only what is not yet in [`CellCacheStore`](cache/store.py#L11-L70).
2. [`comparison_service.py`](services/comparison_service.py#L526-L591) computes statistical blocks over the global common monthly window and generates `cross_comparison_matrix` with all `Location A[i] × Location B[j]` pairs. In the frontend flow (`POST /api/analyze`), [`analyze_regions_contract`](services/comparison_service.py#L699-L825) converts `RegionAnalysisRequest -> RegionAnalysisResponse` supporting an isolated region A, same region A with 2 variables (`region_b: null`), A vs. B pair, and semantic error codes (`OCEAN_MASK_NO_DATA`, `MAX_CELLS_EXCEEDED`, `INVALID_DATE_INTERSECTION`).

---

## 4. Disk Cache (`CellCacheStore`)

- Default directory: `data/cache/storage/` (ignored by [`.gitignore`](../.gitignore)).
- Each entry writes a JSON file per `(connector_id, variable, snapped_lat, snapped_lon, start_year, end_year, extra)` with a short SHA-256 hash in the filename.
- Repeated or multi-variable queries that reuse already-downloaded variables return with `http_calls = 0` and `cache_hits >= 1`.

---

## 5. REST Server Configuration and Execution

Credential prerequisite for authenticated APIs (`NOAA_CDO_TOKEN`, `EARTHDATA_USERNAME`, `EARTHDATA_PASSWORD`, `EARTHDATA_TOKEN`): populate `data/.env` from [`data/.env.example`](.env.example) (automatically loaded by [`base.py`](connectors/base.py) and git-ignored). **No external dependencies required** (100% Python 3 stdlib).

> **Variable cell limit per region (`MAX_CELLS_PER_REGION`):** the maximum number of adjacent cells accepted per region is not fixed — it is controlled by the `MAX_CELLS_PER_REGION` environment variable (default `25`, equivalent to `5×5`) and can be increased or decreased anytime in `data/.env` or the runtime environment. Keep this value aligned with `VITE_MAX_CELLS_PER_REGION` on the frontend.

### Start the Local HTTP REST Server

```bash
python3 -m data.api.server --port 8000
```

Endpoints exposed by [`server.py`](api/server.py#L37-L134):

| Method & Route | Description | Payload / Response |
| :--- | :--- | :--- |
| `GET /api/health` | Service healthcheck | `{"status": "OK", "service": "earth-system-detective-data-backend"}` |
| `GET /api/catalog` | Tree of 7 Families and 42 variables | Structured catalog ready for UI menus |
| `POST /api/analyze` | **Official frontend endpoint (`regionDataAdapter.ts`)** — accepts `RegionAnalysisRequest` (isolated region A, 2 variables at A, or A vs. B pair; includes `CLDTOT -> CLOUD_AMT` mapping, interval `PS`, and `OCEAN_MASK_NO_DATA` detection) | `RegionAnalysisResponse` ([`CONTRATO_DE_DADOS.md`](../CONTRATO_DE_DADOS.md)) |
| `POST /api/location/fetch` | Fetch series for 1 location (`1` or `N` variables) | `LocationQuery` JSON (+ `start_year`, `end_year`) |
| `POST /api/compare` | Compare Location A vs. Location B (`1` vs `1`, `N` vs `M`, or contract `region_a`/`region_b`) | `{location_a, location_b, start_year, end_year}` JSON or `RegionAnalysisRequest` |
