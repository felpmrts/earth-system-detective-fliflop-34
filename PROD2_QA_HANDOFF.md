# QA Technical Handoff — `PROD-2` Track Items (Completed on Branch `mapa`)

- **Status:** **Completed and verified on branch `mapa` (Track A)** — all items **`AUD-01` through `AUD-15`** are closed on branch `mapa` (the 5 items `AUD-04`, `AUD-06`, `AUD-07`, `AUD-08`, and `AUD-09` from track `PROD-1` had already been resolved earlier on `mapa`, and the 10 items `AUD-01`, `AUD-02`, `AUD-03`, `AUD-05`, `AUD-10`, `AUD-11`, `AUD-12`, `AUD-13`, `AUD-14`, and `AUD-15` from track `PROD-2` were implemented and verified in this phase, along with the `Escape` guard for Mantine popups in the mobile drawer in `App.tsx` / `TutorialOverlay.tsx`).
- **Original Scope:** Surgical documentation of the **10 remaining findings** from the read-only audit (`AUD-01`, `AUD-02`, `AUD-03`, `AUD-05`, `AUD-10`, `AUD-11`, `AUD-12`, `AUD-13`, `AUD-14`, `AUD-15`), originally planned on base `223d3b9` / `origin/mapa` `8530d8a`. **Pending note outside branch `mapa`:** the mirror alignment of `CLOUD_AMT.allow_percentage_change = false` on the backend remains to be checked on branch `data` (`data/services/comparison_service.py`).
- **Final verification executed in `frontend/` on branch `mapa`:**
  - `npm run typecheck`: OK (`tsc --noEmit`)
  - `npm run validate:grids`: OK (`12/12` grids present + `CLOUD_AMT -> CLDTOT_grid.json` alias)
  - `npm run build`: OK
  - `npm run test` (`vitest run`): **11 files / 59 tests passing** (including `frontend/src/__tests__/qaProd2Hardening.test.tsx`, `benchMeta.test.ts`, and `contractValidator.test.ts`)
  - `npm run verify:offline`: OK (`dist/` 100% offline with zero external CDNs)
  - `npm run test:e2e` (`playwright test` against `vite preview`): **7/7 E2E tests passing** (`frontend/e2e/trendDetective.spec.ts`)

---

## 1. Executive Summary by Severity and Status (`AUD-01` to `AUD-15`)

- **`PROD-1` items pre-resolved on branch `mapa`:** `AUD-04`, `AUD-06`, `AUD-07`, `AUD-08`, `AUD-09` — **[x] Completed and verified on branch `mapa`**.

| ID | Severity | Status on branch `mapa` | File(s) | Main Risk |
| :--- | :---: | :---: | :--- | :--- |
| `AUD-01` | **Critical** | **[x] Completed and verified** | `frontend/src/App.tsx`, `frontend/src/tutorial/TutorialOverlay.tsx`, `frontend/src/bench.css` | **Mobile 4G Blocker:** dropdowns and datepickers open behind the drawer (`zIndex: 1100` < `1200`) and `Escape` closed the drawer while a popup was open. |
| `AUD-02` | **Critical** | **[x] Completed and verified** | `frontend/src/App.tsx` | **Race condition:** changing selection during an in-flight request does not abort or discard the stale response. |
| `AUD-03` | **Critical** | **[x] Completed and verified** | `frontend/src/services/sessionState.ts`, `frontend/src/bench/ScientificBench.tsx` | **Boot/render crash:** `localStorage` with corrupted `cells` or invalid month (`"2020-99"`) crashes React. |
| `AUD-05` | **Medium** | **[x] Completed and verified** | `frontend/src/App.tsx`, `frontend/src/bench.css` | Switching tabs (`Map` ↔ `Bench`) unmounts `MapWorkspace` and destroys `Same Location (A=B)` mode. |
| `AUD-10` | **Medium** | **[x] Completed and verified** | `frontend/src/contracts/contractValidator.ts`, `frontend/src/bench/ScientificBench.tsx` | Unvalidated numeric/enum fields in the contract can throw `TypeError` in badges and `.toFixed()`. |
| `AUD-11` | **Medium** | **[x] Completed and verified** | `frontend/src/bench.css` | Long IDs (`region_a_id`/`region_b_id` with up to 25 cells) overflow Card 4 on desktop and `375px`. |
| `AUD-12` | **Medium** | **[x] Completed and verified** | `frontend/src/bench.css` | At `375px`, `.map-status` does not wrap and `.map-legend` collides with Leaflet attribution/layers. |
| `AUD-13` | **Medium** | **[x] Completed and verified** | `frontend/src/bench/benchMeta.ts`, `frontend/src/bench/ScientificBench.tsx` | Near-zero values display `"-0.000"`/`"-0.00"`, and `OLS`/`A₀`/`Δ Slope` omit units. |
| `AUD-14` | **Polish** | **[x] Completed and verified** | `frontend/src/contracts/catalog.ts` | `CLOUD_AMT` (`unit: '%'`, alias of `CLDTOT`) allows `%` (`allow_percentage_change: true`). |
| `AUD-15` | **Polish** | **[x] Completed and verified** | `frontend/src/bench/ScientificBench.tsx` | Fixed margins `l: 75, r: 75` overly shrink Plotly chart area at `375px`. |

---

## 2. Surgical Specification of the 10 Items

### `AUD-01` — Mantine Portals (`Select` / `MonthPickerInput`) Hidden Behind the Mobile Drawer

- **Status:** **[x] Completed and verified on branch `mapa`** (`App.tsx` + `hasOpenMantinePopup` in `TutorialOverlay.tsx` + mobile E2E `375x812`).
- **Severity:** **Critical (Blocker for Mobile 4G blind test — Gate 5)**
- **File and lines:**
  - `frontend/src/App.tsx`: lines **219**, **226**, and **231**
  - Z-index reference in `frontend/src/bench.css`: lines **44–45** (`.drawer-backdrop` = `z-index: 1150`; `.workspace > aside` = `z-index: 1200`)
