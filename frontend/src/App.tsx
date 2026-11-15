import environmentalFamilies from './contracts/environmentalFamilies.json';
import { Select, TextInput } from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { useEffect, useRef, useState } from 'react';
import type { RegionAnalysisResponse, RegionSelection, VariableId } from './contracts/types';
import { isValidVariableId, VARIABLE_LIST } from './contracts/catalog';
import type { TrendMode } from './bench/benchMeta';
import { ScientificBench } from './bench/ScientificBench';
import { MapWorkspace } from './map/MapWorkspace';
import { getBackendCatalog, getRegionData } from './services/regionDataAdapter';
import {
  type AppTab,
  type InfoDisplayMode,
  loadPersistedSession,
  savePersistedSession,
  TOUR_STEP_COUNT,
} from './services/sessionState';
import { StoryHub } from './story/StoryHub';
import { materializeStoryPreset, type StoryPreset } from './story/storyPresets';
import { saveTutorialOutcome, shouldAutoOpenTutorial, type TutorialCompletionStatus } from './services/tutorialState';
import { hasOpenMantinePopup, TutorialOverlay } from './tutorial/TutorialOverlay';
import { TUTORIAL_STEPS } from './tutorial/tutorialSteps';
import './bench.css';

const supportedVariables = new Set<string>(VARIABLE_LIST.map(variable => variable.variable_id));
const fallbackVariableOptions = environmentalFamilies.map(({ group, items }) => ({
  group,
  items: items.map(option => ({
    ...option,
    disabled: !supportedVariables.has(option.value),
  })),
}));

const coordinateFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });

function formatRegionCoordinates(region: RegionSelection | null): string {
  const firstCell = region?.cells[0];
  if (!region || !firstCell) return '';
  const { cells } = region;
  const reference = firstCell.lon;
  const latitude = cells.reduce((sum, cell) => sum + cell.lat, 0) / cells.length;
  // Unwrap longitudes near the antimeridian before computing the mean.
  const longitudeOffset = cells.reduce((sum, cell) => sum + (cell.lon - reference + 540) % 360 - 180, 0) / cells.length;
  const longitude = (reference + longitudeOffset + 540) % 360 - 180;
  return `Longitude ${coordinateFormat.format(longitude)}° · Latitude ${coordinateFormat.format(latitude)}°`;
}

