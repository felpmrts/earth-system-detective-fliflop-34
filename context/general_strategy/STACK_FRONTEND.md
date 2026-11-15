# Frontend Stack — Earth System Detective

## Decision

**React + TypeScript + Vite**, with static deployment on **Vercel**. The map, filters, charts, and A/B comparison run in the browser. Vite simplifies the static build and distribution of the local demo. Next.js remains an option if public HTML-rendered pages or a frontend-maintained server layer become concrete requirements.

The decision assumes the data team will provide an independent scientific API. Data documentation specifies a Python statistical engine and a JSON contract with the frontend. The integration endpoint and environment still need confirmation.

## Technologies and Responsibilities

| Part | Choice |
| --- | --- |
| Interface & state | React and TypeScript in strict mode. Analysis state on screen, with hooks and URL parameters when useful to share a query. |
| Build & deploy | Vite. Previews on Vercel via Git and production from branch `main`, with integration on `develop`. |
| Map | 2D Leaflet, with Canvas when point volume requires it. Legend distinguishes direction, magnitude, and significance. |
| Charts | Library to be finalized after validating time series, overlay, dual axes, symlog scale, and PNG export. |
| Integration | `fetch` via a typed client, with validation of incoming JSON, cancellation of stale queries, and loading, error, and no-data states. |
| Cache & offline | IndexedDB for queried data, plus local global grids and cartographic assets for network-free resilience. |

## Product Flow

- The user picks the variable, selects A/B locations with compositions of up to nine adjacent cells, including shapes such as 1×3 and 2×1, and defines a valid period for both series. The bench accepts comparisons between identical or different variables.
- The map loads the precomputed global grid and emits the selection. An adapter queries regional series and metrics on demand. Mocks use the same JSON contract so map, charts, and data progress in parallel.
- The scientific API concentrates NASA data acquisition, spatial aggregation, statistical calculations, and co-pilot integration. The frontend displays raw and anomaly series, per-decade units, OLS, Theil–Sen, and GAM fits, multiscale correlations, outliers, and significance per the contract. The co-pilot receives metrics from the current analysis. Credentials stay on the server.
- The first milestone is publishing one real variable and comparing two regions end-to-end. Validate on mobile and 4G, with a slow or unavailable API and with the demo disconnected. Offline mode covers local data bundles and already-cached queries, according to available local assets.

## Items to Close with Data

- Confirm whether delivery to the frontend will be an API, precomputed files, or both, as well as owner, environment, and contract format.
- Reconcile the 4–6 variable catalog in the master context with the 12 variables and dynamic queries of the strategy. The design accommodates an incremental catalog, precomputed global grid, and dynamic regional queries.
- If NASA or co-pilot integration falls under frontend responsibility, re-evaluate whether co-deployed endpoints with Next.js simplify operations. More variables, charts, or scientific processing can evolve while keeping the frontend on Vite and expanding the API.

## Internal References

- [Project Strategy](./ESTRATEGIA_TREND_DETECTIVE.md)
- [NASA Data Resources](../knowledge_data/nasa_final_resources.md)
- [NASA POWER API Specification](../knowledge_data/NASA_POWER_API_SPECS.md)
- [Maps Context](../knowledge_maps/prod1_context.md)
- [Statistical Contract](../knowledge_base_estatistica/06_GUIA_OPERACIONAL_PARA_AGENTES_DE_IA_NO_HACKATHON.md)
