# Technical Specifications & Ingestion Rules — NASA POWER API v2 (`DADOS-1`)

> **Technical Summary Validated by `DADOS-1` (Kaio and Felipe):** Mandatory data handling rules, *bounding box* limits, physical units, *rate limits*, and storage format for the *Earth System Trend Detective* backend.

---

## 1. Ocean Mask and Missing Values (`GWETTOP` / `GWETROOT`)

- **Sentinel Value (*Fill Value*):** The default missing-data value in the NASA POWER API is **`-999`** (or `-999.0` in JSON/CSV), and **not** `null`.
- **Behavior Over Oceans:** Soil moisture variables (`GWETTOP` — surface $0\text{--}5\text{ cm}$, and `GWETROOT` — root zone $0\text{--}100\text{ cm}$) come from the **MERRA-2 Land** model, which only has data over continents/islands. If a coordinate (`/point`) or cell inside a rectangle (`/regional`) falls over the ocean, the API returns **`-999`** for every month of that cell.
- **Mandatory Backend Rule:** Before computing the spatial mean of a cell composition (especially in coastal regions like Rio de Janeiro or Santos) or running regressions, replace `-999` with `np.nan` (`df.replace(-999, np.nan)`) and use `np.nanmean()` so ocean cells do not distort the land-area mean.

---

## 2. Actual Unit of `PRECTOTCORR` (`AG` Community) and `YYYY13` Filter

- **Returned Unit:** Even on the **monthly** endpoint (`/api/temporal/monthly/point` or `/regional`) in the `AG` (Agroclimatology) community, the variable `PRECTOTCORR` (*Precipitation Corrected*) is returned as a **daily mean rate (`mm/day`)**, and **not** the monthly total (`mm/month`).
- **Confirmation in Payload:** The `"parameters"` block at the top of the JSON explicitly reports `"units": "mm/day"`.
- **Mandatory Backend Rules:**
  1. **Discard the `YYYY13` key:** NASA POWER includes the annual key `YYYY13` alongside the 12 months (`YYYY01..YYYY12`) in monthly series. It must be filtered out before any statistical calculation.
  2. **Conversion to `mm/month`:** To display monthly total volume in `mm/month`, multiply each month's value by the number of days in that month (`calendar.monthrange(year, month)[1]`), handling leap years in February.

---

## 3. `/point` vs. `/regional`: Bounding Box Limits and Latency

| Feature | `/api/temporal/monthly/point` | `/api/temporal/monthly/regional` |
| :--- | :--- | :--- |
| **Parameters per call** | Up to **20 parameters** (`parameters=T2M,PRECTOTCORR,...`) | Only **1 parameter** per request (multiple parameters return `422 Unprocessable Entity`) |
| **Minimum size** | 1 native cell (`lat`, `lon`) | **`2° × 2°`** (smaller boxes, such as `0.5° × 0.5°`, return `422`) |
| **Maximum synchronous size** | 1 native cell | **`10° × 10°`** (larger requires async/batch processing) |
| **Real latency (20–30 years)** | **~0.8 s to 1.8 s** | **~1.5 s to 3.5 s** |

- **Note on the MERRA-2 Grid ($0.5^\circ \text{ lat} \times 0.625^\circ \text{ lon}$):** Even a $3\times 3$ MERRA-2 composition measures $1.5^\circ \times 1.875^\circ$, which is smaller than `/regional`'s $2^\circ \times 2^\circ$ minimum. Therefore, for small compositions ($K \le 9$ adjacent cells), using `/point` with concurrency control and per-cell caching is the default path (or `/regional` when the box reaches $\ge 2^\circ \times 2^\circ$ for 1 variable).

---

## 4. Rate Limits, Concurrency, and Adjacent-Cell Composition

- **Official Limits (NASA POWER API v2):**
  - **Per minute:** Maximum of **30 requests/minute** per IP (synchronous queries).
  - **Simultaneous concurrency:** Tolerates short bursts of **3 to 5 concurrent calls** (`asyncio` / `ThreadPoolExecutor`). Firing 9 parallel calls at once frequently triggers **`429 Too Many Requests`** or timeouts.
- **Flexible Adjacent-Cell Composition ($K \le 9$):**
  - The user is not restricted to $1\times 1 \to 2\times 2 \to 3\times 3$ squares; they can assemble any shape of adjacent cells sharing **at least one point/vertex** (e.g., $1\times 3$, $2\times 1$, $2\times 2$), allowing one geometry for variable $X$ (e.g., $1\times 3$) and another for variable $Y$ (e.g., $2\times 1$).
- **Backend Strategy:**
  - Use an **`asyncio.Semaphore(3)`** concurrency semaphore with exponential *backoff*.
  - Cache each `(lat, lon, var)` cell individually so area expansions reuse already-downloaded cells without extra HTTP calls.

---

## 5. Final Format Decision (Parquet Discarded in Module 1)

- **Decision (`DADOS-1`):** `.parquet` usage is **definitively discarded** in the main flow (Module 1).
- **Direct Pipeline:** We keep `JSON (NASA POWER) -> JSON (Frontend Contract)` with local cache storage (**JSON / SQLite**) indexed by individual cell `(lat, lon, var)` and by aggregated region query.

---

## 6. Geographic Snap Rule (Lat/Lon)

- **MERRA-2 ($0.5^\circ \text{ lat} \times 0.625^\circ \text{ lon}$) — Single default mesh on the frontend:**
  - `lat_snap = round(lat / 0.5) * 0.5`
  - `lon_snap = round(lon / 0.625) * 0.625` *(rounded to 4 decimal places in the cache key)*
- **CERES ($1.0^\circ \times 1.0^\circ$, half-degree centers):**
  - `lat_snap = floor(lat) + 0.5`
  - `lon_snap = floor(lon) + 0.5`
  - *(Since `/point` accepts up to 20 parameters mixing MERRA-2 and CERES in the same call, the frontend uses only the fine MERRA-2 grid.)*