export default function App() {
  const [initialSession] = useState(loadPersistedSession);
  const [analysis, setAnalysis] = useState<RegionAnalysisResponse>();
  const [analyzedAt, setAnalyzedAt] = useState<string | null>(null);
  const [variableOptions, setVariableOptions] = useState(fallbackVariableOptions);
  const [catalogError, setCatalogError] = useState('');
  const [tab, setTab] = useState<AppTab>(initialSession.tab);
  const [infoMode, setInfoMode] = useState<InfoDisplayMode>(initialSession.infoMode);
  const [tourStep, setTourStep] = useState<number>(initialSession.tourStep);
  const [tourCompleted, setTourCompleted] = useState<boolean>(initialSession.tourCompleted);
  const [variableA, setVariableA] = useState(initialSession.variableA);
  const [variableB, setVariableB] = useState(initialSession.variableB);
  const [regionA, setRegionA] = useState<RegionSelection | null>(initialSession.regionA);
  const [regionB, setRegionB] = useState<RegionSelection | null>(initialSession.regionB);
  const [sameLocation, setSameLocation] = useState(initialSession.sameLocation);
  const [focusKey, setFocusKey] = useState(0);
  const [startMonth, setStartMonth] = useState(initialSession.startMonth);
  const [endMonth, setEndMonth] = useState(initialSession.endMonth);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const analysisControllerRef = useRef<AbortController | null>(null);
  const analysisSelectionKeyRef = useRef('');

  const [anomaly, setAnomaly] = useState(initialSession.anomaly);
  const [separate, setSeparate] = useState(initialSession.separate);
  const [dual, setDual] = useState(initialSession.dual);
  const [trendMode, setTrendMode] = useState<TrendMode>(initialSession.trendMode);
  const [sidebarOpen, setSidebarOpen] = useState(initialSession.sidebarOpen);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [mapControlsTarget, setMapControlsTarget] = useState<HTMLDivElement | null>(null);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialPending, setTutorialPending] = useState(shouldAutoOpenTutorial);
  const skipTutorialAutoOpenRef = useRef(false);
  const [tutorialStepIndex, setTutorialStepIndex] = useState(0);
  const tutorialTriggerRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusOnTutorialCloseRef = useRef(false);

  const metadataA = VARIABLE_LIST.find(variable => variable.variable_id === variableA);
  const metadataB = VARIABLE_LIST.find(variable => variable.variable_id === variableB);
  const minimumMonth = metadataA && metadataB
    ? Math.max(metadataA.min_year, metadataB.min_year) + '-01'
    : '';
  const maximumMonth = new Date().toISOString().slice(0, 7);
  const start = startMonth >= minimumMonth && startMonth <= maximumMonth ? startMonth : '';
  const end = endMonth >= (start || minimumMonth) && endMonth <= maximumMonth ? endMonth : '';
  const periodReady = Boolean(minimumMonth && start && end);

  const handleVariableAChange = (next: string) => {
    if (next !== variableA) {
      setRegionA(null);
    }
    setVariableA(next);
  };

  const handleVariableBChange = (next: string) => {
    if (next !== variableB) {
      setRegionB(null);
    }
    setVariableB(next);
  };

  useEffect(() => {
    savePersistedSession({
      variableA,
      variableB,
      startMonth,
      endMonth,
      regionA,
      regionB,
      tab,
      infoMode,
      tourStep,
      tourCompleted,
      sameLocation,
      anomaly,
      separate,
      dual,
      trendMode,
      sidebarOpen,
    });
  }, [
    variableA,
    variableB,
    startMonth,
    endMonth,
    regionA,
    regionB,
    tab,
    infoMode,
    tourStep,
    tourCompleted,
    sameLocation,
    anomaly,
    separate,
    dual,
    trendMode,
    sidebarOpen,
  ]);

  const selectionKey = `${variableA}|${variableB}|${start}|${end}|${regionA?.region_id ?? ''}|${regionB?.region_id ?? ''}`;

  // A query launched from a case preset already uses the selection key it applies.
  useEffect(() => {
    if (analysisSelectionKeyRef.current === selectionKey) return;
    analysisSelectionKeyRef.current = '';
    analysisControllerRef.current?.abort('Selection changed during query.');
    setAnalysis(undefined);
    setAnalyzedAt(null);
    setAnalysisError('');
  }, [selectionKey]);

  useEffect(() => {
    const controller = new AbortController();
    getBackendCatalog(controller.signal)
      .then(catalog => setVariableOptions(catalog.families.map(family => ({
        group: family.name,
        items: family.variables.map(variable => ({
          value: variable.code,
          label: variable.ui_name,
          disabled: !isValidVariableId(variable.code),
        })),
      }))))
      .catch(catalogRequestError => {
        if (!controller.signal.aborted) {
          setCatalogError(catalogRequestError instanceof Error ? catalogRequestError.message : 'Catalog unavailable.');
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!mobileDrawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || tutorialOpen || hasOpenMantinePopup(event.target)) return;
      setMobileDrawerOpen(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [mobileDrawerOpen, tutorialOpen]);

  useEffect(() => () => analysisControllerRef.current?.abort(), []);

  useEffect(() => {
    if (tab !== 'map') return;
    if (skipTutorialAutoOpenRef.current) {
      skipTutorialAutoOpenRef.current = false;
      return;
    }
    if (!tutorialPending) return;
    setTutorialPending(false);
    setTutorialStepIndex(0);
    setTutorialOpen(true);
  }, [tab, tutorialPending]);

  useEffect(() => {
    if (tutorialOpen && (tab === 'story' || tab === 'info')) {
      setTutorialOpen(false);
    }
  }, [tab, tutorialOpen]);

  const analysisRef = useRef<RegionAnalysisResponse | undefined>(analysis);
  analysisRef.current = analysis;

  useEffect(() => {
    if (!tutorialOpen) return;
    const step = TUTORIAL_STEPS[tutorialStepIndex];
    if (!step) return;
    const resolved = step.resolveTarget({ hasAnalysis: Boolean(analysisRef.current) });
    if (resolved.requiredTab) {
      setTab(resolved.requiredTab);
    }
    const isMobile =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(max-width: 700px)').matches
        : false;
    if (isMobile) {
      setMobileDrawerOpen(Boolean(resolved.requiresSidebar));
    }
  }, [tutorialOpen, tutorialStepIndex]);

  const prevAnalysisForTutorialRef = useRef<RegionAnalysisResponse | undefined>(analysis);
  useEffect(() => {
    const previousAnalysis = prevAnalysisForTutorialRef.current;
    prevAnalysisForTutorialRef.current = analysis;
    if (!tutorialOpen || !analysis || analysis === previousAnalysis) return;
    if (TUTORIAL_STEPS[tutorialStepIndex]?.id === 'run-analysis') {
      const benchIndex = TUTORIAL_STEPS.findIndex(step => step.id === 'scientific-bench');
      if (benchIndex >= 0) {
        setTutorialStepIndex(benchIndex);
      }
    }
  }, [tutorialOpen, tutorialStepIndex, analysis]);

  function openTutorialFromStart() {
    setTutorialPending(false);
    restoreFocusOnTutorialCloseRef.current = true;
    setTutorialStepIndex(0);
    setTutorialOpen(true);
  }

  function finishTutorial(status: TutorialCompletionStatus, lastStepId: string) {
    saveTutorialOutcome(status, lastStepId);
    setTutorialOpen(false);
    setMobileDrawerOpen(false);
    if (restoreFocusOnTutorialCloseRef.current) {
      restoreFocusOnTutorialCloseRef.current = false;
      requestAnimationFrame(() => tutorialTriggerRef.current?.focus({ preventScroll: true }));
    }
  }

  async function runAnalysisRequest(params: {
    readonly variableA: string;
    readonly variableB: string;
    readonly regionA: RegionSelection;
    readonly regionB: RegionSelection;
    readonly startDate: string;
    readonly endDate: string;
  }) {
    analysisSelectionKeyRef.current =
      `${params.variableA}|${params.variableB}|${params.startDate}|${params.endDate}|${params.regionA.region_id}|${params.regionB.region_id}`;
    analysisControllerRef.current?.abort();
    const controller = new AbortController();
    analysisControllerRef.current = controller;
    setIsAnalyzing(true);
    setAnalysisError('');

    try {
      const result = await getRegionData({
        variable: params.variableA as VariableId,
        variableB: params.variableB as VariableId,
        region: params.regionA,
        regionB: params.regionB,
        startDate: params.startDate,
        endDate: params.endDate,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setAnalysis(result);
      setAnalyzedAt(new Date().toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'medium' }));
      setTab('bench');
    } catch (requestError) {
      if (!controller.signal.aborted) {
        analysisSelectionKeyRef.current = '';
        setAnalysisError(requestError instanceof Error ? requestError.message : 'Could not analyze selection.');
      }
    } finally {
      if (analysisControllerRef.current === controller) {
        analysisControllerRef.current = null;
        setIsAnalyzing(false);
      }
    }
  }

  async function analyzeSelection() {
    if (!variableA || !variableB || !regionA || !regionB || !periodReady) return;
    await runAnalysisRequest({
      variableA,
      variableB,
      regionA,
      regionB,
      startDate: start,
      endDate: end,
    });
  }

  function handleOpenMoreInfoFull() {
    setInfoMode('full');
    setTab('info');
  }

  function handleStartTour() {
    if (tourCompleted) {
      setTourStep(0);
      setTourCompleted(false);
    }
    setInfoMode('tour');
    setTab('info');
  }

  function handleTourStepChange(nextStep: number) {
    const clamped = Math.max(0, Math.min(TOUR_STEP_COUNT - 1, nextStep));
    setTourStep(clamped);
    if (clamped >= TOUR_STEP_COUNT - 1) {
      setTourCompleted(true);
    }
  }

  function handleOpenFreeMap(options?: { readonly sameLocation?: boolean }) {
    if (options?.sameLocation !== undefined) {
      setSameLocation(options.sameLocation);
    }
    if (tab === 'info' && infoMode === 'tour' && tourStep >= TOUR_STEP_COUNT - 1) {
      setTourCompleted(true);
      setInfoMode('full');
    }
    setTab('map');
  }

  function handleLaunchPreset(preset: StoryPreset, options: { readonly autoAnalyze: boolean }) {
    const materialized = materializeStoryPreset(preset, maximumMonth);
    setVariableA(materialized.variableA);
    setVariableB(materialized.variableB);
    setStartMonth(materialized.startMonth);
    setEndMonth(materialized.endMonth);
    setSameLocation(materialized.sameLocation);
    setRegionA(materialized.regionA);
    setRegionB(materialized.regionB);
    setAnomaly(preset.recommendedBench.anomaly);
    setSeparate(preset.recommendedBench.separate);
    setDual(preset.recommendedBench.dual);
    setTrendMode(preset.recommendedBench.trendMode);
    setFocusKey(prev => prev + 1);
    if (tab === 'info' && infoMode === 'tour' && tourStep >= TOUR_STEP_COUNT - 1) {
      setTourCompleted(true);
      setInfoMode('full');
    }
    skipTutorialAutoOpenRef.current = options.autoAnalyze;
    setTab('map');

    if (options.autoAnalyze) {
      void runAnalysisRequest({
        variableA: materialized.variableA,
        variableB: materialized.variableB,
        regionA: materialized.regionA,
        regionB: materialized.regionB,
        startDate: materialized.startMonth,
        endDate: materialized.endMonth,
      });
    }
  }

  function cancelAnalysis() {
    analysisControllerRef.current?.abort('Query canceled by user.');
  }

  const variablesReady = Boolean(variableA && variableB);
  const regionsReady = Boolean(regionA && regionB);
  const currentStep = !variablesReady ? 0 : !periodReady ? 1 : !regionsReady ? 2 : 3;
  const workflowSteps = [
    { label: 'Variables', complete: variablesReady },
    { label: 'Period', complete: periodReady },
    { label: 'Regions', complete: regionsReady },
    { label: 'Analysis', complete: Boolean(analysis) },
  ];

  const currentTutorialStep = tutorialOpen ? TUTORIAL_STEPS[tutorialStepIndex] : undefined;
  const resolvedTutorialTarget = currentTutorialStep?.resolveTarget({ hasAnalysis: Boolean(analysis) });
  const effectiveSidebarOpen = sidebarOpen || Boolean(tutorialOpen && resolvedTutorialTarget?.requiresSidebar);

  const desktopSidebarToggle = (
      <button
        type="button"
        className={`sidebar-toggle desktop-only${effectiveSidebarOpen ? '' : ' is-collapsed-icon'}`}
        data-tour="close-variables"
        aria-expanded={effectiveSidebarOpen}
        aria-controls="variables-sidebar"
        aria-label={effectiveSidebarOpen ? undefined : 'Open variables panel'}
        title={effectiveSidebarOpen ? 'Collapse variables panel' : 'Variables'}
        onClick={() => setSidebarOpen(prev => !prev)}
      >
        {effectiveSidebarOpen ? (
          '« Collapse panel'
        ) : (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <path d="M9 3v18" />
            <path className="rail-chevron" d="M13.5 9.5 16 12l-2.5 2.5" />
          </svg>
        )}
      </button>
  );
  const mobileSidebarToggle = (
      <button
        type="button"
        className="sidebar-toggle mobile-only"
        aria-expanded={mobileDrawerOpen}
        aria-controls="variables-sidebar"
        onClick={() => setMobileDrawerOpen(true)}
      >
        Variables & period
      </button>
  );

  return (
    <main className={tab === 'story' || tab === 'info' ? 'story-mode' : ''}>
      <header className="brand-header">
        <div className="brand-identity">
          <h1 className="brand-mark">
            <img
              className="brand-logo"
              src="/flipflop-34-logo.jpeg"
              alt="Flipflop 34"
            />
          </h1>
        </div>
        <div className="header-actions">
          {tab === 'map' && (
            <button
              ref={tutorialTriggerRef}
              type="button"
              className="tutorial-trigger"
              aria-label="Interactive tutorial (?)"
              aria-expanded={tutorialOpen}
              title="Open step-by-step guided tutorial"
              onClick={openTutorialFromStart}
            >
              <span className="tutorial-trigger-mark" aria-hidden="true">?</span>
              <span className="tutorial-trigger-label">Tutorial</span>
            </button>
          )}
          <nav className="primary-nav" aria-label="Primary navigation">
            <button type="button" aria-current={tab === 'story' ? 'page' : undefined} onClick={() => setTab('story')}>
              Home
            </button>
            <button type="button" aria-current={tab === 'info' ? 'page' : undefined} onClick={handleOpenMoreInfoFull}>
              Overview
            </button>
            <button type="button" aria-current={tab === 'map' ? 'page' : undefined} onClick={() => setTab('map')}>
              Map
            </button>
            <button type="button" data-tour="tab-bench" aria-current={tab === 'bench' ? 'page' : undefined} onClick={() => setTab('bench')}>
              Scientific Bench
            </button>
          </nav>
        </div>
      </header>
      {tab === 'story' || tab === 'info' ? (
        <StoryHub
          page={tab === 'info' ? 'info' : 'hero'}
          infoMode={infoMode}
          tourStep={tourStep}
          hasExistingAnalysis={Boolean(analysis)}
          onOpenFreeMap={handleOpenFreeMap}
          onOpenMoreInfo={handleStartTour}
          onTourStepChange={handleTourStepChange}
          onOpenBench={() => setTab('bench')}
          onLaunchPreset={handleLaunchPreset}
        />
      ) : (
        <>
          <div className={`workspace ${effectiveSidebarOpen ? '' : 'sidebar-collapsed'}`}>
            {mobileDrawerOpen && (
              <div
                className="drawer-backdrop"
                aria-hidden="true"
                onClick={() => setMobileDrawerOpen(false)}
              />
            )}
            <aside
              id="variables-sidebar"
              className={mobileDrawerOpen ? 'drawer-open' : ''}
              aria-label="Variables and period catalog"
            >
              <div className="sidebar-head">
                <h2>Variables</h2>
                {desktopSidebarToggle}
                <button
                  type="button"
                  className="drawer-close"
                  data-tour="close-variables"
                  aria-label="Close variables panel"
                  onClick={() => setMobileDrawerOpen(false)}
                >
                  ×
                </button>
              </div>
              <div data-tour="sidebar-controls">
                {catalogError && <p className="catalog-warning" role="alert">{catalogError} Using local catalog.</p>}
                {([
                  { slot: 'A', symbol: 'X', region: regionA, value: variableA, onChange: handleVariableAChange },
                  { slot: 'B', symbol: 'Y', region: regionB, value: variableB, onChange: handleVariableBChange },
                ]).map(({ slot, symbol, region, value, onChange }) => {
                  const locationValue = formatRegionCoordinates(region);
                  return (
                    <div key={slot} className={`variable-local-pair pair-${slot.toLowerCase()}`}>
                      <Select className={`variable-picker variable-picker-${slot.toLowerCase()}`}
                        classNames={{ input: 'selection-input', dropdown: 'selection-dropdown', option: 'selection-option' }}
                        label={<span className={`slot-label slot-${slot.toLowerCase()}`}>Variable {symbol}</span>} placeholder="Search variable"
                        data={variableOptions} searchable clearable clearSectionMode="clear"
                        clearButtonProps={{ 'aria-label': 'Clear variable ' + symbol }} nothingFoundMessage="No variables found"
                        value={value || null} onChange={id => onChange(id ?? '')}
                        comboboxProps={{ width: 310, position: 'bottom-start', withinPortal: true, zIndex: tutorialOpen ? 1325 : 1300 }}
                        maxDropdownHeight={340} />
                      <TextInput
                        readOnly
                        className={`variable-picker variable-picker-${slot.toLowerCase()} location-picker`}
                        classNames={{ input: 'selection-input' }}
                        label={<span className={`slot-label slot-${slot.toLowerCase()}`}>Location {slot}</span>}
                        value={locationValue}
                        placeholder=""
                        title={locationValue || undefined}
                      />
                    </div>
                  );
                })}
                <fieldset className="period-picker" disabled={!minimumMonth}>
                  <legend><span>Analysis period</span></legend>
                  <MonthPickerInput className="variable-picker" classNames={{ input: 'selection-input' }} label="Start month" placeholder="Select month"
                    locale="en" valueFormat="MMMM YYYY" clearable disabled={!minimumMonth}
                    popoverProps={{ withinPortal: true, zIndex: tutorialOpen ? 1325 : 1300 }}
                    minDate={minimumMonth ? minimumMonth + '-01' : undefined} maxDate={maximumMonth + '-01'}
                    value={start ? start + '-01' : null} onChange={value => setStartMonth(value?.slice(0, 7) ?? '')} />
                  <MonthPickerInput className="variable-picker" classNames={{ input: 'selection-input' }} label="End month" placeholder="Select month"
                    locale="en" valueFormat="MMMM YYYY" clearable disabled={!minimumMonth}
                    popoverProps={{ withinPortal: true, zIndex: tutorialOpen ? 1325 : 1300 }}
                    minDate={minimumMonth ? (start || minimumMonth) + '-01' : undefined} maxDate={maximumMonth + '-01'}
                    value={end ? end + '-01' : null} onChange={value => setEndMonth(value?.slice(0, 7) ?? '')} />
                </fieldset>
              </div>
              {tab === 'map' && <div ref={setMapControlsTarget} className="sidebar-map-controls-host" />}
            </aside>
            {!effectiveSidebarOpen && (
              <div className="sidebar-collapsed-rail desktop-only" data-tour="open-variables">
                {desktopSidebarToggle}
              </div>
            )}
            <div className="exploration">
              <ol className="workflow-progress" data-tour="workflow-progress" aria-label="Investigation steps">
                {workflowSteps.map((step, index) => (
                  <li key={step.label} className={step.complete ? 'complete' : index === currentStep ? 'current' : ''}
                    aria-current={index === currentStep && !step.complete ? 'step' : undefined}>
                    <span>
                      {step.complete ? (
                        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
                          <path
                            d="M2.4 6.3L4.9 8.8L9.6 3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.9"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : (
                        index + 1
                      )}
                    </span>
                    <strong>{step.label}</strong>
                  </li>
                ))}
              </ol>
              <div className={mobileDrawerOpen ? 'map-panel-toggle drawer-active' : 'map-panel-toggle'}>
                {mobileSidebarToggle}
              </div>
              <div className={tab === 'map' ? 'map-tab-shell' : 'map-tab-shell is-hidden'}>
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
                  sameLocation={sameLocation}
                  onSameLocationChange={setSameLocation}
                  focusKey={focusKey}
                  isAnalyzing={isAnalyzing}
                  analysisError={analysisError}
                  onAnalyze={analyzeSelection}
                  onCancel={cancelAnalysis}
                  controlsTarget={tab === 'map' ? mapControlsTarget : null}
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
            </div>
          </div>
        </>
      )}
      <TutorialOverlay
        open={tutorialOpen}
        steps={TUTORIAL_STEPS}
        stepIndex={tutorialStepIndex}
        liveContext={{
          hasAnalysis: Boolean(analysis),
          variableA,
          variableB,
          startMonth: start,
          endMonth: end,
          periodReady,
          regionACells: regionA?.cells.length ?? 0,
          regionBCells: regionB?.cells.length ?? 0,
          readyToAnalyze: Boolean(variableA && variableB && regionA && regionB && periodReady),
          isAnalyzing,
        }}
        onStepChange={setTutorialStepIndex}
        onComplete={lastStepId => finishTutorial('completed', lastStepId)}
        onSkip={lastStepId => finishTutorial('skipped', lastStepId)}
      />
    </main>
  );
}
