// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadTutorialState,
  resetTutorialState,
  saveTutorialOutcome,
  shouldAutoOpenTutorial,
  TUTORIAL_STORAGE_KEY,
} from '../services/tutorialState';
import { TutorialOverlay } from '../tutorial/TutorialOverlay';
import { TUTORIAL_STEPS } from '../tutorial/tutorialSteps';

vi.mock('../map/MapWorkspace', () => ({
  MapWorkspace: ({ sidebarControls }: { sidebarControls?: unknown }) => (
    <section data-testid="mock-map-workspace">
      {sidebarControls as import('react').ReactNode}
      <div data-tour="map-selection-tools" />
      <div data-tour="hotspot-actions" />
      <button type="button" data-tour="analyze-button">
        Analisar seleção
      </button>
      <div data-tour="query-summary" />
      <div data-tour="map-stage">
        <div data-tour="map-legend" />
      </div>
      <div data-tour="map-tools" />
    </section>
  ),
}));

vi.mock('../bench/ScientificBench', () => ({
  ScientificBench: () => (
    <section data-testid="mock-scientific-bench">
      <div data-tour="bench-discovery" />
      <div data-tour="bench-controls" />
      <div data-tour="bench-answers" />
    </section>
  ),
}));

vi.mock('../services/regionDataAdapter', async importOriginal => {
  const actual = await importOriginal<typeof import('../services/regionDataAdapter')>();
  return {
    ...actual,
    getBackendCatalog: vi.fn().mockResolvedValue({
      families: [],
    }),
  };
});

import App from '../App';

function installJsdomViewportStubs() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
}

