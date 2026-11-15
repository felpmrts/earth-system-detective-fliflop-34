import environmentalFamilies from './contracts/environmentalFamilies.json';
import { Select } from '@mantine/core';
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
import { materializeStoryPreset, STORY_PRESETS, type StoryPreset } from './story/storyPresets';
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
  const [activePresetId, setActivePresetId] = useState<string | null>(initialSession.activePresetId);
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
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialPending, setTutorialPending] = useState(shouldAutoOpenTutorial);
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
      setActivePresetId(null);
    }
    setVariableA(next);
  };

  const handleVariableBChange = (next: string) => {
    if (next !== variableB) {
      setRegionB(null);
      setActivePresetId(null);
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
      activePresetId,
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
    activePresetId,
    anomaly,
    separate,
    dual,
    trendMode,
    sidebarOpen,
  ]);

  const selectionKey = `${variableA}|${variableB}|${start}|${end}|${regionA?.region_id ?? ''}|${regionB?.region_id ?? ''}`;

  // Uma consulta iniciada por um caso já usa a chave da seleção que ele aplica.
  useEffect(() => {
    if (analysisSelectionKeyRef.current === selectionKey) return;
    analysisSelectionKeyRef.current = '';
    analysisControllerRef.current?.abort('Seleção alterada durante a consulta.');
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
          setCatalogError(catalogRequestError instanceof Error ? catalogRequestError.message : 'Catálogo indisponível.');
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
    if (!tutorialPending || tab !== 'map' || activePresetId) return;
    setTutorialPending(false);
    setTutorialStepIndex(0);
    setTutorialOpen(true);
  }, [tab, tutorialPending, activePresetId]);

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
      setAnalyzedAt(new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }));
      setTab('bench');
    } catch (requestError) {
      if (!controller.signal.aborted) {
        analysisSelectionKeyRef.current = '';
        setAnalysisError(requestError instanceof Error ? requestError.message : 'Não foi possível analisar a seleção.');
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
      setActivePresetId(null);
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
    setActivePresetId(preset.id);
    setAnomaly(preset.recommendedBench.anomaly);
    setSeparate(preset.recommendedBench.separate);
    setDual(preset.recommendedBench.dual);
    setTrendMode(preset.recommendedBench.trendMode);
    setFocusKey(prev => prev + 1);
    if (tab === 'info' && infoMode === 'tour' && tourStep >= TOUR_STEP_COUNT - 1) {
      setTourCompleted(true);
      setInfoMode('full');
    }
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
    analysisControllerRef.current?.abort('Consulta cancelada pelo usuário.');
  }

  const activePreset = activePresetId ? STORY_PRESETS.find(preset => preset.id === activePresetId) ?? null : null;

  const variablesReady = Boolean(variableA && variableB);
  const regionsReady = Boolean(regionA && regionB);
  const currentStep = !variablesReady ? 0 : !periodReady ? 1 : !regionsReady ? 2 : 3;
  const workflowSteps = [
    { label: 'Variáveis', complete: variablesReady },
    { label: 'Período', complete: periodReady },
    { label: 'Regiões', complete: regionsReady },
    { label: 'Análise', complete: Boolean(analysis) },
  ];

  const currentTutorialStep = tutorialOpen ? TUTORIAL_STEPS[tutorialStepIndex] : undefined;
  const resolvedTutorialTarget = currentTutorialStep?.resolveTarget({ hasAnalysis: Boolean(analysis) });
  const effectiveSidebarOpen = sidebarOpen || Boolean(tutorialOpen && resolvedTutorialTarget?.requiresSidebar);

  return (
    <main className={tab === 'story' || tab === 'info' ? 'story-mode' : ''}>
      <header className="brand-header">
        <div className="brand-identity">
          <div>
            <h1>Flipflop 34</h1>
            <p className="brand-tagline">Earth System Trend Detective · Liberdade Planetária</p>
          </div>
        </div>
        <div className="header-actions">
          {tab === 'map' && (
            <button
              ref={tutorialTriggerRef}
              type="button"
              className="tutorial-trigger"
              aria-label="Tutorial interativo (?)"
              aria-expanded={tutorialOpen}
              title="Abrir tutorial guiado passo a passo"
              onClick={openTutorialFromStart}
            >
              <span className="tutorial-trigger-mark" aria-hidden="true">?</span>
              <span className="tutorial-trigger-label">Tutorial</span>
            </button>
          )}
          <nav className="primary-nav" aria-label="Navegação principal">
            <button type="button" aria-current={tab === 'story' ? 'page' : undefined} onClick={() => setTab('story')}>
              Início
            </button>
            <button type="button" aria-current={tab === 'info' ? 'page' : undefined} onClick={handleOpenMoreInfoFull}>
              Informações Gerais
            </button>
            <button type="button" aria-current={tab === 'map' ? 'page' : undefined} onClick={() => setTab('map')}>
              Mapa
            </button>
            <button type="button" data-tour="tab-bench" aria-current={tab === 'bench' ? 'page' : undefined} onClick={() => setTab('bench')}>
              Bancada científica
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
          <ol className="workflow-progress" data-tour="workflow-progress" aria-label="Etapas da investigação">
            {workflowSteps.map((step, index) => (
              <li key={step.label} className={step.complete ? 'complete' : index === currentStep ? 'current' : ''}
                aria-current={index === currentStep && !step.complete ? 'step' : undefined}>
                <span>{step.complete ? '✓' : index + 1}</span>
                <strong>{step.label}</strong>
              </li>
            ))}
          </ol>
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
              data-tour="sidebar-controls"
              className={mobileDrawerOpen ? 'drawer-open' : ''}
              aria-label="Catálogo de variáveis e período"
            >
              <div className="sidebar-head">
                <h2>Variáveis</h2>
                <button
                  type="button"
                  className="drawer-close"
                  aria-label="Fechar painel de variáveis"
                  onClick={() => setMobileDrawerOpen(false)}
                >
                  ×
                </button>
              </div>
              {catalogError && <p className="catalog-warning" role="alert">{catalogError} Usando catálogo local.</p>}
              {([
                { slot: 'A', value: variableA, onChange: handleVariableAChange },
                { slot: 'B', value: variableB, onChange: handleVariableBChange },
              ]).map(({ slot, value, onChange }) => (
                <Select key={slot} className={`variable-picker variable-picker-${slot.toLowerCase()}`}
                  classNames={{ input: 'selection-input', dropdown: 'selection-dropdown', option: 'selection-option' }}
                  label={<span className={`slot-label slot-${slot.toLowerCase()}`}><b>{slot}</b> Variável {slot}</span>} placeholder="Buscar variável"
                  data={variableOptions} searchable clearable clearSectionMode="clear"
                  clearButtonProps={{ 'aria-label': 'Limpar variável ' + slot }} nothingFoundMessage="Nenhuma variável encontrada"
                  value={value || null} onChange={id => onChange(id ?? '')}
                  comboboxProps={{ width: 310, position: 'bottom-start', withinPortal: true, zIndex: tutorialOpen ? 1325 : 1300 }}
                  maxDropdownHeight={340} />
              ))}
              <fieldset className="period-picker" disabled={!minimumMonth}>
                <legend>Período</legend>
                <MonthPickerInput className="variable-picker" classNames={{ input: 'selection-input' }} label="Mês inicial" placeholder="Selecione o mês"
                  locale="pt-br" valueFormat="MMMM [de] YYYY" clearable disabled={!minimumMonth}
                  popoverProps={{ withinPortal: true, zIndex: tutorialOpen ? 1325 : 1300 }}
                  minDate={minimumMonth ? minimumMonth + '-01' : undefined} maxDate={maximumMonth + '-01'}
                  value={start ? start + '-01' : null} onChange={value => setStartMonth(value?.slice(0, 7) ?? '')} />
                <MonthPickerInput className="variable-picker" classNames={{ input: 'selection-input' }} label="Mês final" placeholder="Selecione o mês"
                  locale="pt-br" valueFormat="MMMM [de] YYYY" clearable disabled={!minimumMonth}
                  popoverProps={{ withinPortal: true, zIndex: tutorialOpen ? 1325 : 1300 }}
                  minDate={minimumMonth ? (start || minimumMonth) + '-01' : undefined} maxDate={maximumMonth + '-01'}
                  value={end ? end + '-01' : null} onChange={value => setEndMonth(value?.slice(0, 7) ?? '')} />
              </fieldset>
            </aside>
            <div className="exploration">
              <div className="exploration-toolbar" role="toolbar" aria-label="Controles do painel">
                <button
                  type="button"
                  className="sidebar-toggle desktop-only"
                  aria-expanded={effectiveSidebarOpen}
                  aria-controls="variables-sidebar"
                  onClick={() => setSidebarOpen(prev => !prev)}
                >
                  {effectiveSidebarOpen ? '« Recolher painel' : '» Variáveis'}
                </button>
                <button
                  type="button"
                  className="sidebar-toggle mobile-only"
                  aria-expanded={mobileDrawerOpen}
                  aria-controls="variables-sidebar"
                  onClick={() => setMobileDrawerOpen(true)}
                >
                  Variáveis e período
                </button>
                <button
                  type="button"
                  className="sidebar-toggle"
                  onClick={() => setTab('story')}
                >
                  ← Ver História &amp; Casos
                </button>
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
                  activePreset={activePreset}
                  onClearPreset={() => setActivePresetId(null)}
                  onOpenStory={() => setTab('story')}
                  focusKey={focusKey}
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
