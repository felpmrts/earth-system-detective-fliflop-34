# Technical Guide — Step-by-Step Interactive Tutorial (2D Tactical/Scientific HUD) (`TUTORIAL_INTERATIVO_HUD.md`)

**Reference branch:** `mapa`
**Track:** Onboarding, UI & UX Synchronization (`PROD-1` + `PROD-2`)
**Main files:**
- `frontend/src/services/tutorialState.ts`
- `frontend/src/tutorial/tutorialSteps.ts`
- `frontend/src/tutorial/TutorialOverlay.tsx`
- `frontend/src/App.tsx`
- `frontend/src/map/MapWorkspace.tsx`
- `frontend/src/bench/ScientificBench.tsx`
- `frontend/src/bench.css`
- `frontend/src/__tests__/tutorialWalkthrough.test.tsx`
- `frontend/e2e/trendDetective.spec.ts`
- `frontend/playwright.config.ts`

---

## 1. Objective and General Behavior

Implement a native React/CSS guided tutorial (100% offline, zero external libraries) styled as 2D-game tactical-scientific missions, covering the entire application flow in **8 steps** (`INITIAL BRIEFING` + `MISSION 1 / 7` through `MISSION 7 / 7`):

1. **Single welcome on first entry into the free map:** the Home page remains the default entry. The tutorial opens when accessing the `Map` tab without an active case and without a valid `localStorage` record.
2. **On-demand reopening (`?`):** permanent **`Interactive tutorial (?)`** button (`.tutorial-trigger`) in the `.brand-header`, separate from the contextual `Scientific help (?)` button inside the Scientific Bench.
3. **Strict per-step focus and editing:** in each mission, only the selectors explained in that step receive an illuminated cutout and live interaction/editing; unexplained controls remain dimmed and blocked behind the SVG scrim.

---

## 2. Local Persistence (`frontend/src/services/tutorialState.ts`)

- **Key:** `TUTORIAL_STORAGE_KEY = 'flipflop34:tutorial:v1'`.
- **Schema (`PersistedTutorialState`):**
  - `version: 1`
  - `status: 'completed' | 'skipped'`
  - `updatedAt: string` (ISO 8601)
  - `lastStepId: string`
- **API:**
  - `loadTutorialState()` — validates JSON and returns `null` if missing, corrupted, or blocked by privacy/quota.
  - `shouldAutoOpenTutorial()` — returns `loadTutorialState() === null`.
  - `saveTutorialOutcome(status, lastStepId)` — writes completion or skip to `localStorage`.
  - `resetTutorialState()` — removes the stored key.

---

## 3. 8-Step Script (`frontend/src/tutorial/tutorialSteps.ts`)

Each item in `TUTORIAL_STEPS` defines visual metadata (`phaseTag`, `rankTitle`, `badgeIcon`), summary, `fieldTip`, `interactiveHint`, optional `shortcuts`, `resolveMissionStatus` (live reading via `TutorialLiveContext`), and `resolveTarget({ hasAnalysis })`:

| Order | `id` | Title | Strict `selectors` (`fallbackSelectors`) | Tab / Panel |
| :---: | :--- | :--- | :--- | :--- |
| `1 / 8` | `briefing` | `Welcome to Earth System Trend Detective` | `[]` (`placement: 'center'`) | Map |
| `2 / 8` | `variables-and-period` | `Choose Variables A/B and Period` | `['[data-tour="sidebar-controls"]']` (`['[data-tour="workflow-progress"]']`) | Map + Sidebar open |
| `3 / 8` | `global-trends-fdr` | `Read Global Trends and Significance` | `['[data-tour="map-trend-tools"]', '[data-tour="map-legend"]']` | Map |
| `4 / 8` | `hotspot-shortcuts` | `Jump Straight to Global Hotspots` | `['[data-tour="hotspot-actions"]']` | Map |
| `5 / 8` | `spatial-selection` | `Mark Regions A and B on the Map` | `['[data-tour="map-selection-tools"]', '[data-tour="map-nav-tools"]', '[data-tour="map-stage"]']` | Map |
| `6 / 8` | `cartography-layers` | `Switch Satellite and Local Cartography Layers` | `['.map-container .leaflet-control-layers']` (`['[data-tour="map-stage"]']`) | Map |
| `7 / 8` | `run-analysis` | `Review Summary and Run Analysis` | `['[data-tour="map-actions"]', '[data-tour="query-summary"]']` (`['[data-tour="analyze-button"]']`) | Map |
| `8 / 8` | `scientific-bench` | `Explore the Scientific Bench and Export Evidence` | No analysis: `['[data-tour="tab-bench"]']` (`showBenchPreview: true`)<br>With analysis: `['[data-tour="bench-panel"]']` | Map (preview) or Bench |

---

## 4. Overlay Engine, SVG Cutout, and Anti-Overlap (`TutorialOverlay.tsx` + `bench.css`)