- **Bug and impact:** At the `@media (max-width: 700px)` breakpoint (e.g., `375px` phone on 4G test), the user opens the `"Variables & period"` side drawer (`z-index: 1200`), but Mantine portals (`withinPortal: true`) render with `zIndex: 1100`. The Variable A/B dropdown and month pickers open behind the dark backdrop (`1150`) and panel (`1200`), making it impossible to select variables or dates on mobile.

**Current snippet (`frontend/src/App.tsx:218-234`):**
```tsx
              value={value || null} onChange={id => onChange(id ?? '')}
              comboboxProps={{ width: 310, position: 'bottom-start', withinPortal: true, zIndex: 1100 }}
              maxDropdownHeight={340} />
          ))}
          <fieldset className="period-picker" disabled={!minimumMonth}>
            <legend>Period</legend>
            <MonthPickerInput className="variable-picker" classNames={{ input: 'selection-input' }} label="Start month" placeholder="Select month"
              locale="en" valueFormat="MMMM YYYY" clearable disabled={!minimumMonth}
              popoverProps={{ withinPortal: true, zIndex: 1100 }}
              minDate={minimumMonth ? minimumMonth + '-01' : undefined} maxDate={maximumMonth + '-01'}
              value={start ? start + '-01' : null} onChange={value => setStartMonth(value?.slice(0, 7) ?? '')} />
            <MonthPickerInput className="variable-picker" classNames={{ input: 'selection-input' }} label="End month" placeholder="Select month"
              locale="en" valueFormat="MMMM YYYY" clearable disabled={!minimumMonth}
              popoverProps={{ withinPortal: true, zIndex: 1100 }}
              minDate={minimumMonth ? (start || minimumMonth) + '-01' : undefined} maxDate={maximumMonth + '-01'}
              value={end ? end + '-01' : null} onChange={value => setEndMonth(value?.slice(0, 7) ?? '')} />
          </fieldset>
```

**Replacement:** change all three `zIndex: 1100` to **`zIndex: 1300`** (above `.workspace > aside` `1200`).

```tsx
              value={value || null} onChange={id => onChange(id ?? '')}
              comboboxProps={{ width: 310, position: 'bottom-start', withinPortal: true, zIndex: 1300 }}
              maxDropdownHeight={340} />
          ))}
          <fieldset className="period-picker" disabled={!minimumMonth}>
            <legend>Period</legend>
            <MonthPickerInput className="variable-picker" classNames={{ input: 'selection-input' }} label="Start month" placeholder="Select month"
              locale="en" valueFormat="MMMM YYYY" clearable disabled={!minimumMonth}
              popoverProps={{ withinPortal: true, zIndex: 1300 }}
              minDate={minimumMonth ? minimumMonth + '-01' : undefined} maxDate={maximumMonth + '-01'}
              value={start ? start + '-01' : null} onChange={value => setStartMonth(value?.slice(0, 7) ?? '')} />
            <MonthPickerInput className="variable-picker" classNames={{ input: 'selection-input' }} label="End month" placeholder="Select month"
              locale="en" valueFormat="MMMM YYYY" clearable disabled={!minimumMonth}
              popoverProps={{ withinPortal: true, zIndex: 1300 }}
              minDate={minimumMonth ? (start || minimumMonth) + '-01' : undefined} maxDate={maximumMonth + '-01'}
              value={end ? end + '-01' : null} onChange={value => setEndMonth(value?.slice(0, 7) ?? '')} />
          </fieldset>
```

---

### `AUD-02` — Race Condition in `analyzeSelection()` When Changing Parameters with Active Request

- **Status:** **[x] Completed and verified on branch `mapa`** (`App.tsx` + `qaProd2Hardening.test.tsx`).
- **Severity:** **Critical**
- **File and lines:** `frontend/src/App.tsx`: lines **85–89** and **130–152**
- **Bug and impact:** While `isAnalyzing === true`, the side panel and map remain clickable. If the user changes variable, period, or map cell during a slow 4G/network query, `useEffect` (`L85-89`) clears `analysis`, but **does not abort** `analysisControllerRef.current`. Furthermore, in `L140-142`, `setAnalysis(result)`, `setAnalyzedAt(...)`, and `setTab('bench')` run without checking `controller.signal.aborted`. When the old request resolves later, it writes stale results and forces a switch to the bench tab out of sync with the current controls.

**Current snippet (`frontend/src/App.tsx:84-89`):**
```tsx
  // Any change in the spatial/temporal form invalidates the previous analysis.
  useEffect(() => {
    setAnalysis(undefined);
    setAnalyzedAt(null);
    setAnalysisError('');
  }, [variableA, variableB, start, end, regionA, regionB]);
```

**Replacement 1 (`L84-89`):**
```tsx
  // Any change in the spatial/temporal form invalidates and aborts the previous in-flight analysis.
  useEffect(() => {
    analysisControllerRef.current?.abort('Selection changed during query.');
    setAnalysis(undefined);
    setAnalyzedAt(null);
    setAnalysisError('');
  }, [variableA, variableB, start, end, regionA, regionB]);
```

**Current snippet (`frontend/src/App.tsx:130-153`):**
```tsx
    try {
      const result = await getRegionData({
        variable: variableA as VariableId,
        variableB: variableB as VariableId,
        region: regionA,
        regionB,
        startDate: start,
        endDate: end,
        signal: controller.signal,
      });
      setAnalysis(result);
      setAnalyzedAt(new Date().toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'medium' }));
      setTab('bench');
    } catch (requestError) {
      if (!controller.signal.aborted) {
        setAnalysisError(requestError instanceof Error ? requestError.message : 'Unable to analyze the selection.');
      }
    } finally {
      if (analysisControllerRef.current === controller) {
        analysisControllerRef.current = null;
        setIsAnalyzing(false);
      }
    }
```

