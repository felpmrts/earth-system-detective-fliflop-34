# Data Sources & Preprocessing (`DATA_SOURCES.md`)

> *(Initial documentation v1 — public catalog of official NASA, NOAA, and Copernicus/GloFAS sources, grid resolutions, and processing rules applied by **Earth System Trend Detective**).*

---

## 1. Official Matrix of Integrated APIs and Models

The project integrates **5 environmental sources/APIs** orchestrated by a central catalog in `data/catalog/environmental_catalog.py`, totaling **7 Environmental Families (42 operational codes / 39 UI entries)**:

| # | Source / Provider | Dataset / Satellite / Model | Native Spatial Resolution | Access & Authentication | Role in Product |
| :-: | :--- | :--- | :--- | :--- | :--- |
| **1** | **NASA POWER API v2** | **MERRA-2** *(atmospheric & land reanalysis)*, **GPM** *(precipitation)*, and **CERES SYN1deg** *(radiation & clouds)* | `0.5° × 0.625°` (`MERRA-2`) and `1.0° × 1.0°` (`CERES_SYN1deg`) | Open *(no token)* | Primary real-time engine for regional monthly series and precomputed global grids. |
| **2** | **NASA AppEEARS API** | **MODIS** (`MOD13A3.061` NDVI/EVI, `MOD11C3.061` Day/Night LST, `MOD15A2H` LAI) | `500 m` – `0.05°` (`CMG`) / `1 km` | Free (`EARTHDATA_USERNAME` / `EARTHDATA_PASSWORD`) | Vegetation, urban heat islands, and biomass vigor via queue/cache. |
| **3** | **NASA Giovanni / GES DISC & CMR** | **GPM IMERG V07** (`GPM_3IMERGM`), **GLDAS Noah** (`GLDAS_NOAH025_M`), and **MODIS Aerosol** (`MOD08_M3`) | `0.1°` (`IMERG`), `0.25°` (`GLDAS`), `1.0°` (`MOD08_M3`) | Free (`EARTHDATA_TOKEN` / NASA Earthdata Login) | Cross-validation of precipitation, evapotranspiration, runoff, and aerosols. |
| **4** | **Open-Meteo Flood API** | **GloFAS** *(Copernicus Emergency Management Service)* | `0.05°` / hydrological point | Open *(non-commercial/scientific use)* | Mean, maximum, and critical minimum discharge of rivers and watersheds (`m³/s`). |
| **5** | **NOAA Climate Data Online (CDO API v2)** | Ground stations **`GSOM`** and **`GHCND`** | Point *(physical weather station)* | Free (`NOAA_CDO_TOKEN`) | Direct confrontation between satellite estimates and ground thermometers/rain gauges. |

---

## 2. The 7 Environmental Families and Temporal Coverage

| Environmental Family | Key Example Variables | Models / Sources | Typical Start | Scale Types |
| :--- | :--- | :--- | :---: | :--- |
| **1. Temperature and Heat** | `T2M`, `T2M_MAX`, `T2M_MIN`, `T2M_RANGE`, `TS`, `T2MDEW`, `LST_Day_CMG`, `LST_Night_CMG` | MERRA-2, MODIS AppEEARS | `1981` (MERRA-2) / `2000` (MODIS) | Interval (`°C`) |
| **2. Rainfall and Atmospheric Moisture** | `PRECTOTCORR`, `GPM_3IMERGM`, `RH2M`, `QV2M`, `TQV` | MERRA-2, GPM IMERG | `1981` / `2000` | Ratio (`mm/month`, `g/kg`, `kg/m²`) and `%` |
| **3. Soil, Agricultural Drought, and Evapotranspiration** | `GWETTOP`, `GWETROOT`, `GWETPROF`, `Evap_tavg`, `Qs_acc` | MERRA-2 Land, GLDAS Noah | `1981` / `2000` | Ratio (`fraction 0–1`, `mm/day`, `kg/m²`) |
| **4. Rivers, Discharge, and Watersheds** | `river_discharge`, `river_discharge_mean`, `river_discharge_max`, `river_discharge_min` | GloFAS (Open-Meteo) | `1984` | Ratio (`m³/s`) |
| **5. Vegetation and Land Cover** | `_1_km_monthly_NDVI`, `_1_km_monthly_EVI`, `Lai_500m`, `ALLSKY_SRF_ALB` | MODIS AppEEARS, CERES | `2000` / `1984` | Interval (`NDVI`/`EVI`) and Ratio |
| **6. Radiation, Clouds, Winds, and Pressure** | `ALLSKY_SFC_SW_DWN`, `CLRSKY_SFC_SW_DWN`, `ALLSKY_SFC_LW_DWN`, `CLDTOT`/`CLOUD_AMT`, `WS2M`, `WS10M`, `WS50M`, `PS`, `AOD_550` | CERES SYN1deg, MERRA-2, MODIS | `1981` / `1984` | Ratio and Interval (`PS` in `kPa`) |
| **7. Ground Stations** | `PRCP`, `TAVG`, `TMAX`, `TMIN`, `SNOW`, `SNWD`, `AWND` | NOAA CDO v2 | Varies by station | Interval (`°C`) and Ratio (`mm`, `m/s`) |

