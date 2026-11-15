// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import mockAnalysisJson from '../../public/data/mock_analysis.json';
import type { RegionAnalysisResponse } from '../contracts/types';
import { buildRegionSelection, snapCoordToCell } from '../geo/gridGeometry';
import { loadPersistedSession } from '../services/sessionState';
import { saveTutorialOutcome } from '../services/tutorialState';

const capturedLayouts: Array<Record<string, unknown>> = [];
const mockGetRegionData = vi.fn();

vi.mock('plotly.js-basic-dist-min', () => ({ default: {} }));
vi.mock('react-plotly.js/factory', () => ({
  default: () =>
    function MockPlot(props: { layout?: Record<string, unknown> }) {
      if (props.layout) capturedLayouts.push(props.layout);
      return <div data-testid="mock-plotly-chart" />;
    },
}));

vi.mock('../map/MapWorkspace', async () => {
  const { useState } = await import('react');
  return {
    MapWorkspace: (props: {
      onRegionAChange: (region: ReturnType<typeof buildRegionSelection>) => void;
      onRegionBChange: (region: ReturnType<typeof buildRegionSelection>) => void;
      onAnalyze: () => void;
    }) => {
      const [localSame, setLocalSame] = useState(false);
      return (
        <section className="map-workspace" data-testid="test-map-workspace">
          <button
            type="button"
            data-testid="toggle-same-local"
            onClick={() => setLocalSame((prev: boolean) => !prev)}
          >
            {localSame ? 'A=B ativo' : 'A=B inativo'}
          </button>
          <button
            type="button"
            data-testid="seed-regions-btn"
            onClick={() => {
              props.onRegionAChange(buildRegionSelection('A', 'GWETTOP', [snapCoordToCell(-15, -48, 'GWETTOP')]));
              props.onRegionBChange(buildRegionSelection('B', 'T2M_MAX', [snapCoordToCell(-15, -48, 'T2M_MAX')]));
            }}
          >
            Marcar A e B
          </button>
          <button
            type="button"
            data-testid="shift-region-a-btn"
            onClick={() => {
              props.onRegionAChange(buildRegionSelection('A', 'GWETTOP', [snapCoordToCell(-10, -52, 'GWETTOP')]));
            }}
          >
            Alterar A
          </button>
          <button type="button" data-testid="trigger-analyze-btn" onClick={props.onAnalyze}>
            Analisar seleção
          </button>
        </section>
      );
    },
  };
});

vi.mock('../services/regionDataAdapter', async importOriginal => {
  const actual = await importOriginal<typeof import('../services/regionDataAdapter')>();
  return {
    ...actual,
    getBackendCatalog: vi.fn().mockResolvedValue({ families: [] }),
    getRegionData: (...args: unknown[]) => mockGetRegionData(...args),
  };
});

import App from '../App';
import { ScientificBench } from '../bench/ScientificBench';

function installViewportStubs() {
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
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
}