**Replacement 2 (`L139-143`):**
```tsx
      if (controller.signal.aborted) return;
      setAnalysis(result);
      setAnalyzedAt(new Date().toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'medium' }));
      setTab('bench');
```

---

### `AUD-03` — Crash from Partially Corrupted Session in `localStorage` (`cells` / `startMonth`)

- **Status:** **[x] Completed and verified on branch `mapa`** (`sessionState.ts` + `ScientificBench.tsx` + `qaProd2Hardening.test.tsx`).
- **Severity:** **Critical**
- **File and lines:**
  - `frontend/src/services/sessionState.ts`: lines **38–49** and **74–75**
  - Complementary defensive guard in `frontend/src/bench/ScientificBench.tsx`: lines **241–244**
- **Bug and impact:** `isValidRegion` only checks whether `cells` is an array with `length` between `1` and `MAX_CELLS_PER_REGION`, without validating `cells` elements (`lat`, `lon`, `bounds_leaflet`, `cell_id`) or checking if `source_model` still matches the current catalog. An old/corrupted payload (`cells: [{}]`) passes `isValidRegion` and crashes `MapWorkspace` at `cell.bounds_leaflet[0][0]`. Moreover, `startMonth`/`endMonth` accept any string: a string like `"2020-99"` passes lexicographical comparison (`App.tsx:53-54`) and throws an unhandled `RangeError: Invalid time value` in `Intl.DateTimeFormat().format(...)` (`MapWorkspace.tsx:600`) and `new Date(...).toISOString()` (`ScientificBench.tsx:243`).

**Current snippet (`frontend/src/services/sessionState.ts:1,38-49,74-77`):**
```ts
import { isValidVariableId } from '../contracts/catalog';
...
function isValidRegion(value: unknown, expectedSlot: 'A' | 'B'): value is RegionSelection {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RegionSelection>;
  return (
    candidate.slot === expectedSlot &&
    typeof candidate.region_id === 'string' &&
    typeof candidate.variable_id === 'string' &&
    isValidVariableId(candidate.variable_id) &&
    Array.isArray(candidate.cells) &&
    candidate.cells.length > 0 &&
    candidate.cells.length <= MAX_CELLS_PER_REGION
  );
}
...
      startMonth: typeof parsed.startMonth === 'string' ? parsed.startMonth : '',
      endMonth: typeof parsed.endMonth === 'string' ? parsed.endMonth : '',
      regionA: isValidRegion(parsed.regionA, 'A') && parsed.regionA.variable_id === variableA ? parsed.regionA : null,
      regionB: isValidRegion(parsed.regionB, 'B') && parsed.regionB.variable_id === variableB ? parsed.regionB : null,
```

**Replacement 1 (`frontend/src/services/sessionState.ts`):**
```ts
import { getVariableMetadata, isValidVariableId } from '../contracts/catalog';
import type { GridCell, RegionSelection } from '../contracts/types';
import type { TrendMode } from '../bench/benchMeta';
import { MAX_CELLS_PER_REGION } from '../geo/gridGeometry';

const YEAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function isValidYearMonth(value: unknown): value is string {
  return typeof value === 'string' && YEAR_MONTH_PATTERN.test(value);
}

function isValidGridCell(cell: unknown): cell is GridCell {
  if (!cell || typeof cell !== 'object') return false;
  const candidate = cell as Partial<GridCell>;
  const bounds = candidate.bounds_leaflet;
  return (
    typeof candidate.cell_id === 'string' &&
    candidate.cell_id.length > 0 &&
    typeof candidate.lat === 'number' &&
    Number.isFinite(candidate.lat) &&
    typeof candidate.lon === 'number' &&
    Number.isFinite(candidate.lon) &&
    Array.isArray(bounds) &&
    bounds.length === 2 &&
    Array.isArray(bounds[0]) &&
    bounds[0].length === 2 &&
    Number.isFinite(bounds[0][0]) &&
    Number.isFinite(bounds[0][1]) &&
    Array.isArray(bounds[1]) &&
    bounds[1].length === 2 &&
    Number.isFinite(bounds[1][0]) &&
    Number.isFinite(bounds[1][1])
  );
}
```
And in `isValidRegion` + return of `loadPersistedSession`:
```ts
function isValidRegion(value: unknown, expectedSlot: 'A' | 'B'): value is RegionSelection {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RegionSelection>;
  if (
    candidate.slot !== expectedSlot ||
    typeof candidate.region_id !== 'string' ||
    typeof candidate.variable_id !== 'string' ||
    !isValidVariableId(candidate.variable_id) ||
    !Array.isArray(candidate.cells) ||
    candidate.cells.length === 0 ||
    candidate.cells.length > MAX_CELLS_PER_REGION
  ) {
    return false;
  }
  const expectedModel = getVariableMetadata(candidate.variable_id).source_model;
  return (
    candidate.source_model === expectedModel &&
    candidate.cells.every(cell => isValidGridCell(cell))
  );
}
```
```ts
      startMonth: isValidYearMonth(parsed.startMonth) ? parsed.startMonth : '',
      endMonth: isValidYearMonth(parsed.endMonth) ? parsed.endMonth : '',
```

**Replacement 2 (complementary guard in `frontend/src/bench/ScientificBench.tsx:241-244`):**
```ts
  const isYearMonth = (val: string | undefined): val is string =>
    Boolean(val && /^\d{4}-(0[1-9]|1[0-2])$/.test(val));
  const firstDate = isYearMonth(firstMonth) ? `${firstMonth}-01` : undefined;
  const lastDate = isYearMonth(lastMonth)
    ? new Date(Date.UTC(Number(lastMonth.slice(0, 4)), Number(lastMonth.slice(5, 7)), 0)).toISOString().slice(0, 10)
    : undefined;
```

---

### `AUD-05` — Tab Switch Unmounts `MapWorkspace` and Destroys `Same Location (A=B)` State

