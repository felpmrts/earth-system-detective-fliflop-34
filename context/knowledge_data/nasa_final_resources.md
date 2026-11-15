# Data & Analysis Architecture — Earth System Trend Detective (NASA Space Apps)

> **MVP Objective:** Allow the user to act as a "data detective" — choosing an environmental context, selecting a **point** or **rectangle (region)** on the map, viewing the historical time series, and receiving a clear statistical verdict on **what changed, how much it changed, and whether the trend is statistically significant**.

---

## 1. Source and Integration Matrix (Backend)

To balance real-time speed during the demo with scientific rigor from official NASA data, ingestion is split into **live queries**, **background processing**, and **validation/demo**:

| Official Source | What We Select | What It Returns | Role and Usage Rule in App |
| :--- | :--- | :--- | :--- |
| **NASA POWER API**<br>*(MERRA-2 and GPM models)* | Variable, period (years), and **point** (`lat/lon`) or **rectangle** (`bbox`).<br>*(⚠️ Regional query accepts 1 parameter per request)*. | **JSON** or CSV.<br>• **Point:** ready series.<br>• **Rectangle:** cell grid (backend computes spatial mean). | **Primary live engine (~1–2s):** Air temperature (`T2M`), Rainfall (`PRECTOTCORR`), Humidity (`RH2M`), Radiation (`ALLSKY_SFC_SW_DWN`). Validate how many grid cells fall inside the chosen rectangle. |
| **NASA AppEEARS API**<br>*(MODIS satellite)* | Product (e.g., `MOD13A3` or `MOD11C3`), layer (`NDVI` or Surface Temp.), dates, and geometry. | **CSV** (point) or GeoTIFF/NetCDF (area). API first returns a `task_id`. | **Vegetation and Surface queries:** Trigger the request, save `task_id`, and poll in background, while keeping precomputed CSVs for the demo. |
| **Open-Meteo Flood API**<br>*(GloFAS model)* | River/basin coordinate and date range. | Instant **JSON** (~1s) with river discharge (`river_discharge` in $m^3/s$). | **Live hydrology:** Covers drought, flood, and water-flow analysis without downloading and subsetting heavy GLDAS NetCDF/HDF files in real time. |
| **NOAA CDO API v2**<br>*(Ground Stations)* | Dataset (`GSOM`/`GHCND`), station/region, and period. *(Requires free token in header)*. | **JSON** (~1–3s) with physical ground measurements (`PRCP`, `TAVG`, `SNOW`). | **Satellite vs. Ground comparison:** Confronts satellite-estimated trends with real rain gauges and thermometers. |
| **Giovanni & Hydrology Time Series** | Variable, period, and area (Giovanni) or point (Hydrology). | Clean time-series **CSV**. | **Validation & Benchmarks:** Used to verify that regional means computed by our backend match official NASA numbers and to feed demo cases. |

> **⚠️ Scope Decision (Performance):** Avoid downloading and dynamically subsetting raw `.hdf` and `.nc4` files (via `earthaccess` / Harmony) during user navigation. If soil moisture from **GLDAS** is needed, run an offline script to extract the CSV and save it in the project cache.

---

## 2. Guided Discovery Layer ("Data Detective")

To serve the challenge's target audience (students and the general public), the app translates scientific variables into investigative questions by biome/context:

| Context / Region | Suggested Variables | Investigative Question | Plain-Language Translation for User |
| :--- | :--- | :--- | :--- |
| **Urban Area / Metropolis** | `T2M` (NASA POWER) + `LST` (AppEEARS) | *"Is the urban heat island effect intensifying warming in this city?"* | Measures the gradual rise in air and surface temperature over decades, removing seasonal cycles. |
| **Forest / Cerrado / Agri** | `NDVI` (AppEEARS) + `PRECTOTCORR` (POWER) | *"Is vegetation losing vigor or suffering from rainfall regime shifts?"* | NDVI ranges from -1 to +1; sustained declines indicate deforestation, degradation, or severe water stress. |
| **Watershed / River** | `river_discharge` (GloFAS) + `PRECTOTCORR` (POWER) | *"Is this river's water volume falling even when it rains?"* | Measures water volume passing per second ($m^3/s$), revealing dam impacts, land use, or prolonged droughts. |
| **Arid / Semi-Arid Region** | `RH2M` (Humidity) + `ALLSKY_SFC_SW_DWN` (Radiation) | *"Is the region becoming drier and exposed to stronger solar radiation?"* | Indicates aridification trends through continuous historical loss of atmospheric moisture. |

---

## 3. Statistical Engine Pipeline (Python Backend)

Every extracted series (whether from a point or the spatial mean of a rectangle) goes through 4 standardized stages before reaching the screen:

1. **Cleaning and Temporal Aggregation:**
   * Standardize to **monthly** frequency (reduces daily noise and facilitates 20-to-40-year analysis).
   * Convert missing-data sentinel values (such as NASA POWER's `-999`) to `NaN` without turning them into zero (zero rain is real data).
2. **Seasonality Control (Mandatory):**
   * Since environmental variables oscillate naturally between summer and winter, apply the **Seasonal Mann-Kendall Test** (`pymannkendall.seasonal_test(series, period=12)`).
3. **Magnitude and Significance Calculation:**
   * **Rate of Change (Sen's Slope):** Multiply the monthly median slope by `120` to express change **per decade** (e.g., `+0.38 °C / decade`).
   * **Statistical Significance:** Evaluate the *p-value* at **95% confidence ($\alpha = 0.05$)**. If $p < 0.05$, the trend is confirmed as statistically significant.
4. **Smart Cache:**
   * Save processed results to disk/SQLite indexed by `source_variable_geometry_period`. Repeated queries respond in milliseconds.