describe('PROD-2 QA Hardening (AUD-02, AUD-03, AUD-05, AUD-10, AUD-13, AUD-15)', () => {
  beforeEach(() => {
    localStorage.clear();
    capturedLayouts.length = 0;
    mockGetRegionData.mockReset();
    installViewportStubs();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('AUD-03: descarta células corrompidas, modelo divergente, coordenadas fora da faixa e meses inválidos no localStorage', () => {
    const validCell = snapCoordToCell(-15, -48, 'GWETTOP');
    const validRegionA = buildRegionSelection('A', 'GWETTOP', [validCell]);

    localStorage.setItem(
      'flipflop34:session:v2',
      JSON.stringify({
        tab: 'map',
        variableA: 'GWETTOP',
        variableB: 'T2M_MAX',
        startMonth: '2020-99',
        endMonth: 'invalid-date',
        regionA: { ...validRegionA, source_model: 'CERES_SYN1deg' },
        regionB: {
          slot: 'B',
          region_id: 'MERRA-2__bad',
          variable_id: 'T2M_MAX',
          source_model: 'MERRA-2',
          grid_resolution: { dLat: 0.5, dLon: 0.625 },
          cells: [{ ...validCell, lat: 120 }],
        },
      }),
    );

    const session = loadPersistedSession();
    expect(session.startMonth).toBe('');
    expect(session.endMonth).toBe('');
    expect(session.regionA).toBeNull();
    expect(session.regionB).toBeNull();
  });

  it('AUD-03 / AUD-10 / AUD-13 / AUD-15: ScientificBench resiste a NaN/enum inesperado, exibe unidades e margens responsivas', () => {
    const degraded = structuredClone(mockAnalysisJson) as unknown as {
      region_a_analysis: {
        significance: { confidence_tier: string };
        regression: { regime_shape: string; slope_per_decade_ols: number; intercept_at_start_A0: number };
        correlation_and_coupling: { r_squared: number; ellipse_aspect_ratio: number };
        period: { n_effective_ar1: number };
        outliers_mahalanobis: Array<{ mahalanobis_d: number; date: string; observed_anomaly: number; diagnostic_hint: string }>;
      };
      comparison_pair: {
        slope_difference_per_decade: number | null;
      };
    };

    degraded.region_a_analysis.significance.confidence_tier = 'UNKNOWN_TIER';
    degraded.region_a_analysis.regression.regime_shape = 'custom_regime';
    degraded.region_a_analysis.regression.slope_per_decade_ols = -0.00001;
    degraded.region_a_analysis.regression.intercept_at_start_A0 = Number.NaN;
    degraded.region_a_analysis.correlation_and_coupling.r_squared = Number.NaN;
    degraded.region_a_analysis.period.n_effective_ar1 = Number.NaN;
    degraded.region_a_analysis.outliers_mahalanobis[0]!.mahalanobis_d = Number.NaN;
    degraded.comparison_pair.slope_difference_per_decade = -0.508;

    render(
      <ScientificBench
        analysis={degraded as unknown as RegionAnalysisResponse}
        variableA="GWETTOP"
        variableB="T2M_MAX"
        regionA={null}
        regionB={null}
        start="2020-99"
        end="2025-13"
        periodReady
        analyzedAt={null}
        anomaly={false}
        separate={false}
        dual
        trendMode="both"
        onAnomalyChange={() => {}}
        onSeparateChange={() => {}}
        onDualChange={() => {}}
        onTrendModeChange={() => {}}
        onBackToMap={() => {}}
      />,
    );

    expect(screen.getByText('Resumo da descoberta')).toBeTruthy();
    expect(screen.getAllByText(/OLS:/).length).toBeGreaterThan(0);
    // Verifica que start/end inválidos não lançam RangeError em new Date(...).toISOString() (AUD-03)
    expect(screen.getByText(/não contém dados no período selecionado/i)).toBeTruthy();
    // Verifica unidade de tendência no delta de declive (AUD-13)
    expect(screen.getByText(/-0\.5080 fração\/década/)).toBeTruthy();
    // Verifica unidade de OLS e A0 no Card 2 (AUD-13)
    expect(document.body.textContent).toContain('0.0000 fração/década');
    expect(document.body.textContent).toContain('— fração (0–1)');

    cleanup();
    capturedLayouts.length = 0;

    render(
      <ScientificBench
        analysis={degraded as unknown as RegionAnalysisResponse}
        variableA="GWETTOP"
        variableB="T2M_MAX"
        regionA={null}
        regionB={null}
        start="2000-01"
        end="2009-12"
        periodReady
        analyzedAt={null}
        anomaly={false}
        separate={false}
        dual
        trendMode="both"
        onAnomalyChange={() => {}}
        onSeparateChange={() => {}}
        onDualChange={() => {}}
        onTrendModeChange={() => {}}
        onBackToMap={() => {}}
      />,
    );

    // Ativa Visão Dupla para renderizar ambos os gráficos Plotly e conferir margens (AUD-15)
    fireEvent.click(screen.getByRole('button', { name: 'Visão Dupla' }));
    expect(capturedLayouts[0]?.margin).toEqual({ l: 48, t: 28, r: 44, b: 85 });
    expect(capturedLayouts.at(-1)?.margin).toEqual({ l: 48, t: 42, r: 20, b: 78 });
  });

  it('AUD-02: aborta requisição em voo ao alterar seleção e ignora resposta tardia obsoleta', async () => {
    saveTutorialOutcome('completed', 'scientific-bench');
    localStorage.setItem(
      'flipflop34:session:v2',
      JSON.stringify({
        tab: 'map',
        variableA: 'GWETTOP',
        variableB: 'T2M_MAX',
        startMonth: '2015-01',
        endMonth: '2022-12',
      }),
    );

    let capturedSignal: AbortSignal | undefined;
    let resolveDeferred!: (value: RegionAnalysisResponse) => void;
    mockGetRegionData.mockImplementation((params: { signal?: AbortSignal }) => {
      capturedSignal = params.signal;
      return new Promise<RegionAnalysisResponse>(resolve => {
        resolveDeferred = resolve;
      });
    });

    render(
      <MantineProvider>
        <App />
      </MantineProvider>,
    );

    fireEvent.click(screen.getByTestId('seed-regions-btn'));
    fireEvent.click(screen.getByTestId('trigger-analyze-btn'));

    await waitFor(() => expect(mockGetRegionData).toHaveBeenCalledTimes(1));
    expect(capturedSignal?.aborted).toBe(false);

    // Altera a região A antes da requisição resolver -> deve abortar o sinal ativo
    fireEvent.click(screen.getByTestId('shift-region-a-btn'));
    await waitFor(() => expect(capturedSignal?.aborted).toBe(true));

    // Mesmo se a resposta antiga resolver depois, não muda para a Bancada
    resolveDeferred(structuredClone(mockAnalysisJson) as unknown as RegionAnalysisResponse);
    await new Promise(r => setTimeout(r, 20));
    expect(screen.queryByText('Resumo da descoberta')).toBeNull();
  });

  it('AUD-05: alternar para Bancada e voltar ao Mapa mantém MapWorkspace montado sem perder estado local', () => {
    saveTutorialOutcome('completed', 'scientific-bench');

    render(
      <MantineProvider>
        <App />
      </MantineProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mapa' }));
    fireEvent.click(screen.getByTestId('toggle-same-local'));
    expect(screen.getByTestId('toggle-same-local').textContent).toBe('A=B ativo');

    fireEvent.click(screen.getByRole('button', { name: 'Bancada científica' }));
    expect(document.querySelector('.map-tab-shell.is-hidden')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Mapa' }));
    expect(document.querySelector('.map-tab-shell.is-hidden')).toBeNull();
    expect(screen.getByTestId('toggle-same-local').textContent).toBe('A=B ativo');
  });
});