- **Status:** **[x] Completed and verified on branch `mapa`** (`App.tsx` + `bench.css` + `qaProd2Hardening.test.tsx` + E2E `trendDetective.spec.ts`).
- **Severity:** **Medium**
- **File and lines:** `frontend/src/App.tsx`: lines **259–296**
- **Bug and impact:** `<MapWorkspace>` only exists in the tree when `tab === 'map'`. When an analysis finishes (`setTab('bench')` at `L142`) or when navigating between tabs, `<MapWorkspace>` unmounts, losing `sameLocation` (`A=B`), undo history, and map zoom. Moreover, if the user changes `Variable B` (e.g., `MERRA-2` → `CERES`) in the sidebar while on the `Scientific bench` tab, `handleVariableBChange` clears `regionB`, and `A=B` mirroring never re-snaps `regionB` because `MapWorkspace` is unmounted.
- **Zero-merge-conflict solution with `PROD-1`:** keep `<MapWorkspace>` mounted using a wrapper with `display: tab === 'map' ? 'contents' : 'none'`. Since `bench.css:30` styles `.exploration > section`, `display: contents` preserves the exact CSS Grid layout when visible; when `tab === 'bench'`, `MapWorkspace` stays mounted preserving `sameLocation` and re-running the `mirrorRegionSelection` `useEffect`, while the existing `ResizeObserver` automatically triggers `map.invalidateSize()` upon returning to `'map'`.

**Current snippet (`frontend/src/App.tsx:259-296`):**
```tsx
          {tab === 'map' ? (
            <MapWorkspace
              variableA={variableA ? variableA as VariableId : null}
              variableB={variableB ? variableB as VariableId : null}
              periodReady={periodReady}
              startMonth={start}
              endMonth={end}
              regionA={regionA}
              regionB={regionB}
              onRegionAChange={setRegionA}
              onRegionBChange={setRegionB}
              isAnalyzing={isAnalyzing}
              analysisError={analysisError}
              onAnalyze={analyzeSelection}
              onCancel={cancelAnalysis}
            />
          ) : (
            <ScientificBench
              analysis={analysis}
              variableA={variableA}
              variableB={variableB}
              regionA={regionA}
              regionB={regionB}
              start={start}
              end={end}
              periodReady={periodReady}
              analyzedAt={analyzedAt}
              anomaly={anomaly}
              separate={separate}
              dual={dual}
              trendMode={trendMode}
              onAnomalyChange={setAnomaly}
              onSeparateChange={setSeparate}
              onDualChange={setDual}
              onTrendModeChange={setTrendMode}
              onBackToMap={() => setTab('map')}
            />
          )}
```

**Replacement:**
```tsx
          <div style={{ display: tab === 'map' ? 'contents' : 'none' }}>
            <MapWorkspace
              variableA={variableA ? variableA as VariableId : null}
              variableB={variableB ? variableB as VariableId : null}
              periodReady={periodReady}
              startMonth={start}
              endMonth={end}
              regionA={regionA}
              regionB={regionB}
              onRegionAChange={setRegionA}
              onRegionBChange={setRegionB}
              isAnalyzing={isAnalyzing}
              analysisError={analysisError}
              onAnalyze={analyzeSelection}
              onCancel={cancelAnalysis}
            />
          </div>
          {tab === 'bench' && (
            <ScientificBench
              analysis={analysis}
              variableA={variableA}
              variableB={variableB}
              regionA={regionA}
              regionB={regionB}
              start={start}
              end={end}
              periodReady={periodReady}
              analyzedAt={analyzedAt}
              anomaly={anomaly}
              separate={separate}
              dual={dual}
              trendMode={trendMode}
              onAnomalyChange={setAnomaly}
              onSeparateChange={setSeparate}
              onDualChange={setDual}
              onTrendModeChange={setTrendMode}
              onBackToMap={() => setTab('map')}
            />
          )}
```

---

### `AUD-10` — Incomplete Statistics Validation in Contract and Unguarded Accesses in UI

- **Status:** **[x] Completed and verified on branch `mapa`** (`contractValidator.ts` + `ScientificBench.tsx` + `contractValidator.test.ts` + `qaProd2Hardening.test.tsx`).
- **Severity:** **Medium**
- **Files and lines:**
  - `frontend/src/contracts/contractValidator.ts`: lines **152–185**
  - `frontend/src/bench/ScientificBench.tsx`: lines **101–103**, **111**, **131**, **143**, **805**, **826**, **841**, **846**, **850**, **858–865**
- **Bug and impact:** `validateVariableStatistics` does not reject `unit`/`trend_unit` containing `%` when `scale_type === 'interval'`, and does not validate `intercept_at_start_A0`, `slope_ci95_low/high`, `cumulative_model_change`, `quadratic_acceleration_B2`, `regime_shape`, `confidence_tier`, `correlation_and_coupling.*`, or `outliers_mahalanobis`. In `ScientificBench.tsx`, direct accesses like `CONFIDENCE_LABELS[tier].label` or `number.toFixed(...)` throw `TypeError` if any field arrives unexpected/non-finite.