describe('Tutorial Interativo — Estado, Roteiro e Integração com App', () => {
  beforeEach(() => {
    localStorage.clear();
    installJsdomViewportStubs();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('tutorialState persiste conclusão, skip e tolera JSON corrompido ou erro de storage', () => {
    expect(shouldAutoOpenTutorial()).toBe(true);
    expect(loadTutorialState()).toBeNull();

    saveTutorialOutcome('completed', 'scientific-bench');
    expect(shouldAutoOpenTutorial()).toBe(false);
    expect(loadTutorialState()).toMatchObject({
      version: 1,
      status: 'completed',
      lastStepId: 'scientific-bench',
    });

    resetTutorialState();
    expect(shouldAutoOpenTutorial()).toBe(true);

    localStorage.setItem(TUTORIAL_STORAGE_KEY, '{broken-json');
    expect(loadTutorialState()).toBeNull();
    expect(shouldAutoOpenTutorial()).toBe(true);

    localStorage.setItem(
      TUTORIAL_STORAGE_KEY,
      JSON.stringify({ version: 1, status: 'invalid', lastStepId: 'briefing' }),
    );
    expect(loadTutorialState()).toBeNull();

    const spyGetItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(loadTutorialState()).toBeNull();
    expect(shouldAutoOpenTutorial()).toBe(true);
    spyGetItem.mockRestore();
  });

  it('TUTORIAL_STEPS mantém 8 etapas válidas e adapta o passo da Bancada com ou sem análise', () => {
    expect(TUTORIAL_STEPS).toHaveLength(8);
    const ids = TUTORIAL_STEPS.map(step => step.id);
    expect(new Set(ids).size).toBe(TUTORIAL_STEPS.length);

    const benchStep = TUTORIAL_STEPS[TUTORIAL_STEPS.length - 1]!;
    const withoutAnalysis = benchStep.resolveTarget({ hasAnalysis: false });
    expect(withoutAnalysis.requiredTab).toBe('map');
    expect(withoutAnalysis.showBenchPreview).toBe(true);
    expect(withoutAnalysis.selectors).toContain('[data-tour="tab-bench"]');

    const withAnalysis = benchStep.resolveTarget({ hasAnalysis: true });
    expect(withAnalysis.requiredTab).toBe('bench');
    expect(withAnalysis.showBenchPreview).toBe(false);
    expect(withAnalysis.selectors).toContain('[data-tour="bench-panel"]');
  });

  it('abre automaticamente na primeira visita ao mapa, percorre até o fim e não reabre após recarregar', async () => {
    render(
      <MantineProvider>
        <App />
      </MantineProvider>,
    );

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: /Interactive tutorial/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Map' }));
    expect(screen.getByRole('button', { name: /Interactive tutorial/i })).toBeTruthy();
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(screen.getByText('Welcome to Earth System Trend Detective')).toBeTruthy();
    expect(screen.getByText(`1 / ${TUTORIAL_STEPS.length}`)).toBeTruthy();

    for (let step = 0; step < TUTORIAL_STEPS.length - 1; step += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    }

    expect(screen.getByText('Explore the Scientific Workbench and Export Evidence')).toBeTruthy();
    expect(screen.getByText(/ANALYTICAL PANELS toolbar/)).toBeTruthy();
    expect(screen.queryByText(/Após analisar/)).toBeNull();
    expect(screen.getByLabelText('Preview of what unlocks in the Scientific Workbench')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Finish training' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(shouldAutoOpenTutorial()).toBe(false);
    expect(loadTutorialState()?.status).toBe('completed');

    cleanup();

    render(
      <MantineProvider>
        <App />
      </MantineProvider>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Interactive tutorial/i }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Welcome to Earth System Trend Detective')).toBeTruthy();
  });

  it('permite pular via botão e teclado (ArrowRight / ArrowLeft / Escape) e destaca spotlight quando alvo tem dimensões', () => {
    const onStepChange = vi.fn();
    const onComplete = vi.fn();
    const onSkip = vi.fn();

    const baseContext = {
      hasAnalysis: false,
      variableA: 'GWETTOP',
      variableB: 'T2M_MAX',
      startMonth: '2015-01',
      endMonth: '2022-12',
      periodReady: true,
      regionACells: 0,
      regionBCells: 0,
      readyToAnalyze: false,
      isAnalyzing: false,
    };

    const anchor = document.createElement('div');
    anchor.setAttribute('data-tour', 'hotspot-actions');
    const editableInput = document.createElement('input');
    editableInput.type = 'text';
    anchor.appendChild(editableInput);
    anchor.getBoundingClientRect = () =>
      ({
        left: 260,
        top: 90,
        width: 180,
        height: 40,
        right: 440,
        bottom: 130,
        x: 260,
        y: 90,
        toJSON: () => ({}),
      }) as DOMRect;
    document.body.appendChild(anchor);

    const { container, rerender } = render(
      <TutorialOverlay
        open
        steps={TUTORIAL_STEPS}
        stepIndex={3}
        liveContext={baseContext}
        onStepChange={onStepChange}
        onComplete={onComplete}
        onSkip={onSkip}
      />,
    );

    expect(container.querySelector('.tutorial-spotlight')).not.toBeNull();
    const scrimPath = container.querySelector('path.tutorial-scrim-path');
    expect(scrimPath).not.toBeNull();
    expect(scrimPath?.getAttribute('d')).toContain('M 0 0 H');
    expect(scrimPath?.getAttribute('fill-rule')).toBe('evenodd');

    // Atalhos de seta não sequestram navegação quando usuário edita um input dentro do alvo
    editableInput.focus();
    fireEvent.keyDown(editableInput, { key: 'ArrowRight' });
    expect(onStepChange).not.toHaveBeenCalled();

    // Minimizar e expandir libera visualização máxima
    fireEvent.click(screen.getByRole('button', { name: 'Minimize tutorial card' }));
    expect(container.querySelector('.tutorial-hud-card.is-minimized')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
    expect(container.querySelector('.tutorial-hud-card.is-minimized')).toBeNull();

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onStepChange).toHaveBeenCalledWith(4);

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(onStepChange).toHaveBeenCalledWith(2);

    // Dropdown oculto (keepMounted do Mantine) não deve impedir Escape de fechar o tutorial
    const hiddenPopup = document.createElement('div');
    hiddenPopup.className = 'mantine-Combobox-dropdown';
    hiddenPopup.style.display = 'none';
    document.body.appendChild(hiddenPopup);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onSkip).toHaveBeenCalledWith(TUTORIAL_STEPS[3]!.id);

    // Dropdown visível com dimensões reais bloqueia Escape do tutorial para fechar apenas o dropdown primeiro
    onSkip.mockClear();
    hiddenPopup.style.display = 'block';
    hiddenPopup.getBoundingClientRect = () =>
      ({ width: 220, height: 180, left: 20, top: 80, right: 240, bottom: 260, x: 20, y: 80, toJSON: () => ({}) }) as DOMRect;
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onSkip).not.toHaveBeenCalled();
    hiddenPopup.remove();

    const benchPanelAnchor = document.createElement('div');
    benchPanelAnchor.setAttribute('data-tour', 'bench-panel');
    benchPanelAnchor.getBoundingClientRect = () =>
      ({ width: 1320, height: 680, left: 20, top: 140, right: 1340, bottom: 820, x: 20, y: 140, toJSON: () => ({}) }) as DOMRect;
    document.body.appendChild(benchPanelAnchor);

    rerender(
      <TutorialOverlay
        open
        steps={TUTORIAL_STEPS}
        stepIndex={TUTORIAL_STEPS.length - 1}
        liveContext={{ ...baseContext, hasAnalysis: true }}
        onStepChange={onStepChange}
        onComplete={onComplete}
        onSkip={onSkip}
      />,
    );

    const benchCard = container.querySelector('.tutorial-hud-card');
    expect(benchCard?.classList.contains('is-centered')).toBe(false);

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onComplete).toHaveBeenCalledWith(TUTORIAL_STEPS[TUTORIAL_STEPS.length - 1]!.id);

    benchPanelAnchor.remove();
    anchor.remove();
  });

  it('sincroniza barra lateral quando recolhida no desktop ao avançar para a Missão 1', async () => {
    render(
      <MantineProvider>
        <App />
      </MantineProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Map' }));

    // Fecha o tutorial inicial para recolher a barra lateral manualmente primeiro
    fireEvent.click(screen.getByRole('button', { name: 'Skip tutorial' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    const collapseBtn = screen.getByRole('button', { name: /Collapse panel/i });
    fireEvent.click(collapseBtn);
    expect(document.querySelector('.workspace.sidebar-collapsed')).not.toBeNull();

    // Reabre via botão '?' e avança para a etapa de Variáveis/Período
    fireEvent.click(screen.getByRole('button', { name: /Interactive tutorial/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(document.querySelector('.workspace.sidebar-collapsed')).toBeNull();
    });

    // Avança para o Passo 3 (mapa) -> sidebar recolhida volta ao estado anterior do usuário
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => {
      expect(document.querySelector('.workspace.sidebar-collapsed')).not.toBeNull();
    });
  });

  it('reinicia scrollTop do corpo ao trocar de etapa, rola até alvos fora da viewport e recalcula spotlight no scroll/resize', async () => {
    const scrollIntoViewMock = vi.fn();
    let targetTop = 980;
    const offscreenTarget = document.createElement('div');
    offscreenTarget.setAttribute('data-tour', 'hotspot-actions');
    offscreenTarget.scrollIntoView = scrollIntoViewMock;
    offscreenTarget.getBoundingClientRect = () =>
      ({
        left: 220,
        top: targetTop,
        width: 180,
        height: 44,
        right: 400,
        bottom: targetTop + 44,
        x: 220,
        y: targetTop,
        toJSON: () => ({}),
      }) as DOMRect;
    document.body.appendChild(offscreenTarget);

    const inViewTarget = document.createElement('div');
    inViewTarget.setAttribute('data-tour', 'map-selection-tools');
    inViewTarget.getBoundingClientRect = () =>
      ({
        left: 240,
        top: 120,
        width: 240,
        height: 40,
        right: 480,
        bottom: 160,
        x: 240,
        y: 120,
        toJSON: () => ({}),
      }) as DOMRect;
    document.body.appendChild(inViewTarget);

    const onStepChange = vi.fn();
    const { container, rerender } = render(
      <TutorialOverlay
        open
        steps={TUTORIAL_STEPS}
        stepIndex={3}
        liveContext={{
          hasAnalysis: false,
          variableA: 'GWETTOP',
          variableB: 'T2M_MAX',
          startMonth: '2015-01',
          endMonth: '2022-12',
          periodReady: true,
          regionACells: 0,
          regionBCells: 0,
          readyToAnalyze: false,
          isAnalyzing: false,
        }}
        onStepChange={onStepChange}
        onComplete={vi.fn()}
        onSkip={vi.fn()}
      />,
    );

    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest',
    });

    const cardBody = container.querySelector('.tutorial-hud-body') as HTMLElement;
    expect(cardBody).not.toBeNull();
    cardBody.scrollTop = 140;

    // Simula scroll da página trazendo o alvo para dentro da viewport e confirma recálculo do spotlight
    targetTop = 210;
    fireEvent.scroll(window);
    await waitFor(() => {
      const spotlight = container.querySelector('.tutorial-spotlight') as HTMLElement | null;
      expect(spotlight?.style.top).toBe('205px');
    });

    rerender(
      <TutorialOverlay
        open
        steps={TUTORIAL_STEPS}
        stepIndex={4}
        liveContext={{
          hasAnalysis: false,
          variableA: 'GWETTOP',
          variableB: 'T2M_MAX',
          startMonth: '2015-01',
          endMonth: '2022-12',
          periodReady: true,
          regionACells: 0,
          regionBCells: 0,
          readyToAnalyze: false,
          isAnalyzing: false,
        }}
        onStepChange={onStepChange}
        onComplete={vi.fn()}
        onSkip={vi.fn()}
      />,
    );

    expect(cardBody.scrollTop).toBe(0);

    offscreenTarget.remove();
    inViewTarget.remove();
  });
});
