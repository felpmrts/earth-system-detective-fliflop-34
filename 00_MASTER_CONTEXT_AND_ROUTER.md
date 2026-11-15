# 00. Master Context & Knowledge Router — NASA Space Apps 2026 (*Be An Earth System Trend Detective!*)

## GIT AUTO-SYNC PROTOCOL

> **PERMANENT AND MANDATORY AUTONOMY RULE FOR AI AGENTS:**
> - **Trigger:** Whenever starting a new session, or when the user asks to *"sync"*, *"next step"*, or *"update context"*.
> - **Step 1 — Git Sync:** Check `git status`; if there are no pending local changes, run `git fetch --all`, inspect recent commits on active branches (`mapa`, `frontend`, `data`, `main`/`develop`), and update the active branch (`git pull`) before proposing or editing code.
> - **Step 2 — Diff Diagnosis:** Inspect the latest commits (`git log -n 5 --stat` on the active branch and comparisons against `origin/frontend` and `origin/data`) to identify recent changes from other tracks (`PROD-2` and `DADOS`) and avoid merge conflicts or rework.

> **SYSTEM INSTRUCTION FOR AI AGENTS (PROGRESSIVE DISCLOSURE PROTOCOL):**
> This file (`00_MASTER_CONTEXT_AND_ROUTER.md`) is the **Single Source of Truth** for the entire project.
> **DO NOT read every file in the repository at once.** To save tokens, preserve attention, and avoid *context rot*, strictly follow this protocol:
> 1. Absorb the **Ultra-Dense Project Context** in Sections 1, 2, and 3 below (this already contains 80% of global decisions).
> 2. Consult the **Decision Tree ("Which Question Do You Need to Answer?")** in Section 4 or the **Complete Catalog of Markdown Documents** in Section 5.
> 3. Open **only** the files (or line ranges `#L...`) needed for your current subtask.
> 4. **Continuous Index Maintenance (Mandatory Rule):** Whenever you make any relevant change (new scripts, endpoints, data/statistics rules, or new `.md` documents), **immediately update the essentials** in the corresponding domain index (`context/knowledge_data/00_INDICE_E_ARQUITETURA_DADOS.md`, `context/knowledge_base_estatistica/00_INDICE_E_ARQUITETURA_ESTATISTICA.md`, etc.) and in Sections 4, 5, and 6 of this file.
> 5. **Context Folder Structure:** Only this file (`00_MASTER_CONTEXT_AND_ROUTER.md`) lives at the root. All domain-specific context files are organized in subfolders inside `context/` (`context/general_strategy/`, `context/knowledge_base_estatistica/`, `context/knowledge_data/`, `context/knowledge_maps/`).

---

## 1. Ultra-Dense Context of the Challenge and Product (What We Are Building)