> **Precomputed global layers in the frontend (`frontend/public/data/*_grid.json`):** 12 homologated global grids of 144 points each (`T2M`, `T2M_MAX`, `T2M_MIN`, `PRECTOTCORR`, `RH2M`, `GWETTOP`, `GWETROOT`, `PS`, `WS10M`, `ALLSKY_SFC_SW_DWN`, `ALLSKY_SFC_LW_DWN`, `CLDTOT`), enabling instant exploration of the trend layer and 100% offline operation.

---

## 3. Sanitization and Physical Preprocessing Rules

- **Missing-data sentinel (`-999`) and ocean mask:** Values `-999` / `-999.0` (common over oceans in MERRA-2 Land variables `GWETTOP`, `GWETROOT`, and `GWETPROF`) are converted to `NaN`, never to zero. Spatial aggregation of selected cells (up to `25` connected cells per region, configurable via `MAX_CELLS_PER_REGION` / `VITE_MAX_CELLS_PER_REGION`) uses a NaN-ignoring mean (`nanmean`). If the entire region falls on an ocean mask with no data, the backend returns the semantic error `OCEAN_MASK_NO_DATA`.
- **Removal of annual summary `YYYY13`:** The `YYYY13` annual keys returned by NASA POWER in monthly series are discarded before any computation.
- **Monthly precipitation unit (`PRECTOTCORR`):** The daily mean rate (`mm/day`) is multiplied by the actual number of days in each month (`calendar.monthrange(year, month)[1]`, accounting for leap years) to express monthly totals in `mm/month`.
- **Cross-grid re-snap and alignment (`A=B` multi-model):** When the same physical area combines a `MERRA-2` (`0.5° × 0.625°`) product and a `CERES_SYN1deg` (`1.0° × 1.0°`) product, the frontend reprojects centroids and preserves connectivity up to the configured cell cap, while the backend strictly aligns the monthly temporal intersection $[t_0, t_f]$ before computing comparative metrics.
- **Scale control (Invariant #3):** Interval variables (such as `°C`, `kPa`, `NDVI`, `EVI`) have `allow_percentage_change = false` and never have trends displayed in `%`.

---

## 4. Known Limitations

- **Discontinuities and time windows across sensors:** MODIS products start in `2000`, whereas MERRA-2 reanalyses start in `1981` and CERES SYN1deg series start in `1984`; combined queries are automatically restricted to the common intersection between `A` and `B`.
- **NOAA CDO and AppEEARS stations:** May exhibit occasional historical gaps or asynchronous queue latency over long windows (NOAA CDO is queried in 10-year chunks with pagination and local caching in `data/cache/storage/`).
- **Offline Contingency:** The static bundle (`VITE_DATA_MODE=offline`) guarantees 100% operation without internet using `public/data/mock_analysis.json` and the 12 embedded global grids, without triggering calls to external CDNs.

---

## 5. Official References

- **NASA POWER Project:** Prediction Of Worldwide Energy Resources (POWER) API v2 — NASA Langley Research Center (`power.larc.nasa.gov`). Includes **MERRA-2** outputs (GMAO, DOI: `10.5067/VJAFPLI1CSIV` / GMAO monthly series) and **CERES SYN1deg** (`ceres.larc.nasa.gov`).
- **NASA Earthdata AppEEARS & MODIS:** LP DAAC — `MOD13A3.061` (NDVI/EVI), `MOD11C3.061` (LST), and `MOD15A2H.061` (LAI) (`appeears.earthdatacloud.nasa.gov`).
- **NASA GES DISC / Giovanni:** `GPM_3IMERGM` V07 (`DOI: 10.5067/GPM/IMERG/3B-MONTH/07`), `GLDAS_NOAH025_M` (`DOI: 10.5067/SXAVCZFAQLNO`), and `MOD08_M3` (`giovanni.gsfc.nasa.gov`).
- **Copernicus / GloFAS via Open-Meteo Flood API:** Global Flood Awareness System (`open-meteo.com/en/docs/flood-api`).
- **NOAA National Centers for Environmental Information (NCEI):** Climate Data Online API v2 — `GSOM` & `GHCND` (`ncdc.noaa.gov/cdo-web`).
