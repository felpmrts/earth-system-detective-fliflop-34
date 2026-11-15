# UX/UI Roadmap — Project Flipflop 34

This document compiles the proposed improvements to turn the application into a guided, readable, and accessible scientific experience. The order reflects user impact rather than strict technical dependency.

## Phase 1 — Core Flow

1. **Four-step flow** — Display `Variables → Period → Regions → Analysis` with pending, current, and completed states. **Implemented.**
2. **Persistent A/B identity** — Cyan for A and orange for B across selectors, map, summary, curves, and legends. **Implemented.**
3. **Pre-query summary** — Show variables, cell count, model, and period before analyzing. **Implemented.**
4. **Informative, cancellable loading** — Indicate NASA POWER query, elapsed time, indeterminate progress, and allow cancellation. **Implemented.**
5. **Bench empty state** — Do not show scientific controls without a result; guide the user back to the map. **Implemented.**

## Phase 2 — Map Experience

6. **Compact fixed legend** — Explain A/B colors, outline, nine-cell limit, and active resolution. **Implemented.**
7. **Cell preview** — Highlight the cell under the cursor before clicking and show coordinates/code. **Implemented.**
8. **Assisted spatial navigation** — Actions “Go to A”, “Go to B”, “Fit A + B”, “Clear all”, and “Undo”. **Implemented.**
9. **User-oriented layer names** — Use “NASA Satellite”, “Street map”, and “Terrain”, keeping technical details in tooltips. **Implemented.**

## Phase 3 — Scientific Bench

10. **Discovery header** — Summarize comparison, location, and period before the chart. **Implemented.**
11. **Segmented controls** — Replace checkboxes with groups like `Raw | Anomaly`, `Overlaid | Separated`, and trend options. **Implemented.**
12. **Scientific tooltips** — Show month, raw value, anomaly, unit, variable, region, and estimated trend. **Implemented.**
13. **Contextual help** — Explain OLS, Theil–Sen, FDR, AR(1), anomaly, and Mahalanobis in plain language. **Implemented.**
14. **Data provenance and quality** — Show source, cache/API, resolution, coverage, cells, missing values, and query timestamp. **Implemented.**

## Phase 4 — Layout and Continuity

15. **Collapsible sidebar** — Gain map area on desktop and use a drawer on mobile. **Implemented.**
16. **Pinned primary actions** — Keep “Analyze selection” visible; on mobile, use a fixed bottom bar. **Implemented.**
17. **Session persistence** — Restore variables, period, regions, tab, and chart preferences after reload. **Implemented.**

## Phase 5 — Accessibility

18. **Do not rely on color alone** — Differentiate A/B also by label, shape, and line pattern. **Implemented.**
19. **Full keyboard navigation** — Visible focus, logical tab order, accessible calendars, and announced messages. **Implemented.**
20. **System preferences** — Support `prefers-reduced-motion` and `prefers-contrast`. **Implemented.**

## Recommended Next Sequence

1. Legend and cell preview.
2. Discovery header and indicators.
3. Bench segmented controls.
4. Data provenance and quality panel.
5. Collapsible sidebar and mobile experience.
6. Session persistence and full accessibility audit.
