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
      onRegionAChange: (region: ReturnType<typeof buildRegionSelection> | null) => void;
      onRegionBChange: (region: ReturnType<typeof buildRegionSelection> | null) => void;
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
          <button
            type="button"
            data-testid="clear-region-a-btn"
            onClick={() => props.onRegionAChange(null)}
          >
            Limpar A
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
  if (typeof Element !== 'undefined') {
    Element.prototype.scrollIntoView = vi.fn();
  }
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

    expect(screen.getByText('Discovery Summary')).toBeTruthy();
    expect(screen.getAllByText(/OLS:/).length).toBeGreaterThan(0);
    // Verifies that invalid start/end do not throw RangeError in new Date(...).toISOString() (AUD-03)
    expect(screen.getByText(/contains no data in the selected period/i)).toBeTruthy();
    // Verifica unidade de tendência no delta de declive (AUD-13)
    expect(screen.getByText(/-0\.5080 fraction\/decade/)).toBeTruthy();
    // Verifica unidade de OLS e A0 no Card 2 (AUD-13)
    expect(document.body.textContent).toContain('0.0000 fraction/decade');
    expect(document.body.textContent).toContain('— fraction (0–1)');

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

    // Activate Dual View to render both Plotly charts and check margins (AUD-15)
    fireEvent.click(screen.getByRole('button', { name: 'Dual View' }));
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

    // Even if the old response resolves later, it does not switch to the Bench
    resolveDeferred(structuredClone(mockAnalysisJson) as unknown as RegionAnalysisResponse);
    await new Promise(r => setTimeout(r, 20));
    expect(screen.queryByText('Discovery Summary')).toBeNull();
  });

  it('AUD-05: alternar para Bancada e voltar ao Mapa mantém MapWorkspace montado sem perder estado local', () => {
    saveTutorialOutcome('completed', 'scientific-bench');

    render(
      <MantineProvider>
        <App />
      </MantineProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Map' }));
    fireEvent.click(screen.getByTestId('toggle-same-local'));
    expect(screen.getByTestId('toggle-same-local').textContent).toBe('A=B ativo');

    fireEvent.click(screen.getByRole('button', { name: 'Scientific Bench' }));
    expect(document.querySelector('.map-tab-shell.is-hidden')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Map' }));
    expect(document.querySelector('.map-tab-shell.is-hidden')).toBeNull();
    expect(screen.getByTestId('toggle-same-local').textContent).toBe('A=B ativo');
  });

  it('preserva Bancada ao trocar variável na sidebar (re-snap + min_year), desbloqueia sidebar-update-bench-btn e bloqueia após atualizar ou limpar região', async () => {
    saveTutorialOutcome('completed', 'scientific-bench');
    localStorage.setItem(
      'flipflop34:session:v2',
      JSON.stringify({
        tab: 'map',
        variableA: 'GWETTOP',
        variableB: 'T2M_MAX',
        startMonth: '1981-01',
        endMonth: '2022-12',
      }),
    );

    const firstPayload = structuredClone(mockAnalysisJson) as unknown as RegionAnalysisResponse;
    const secondPayload = structuredClone(mockAnalysisJson) as unknown as RegionAnalysisResponse & {
      region_a_analysis: { variable_id: string; variable_name: string; unit: string; trend_unit: string };
    };
    secondPayload.region_a_analysis.variable_id = 'ALLSKY_SFC_SW_DWN';
    secondPayload.region_a_analysis.variable_name = 'All-Sky Surface Shortwave Downward Irradiance';
    secondPayload.region_a_analysis.unit = 'MJ/m²/day';
    secondPayload.region_a_analysis.trend_unit = 'MJ/m²/day/decade';

    let resolveSecond!: (value: RegionAnalysisResponse) => void;
    mockGetRegionData
      .mockResolvedValueOnce(firstPayload)
      .mockImplementationOnce(
        () =>
          new Promise<RegionAnalysisResponse>(resolve => {
            resolveSecond = resolve;
          }),
      );

    render(
      <MantineProvider>
        <App />
      </MantineProvider>,
    );

    fireEvent.click(screen.getByTestId('seed-regions-btn'));
    fireEvent.click(screen.getByTestId('trigger-analyze-btn'));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Discovery Summary' })).toBeTruthy());

    // 1. Estado inicial na Bancada: botão sincronizado, sem botão 'x' de remoção em variáveis/tempo
    const updateBtn = screen.getByTestId('sidebar-update-bench-btn') as HTMLButtonElement;
    expect(updateBtn.disabled).toBe(true);
    expect(updateBtn.textContent).toBe('Bench synced');
    expect(screen.queryByRole('button', { name: 'Clear variable X' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear variable Y' })).toBeNull();
    expect(document.querySelector('#variables-sidebar .period-picker button[aria-label*="Clear"]')).toBeNull();

    // 2. Troca Variable X de GWETTOP (MERRA-2, 1981) -> ALLSKY_SFC_SW_DWN (CERES, 1984) na sidebar
    const selectVarX = async (optionName: string) => {
      const varXInput = document.querySelector('#variables-sidebar .variable-picker-a input') as HTMLInputElement;
      expect(varXInput).not.toBeNull();
      fireEvent.change(varXInput, { target: { value: optionName } });
    };
    await selectVarX('All-Sky Surface Shortwave Downward Irradiance');

    // Bancada NÃO cai no empty state e o botão desbloqueia
    expect(screen.getByRole('heading', { name: 'Discovery Summary' })).toBeTruthy();
    expect(screen.queryByText('No analysis run yet')).toBeNull();
    expect(updateBtn.disabled).toBe(false);
    expect(updateBtn.textContent).toBe('Update Scientific Bench');

    // 3. Dispara reanálise pelo botão lateral mantendo a Bancada montada durante loading (com classe is-updating)
    fireEvent.click(updateBtn);
    await waitFor(() => expect(mockGetRegionData).toHaveBeenCalledTimes(2));
    expect(updateBtn.disabled).toBe(true);
    expect(updateBtn.textContent).toBe('Updating bench...');
    expect(screen.getByRole('heading', { name: 'Discovery Summary' })).toBeTruthy();
    expect(document.querySelector('.bench-panel.is-updating')).not.toBeNull();

    const secondCallParams = mockGetRegionData.mock.calls[1]![0] as {
      variable: string;
      startDate: string;
      region: ReturnType<typeof buildRegionSelection>;
    };
    expect(secondCallParams.variable).toBe('ALLSKY_SFC_SW_DWN');
    expect(secondCallParams.startDate).toBe('1984-01');
    expect(secondCallParams.region.source_model).toBe('CERES_SYN1deg');
    expect(secondCallParams.region.cells.length).toBeGreaterThan(0);

    // Conclui atualização in-place: anima atualização (.is-just-updated + sweep + badge) e bloqueia o botão
    resolveSecond(secondPayload);
    await waitFor(() => {
      expect(document.querySelector('.bench-panel')?.textContent).toContain(
        'All-Sky Surface Shortwave Downward Irradiance',
      );
      expect(updateBtn.disabled).toBe(true);
      expect(document.querySelector('.bench-panel.is-just-updated')).not.toBeNull();
      expect(document.querySelector('.bench-update-sweep')).not.toBeNull();
      expect(screen.getByTestId('bench-updated-badge').textContent).toContain('Bench updated');
    });
    expect(updateBtn.textContent).toBe('Bench synced');

    // 4. Se o usuário excluir a Região A, Bancada permanece segura e o botão continua bloqueado
    fireEvent.click(screen.getByTestId('clear-region-a-btn'));
    await selectVarX('Mean Air Temperature (2m)');
    expect(screen.getByRole('heading', { name: 'Discovery Summary' })).toBeTruthy();
    expect(updateBtn.disabled).toBe(true);
    expect(updateBtn.textContent).toBe('Select regions on Map');
  });
});