**Current snippet (`frontend/src/contracts/contractValidator.ts:152-185`):**
```ts
  // Invariant #3 lock: forbidden to display percentage change on interval scales (°C, kPa).
  if (scaleType === 'interval' && data.allow_percentage_change) {
    throw new ContractValidationError(
      `Invariant #3 violation in ${prefix}: scale_type="interval" (${varId}) cannot have allow_percentage_change=true.`,
    );
  }

  if (!isRecord(data.period)) {
    throw new ContractValidationError(`${prefix}.period missing.`);
  }
  assertFiniteNumber(data.period.n_observations, `${prefix}.period.n_observations`);
  assertFiniteNumber(data.period.n_effective_ar1, `${prefix}.period.n_effective_ar1`);

  if (!isRecord(data.regression)) {
    throw new ContractValidationError(`${prefix}.regression missing.`);
  }
  assertFiniteNumber(data.regression.slope_per_decade_ols, `${prefix}.regression.slope_per_decade_ols`);
  assertFiniteNumber(data.regression.slope_per_decade_sen, `${prefix}.regression.slope_per_decade_sen`);

  if (!isRecord(data.significance)) {
    throw new ContractValidationError(`${prefix}.significance missing.`);
  }
  assertNumberInRange(data.significance.p_value_naive, 0, 1, `${prefix}.significance.p_value_naive`);
  assertNumberInRange(
    data.significance.p_value_ar1_corrected,
    0,
    1,
    `${prefix}.significance.p_value_ar1_corrected`,
  );
  assertNumberInRange(data.significance.fdr_q_value, 0, 1, `${prefix}.significance.fdr_q_value`);
  if (typeof data.significance.is_significant_fdr05 !== 'boolean') {
    throw new ContractValidationError(`${prefix}.significance.is_significant_fdr05 must be boolean.`);
  }
```

**Replacement 1 (`frontend/src/contracts/contractValidator.ts:152-185`):**
```ts
  const unit = assertNonEmptyString(data.unit, `${prefix}.unit`);
  const trendUnit = assertNonEmptyString(data.trend_unit, `${prefix}.trend_unit`);

  // Invariant #3 lock: forbidden to display percentage change or "%" unit on interval scales (°C, kPa).
  if (scaleType === 'interval' && (data.allow_percentage_change || unit.includes('%') || trendUnit.includes('%'))) {
    throw new ContractValidationError(
      `Invariant #3 violation in ${prefix}: scale_type="interval" (${varId}) cannot use "%" change or unit.`,
    );
  }

  if (!isRecord(data.period)) {
    throw new ContractValidationError(`${prefix}.period missing.`);
  }
  assertFiniteNumber(data.period.n_observations, `${prefix}.period.n_observations`);
  assertFiniteNumber(data.period.n_effective_ar1, `${prefix}.period.n_effective_ar1`);

  if (!isRecord(data.regression)) {
    throw new ContractValidationError(`${prefix}.regression missing.`);
  }
  assertFiniteNumber(data.regression.intercept_at_start_A0, `${prefix}.regression.intercept_at_start_A0`);
  assertFiniteNumber(data.regression.slope_per_decade_ols, `${prefix}.regression.slope_per_decade_ols`);
  assertFiniteNumber(data.regression.slope_per_decade_sen, `${prefix}.regression.slope_per_decade_sen`);
  assertFiniteNumber(data.regression.slope_ci95_low, `${prefix}.regression.slope_ci95_low`);
  assertFiniteNumber(data.regression.slope_ci95_high, `${prefix}.regression.slope_ci95_high`);
  assertFiniteNumber(data.regression.cumulative_model_change, `${prefix}.regression.cumulative_model_change`);
  assertFiniteNumber(data.regression.quadratic_acceleration_B2, `${prefix}.regression.quadratic_acceleration_B2`);
  const regime = assertNonEmptyString(data.regression.regime_shape, `${prefix}.regression.regime_shape`);
  if (!['linear', 'accelerating_rise', 'accelerating_decline', 'saturating', 'non_monotonic'].includes(regime)) {
    throw new ContractValidationError(`${prefix}.regression.regime_shape invalid: ${regime}`);
  }

  if (!isRecord(data.correlation_and_coupling)) {
    throw new ContractValidationError(`${prefix}.correlation_and_coupling missing.`);
  }
  assertNumberInRange(data.correlation_and_coupling.pearson_r, -1, 1, `${prefix}.correlation_and_coupling.pearson_r`);
  assertNumberInRange(data.correlation_and_coupling.kendall_tau, -1, 1, `${prefix}.correlation_and_coupling.kendall_tau`);
  assertNumberInRange(data.correlation_and_coupling.r_squared, 0, 1, `${prefix}.correlation_and_coupling.r_squared`);
  assertFiniteNumber(data.correlation_and_coupling.ellipse_aspect_ratio, `${prefix}.correlation_and_coupling.ellipse_aspect_ratio`);

  if (!isRecord(data.significance)) {
    throw new ContractValidationError(`${prefix}.significance missing.`);
  }
  assertNumberInRange(data.significance.p_value_naive, 0, 1, `${prefix}.significance.p_value_naive`);
  assertNumberInRange(
    data.significance.p_value_ar1_corrected,
    0,
    1,
    `${prefix}.significance.p_value_ar1_corrected`,
  );
  assertNumberInRange(data.significance.fdr_q_value, 0, 1, `${prefix}.significance.fdr_q_value`);
  if (typeof data.significance.is_significant_fdr05 !== 'boolean') {
    throw new ContractValidationError(`${prefix}.significance.is_significant_fdr05 must be boolean.`);
  }
  const tier = assertNonEmptyString(data.significance.confidence_tier, `${prefix}.significance.confidence_tier`);
  if (!['CONFIRMED_HIGH', 'CONFIRMED_MODERATE', 'INSUFFICIENT_SIGNAL', 'NO_TREND'].includes(tier)) {
    throw new ContractValidationError(`${prefix}.significance.confidence_tier invalid: ${tier}`);
  }

  if (!Array.isArray(data.outliers_mahalanobis)) {
    throw new ContractValidationError(`${prefix}.outliers_mahalanobis must be an array.`);
  }
  data.outliers_mahalanobis.forEach((outlier, index) => {
    if (!isRecord(outlier)) {
      throw new ContractValidationError(`${prefix}.outliers_mahalanobis[${index}] must be an object.`);
    }
    assertNonEmptyString(outlier.date, `${prefix}.outliers_mahalanobis[${index}].date`);
    assertFiniteNumber(outlier.mahalanobis_d, `${prefix}.outliers_mahalanobis[${index}].mahalanobis_d`);
  });