### 4.1 Multi-Hole SVG Scrim with `fillRule="evenodd"`
- `buildEvenOddScrimPath(rects, vw, vh)` builds the outer viewport rectangle combined with rounded subpaths (`roundedRectSubpath`) for each highlight rectangle inside `<svg className="tutorial-scrim-svg"><path className="tutorial-scrim-path" fillRule="evenodd" clipRule="evenodd" ... /></svg>`.
- In `bench.css`, `.tutorial-scrim-path` uses `fill: rgba(4, 10, 18, .76)` and `pointer-events: visiblePainted`: the "holes" are transparent to user clicks directly on highlighted controls, while clicks outside targets trigger the visual ping (`.tutorial-spotlight.is-pinged`).
- A `.tutorial-spotlight` with HUD corner brackets (`.spotlight-corner`) wraps each element resolved by `resolveStepElements`.

### 4.2 Smart Positioning (`computeCardLayout`)
- Classifies focused rectangles into **controls/panels** vs. **wide stages** (`r.width > vw * 0.65 && r.height > vh * 0.4`).
- Evaluates multiple candidates around `primaryRect`, the union of controls (`computeBoundingUnion`), individual targets, viewport corners/edges, and **adaptive height pockets** (`MIN_POCKET_CARD_HEIGHT = 210` after measuring natural height without `maxHeight` via `measureNaturalCardSize`).
- Penalizes overlap with controls using `CONTROL_OVERLAP_WEIGHT = 1000` (vs. `STAGE_OVERLAP_WEIGHT = 1` and `STAGE_CENTER_OVERLAP_WEIGHT = 8` for the map center), preventing the card from covering selection buttons, filters, or `[data-tour="query-summary"]`.
- When the sole target is the full Bench panel (`hasAnalysis === true` at step `8/8`), the card anchors in the **bottom-right corner** (without `.is-centered`) so it does not obstruct Plotly charts or header buttons (`Scientific help (?)`, `Export CSV/JSON`).
- In `.tutorial-hud-card` (`bench.css`), the flex column layout pins header, progress bar, and navigation footer (`Skip tutorial`, `Previous`, `Next`), restricting scroll to `.tutorial-hud-body` on short viewports.
- Allows **Minimize (`−`) / Expand** to free 100% of the screen when marking cells on the map.

### 4.3 Reactive State and Keyboard Synchronization (`App.tsx` + `TutorialOverlay.tsx`)
- **Layout observers:** `ResizeObserver`, `MutationObserver` on targets (e.g., expanding `.leaflet-control-layers`), and a temporary `mountObserver` on `<main>`/`document.body` when a target has yet to mount after a tab switch.
- **Mantine popovers above overlay:** `Select` and `MonthPickerInput` in `App.tsx` use `zIndex: tutorialOpen ? 1325 : 1100` (between scrim and card).
- **Safe keyboard during editing:** `ArrowRight` / `ArrowLeft` are ignored when focus is inside editable controls (`isEditingControlOrPopup`), and `Escape` respects visibly open Mantine menus/popovers (`hasOpenMantinePopup`) before closing the tutorial.
- **Sidebar / Drawer:** `effectiveSidebarOpen` temporarily expands `#variables-sidebar` on desktop or opens the mobile drawer (`.drawer-open`) during step `2/8`, restoring the previous state upon advancing.
- **`7/8 -> 8/8` transition only on new analysis:** `prevAnalysisForTutorialRef` in `App.tsx` compares the previous `analysis` result with the current one, avoiding skipping step `7/8` if the user reopens the tutorial with a prior analysis loaded, and advancing to `8/8` (`scientific-bench`) as soon as a new query completes in `run-analysis`.

---

## 5. Test Coverage and Playwright Configuration

- **Unit tests (`frontend/src/__tests__/tutorialWalkthrough.test.tsx`):** 5 tests covering `tutorialState` persistence/fallback, 8 steps and adaptive Bench mode, 1st-visit cycle (`localStorage`), focus/keyboard/Mantine dropdown/`fill-rule="evenodd"`/`bench-panel` anchoring, and sidebar synchronization.
- **E2E tests (`frontend/e2e/trendDetective.spec.ts`):**
  - Desktop `1366×768`: automatic 1st visit, live Variable A editing, `q < 0.05 only` toggle, out-of-focus control blocking verified via `document.elementFromPoint`, zero overlap at `5/8` and `7/8`, `Next` button visibility, minimize/expand when selecting a cell, post-reload persistence, and `?` reopening.
  - Mobile `375×812`: opening via `?`, automatic `#variables-sidebar.drawer-open` synchronization without horizontal overflow, card framing, and `Escape` closing.
  - `7/8 -> 8/8` transition with a prior analysis loaded (`mockAnalyzeOffline: true`): ensures staying on step `7/8`, automatic advance to `8/8` after a new query, and bottom-right anchoring without `.is-centered`.
- **Local Playwright channel (`frontend/playwright.config.ts`):** `resolveLocalBrowserChannel()` keeps `undefined` in CI (`process.env.CI`) and locally detects Chrome or Edge on Windows.
