# Test Prototype for the 5 APIs & Location A vs. Location B Flow (`data/`)

This directory contains the executable prototype ([`api_prototype_test.py`](api_prototype_test.py)) and the captured real output ([`sample_comparison_output.json`](sample_comparison_output.json)) to validate the project's 5 APIs and the flow:

> **Validated Product Rule:** The user selects **Location A** (pulling **1 single variable**) and **Location B** (pulling **1 single variable**) — either from the same API or from different APIs — to then compute individual trends and the multiscale comparison between A and B.

---

## 1. Matrix of the 5 APIs: Which Require Registration?

| # | API / Source | Requires Registration? | How to Obtain Access / Credential | Environment Variable (Prototype) | Live Test Result (`2026-11-14`) |
| :---: | :--- | :---: | :--- | :--- | :--- |
| **1** | **NASA POWER API v2** *(MERRA-2 / GPM / CERES)* | **No** *(100% open)* | No token or login. Respect *rate limit* of `30 req/min` and `Semaphore(3)`. | *(None)* | ✅ **`OK`** (`HTTP 200`, 48 months in ~0.7s; 276 months `2001–2023` validated) |
| **2** | **Open-Meteo Flood API** *(GloFAS Model)* | **No** *(open for non-commercial use)* | No token or login for non-commercial/academic use. | *(None)* | ✅ **`OK`** (`HTTP 200`, `river_discharge` in `m³/s`, 48 months in ~1.2s; 276 months validated) |
| **3** | **NOAA CDO API v2** *(Ground stations `GSOM`/`GHCND`)* | **Yes** *(Free token)* | Request free token via email at [ncdc.noaa.gov/cdo-web/token](https://www.ncdc.noaa.gov/cdo-web/token) and pass in header `token: <YOUR_TOKEN>`. | `NOAA_CDO_TOKEN` | ✅ **`OK`** (Station `GHCND:BLM00085154` returned real record `TAVG: 27.9` in ~1.6s) |
| **4** | **NASA AppEEARS API** *(MODIS Satellite: NDVI, EVI, LST)* | **Yes** *(Earthdata Login)* | Catalog `/api/product/*` is open, but creating and downloading tasks (`/api/login`, `/api/task`) requires a free account at [urs.earthdata.nasa.gov/users/new](https://urs.earthdata.nasa.gov/users/new). | `EARTHDATA_USERNAME` and `EARTHDATA_PASSWORD` | ✅ **`OK`** (`MOD13A3.061` catalog HTTP `200` + `OK_AUTENTICADO` via `/api/login` and `/api/task` HTTP `200` in ~2.0s) |
| **5** | **NASA Giovanni / GES DISC** *(Validation / GLDAS)* | **Yes** *(Earthdata Login)* | Create a free account at [urs.earthdata.nasa.gov/users/new](https://urs.earthdata.nasa.gov/users/new), authorize the **"NASA GESDISC DATA ARCHIVE"** app in your profile, and export CSVs at [giovanni.gsfc.nasa.gov/giovanni/](https://giovanni.gsfc.nasa.gov/giovanni/) or use a Bearer token on GES DISC / CMR. | `EARTHDATA_TOKEN` | ✅ **`OK`** (`giovanni` portal HTTP `200` + authenticated CMR `GLDAS_NOAH025_M` collection/granules HTTP `200` in ~2.6s; legacy Data Rods `timeseries.cgi` endpoint redirects `301` for post-2025-10-31 transition) |

---

## 2. How the `Location A (1 variable) vs. Location B (1 variable)` Flow Works

In the prototype ([`api_prototype_test.py`](api_prototype_test.py)), `compare_location_a_and_b(location_a, location_b, start_year, end_year)` executes:

1. **Decoupled collection of 1 variable per location (with queried API indicator):**
   - Each run prints `>>> PUXANDO API [...]: <API Name> | Endpoint: <URL> | Variável: <var>` to the terminal and records `"api_puxada"` and `"endpoint_consultado"` in the output JSON.
   - `fetch_location_single_variable(location_a, ...)` fetches only `variable` for `location_a` (applying `snap_merra2` for NASA POWER, removing `-999` and `YYYY13`, and converting `PRECTOTCORR` from `mm/day` to `mm/month`).
   - `fetch_location_single_variable(location_b, ...)` fetches only `variable` for `location_b` (either from the same API or another, such as Open-Meteo GloFAS).
2. **Strict temporal alignment:** Intersects only common months `[t_0, t_f]` between A and B (276 months from `2001-01` to `2023-12` in the saved test).
3. **Anomalies + Regression + Multiscale Correlation:**
   - Extracts deseasonalized monthly anomalies ($Y'_{y,m} = Y_{y,m} - \bar{Y}_m$) for A and B.
   - Computes decadal slope via **OLS** and **Theil–Sen** ($10 \times B_{\text{year}}$) respecting scale (`ratio` vs. `interval` for `allow_percentage_change`).
   - Computes **$r_{\text{global}}$** (secular correlation of anomalies) and **$r_{\text{detrended}}$** (short-term residual correlation after removing linear trends from A and B).

---

## 3. How to Run the Prototype

### Default run (tests the 2 open APIs live + probes the 3 registration-gated APIs)
```bash
python3 data/api_prototype_test.py
```

### Authenticated run (recommended after creating free tokens)
1. Fill in your credentials in the local file [`data/.env`](.env) (based on [`data/.env.example`](.env.example) and already protected in `.gitignore` so secrets are never pushed to Git):
   - `NOAA_CDO_TOKEN`
   - `EARTHDATA_USERNAME` and `EARTHDATA_PASSWORD`
   - `EARTHDATA_TOKEN`
2. Run directly (the script loads `data/.env` automatically):
```bash
python3 data/api_prototype_test.py
```

The script writes the consolidated output to [`data/sample_comparison_output.json`](sample_comparison_output.json).
