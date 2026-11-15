# Earth System Trend Detective — Project FlipFlop-34

> **NASA International Space Apps Challenge 2026** · Challenge *Be An Earth System Trend Detective!*
> *(Initial documentation v1 — public baseline for local reproduction, testing, and continuous integration).*

**Earth System Trend Detective** transforms multidecadal climate time series from NASA, NOAA, and Copernicus into visual, geospatial, and statistically audited diagnostics, answering the **4 Detective Questions** for any point or compared region on the planet:

1. **WHAT is changing?** Raw time series vs. monthly climatological anomaly (seasonal cycle removed) and nonlinear regime (GAM/Spline and acceleration $B_2$).
2. **WHERE is it changing?** Interactive Canvas map with a precomputed global grid ($q_{\text{FDR}} < 0.05$) and A × B comparator with **Same Location (`A=B`)** mode and cross-grid *re-snap* (`MERRA-2` $0.5^\circ \times 0.625^\circ$ and `CERES_SYN1deg` $1.0^\circ \times 1.0^\circ$).
3. **HOW MUCH is it changing?** Rate of change per decade fitted across the entire point cloud (robust **Theil–Sen** with 95% CI and **OLS**), respecting interval scales (`%` is forbidden on $^\circ\text{C}$, $\text{kPa}$, etc.).
4. **Is it statistically significant?** Temporal autocorrelation **$\text{AR}(1)$** correction ($N_{\text{effective}}$), false discovery rate control (**Benjamini–Hochberg FDR**), and bivariate extreme detection via **Mahalanobis Distance ($D_M > 2.5$)**.

---

## The Project's 7 Statistical Invariants

1. Computing trends as end point minus start point ($Y_{\text{end}} - Y_{\text{start}}$) is forbidden.
2. Regressions are applied exclusively to **monthly climatological anomalies** (seasonality removal — Henrietta Leavitt Principle).
3. Percentage change (`%`) is strictly forbidden for **interval-scale** variables.
4. Clear separation between slope magnitude ($B$) and coupling strength ($r$, $\tau$, $R^2$).
5. Multiscale decomposition between long-term secular correlation ($r_{\text{global}}$) and short-term residual oscillation ($r_{\text{detrended}}$).
6. Smooth nonlinear modeling (**GAM / Smoothing Spline**) instead of unconstrained high-degree polynomials.
7. Outlier identification via **Mahalanobis Ellipse ($D_M > 2.5$)** and significance corrected for **$\text{AR}(1)$ + FDR ($q < 0.05$)**.

---

## Repository Structure

| Directory / File | Role |
| :--- | :--- |
| `frontend/` | React + TypeScript + Vite + Mantine + Leaflet (Canvas) + Plotly.js web application, 8-step HUD Tutorial, offline global layers in `public/data/`, Co-Pilot panel, Vitest unit tests, and Playwright E2E suite. |
| `backend/` | State-of-the-art statistical engine (`stats_engine.py`: GCV Spline/LOWESS, `MinCovDet` Mahalanobis, Santer `AR(1)` + Hamed-Rao + BH FDR), agentic Statistical Co-Pilot (`copilot_engine.py` + `copilot_tools.py` with Gemini / OpenRouter), Discovery Engine (`discovery_engine.py` / `ml_discovery.py`), and `requirements.txt`. |
| `data/` | Data layer and REST API (`data.api.server`): catalog of the 7 Environmental Families (42 variables), multi-API connectors, disk cache, comparison service (`comparison_service.py` delegating to `backend/stats_engine.py`), and contract tests. |
| `context/` | Scientific knowledge base, NASA/NOAA/GloFAS API specifications, maps, and operational guides. |
| `.github/workflows/ci.yml` | GitHub Actions CI pipeline (`backend/` + `data/tests/`, typecheck, grid homologation, offline audit, and Playwright E2E tests). |
| `CONTRATO_DE_DADOS.md` | Frozen JSON contract (`RegionAnalysisRequest -> RegionAnalysisResponse`). |
| `DATA_SOURCES.md` | Inventory of data sources, spatial resolutions, preprocessing rules, and official citations. |
| `00_MASTER_CONTEXT_AND_ROUTER.md` | Architectural entry point and internal documentation router. |

---

## Running Locally

### Prerequisites
- **Python 3.10+** with `pip` / `venv` (statistical engine dependencies in `backend/requirements.txt`: `numpy`, `scipy`, `scikit-learn`)
- **Node.js 22+** and **npm**

### 1. Start the Backend (`http://127.0.0.1:8000`)

From the repository root:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt

# Optional: copy credentials template (OpenRouter / Gemini for Co-Pilot and NOAA/AppEEARS/Giovanni)
cp data/.env.example data/.env

PYTHONPATH=. python3 -m data.api.server --host 127.0.0.1 --port 8000
```

Main endpoints: `GET /api/health`, `GET /api/catalog`, `POST /api/analyze`, `POST /api/copilot`, `POST /api/discover`, `POST /api/compare`.

### 2. Start the Frontend (`http://127.0.0.1:5173`)

In another terminal:

```bash
cd frontend
npm ci
npm run dev -- --host 127.0.0.1 --port 5173
```

### 100% Offline Mode (Demo Contingency)

To run without a backend or internet connection, set `VITE_DATA_MODE=offline` in `frontend/.env.local` (based on `frontend/.env.example`):

```bash
cd frontend
npm run build
npm run verify:offline
npm run preview
```

---

## Testing and Auditing

### Frontend (Typecheck, Grids, Unit Tests, Offline Bundle, and Real E2E)

```bash
cd frontend
npm run typecheck         # Strict TypeScript check (tsc --noEmit)
npm run validate:grids    # Structural and statistical homologation of the 12 global grids
npm run build             # Production build into dist/
npm test                  # Unit test suite (Vitest; includes dist/ audit)
npm run verify:offline    # Audit for 0 external CDNs and offline integrity in dist/
npm run test:e2e          # Playwright suite in a real browser against vite preview
```

> To run `npm run test:e2e` on Linux/CI for the first time: `npx playwright install --with-deps chromium`.

### Backend (`backend/` + `data/`)

```bash
PYTHONPATH=. python3 -B -m unittest discover -s backend -p "test_*.py" -v
PYTHONPATH=. python3 -B -m unittest discover -s data/tests -p "test_*.py" -v
```
