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
import { loadPersistedSession, savePersistedSession } from './services/sessionState';
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
  const [tab, setTab] = useState<'map' | 'bench'>(initialSession.tab);
  const [variableA, setVariableA] = useState(initialSession.variableA);
  const [variableB, setVariableB] = useState(initialSession.variableB);
  const [regionA, setRegionA] = useState<RegionSelection | null>(initialSession.regionA);
  const [regionB, setRegionB] = useState<RegionSelection | null>(initialSession.regionB);
  const [startMonth, setStartMonth] = useState(initialSession.startMonth);
  const [endMonth, setEndMonth] = useState(initialSession.endMonth);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const analysisControllerRef = useRef<AbortController | null>(null);

  const [anomaly, setAnomaly] = useState(initialSession.anomaly);
  const [separate, setSeparate] = useState(initialSession.separate);
  const [dual, setDual] = useState(initialSession.dual);
  const [trendMode, setTrendMode] = useState<TrendMode>(initialSession.trendMode);
  const [sidebarOpen, setSidebarOpen] = useState(initialSession.sidebarOpen);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

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
    if (next !== variableA) setRegionA(null);
    setVariableA(next);
  };

  const handleVariableBChange = (next: string) => {
    if (next !== variableB) setRegionB(null);
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
      anomaly,
      separate,
      dual,
      trendMode,
      sidebarOpen,
    });
  }, [variableA, variableB, startMonth, endMonth, regionA, regionB, tab, anomaly, separate, dual, trendMode, sidebarOpen]);

  // Qualquer mudança no formulário espacial/temporal invalida a análise anterior.
  useEffect(() => {
    setAnalysis(undefined);
    setAnalyzedAt(null);
    setAnalysisError('');
  }, [variableA, variableB, start, end, regionA, regionB]);

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
      if (event.key === 'Escape') setMobileDrawerOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileDrawerOpen]);

  useEffect(() => () => analysisControllerRef.current?.abort(), []);

  async function analyzeSelection() {
    if (!variableA || !variableB || !regionA || !regionB || !periodReady) return;

    analysisControllerRef.current?.abort();
    const controller = new AbortController();
    analysisControllerRef.current = controller;
    setIsAnalyzing(true);
    setAnalysisError('');

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
      setAnalyzedAt(new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }));
      setTab('bench');
    } catch (requestError) {
      if (!controller.signal.aborted) {
        setAnalysisError(requestError instanceof Error ? requestError.message : 'Não foi possível analisar a seleção.');
      }
    } finally {
      if (analysisControllerRef.current === controller) {
        analysisControllerRef.current = null;
        setIsAnalyzing(false);
      }
    }
  }

  function cancelAnalysis() {
    analysisControllerRef.current?.abort('Consulta cancelada pelo usuário.');
  }

  const variablesReady = Boolean(variableA && variableB);
  const regionsReady = Boolean(regionA && regionB);
  const currentStep = !variablesReady ? 0 : !periodReady ? 1 : !regionsReady ? 2 : 3;
  const workflowSteps = [
    { label: 'Variáveis', complete: variablesReady },
    { label: 'Período', complete: periodReady },
    { label: 'Regiões', complete: regionsReady },
    { label: 'Análise', complete: Boolean(analysis) },
  ];

  return (
    <main>
      <header className="brand-header">
        <img className="brand-logo" src="/flipflop-34-logo.jpeg" alt="" aria-hidden="true" />
        <h1>Project Flipflop 34</h1>
      </header>
      <ol className="workflow-progress" aria-label="Etapas da investigação">
        {workflowSteps.map((step, index) => (
          <li key={step.label} className={step.complete ? 'complete' : index === currentStep ? 'current' : ''}
            aria-current={index === currentStep && !step.complete ? 'step' : undefined}>
            <span>{step.complete ? '✓' : index + 1}</span>
            <strong>{step.label}</strong>
          </li>
        ))}
      </ol>
      <div className={`workspace ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
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
              comboboxProps={{ width: 310, position: 'bottom-start', withinPortal: true, zIndex: 1100 }}
              maxDropdownHeight={340} />
          ))}
          <fieldset className="period-picker" disabled={!minimumMonth}>
            <legend>Período</legend>
            <MonthPickerInput className="variable-picker" classNames={{ input: 'selection-input' }} label="Mês inicial" placeholder="Selecione o mês"
              locale="pt-br" valueFormat="MMMM [de] YYYY" clearable disabled={!minimumMonth}
              popoverProps={{ withinPortal: true, zIndex: 1100 }}
              minDate={minimumMonth ? minimumMonth + '-01' : undefined} maxDate={maximumMonth + '-01'}
              value={start ? start + '-01' : null} onChange={value => setStartMonth(value?.slice(0, 7) ?? '')} />
            <MonthPickerInput className="variable-picker" classNames={{ input: 'selection-input' }} label="Mês final" placeholder="Selecione o mês"
              locale="pt-br" valueFormat="MMMM [de] YYYY" clearable disabled={!minimumMonth}
              popoverProps={{ withinPortal: true, zIndex: 1100 }}
              minDate={minimumMonth ? (start || minimumMonth) + '-01' : undefined} maxDate={maximumMonth + '-01'}
              value={end ? end + '-01' : null} onChange={value => setEndMonth(value?.slice(0, 7) ?? '')} />
          </fieldset>
        </aside>
        <div className="exploration">
          <nav aria-label="Área de trabalho">
            <button
              type="button"
              className="sidebar-toggle desktop-only"
              aria-expanded={sidebarOpen}
              aria-controls="variables-sidebar"
              onClick={() => setSidebarOpen(prev => !prev)}
            >
              {sidebarOpen ? '« Recolher painel' : '» Variáveis'}
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
            <button type="button" aria-current={tab === 'map' ? 'page' : undefined} onClick={() => setTab('map')}>Mapa</button>
            <button type="button" aria-current={tab === 'bench' ? 'page' : undefined} onClick={() => setTab('bench')}>Bancada científica</button>
          </nav>
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
        </div>
      </div>
    </main>
  );
}
