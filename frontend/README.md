# Frontend — Earth System Trend Detective

This guide describes how to run, maintain, and integrate the web application. The stack uses React, TypeScript, Vite, Mantine for controls, and Plotly.js for charts. The static build can be deployed to Vercel with `frontend/` as the root directory.

## Local Environment

Use a Node.js version compatible with the installed Vite and npm. From the repository root:

```powershell
cd frontend
npm ci
npm run dev
```

Open the address printed by Vite. To verify changes, run `npm run typecheck`, `npm test`, and `npm run build`. The build outputs `frontend/dist/`. Use `npm run preview` to serve that build locally. To homologate the 12 real `{var_id}_grid.json` files in `public/data/`, run `npm run validate:grids -- --strict` (partial mode without `--strict` validates only present files and the `CLOUD_AMT -> CLDTOT_grid.json` alias).

## Journey and State

1. Choose variables A and B in the selectors grouped by family. Both sides can use the same variable.
2. Select the start month and end month. The minimum start comes from the greater start year between the two variables. The upper bound is the current month. Effective coverage depends on the query.
3. The Map area uses NASA GIBS in Leaflet. Choose the active side and click cells to compose regions A and B (or enable **Same Location (A=B)** to mirror A into B — with automatic *re-snap* and deduplication when `MERRA-2` `0.5°×0.625°` and `CERES_SYN1deg` `1.0°×1.0°` differ). The connected-cell limit per region is variable and configurable via `VITE_MAX_CELLS_PER_REGION` (default `25`, equivalent to `5×5`), and can be changed at any time.
4. `Analyze selection` sends a single `POST /api/analyze` request once variables, period, and regions A/B are complete. The Bench receives the real response and displays backend errors without silently substituting synthetic data.

State lives in `src/App.tsx`. The app starts on the Map tab and preserves choices across tab switches. Chart controls toggle raw vs. anomaly series, overlaid vs. separated curves, dual Y-axis, and OLS/Theil–Sen trends. Different units are separated when dual axis is disabled. Temporal slicing preserves alignment between dates, values, and trends and constrains horizontal navigation. Slicing uses precomputed fits from the fixture, valid for the original analysis period.

## Environmental Catalog

`src/contracts/environmentalFamilies.json` is a presentation slice of the Python catalog `data/catalog/environmental_catalog.py` from branch `data`, revision `00efd67`. It preserves the names, codes, and ordering of the seven families and 42 entries. Options not yet supported in the frontend operational contract appear disabled. The legacy entry `CLDTOT` remains available in the radiation and atmosphere family to preserve the current contract. Data also registers `CLOUD_AMT` as a distinct code, whose full adoption depends on aligning map, operational catalog, and API.

When updating families, verify that all codes in `src/contracts/catalog.ts` remain accessible. That file centralizes operational metadata such as unit, grid resolution, model, start year, and land mask. New sources may require their own metadata and spatial rules before being enabled.

## Code Organization

| Path                                  | Responsibility                                                                                        |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/main.tsx`                        | Initializes React and the Mantine dark theme with date locale.                                        |
| `src/App.tsx` and `src/bench.css`     | Exploration state, selectors, navigation, map container panel, charts, and responsive layout.         |
| `src/contracts/`                      | Query and response types, catalog, families, and payload validation.                                  |
| `src/geo/gridGeometry.ts`             | Geometry, native grid snapping, and connected-cell composition (limit configurable via `VITE_MAX_CELLS_PER_REGION`, default `25`). |
| `src/map/`                            | React/Leaflet map, NASA GIBS and OSM layers, A/B selection, styles, and legend.                       |
| `src/services/regionDataAdapter.ts`   | Backend catalog, real analyses, validation, timeout, cache, and explicit offline mode.                |
| `src/services/idbCache.ts`            | Persistence of analyses in IndexedDB.                                                                 |
| `public/data/`                        | Precomputed global grids and synthetic bench fixture.                                                 |
| `src/__tests__/`                      | Contract, geometry, legend, and adapter tests.                                                        |

## Integration with PROD-1 and Data

The exploration screen coordinates the flow. The map receives the variable relevant to A or B and returns the typed spatial selection. A region's cells follow that variable's model and resolution. Leaflet uses latitude/longitude, while GeoJSON uses longitude/latitude. See details in the [PROD-1 contract](../context/knowledge_maps/CONTRATO_FRONTEND_PROD1.md).

The [data contract](../CONTRATO_DE_DADOS.md) defines `POST /api/analyze` with variables, regions, and monthly dates, returning an analysis for A, optional analysis for B, and comparison metrics. The backend aggregates cells, queries sources, and computes statistics. The browser renders the precomputed values. `series.linear_fit` feeds OLS and the optional `sen_fit` series feeds Theil–Sen when available. On the global map, direction, magnitude, and significance are distinct legend dimensions.

### Data and Offline Configuration

The default mode is `api`. Copy `.env.example` to `.env.local` when local adjustments are needed. `VITE_DATA_MODE=offline` deliberately activates local synthetic files; `VITE_DATA_MODE=api` uses `VITE_API_BASE_URL` (local example `http://localhost:8000`). The maximum cells per region is variable and set by `VITE_MAX_CELLS_PER_REGION` (default `25`), and can be changed anytime in `.env.local` (or environment) — keep it aligned with `MAX_CELLS_PER_REGION` on the backend. `VITE_*` variables are public. Keep credentials on the backend.

The frontend loads families and availability via `GET /api/catalog`. The 22 NASA POWER variables in `realtime` mode are enabled; queue, demo, or credential-gated connectors remain unavailable. Upon final confirmation, the adapter calls `POST /api/analyze`, validates the response, and writes the result to IndexedDB. In API mode, failures are surfaced as real errors. The mock is used only when `VITE_DATA_MODE=offline` is explicitly configured.

To run the full local integration, start both processes in separate terminals:

```powershell
python -m data.api.server --port 8000
cd frontend
npm run dev
```

The backend expects months in `YYYY-MM` format. The frontend converts Mantine's selection to that contract and keeps full dates only in chart axis presentation.

## Pre-Integration Checklist

- Run typecheck, tests, and build.
- Validate A/B selectors on desktop and mobile, including search, clearing, long names, and boundary months.
- Check series with swapped A/B, dual units, unavailable series, period with no points, and toggling between raw and anomaly.
- Check geographic snapping, A/B cells, configured cell limit (`VITE_MAX_CELLS_PER_REGION`), and state preservation across tab switches.
- In API integration, verify success payloads, missing data, timeout, explicit error, and deliberate offline mode.

UI development takes place on `frontend`, with integration on `develop` and production on `main`. The map feeds the A/B spatial state and the real backend call already fires after `Analyze selection`. The co-pilot panel still depends on integration. See also the [stack decision](../context/general_strategy/STACK_FRONTEND.md).