- **Event & Real Window:** NASA International Space Apps Challenge 2026 | Saturday 09:00 $\to$ Sunday 24:00 (**39 consecutive hours / ~30 productive hours per person** after subtracting 6h mandatory sleep and breaks).
- **Selected Challenge:** **Be An Earth System Trend Detective!** (Listed as Challenge #14 on the official portal / section #2 of the preliminary dossier).
- **The Core Scientific Problem:** Earth's environmental variables (atmosphere, land, ocean, ice) measured by NASA satellites and models change over decades. However, **the same global physical process can produce an upward trend in one region and a downward trend in another** (spatial divergence), or **rise over the long term while oscillating out of phase in the short term** (multiscale paradox).
- **The Deliverable (Definition of Done):** A fast, interactive web application built on a **curated catalog of 4 to 6 precomputed NASA variables** (never heavy live computation during the demo!), where the user picks a variable and clicks any region/point (or compares 2 regions side by side) and immediately receives — without needing to read documentation — the **4 Detective Answers**:
  1. **WHAT is changing?** (Physical variable, raw series vs. climatological anomaly without seasonality, and regime shape: linear, accelerating, or decelerating).
  2. **WHERE is it changing?** (Interactive spatial map highlighting regional divergences *"rises here, falls there"* and side-by-side comparison of two regions).
  3. **HOW MUCH is it changing?** (Rate of change per decade extracted over the **entire point cloud**, never just end point minus start point).
  4. **Is the change STATISTICALLY SIGNIFICANT?** (Rigorous separation between true secular trend and natural noise/cycles like El Niño, corrected for climate memory and spatial false positives).
- **Repository & Git Flow (4 Branches):** `https://github.com/felpmrts/earth-system-detective-fliflop-34` has 4 branches: `main` (stable release/production), `develop` (central integration), `frontend` (UI/Map/Charts development), and `data` (NASA POWER ingestion and statistical engine). **Rule for AIs:** never commit directly to `main`; work on the respective track branch (`frontend` or `data`) or on `develop` for documentation/integration.
- **MVP Scope Note (Variables per Area):** The **MVP starts with 1 variable per area (`variable_x` / `variable_y`)**, allowing users to compare two areas with the same variable or correlate two distinct variables on the analysis bench. Future expansion supports multiple simultaneous variables per area grouped into environmental families.

---

## 2. 6-Person Team Governance, Parallel Tracks, and Hard Gates

The team operates in **4 parallel tracks decoupled by a JSON Data Contract** frozen at **10:30 Saturday** (so Frontend can build the UI with *mock data* while Data processes NASA satellites):

| Role | Code | Primary Responsibility | Backup Pair (Anti-SPOF) |
| :--- | :---: | :--- | :---: |
| **Coordination & Deploy** | `COORD` | Continuous integration, gate control, active deploy, submission | `NARR` |
| **Data Engineering** | `DADOS-1` | NASA ingestion, cleaning, conversion to JSON Data Contract | `DADOS-2` |
| **Statistics & Science** | `DADOS-2` | Anomalies, robust/GAM regression, significance tests, physical sanity | `DADOS-1` |
| **Maps & Geo Visualization** | `PROD-1` | Interactive trend map, significance layer, performance, offline mode | `PROD-2` |
| **Interface & UX** | `PROD-2` | Time-series charts, 4-answers panel, 2-region comparator | `PROD-1` |
| **Narrative, Research & Video** | `NARR` | Plain-language scientific context, real findings hunt, video script & editing | `COORD` |

- **The 5 Non-Negotiable Gates (*If a gate fails, cut scope; the deadline never moves*):**
  - **Milestone 0 (Sat 10:30):** JSON Data Contract frozen between `DADOS-1`, `DADOS-2`, and `PROD-1`.
  - **Gate 1 (Sat 12:30):** At least **1 real NASA variable** processed and formatted to the contract (otherwise activate Data Plan B).
  - **Gate 2 (Sat 16:00):** **Walking Skeleton** (end-to-end flow with 1 real variable live in a published browser).
  - **Discovery Checkpoint (Sat 22:30 – 00:30):** Internal demo + investigation with the tool to find 2–3 validated real climate stories. *(Mandatory sleep: 01:00–07:00)*.
  - **Gate 3 (Sun 13:00):** **Feature Freeze** (code freeze + 100% offline bundle ready; bug fixes only from here on).
  - **Gate 4 (Sun 19:00):** Pitch video exported, subtitled, and cold-reviewed.
  - **Gate 5 (Sun 22:30):** Official submission sent and verified by blind tests on 4G/mobile phones (90 min buffer before 24:00).

---

## 3. The 7 State-of-the-Art Statistical Invariants (Inviolable Rules for Code and Pitch)

Extracted from Hindemburg Melão Jr.'s theoretical base and integrated into modern climatology. **No AI agent may violate these rules:**

1. **FORBIDDEN to compute trends via End Point minus Start Point ($Y_{\text{end}} - Y_{\text{start}}$):** Discarding the intermediate trajectory is a gross elementary error that confuses El Niño/La Niña phase with secular trend. Every rate ("How much is it changing?") **must** come from regression fitted to the entirety of the $N$ cloud points: $B_{\text{OLS}}$ and **Theil–Sen Robust Median Slope ($B_{\text{Sen}}$)** expressed per decade ($10 \times B_{\text{year}}$).
2. **Isolation of Confounders Before Regression (Henrietta Leavitt Principle):** Just as Leavitt isolated stellar distance by observing Cepheids only in the Magellanic Cloud, regressing raw monthly series contaminated by the summer/winter cycle is forbidden. First extract the **Monthly Climatological Anomaly** ($Y'_{y,m} = Y_{y,m} - \bar{Y}_m$), enforce the same time window $[t_0, t_f]$ when comparing regions, and audit sensor transitions (MODIS/VIIRS, GRACE/GRACE-FO).
3. **Absolute Respect for Variable Scale (Ratio vs. Interval):** Displaying percentage change ($\%$) for **interval-scale** variables (without a true absolute zero, such as Temperature in $^\circ\text{C}$ or GRACE Water Anomalies in $\text{cm}$) is **forbidden**. On interval scales, display only differences ($\pm X\,^\circ\text{C/decade}$). Percentages are permitted only on pure ratio scales (e.g., ice area in $\text{km}^2$, absolute precipitation in $\text{mm}$).
4. **Distinction Between Slope ($B$) and Coupling/Correlation ($r$ / $\tau$):** Regression ($B$) tells *how much* $Y$ varies with $X$; correlation (Pearson $r$, Kendall $\tau$) tells *how narrow the contour ellipse is* (how predictable and noise-free the variation is). Display both!
5. **Multiscale Correlation Decomposition (Global vs. Local):** When comparing 2 regions or 2 variables, measure both the **long-term secular correlation ($r_{\text{global}}$)** and the **short-term detrended residual correlation ($r_{\text{detrended}}$)**. Two regions can rise together over 25 years ($r_{\text{global}} > 0$) while operating in systematic opposition over 6–24 month windows ($r_{\text{detrended}} < 0$).
6. **Nonlinear Modeling with GAM/Splines and "Hump" Diagnostics:** Never use unconstrained high-degree polynomials (which create spurious physical inversions at the endpoints). Combine the trend line with a smooth curve (**GAM / Smoothing Spline**) to reveal physical acceleration/saturation, and use curve geometry to separate satellite artifacts (*global step*), El Niño pulses (*reversible hump*), and true regime shifts (*persistent ramp*).
7. **Outliers via Mahalanobis Ellipse + Spatial Significance ($\text{AR}(1)$ + FDR):** Identify extreme years outside the bivariate ellipse via **Mahalanobis Distance ($D_M > 2.5$)** without silently deleting them. To answer *"Is it significant?"*, correct the $p\text{-value}$ for **$\text{AR}(1)$ serial autocorrelation** (Santer / Hamed-Rao $N_{\text{effective}}$) and apply **Benjamini–Hochberg (FDR, $q < 0.05$)** across the map grid to eliminate mass spatial false positives.

---

## 4. Smart Router for AIs: "Which Question Do You Need to Answer Right Now?"

Use the table below to jump directly to the exact document (and section) without reading unnecessary files:

| If your current task or question is... | Read ONLY this/these file(s) / lines |
| :--- | :--- |
| **"I need to create or validate the JSON schema of the Data Contract (Phase 1) or implement the backend/frontend for the 4 answers"** | 👉 [`context/knowledge_base_estatistica/06_GUIA_OPERACIONAL_PARA_AGENTES_DE_IA_NO_HACKATHON.md`](context/knowledge_base_estatistica/06_GUIA_OPERACIONAL_PARA_AGENTES_DE_IA_NO_HACKATHON.md#L1-L115) *(Contains the full ready-to-use JSON and the 4-question mapping)* |
| **"I need to know the team schedule, who does what in each phase, branch rules, or how to act if a gate slips"** | 👉 [`context/general_strategy/ESTRATEGIA_TREND_DETECTIVE.md`](context/general_strategy/ESTRATEGIA_TREND_DETECTIVE.md#L50-L518) *(Sections 3, 4, 5, and 7)* |
| **"I need to program linear trend calculation ($B$), centered intercept ($A_0$), and understand why not to use end-minus-start"** | 👉 [`context/knowledge_base_estatistica/01_FUNDAMENTOS_E_ERROS_CLASSICOS_DE_REGRESSAO.md`](context/knowledge_base_estatistica/01_FUNDAMENTOS_E_ERROS_CLASSICOS_DE_REGRESSAO.md#L25-L128) |
| **"I need to preprocess a NASA variable, remove seasonality (anomalies), handle scales ($^\circ\text{C}$ vs $\text{mm}$), or harmonize satellites"** | 👉 [`context/knowledge_base_estatistica/02_ESCALAS_CONTROLE_DE_VARIAVEIS_E_ANOMALIAS.md`](context/knowledge_base_estatistica/02_ESCALAS_CONTROLE_DE_VARIAVEIS_E_ANOMALIAS.md#L33-L125) *(Includes per-variable decision table in Section 4)* |
| **"I need to implement the 2-Region Side-by-Side Comparator, spatial divergence, or long- vs. short-term correlation"** | 👉 [`context/knowledge_base_estatistica/03_CORRELACAO_MULTIESCALA_E_DIVERGENCIA_ESPACIAL.md`](context/knowledge_base_estatistica/03_CORRELACAO_MULTIESCALA_E_DIVERGENCIA_ESPACIAL.md#L32-L129) |
| **"The time series is nonlinear (accelerating, saturating, or has a strange 'hump'): how to fit GAM/Spline and diagnose?"** | 👉 [`context/knowledge_base_estatistica/04_MODELAGEM_NAO_LINEAR_GAMS_E_CONSTRICOES_FISICAS.md`](context/knowledge_base_estatistica/04_MODELAGEM_NAO_LINEAR_GAMS_E_CONSTRICOES_FISICAS.md#L40-L128) |
| **"I need to program the significance test ($p\text{-value}$ with $\text{AR}(1)$ + map FDR), Theil-Sen, or detect outliers with Mahalanobis"** | 👉 [`context/knowledge_base_estatistica/05_OUTLIERS_ROBUSTEZ_E_SIGNIFICANCIA_ESPACIAL.md`](context/knowledge_base_estatistica/05_OUTLIERS_ROBUSTEZ_E_SIGNIFICANCIA_ESPACIAL.md#L19-L115) |
| **"I need to structure the Pitch Video script, audit whether a climate finding is real, or defend our rigor to judges"** | 👉 [`context/knowledge_base_estatistica/06_GUIA_OPERACIONAL_PARA_AGENTES_DE_IA_NO_HACKATHON.md`](context/knowledge_base_estatistica/06_GUIA_OPERACIONAL_PARA_AGENTES_DE_IA_NO_HACKATHON.md#L102-L130) + [`context/general_strategy/ESTRATEGIA_TREND_DETECTIVE.md`](context/general_strategy/ESTRATEGIA_TREND_DETECTIVE.md#L303-L382) |
| **"I want an overview of the 14 NASA Space Apps 2026 challenges and the four 25% judging criteria"** | 👉 [`context/general_strategy/RELATORIO_ESTRATEGICO_SPACEAPPS_2026.md`](context/general_strategy/RELATORIO_ESTRATEGICO_SPACEAPPS_2026.md#L39-L110) |
| **"I need to consult Data Sources, APIs (NASA POWER, AppEEARS, GloFAS, NOAA), Ingestion Rules (`-999`, `YYYY13`, `mm/day`, `/point` vs `/regional`), or the 7 Environmental Families Catalog"** | 👉 [`context/knowledge_data/00_INDICE_E_ARQUITETURA_DADOS.md`](context/knowledge_data/00_INDICE_E_ARQUITETURA_DADOS.md#L1-L92) *(Central index for `context/knowledge_data/` with line-range router for APIs, variables, and ingestion rules)* |
| **"I need to configure credentials (`data/.env`), use or evolve the Modular Data Backend in `data/` (7 Families / 42 vars catalog, frontend contract `POST /api/analyze`, `1 → N` variables flow, and cache)"** | 👉 [`data/README.md`](data/README.md) + [`data/.env.example`](data/.env.example) + [`CONTRATO_DE_DADOS.md`](CONTRATO_DE_DADOS.md) + [`data/api/server.py`](data/api/server.py) |
| **"I need to modify or audit statistical/mathematical calculations without breaking the architecture"** | 👉 [`backend/stats_engine.py`](backend/stats_engine.py) *(single module for mathematical/statistical models; `data/api/server.py` does HTTP routing only and `data/services/comparison_service.py` delegates completely to `stats_engine.py`)* |
| **"I need to integrate, audit, or maintain the Statistical Co-Pilot Chatbot architecture and prompt (`POST /api/copilot`)"** | 👉 [`context/knowledge_base_estatistica/07_ARQUITETURA_E_PROMPT_COPILOTO.md`](context/knowledge_base_estatistica/07_ARQUITETURA_E_PROMPT_COPILOTO.md) + [`backend/copilot_engine.py`](backend/copilot_engine.py) *(Hybrid LLM + deterministic fallback architecture, PT/EN System Prompts with 7 Invariants, and `POST /api/copilot` contract)* |
| **"I need to work on the interactive map, precomputed global grids, 3×3 block, hotspots, offline bundle, or E2E/CI"** | 👉 [`frontend/src/map/MapWorkspace.tsx`](frontend/src/map/MapWorkspace.tsx) + [`frontend/src/geo/gridGeometry.ts`](frontend/src/geo/gridGeometry.ts) + [`frontend/src/map/mapStyles.ts`](frontend/src/map/mapStyles.ts) + [`frontend/e2e/trendDetective.spec.ts`](frontend/e2e/trendDetective.spec.ts) + [`.github/workflows/ci.yml`](.github/workflows/ci.yml) |

---

## 5. Complete Catalog of All Markdown (`.md`) Documents in the Project

- [Frontend Documentation](frontend/README.md) — setup, architecture, catalog, and integration.

Below are the project's Markdown documents, organized by functional module, with approximate size and surgical content summary:

### 🏛️ Layer 0: Central Router (Root) and Public Documentation
1. **[`00_MASTER_CONTEXT_AND_ROUTER.md`](00_MASTER_CONTEXT_AND_ROUTER.md)** *(This document)*
   - **Role:** Single entry point for AIs and humans. Contains the dense executive summary, the 7 statistical invariants, the selective-reading decision tree, and the live inventory of all `.md` files.
2. **[`README.md`](README.md)** *(v1 — Root public documentation)*
   - **Role:** Public repository gateway with overview, layered architecture, variable catalog, local execution, test suite (Vitest + Playwright E2E), and offline bundle.
3. **[`DATA_SOURCES.md`](DATA_SOURCES.md)** *(v1 — Official source inventory)*
   - **Role:** Initial catalog of official sources (NASA POWER / MERRA-2 / CERES_SYN1deg, AppEEARS, Open-Meteo, NOAA CDO, CMR/Earthdata), homologated grids, resolutions, ocean mask policies, and known limitations.

### 🧭 Layer 1: General Strategy, Governance, and NASA Context (`context/general_strategy/`)
2. **[`context/general_strategy/ESTRATEGIA_TREND_DETECTIVE.md`](context/general_strategy/ESTRATEGIA_TREND_DETECTIVE.md)** *(542 lines | ~41 KB)*
   - **Summary:** Operational master plan for the 39 hours of the *"Be An Earth System Trend Detective!"* challenge. Defines acceptance criteria for the 4 questions, 6-person team split (`COORD`, `DADOS-1`, `DADOS-2`, `PROD-1`, `PROD-2`, `NARR`), parallel development via Data Contract, detailed 8-Phase + 5-Gate schedule, MoSCoW scope, 15-risk matrix, and submission checklist.
3. **[`context/general_strategy/RELATORIO_ESTRATEGICO_SPACEAPPS_2026.md`](context/general_strategy/RELATORIO_ESTRATEGICO_SPACEAPPS_2026.md)** *(299 lines | ~29 KB)*
   - **Summary:** Preliminary dossier of the 14 NASA Space Apps 2026 challenges, judging methodology (Galactic Impact, Use of NASA Data, MVP Prototype, Pitch), and preliminary analysis of satellites (MODIS, AIRS, OMI, GRACE/GRACE-FO, Giovanni) and tools (Xarray, NetCDF4, Deck.gl/Leaflet) for *Trend Detective* (listed in section #2 of the report, lines 97–109).
4. **[`context/general_strategy/STACK_FRONTEND.md`](context/general_strategy/STACK_FRONTEND.md)** *(~4 KB)*
   - **Summary:** Frontend tech stack decision and specification (`React + TypeScript + Vite` deployed on Vercel, `Leaflet (Canvas)` for 2D global grid rendering, typed client for the JSON contract, and IndexedDB for offline caching).

### 📐 Layer 2: State-of-the-Art Statistical Knowledge Base (`context/knowledge_base_estatistica/`)
5. **[`context/knowledge_base_estatistica/00_INDICE_E_ARQUITETURA_ESTATISTICA.md`](context/knowledge_base_estatistica/00_INDICE_E_ARQUITETURA_ESTATISTICA.md)** *(~8 KB)*
   - **Summary:** Specific index for the statistics folder and transformation diagram linking concepts extracted from Hindemburg Melão Jr. to the 4 NASA challenge questions.
6. **[`context/knowledge_base_estatistica/01_FUNDAMENTOS_E_ERROS_CLASSICOS_DE_REGRESSAO.md`](context/knowledge_base_estatistica/01_FUNDAMENTOS_E_ERROS_CLASSICOS_DE_REGRESSAO.md)** *(~12 KB)*
   - **Summary:** Regression as a rule-of-three across the entire point cloud; why computing change via $Y_{\text{final}} - Y_{\text{initial}}$ is a catastrophic elementary error; anatomy of $\hat{Y} = A + BX$ (decadal trend, centering the intercept $A_0$ to avoid the "false zero"); comparison between Ordinary Least Squares (OLS) and robust median/absolute-deviation fitting (Theil–Sen); visual best practices for scatter plots and time series.
7. **[`context/knowledge_base_estatistica/02_ESCALAS_CONTROLE_DE_VARIAVEIS_E_ANOMALIAS.md`](context/knowledge_base_estatistica/02_ESCALAS_CONTROLE_DE_VARIAVEIS_E_ANOMALIAS.md)** *(~15 KB)*
   - **Summary:** The **Henrietta Leavitt Principle** (controlling distance via Cepheids in the Magellanic Cloud) translated to isolate the 3 confounders in NASA data: annual seasonality (climatological anomalies and $Z\text{-score}$), sensor discontinuities (MODIS/VIIRS, GRACE), and time windows. Difference between ratio vs. interval scales (prohibition of $\%$ on $^\circ\text{C}$ and anomalies), baseline *offset*, and logarithmic/inverted scales.
8. **[`context/knowledge_base_estatistica/03_CORRELACAO_MULTIESCALA_E_DIVERGENCIA_ESPACIAL.md`](context/knowledge_base_estatistica/03_CORRELACAO_MULTIESCALA_E_DIVERGENCIA_ESPACIAL.md)** *(~14 KB)*
   - **Summary:** Geometric and operational difference between Correlation ($r$, ellipse width and predictability) and Regression ($B$, physical rate). The **Multiscale Correlation Paradox** (how two series can have positive correlation over 25 years and systematically negative short-term correlation due to dipoles like El Niño). Taxonomy of correlations (Pearson, Spearman, Kendall $\tau$, Tukey Biweight), composite variables/*proxies*, and preventing contaminated correlations (circularity).
9. **[`context/knowledge_base_estatistica/04_MODELAGEM_NAO_LINEAR_GAMS_E_CONSTRICOES_FISICAS.md`](context/knowledge_base_estatistica/04_MODELAGEM_NAO_LINEAR_GAMS_E_CONSTRICOES_FISICAS.md)** *(~13 KB)*
   - **Summary:** Physical dissipation and saturation (microwave mug experiment); danger of unconstrained polynomials; use of **GAMs (Generalized Additive Models)**, penalized *Splines*, and monotonically constrained regression; distinguishing logistic vs. GAM via derivatives $f'(x), f''(x)$; forensic decision tree to diagnose "humps" (local anomalies), separating sensor error, El Niño pulse, and structural regime shift.
10. **[`context/knowledge_base_estatistica/05_OUTLIERS_ROBUSTEZ_E_SIGNIFICANCIA_ESPACIAL.md`](context/knowledge_base_estatistica/05_OUTLIERS_ROBUSTEZ_E_SIGNIFICANCIA_ESPACIAL.md)** *(~13 KB)*
    - **Summary:** Bivariate *outlier* detection via **Mahalanobis Ellipse and Distance ($D_M$)**; warning on heavy-tailed distributions vs. Gaussian Normal; dual OLS + Theil–Sen validation; state-of-the-art statistical significance with **$\text{AR}(1)$ serial autocorrelation** correction (Santer / Hamed-Rao $N_{\text{effective}}$) and mass spatial false-positive control on the map via **Benjamini–Hochberg FDR ($q < 0.05$)**.
11. **[`context/knowledge_base_estatistica/06_GUIA_OPERACIONAL_PARA_AGENTES_DE_IA_NO_HACKATHON.md`](context/knowledge_base_estatistica/06_GUIA_OPERACIONAL_PARA_AGENTES_DE_IA_NO_HACKATHON.md)** *(~11 KB)*
    - **Summary:** Direct executable manual for the hackathon. Contains the mathematical matrix of the 4 questions, the **complete JSON schema of the Data Contract** (supporting dual regression, GAM, Mahalanobis, $\text{AR}(1)$ + FDR, and 2-region multiscale comparator), the 10-point findings audit checklist, and the 20-second scientific rigor pitch.
12. **[`context/knowledge_base_estatistica/07_ARQUITETURA_E_PROMPT_COPILOTO.md`](context/knowledge_base_estatistica/07_ARQUITETURA_E_PROMPT_COPILOTO.md)**
    - **Summary:** Architectural and prompt-engineering specification for task `F4 · P0 · MUST` (**Statistical Co-Pilot Chatbot**). Documents the hybrid architecture (`fast LLM + deterministic heuristic fallback`), official System Prompts (PT/EN) locked to the 7 Statistical Invariants, sanitization rules against `%` on interval scales, and HTTP contract `POST /api/copilot`.

### 🛰️ Layer 3: Data Engineering and NASA APIs (`context/knowledge_data/` and `data/`)
12. **[`context/knowledge_data/00_INDICE_E_ARQUITETURA_DADOS.md`](context/knowledge_data/00_INDICE_E_ARQUITETURA_DADOS.md)** *(~15 KB)*
    - **Summary:** Central index and selective-reading router for the data layer. Maps by topic and line range all NASA POWER API specs, data source matrix, ingestion/cleaning pipeline, the 7 Environmental Families, and inviolable data engineering rules (`DADOS-1`).
13. **[`context/knowledge_data/NASA_POWER_API_SPECS.md`](context/knowledge_data/NASA_POWER_API_SPECS.md)** *(~5 KB)*
    - **Summary:** Technical specs validated by `DADOS-1`: ocean mask (`-999` $\to$ `np.nan` + `nanmean`), exclusion of `YYYY13`, `PRECTOTCORR` conversion (`mm/day` $\to$ `mm/month`), `/point` vs. `/regional` limits (`2°×2°` to `10°×10°`), *rate limit* (`30 req/min`, `Semaphore(3)`), free composition of adjacent cells ($1\times 3$, $2\times 1$), and Parquet vs. JSON evaluation.
14. **[`context/knowledge_data/nasa_final_resources.md`](context/knowledge_data/nasa_final_resources.md)** *(~6 KB)*
    - **Summary:** Source matrix (NASA POWER, AppEEARS, Open-Meteo GloFAS, NOAA CDO, Giovanni), biome-guided discovery layer, and backend statistical pipeline.
15. **[`context/knowledge_data/environmental_family.md`](context/knowledge_data/environmental_family.md)** *(~11 KB)*
    - **Summary:** Complete catalog of the 7 Environmental Families (39 UI entries / 42 parameter codes) with API/source, operating mode (`Real-Time`, `Queue / Cache`, `Validation / Demo`), physical unit, and user explanations.
16. **[`data/README.md`](data/README.md)** *(modular architecture in `data/`)* + **`data/{catalog,models,cache,connectors,services,api}/`** + **[`data/.env.example`](data/.env.example)** + **[`data/api/server.py`](data/api/server.py)**
    - **Summary:** Modular implementation driven by the 7 Environmental Families catalog (42 codes in [`environmental_catalog.py`](data/catalog/environmental_catalog.py)), `LocationQuery` contracts compatible with `1 variable` (MVP) and `N variables` ([`ingestion_service.py`](data/services/ingestion_service.py)), 10-year chunk loop on NOAA CDO ([`noaa_cdo.py`](data/connectors/noaa_cdo.py)), disk cache (`data/cache/storage/`), comparison service in [`comparison_service.py`](data/services/comparison_service.py) (delegating statistical calculations to [`backend/stats_engine.py`](backend/stats_engine.py)), and pure REST server (`/api/health`, `/api/catalog`, `/api/analyze`, `/api/location/fetch`, `/api/compare`) in [`data/api/server.py`](data/api/server.py).
17. **[`context/knowledge_data/NASA_RESOURCES.md`](context/knowledge_data/NASA_RESOURCES.md)** *(~24 KB)*
    - **Summary:** Complete survey of the 13 official resources from the challenge's *Resources* tab, file formats, and volume estimates.

### 🗺️ Layer 4: Maps and Geospatial Visualization (`context/knowledge_maps/`)
18. **[`context/knowledge_maps/prod1_context.md`](context/knowledge_maps/prod1_context.md)**
    - **Summary:** Technical context for the 2D Maps track (`PROD-1`).
19. **[`context/knowledge_maps/MAPA_BLOCO3X3_E_HOTSPOTS_DEMO.md`](context/knowledge_maps/MAPA_BLOCO3X3_E_HOTSPOTS_DEMO.md)**
    - **Summary:** Technical guide for map demo enhancements (`buildCellBlock3x3`, `Alt + Click`/toggle `"3×3 Block"`, `findGlobalTrendHotspots`, and `Extreme +` / `Extreme −` navigation with zoom `7` + focal ring).
20. **[`context/knowledge_maps/TUTORIAL_INTERATIVO_HUD.md`](context/knowledge_maps/TUTORIAL_INTERATIVO_HUD.md)**
    - **Summary:** Technical documentation for the 8-step interactive walkthrough (`tutorialState.ts`, `tutorialSteps.ts`, `TutorialOverlay.tsx`), SVG `fillRule="evenodd"` cutout, strict per-step focus and editing, anti-overlap `computeCardLayout` algorithm, Bench anchoring at step `8/8`, new-analysis trigger `7/8 -> 8/8` (`prevAnalysisForTutorialRef`), and Vitest + Playwright coverage.

---

## 6. Slot for New Markdown Documents (Continuous Updates Before and During the Hackathon)

- [Frontend Documentation](frontend/README.md) — setup, architecture, catalog, and integration.

> **Maintenance Rule for AI Agents:** Whenever you make any essential change (new `.md` documents, scripts, endpoints, ingestion rules, or architectural decisions), immediately update the corresponding folder index and the registry below (as well as Sections 4 and 5 when applicable):

| Status | Planned / Created Path | Document Role | Owner |
| :---: | :--- | :--- | :--- |
| ✅ *Created* | `context/general_strategy/STACK_FRONTEND.md` | Architecture decision and frontend tech stack (React + TypeScript + Vite, Leaflet Canvas, data client, and IndexedDB). | `PROD-1` + `PROD-2` |
| ✅ *Created* | `context/knowledge_data/00_INDICE_E_ARQUITETURA_DADOS.md` | Central index and selective-reading router for `context/knowledge_data/`. | `DADOS-1` |
| ✅ *Created* | `context/knowledge_data/NASA_POWER_API_SPECS.md` | Validated technical rules for NASA POWER API (`-999`, `YYYY13`, `mm/day`, `/point` vs `/regional`, `Semaphore(3)`, Parquet vs JSON). | `DADOS-1` |
| ✅ *Created* | `context/knowledge_data/nasa_final_resources.md` | Data source architecture and backend ingestion pipeline. | `DADOS-1` |
| ✅ *Created* | `context/knowledge_data/environmental_family.md` | Catalog of the 7 Environmental Families (API codes, modes, units, and UI descriptions). | `DADOS-1` + `PROD-2` |
| ✅ *Created* | `data/README.md` + `data/.env.example` + subpackages `data/{catalog,models,cache,connectors,services,api}/` | Modular data backend architecture (7 Families / 42 variables, credentials in `data/.env`, 10-year NOAA CDO loop + `GHCND -> monthly` fallback, CMR `granules.json`, JSON cache, `1 → N` variable comparison, pure REST routing in `data/api/server.py` `/api/analyze` + `/api/compare`, and orchestration in `comparison_service.py` delegating calculations to `backend/stats_engine.py`). | `DADOS-1`, `DADOS-2`, `STAT-1`, `PROD-1` |
| ✅ *Created* | `context/knowledge_data/NASA_RESOURCES.md` | Catalog of official NASA resources for the challenge. | `DADOS-1` |
| ✅ *Created* | `context/knowledge_maps/prod1_context.md` | Specification and context for the 2D Map track. | `PROD-1` |
| ✅ *Created* | `context/knowledge_maps/CONTRATO_FRONTEND_PROD1.md` | Map/UI architecture specification, 8-neighbor connectivity, and `PROD-1` integration. | `PROD-1` |
| ✅ *Created* | `CONTRATO_DE_DADOS.md` | Frozen JSON specification (`RegionAnalysisRequest -> RegionAnalysisResponse`) between Backend (`DADOS-1/2`) and Frontend (`PROD-1/2`). | `DADOS-1` + `PROD-1` |
| ✅ *Integrated (Phase 2)* | `backend/stats_engine.py` + `data/services/comparison_service.py` + `backend/test_stats_engine.py` | State-of-the-art statistical engine (`DADOS-2`: GCV Spline/LOWESS, `MinCovDet` Mahalanobis, Santer `AR(1)` + Hamed-Rao + BH FDR, `z_scores`, `sen_fit`, multiscale paradox) integrated in `comparison_service.py` for all 42 catalog variables and validated by unit tests + `mock_analysis.json`. | `DADOS-2`, `DADOS-1` |
| ✅ *Integrated (Phase 2)* | `frontend/src/App.tsx`, `frontend/src/bench.css`, `frontend/src/story/*`, `frontend/src/contracts/{types,contractValidator}.ts` | 3D narrative covers + guided tour + interactive Scientific Bench: 3 NARR Classic Cases (1 click), free exploration on the interactive map, Triple Normalization (Anomaly / Raw / Z-Score $\sigma$), Linear vs. Symlog scale, X vs. Y scatter with Mahalanobis ellipse ($D_M=2.5$), independent layers (OLS, Theil-Sen, GAM, Outliers), Statistical Co-Pilot, and **4 Detective Answers** drawer. | `PROD-2`, `DADOS-2`, `NARR` |
| ✅ *Created* | `context/knowledge_base_estatistica/07_ARQUITETURA_E_PROMPT_COPILOTO.md` | Hybrid architecture (`fast LLM + deterministic heuristic fallback`), official System Prompts (PT/EN) with 7 Statistical Invariants, and `POST /api/copilot` contract (`F4 · P0 · MUST`). | `DADOS-2` |
| ✅ *Created* | `backend/copilot_engine.py`, `backend/copilot_tools.py`, `backend/test_copilot_*.py` & route `POST /api/copilot` (`data/api/server.py`) | Statistical Co-Pilot Chatbot engine with 6 deterministic tools, compact serialization, `analysis_key` cache, interval-scale sanitization (Invariant #3), PT/EN deterministic synthesis, Gemini and OpenRouter (`deepseek/deepseek-chat`) support, and unit test suite. | `DADOS-2` |
| ✅ *Created* | `backend/discovery_engine.py`, `backend/test_discovery_engine.py`, `backend/requirements.txt` & route `POST /api/discover` | Real-time discovery engine (CUSUM Mode B, regime breaks, and teleconnections) exposed via `POST /api/discover`, with Python dependencies (`numpy`, `scipy`, `scikit-learn`) declared in `backend/requirements.txt`. | `DADOS-2` |
| ✅ *Created* | `DECISOES.md` | Chronological log of scope and architecture decisions (includes `PROD-1` records for `A=B` *re-snap* and `validate:grids` homologation). | `COORD` + `PROD-1` |
| ✅ *Created* | `data/README_TESTE_APIS.md` | Matrix of the 5 APIs, credential instructions (`data/.env`), and executable prototype of the `Location A (1 variable) vs. Location B (1 variable)` flow. | `DADOS-1` |
| ✅ *Created* | `frontend/UX_UI_ROADMAP.md` | Roadmap for UX/UI improvements, accessibility, and Map → Bench flow continuity. | `PROD-1` + `PROD-2` |
| ✅ *Created* | `context/general_strategy/DESCOBERTA_CIENTIFICA_ML_DEEP_RESEARCH.md` | Synthesis of Deep Research (`Tendências Globais do Sistema Terrestre.md`), 2 scientific hypotheses, `backend/ml_discovery.py` pipeline architecture, and empirical results (`2001–2025`) in `backend/ml_discovery_results.json`. | `NARR` |
| ✅ *Created (v1)* | `DATA_SOURCES.md` | Official citation of NASA datasets, grids/resolutions, period, masks, and known limitations (initial v1 version). | `DADOS-1` + `NARR` |
| ✅ *Created (v1)* | `README.md` | Root public repository documentation (architecture, local execution, unit/E2E tests, and offline bundle — initial v1 version). | `COORD` + `NARR` |
| ✅ *Created* | `.github/workflows/ci.yml` + `frontend/playwright.config.ts` + `frontend/e2e/trendDetective.spec.ts` | GitHub Actions CI pipeline (`backend-tests` + `frontend-e2e`) and Playwright E2E suite against `vite preview` (`A=B` flow, Leaflet Canvas, drag up to 25 cells, 100% offline + CSV/JSON export, desktop `1366×768` and mobile `375×812`). | `PROD-1` + `COORD` |
| ✅ *Integrated (Map & Offline)* | `frontend/public/data/*_grid.json` (12 grids, 144 pts), `frontend/scripts/{registerTs.mjs,validateGlobalGrids.ts,verifyOfflineBundle.ts}` and `frontend/src/{map/MapWorkspace.tsx,map/mapStyles.ts,map/legendConfig.ts,geo/gridGeometry.ts}` | 12 homologated global grids required in `verify:offline`, Node TS loader via `registerTs.mjs`, decadal calibration of all 43 variables (`MAGNITUDE_REFERENCE_BY_VAR`), statistical legend with proxy and FDR (`q < 0.05 only`), direct marker click with DOM tooltip, 3×3 block selection (`buildCellBlock3x3` via `Alt + Click` / `"3×3 Block"` toggle), and hotspots (`Extreme +` / `Extreme −` prioritizing `q < 0.05` with `map.flyTo` zoom `7` + visual target). | `PROD-1` |
| ✅ *Created* | `context/knowledge_maps/MAPA_BLOCO3X3_E_HOTSPOTS_DEMO.md` | Technical documentation for 3×3 block selection (`buildCellBlock3x3`), drag exclusivity, heterogeneous `A=B` mirroring, and `Extreme +` / `Extreme −` shortcuts (`findGlobalTrendHotspots`). | `PROD-1` |
| ✅ *Integrated (2D Onboarding)* | `frontend/src/tutorial/{TutorialOverlay.tsx,tutorialSteps.ts}`, `frontend/src/services/tutorialState.ts`, `frontend/src/__tests__/tutorialWalkthrough.test.tsx`, `frontend/e2e/trendDetective.spec.ts` and `context/knowledge_maps/TUTORIAL_INTERATIVO_HUD.md` | Step-by-step interactive tutorial (2D-game-style tactical/scientific HUD in 8 steps): single auto-welcome on 1st visit (`flipflop34:tutorial:v1`), permanent **`?`** button (`Interactive tutorial (?)`), multi-hole SVG cutout (`fillRule="evenodd"`) enabling editing only on explained targets, anti-overlap `computeCardLayout` with fixed footer, tab/sidebar/mobile-drawer synchronization (`#variables-sidebar`), `7/8 -> 8/8` transition only on new analysis (`prevAnalysisForTutorialRef`), bottom-right anchoring at step `8/8`, and Vitest + Playwright E2E suite (`7` tests). | `PROD-1` + `PROD-2` |
| ✅ *Created* | `context/knowledge_maps/TUTORIAL_INTERATIVO_HUD.md` | Complete technical guide for the interactive tutorial (architecture, `flipflop34:tutorial:v1` persistence, 8-step matrix, `evenodd` SVG cutout, `computeCardLayout`, and E2E coverage). | `PROD-1` + `PROD-2` |