```

**Replacement 2 (UI fallbacks — `frontend/src/bench/ScientificBench.tsx`):**
- Create a `formatFixed(val: number | null | undefined, digits: number): string` helper in `ScientificBench.tsx` (or reuse `formatPointValue` parameterized with `digits = 3`) to avoid direct `.toFixed(...)` calls on lines `143, 826, 850, 858, 859, 865`.
- Use fallback in `CONFIDENCE_LABELS[tier] ?? CONFIDENCE_LABELS.INSUFFICIENT_SIGNAL` (`L101, L841`) and `REGIME_LABELS[regime] ?? regime` (`L102, L805`).

---

### `AUD-11` — Horizontal Overflow of `region_a_id` / `region_b_id` in Diagnostics Card 4

- **Status:** **[x] Completed and verified on branch `mapa`** (`bench.css` + E2E `trendDetective.spec.ts`).
- **Severity:** **Medium**
- **Files and lines:**
  - `frontend/src/bench.css`: lines **220** and **225**
  - Affected element in `frontend/src/bench/ScientificBench.tsx`: lines **885–888** (`<code>{analysis.comparison_pair.region_a_id}</code>`)
- **Bug and impact:** With selections of up to 9–25 cells, `region_a_id` and `region_b_id` form continuous strings without spaces (100–250+ characters). Because `.diag-card` (`L220`) and `.diag-meta code` (`L225`) lack `min-width: 0` and word wrapping, the `<code>` element overflows the grid horizontally at `375px` and compresses columns at `1366×768`.

**Current snippet (`frontend/src/bench.css:220-226`):**
```css
.diag-card { background: #122136; border: 1px solid #2a3f5c; border-radius: 10px; padding: .75rem .85rem; display: flex; flex-direction: column; gap: .55rem; }
.diag-card h4 { margin: 0; font-size: .9rem; color: #67e8f9; border-bottom: 1px solid #23364f; padding-bottom: .35rem; }
.diag-row { display: flex; flex-direction: column; gap: .25rem; font-size: .84rem; padding-top: .25rem; }
.diag-row + .diag-row { border-top: 1px dashed #243852; padding-top: .5rem; }
.diag-meta { color: #bdd0e6; font-size: .8rem; line-height: 1.45; }
.diag-meta code { color: #a5f3fc; background: #0a1422; padding: .08rem .28rem; border-radius: 4px; font-size: .78rem; }
```

**Replacement:**
```css
.diag-card { min-width: 0; background: #122136; border: 1px solid #2a3f5c; border-radius: 10px; padding: .75rem .85rem; display: flex; flex-direction: column; gap: .55rem; }
.diag-card h4 { margin: 0; font-size: .9rem; color: #67e8f9; border-bottom: 1px solid #23364f; padding-bottom: .35rem; }
.diag-row { display: flex; flex-direction: column; gap: .25rem; font-size: .84rem; padding-top: .25rem; }
.diag-row + .diag-row { border-top: 1px dashed #243852; padding-top: .5rem; }
.diag-meta { min-width: 0; color: #bdd0e6; font-size: .8rem; line-height: 1.45; }
.diag-meta code { color: #a5f3fc; background: #0a1422; padding: .08rem .28rem; border-radius: 4px; font-size: .78rem; overflow-wrap: anywhere; word-break: break-word; }
```

---

### `AUD-12` — Mobile Layout Collisions (`375px`) in `.map-status`, `.map-legend`, and Layer Control

- **Status:** **[x] Completed and verified on branch `mapa`** (`bench.css` + mobile E2E `375x812`).
- **Severity:** **Medium**
- **File and lines:** `frontend/src/bench.css`: lines **73–75** and **192–196**
- **Bug and impact:**
  1. `.map-status` (`L75`) lacks `flex-wrap: wrap` (only `.map-toolbar` has it at `L74`). At `375px`, `.map-message` (`notice + gridNotice + offlineTileNotice`) competes for horizontal space with `.map-tools`, getting squeezed into a tiny column.
  2. In `.map-stage` (`min-height: 300px`, `L127`), at `375px`, `.map-legend` (`left: .75rem; bottom: .75rem; max-width: 13.5rem`) collides horizontally with `.leaflet-control-attribution` (bottom-right), and expanded `.leaflet-control-layers` (`topright`) vertically overlaps `.box-select-badge` / `.map-legend`.

**Current snippet (`frontend/src/bench.css:73-75`):**
```css
.map-toolbar, .map-status { z-index: 500; display: flex; align-items: center; justify-content: space-between; gap: .75rem; padding: .55rem .75rem; background: #121e30; }
.map-toolbar { border-bottom: 1px solid #2a3c54; flex-wrap: wrap; }
.map-status { min-height: 1.8rem; color: #acc1d9; border-top: 1px solid #2a3c54; font-size: .85rem; }
```

**Replacement 1 (`frontend/src/bench.css:73-75`):**
```css
.map-toolbar, .map-status { z-index: 500; display: flex; align-items: center; justify-content: space-between; gap: .75rem; padding: .55rem .75rem; background: #121e30; }
.map-toolbar { border-bottom: 1px solid #2a3c54; flex-wrap: wrap; }
.map-status { min-height: 1.8rem; flex-wrap: wrap; color: #acc1d9; border-top: 1px solid #2a3c54; font-size: .85rem; }
```

**Current snippet (`frontend/src/bench.css:192-196`):**
```css
@media (max-width: 700px) {
  .map-actions { position: fixed; left: 0; right: 0; bottom: 0; z-index: 900; padding: .6rem .75rem; background: rgba(10, 20, 34, .96); border-top: 1px solid #2a3c54; backdrop-filter: blur(8px); }
  .map-actions > button { flex: 1; min-height: 2.5rem; }
  .map-legend { max-width: 13.5rem; font-size: .7rem; }
}
```

**Replacement 2 (`frontend/src/bench.css:192-196`):**
```css
@media (max-width: 700px) {
  .map-actions { position: fixed; left: 0; right: 0; bottom: 0; z-index: 900; padding: .6rem .75rem; background: rgba(10, 20, 34, .96); border-top: 1px solid #2a3c54; backdrop-filter: blur(8px); }
  .map-actions > button { flex: 1; min-height: 2.5rem; }
  .map-message { flex-basis: 100%; }
  .map-legend { left: .5rem; bottom: 1.65rem; max-width: min(12.5rem, calc(100% - 1rem)); padding: .4rem .55rem; font-size: .68rem; }
  .map-container .leaflet-control-layers-expanded { max-height: 11rem; overflow-y: auto; }
}
```

---

### `AUD-13` — `-0.000` / `-0.00` Formatting, Missing `Number.isFinite` Guard, and Missing Units

- **Status:** **[x] Completed and verified on branch `mapa`** (`benchMeta.ts` + `ScientificBench.tsx` + `benchMeta.test.ts` + `qaProd2Hardening.test.tsx` + E2E).
- **Severity:** **Medium**
- **Files and lines:**
  - `frontend/src/bench/benchMeta.ts`: lines **73–81**
  - `frontend/src/bench/ScientificBench.tsx`: lines **518**, **522**, **825–827**, **896–898**
- **Bug and impact:** `formatSignedNumber(-0.0002, 3)` produces `"-0.000"` (`"-0.00000"` for `B₂` with `decimals=5`), and `L518, 522` call `.toFixed(2)` directly (e.g., `"-0.00"`), without checking `Number.isFinite`. Furthermore, in the diagnostic cards, `OLS` (`L825`), `A₀` (`L826`), and `Δ Slope (A − B)` (`L897`) do not display `{region.trend_unit}` / `{region.unit}`.

**Current snippet (`frontend/src/bench/benchMeta.ts:73-81`):**
```ts
export function formatSignedNumber(value: number, decimals = 3): string {
  const formatted = value.toFixed(decimals);
  return value > 0 ? `+${formatted}` : formatted;
}

export function formatPValue(value: number): string {
  if (value < 0.0001) return value.toExponential(1);
  return value.toFixed(4);
}
```

**Replacement 1 (`frontend/src/bench/benchMeta.ts:73-81`):**
```ts
export function formatSignedNumber(value: number, decimals = 3): string {
  if (!Number.isFinite(value)) return '—';
  const threshold = 0.5 * 10 ** -decimals;
  const normalized = Math.abs(value) < threshold ? 0 : value;
  const formatted = normalized.toFixed(decimals);
  return normalized > 0 ? `+${formatted}` : formatted;
}

export function formatPValue(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value > 0 && value < 0.0001) return value.toExponential(1);
  return value.toFixed(4);
}
```

**Current snippet (`frontend/src/bench/ScientificBench.tsx:518,522,825-828,896-898`):**
```tsx
                <strong>{analysis.comparison_pair.multiscale_correlation.long_term_secular_r.toFixed(2)}</strong>
...
                <strong>{analysis.comparison_pair.multiscale_correlation.short_term_detrended_r.toFixed(2)}</strong>
```
```tsx
                  <div className="diag-meta">
                    OLS: <b>{formatSignedNumber(region.regression.slope_per_decade_ols, 4)}</b> · A₀:{' '}
                    <code>{region.regression.intercept_at_start_A0.toFixed(3)}</code> · Δ Model:{' '}
                    <b>{formatSignedNumber(region.regression.cumulative_model_change, 4)} {region.unit}</b>
                  </div>
```
```tsx
                        {' '}· Δ Slope (A − B) ={' '}
                        <b>{formatSignedNumber(analysis.comparison_pair.slope_difference_per_decade, 4)}</b>
```

**Replacement 2 (`frontend/src/bench/ScientificBench.tsx`):**
- On lines `518` and `522`, use `formatSignedNumber(..., 2)`.
- On lines `825–827`:
```tsx
                  <div className="diag-meta">
                    OLS: <b>{formatSignedNumber(region.regression.slope_per_decade_ols, 4)} {region.trend_unit}</b> · A₀:{' '}
                    <code>{formatPointValue(region.regression.intercept_at_start_A0)} {region.unit}</code> · Δ Model:{' '}
                    <b>{formatSignedNumber(region.regression.cumulative_model_change, 4)} {region.unit}</b>
                  </div>
```
- On lines `896–898`:
```tsx
                        {' '}· Δ Slope (A − B) ={' '}
                        <b>
                          {formatSignedNumber(analysis.comparison_pair.slope_difference_per_decade, 4)}{' '}
                          {regions[0]?.trend_unit ?? ''}
                        </b>
```

---

### `AUD-14` — Consistency of `CLOUD_AMT` (`unit: '%'` with `allow_percentage_change: false`)

- **Status:** **[x] Completed and verified on branch `mapa`** (`catalog.ts` + `contractValidator.test.ts`).
- **Severity:** **Polish**
- **File and lines:** `frontend/src/contracts/catalog.ts`: lines **302–307** (backend mirror in `data/services/comparison_service.py:48-54` on branch `data`)
- **Bug and impact:** Although `CLDTOT` (`L290-301`) and `RH2M` (`unit: '%'`, `trend_unit: 'p.p./decade'`) have `allow_percentage_change: false` because they are ratios already expressed in percentage, `CLOUD_AMT` (`is_alias_of: 'CLDTOT'`) is marked with `allow_percentage_change: true`.

**Current snippet (`frontend/src/contracts/catalog.ts:302-307`):**
```ts
  CLOUD_AMT: {
    variable_id: 'CLOUD_AMT', variable_name: 'Cloud Cover', domain: 'Radiation & Clouds',
    source_model: 'CERES_SYN1deg', resolution: CERES_RESOLUTION, grid_origin: CERES_ORIGIN, min_year: 1984,
    scale_type: 'ratio', unit: '%', trend_unit: 'p.p./decade', allow_percentage_change: true, land_only_mask: false,
    is_alias_of: 'CLDTOT',
  },
```

**Replacement:** change `allow_percentage_change: true` to `allow_percentage_change: false` (and later align the same field in `data/services/comparison_service.py` on branch `data`).

---

### `AUD-15` — Fixed Horizontal Plotly Margins on Narrow Screens (`375px`)

- **Status:** **[x] Completed and verified on branch `mapa`** (`ScientificBench.tsx` + `qaProd2Hardening.test.tsx`).
- **Severity:** **Polish**
- **File and lines:** `frontend/src/bench/ScientificBench.tsx`: lines **746** and **783**
- **Bug and impact:** Both charts use `margin: { l: 75, t: 28, r: 75, b: 95 }` (`L746`) and `{ l: 75, t: 42, r: 28, b: 85 }` (`L783`), consuming a fixed `150px` horizontally even inside a narrow `.chart-box` (~`320px` on mobile `375px`), squeezing the plot area even though the axes already have `automargin: true`.

**Current snippet (`frontend/src/bench/ScientificBench.tsx:746` and `783`):**
```tsx
                  margin: { l: 75, t: 28, r: 75, b: 95 },
```
```tsx
                  margin: { l: 75, t: 42, r: 28, b: 85 },
```

**Replacement:** reduce fixed horizontal margins so `automargin: true` manages label breathing room without strangling the chart at `375px`:
```tsx
                  margin: { l: 48, t: 28, r: 44, b: 85 },
```
```tsx
                  margin: { l: 48, t: 42, r: 20, b: 78 },
```

---

## 3. Ready-to-Copy-and-Paste Prompt (`PROD-2` — Branch `frontend`)

```text
Work on branch `frontend` applying in batch the surgical fixes for the 10 items documented in `PROD2_QA_HANDOFF.md` (`AUD-01`, `AUD-02`, `AUD-03`, `AUD-05`, `AUD-10`, `AUD-11`, `AUD-12`, `AUD-13`, `AUD-14`, `AUD-15`), WITHOUT modifying `MapWorkspace.tsx` or `gridGeometry.ts` (exclusive to `PROD-1`):

1. `frontend/src/App.tsx`:
   - (`AUD-01`) Raise `zIndex` of `comboboxProps` and both `popoverProps` from `1100` to `1300` so they stay above `.workspace > aside` (`1200`) and `.drawer-backdrop` (`1150`) on mobile.
   - (`AUD-02`) Call `analysisControllerRef.current?.abort(...)` in the invalidation `useEffect` (`[variableA, variableB, start, end, regionA, regionB]`) and check `if (controller.signal.aborted) return;` right after `await getRegionData(...)` before `setAnalysis`/`setAnalyzedAt`/`setTab`.
   - (`AUD-05`) Keep `<MapWorkspace>` mounted when `tab === 'bench'` by wrapping it in `<div style={{ display: tab === 'map' ? 'contents' : 'none' }}>` to preserve `sameLocation` (`A=B`) and re-snap when switching tabs or variables without conflicting with `MapWorkspace.tsx`.

2. `frontend/src/services/sessionState.ts` + `frontend/src/bench/ScientificBench.tsx`:
   - (`AUD-03`) Validate complete `GridCell` and catalog-compatible `source_model` in `isValidRegion`, validate `startMonth`/`endMonth` with `/^\d{4}-(0[1-9]|1[0-2])$/` in `loadPersistedSession`, and guard `firstDate`/`lastDate` in `ScientificBench.tsx` against invalid month strings.

3. `frontend/src/contracts/contractValidator.ts` + `frontend/src/contracts/catalog.ts`:
   - (`AUD-10`) Validate `unit`, `trend_unit` (forbidding `%` on `interval` variables), all finite fields of `regression` (`intercept_at_start_A0`, `slope_ci95_*`, `cumulative_model_change`, `quadratic_acceleration_B2`, `regime_shape`), `correlation_and_coupling.*`, `significance.confidence_tier`, and `outliers_mahalanobis`.
   - (`AUD-14`) Change `CLOUD_AMT.allow_percentage_change` to `false` in `catalog.ts` (flag equivalent mirror in `data/services/comparison_service.py` on branch `data`).

4. `frontend/src/bench/benchMeta.ts` + `frontend/src/bench/ScientificBench.tsx` + `frontend/src/bench.css`:
   - (`AUD-10` UI) Add safe fallbacks for `CONFIDENCE_LABELS`, `REGIME_LABELS`, and `.toFixed(...)` in the bench.
   - (`AUD-11`) Add `min-width: 0` on `.diag-card`/`.diag-meta` and `overflow-wrap: anywhere; word-break: break-word;` on `.diag-meta code`.
   - (`AUD-12`) Add `flex-wrap: wrap` on `.map-status`, adjust `.map-message`, `.map-legend`, and `.leaflet-control-layers-expanded` under `@media (max-width: 700px)`.
   - (`AUD-13`) Normalize `-0` (`Math.abs(v) < 0.5 * 10 ** -decimals`) and `!Number.isFinite` in `formatSignedNumber`/`formatPValue`, use `formatSignedNumber` in `r_global`/`r_detrended`, and display units in `OLS`, `A₀`, and `Δ Slope (A − B)`.
   - (`AUD-15`) Reduce fixed horizontal margins of both `<Plot>` (`l: 48, r: 44` / `l: 48, r: 20`) while keeping `automargin: true`.

5. Create/update unit tests covering corrupted `sessionState.ts` (`AUD-03`), `contractValidator.ts` (`AUD-10`), `formatSignedNumber` (`AUD-13`), and `ScientificBench.tsx` mobile/fallbacks. Run `npx tsc --noEmit`, `npx vitest run`, `npm run verify:offline`, and `npm run build` in `frontend/` before committing.
```
