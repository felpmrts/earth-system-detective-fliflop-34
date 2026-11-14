import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import gwettopGridJson from '../../public/data/GWETTOP_grid.json';
import mockAnalysisJson from '../../public/data/mock_analysis.json';
import t2mGridJson from '../../public/data/T2M_grid.json';
import { validateGlobalGrid } from '../contracts/contractValidator.ts';
import type {
  MapNotification,
  MapViewContractProps,
  RegionAnalysisResponse,
} from '../contracts/types.ts';
import { isConnectedComponent } from '../geo/gridGeometry.ts';
import {
  applyCellToggle,
  applySlotVariableChange,
  buildAnalyzeRequestInput,
  createInitialMapSelectionState,
  executeStateAnalysis,
  type UseMapSelectionControllerResult,
} from '../map/mapIntegration.ts';
import { getGlobalPointStyle } from '../map/mapStyles.ts';
import { RegionAnalysisCache } from '../services/idbCache.ts';
import { createRegionDataAdapter } from '../services/regionDataAdapter.ts';

describe('Walking Skeleton End-to-End (PROD-1 -> Adapter -> PROD-2)', () => {
  it('expõe retorno de useMapSelectionController() tipado exatamente conforme contrato PROD-2', () => {
    expectTypeOf<UseMapSelectionControllerResult['mapProps']>().toEqualTypeOf<MapViewContractProps>();
    expectTypeOf<UseMapSelectionControllerResult['analysisData']>().toEqualTypeOf<
      RegionAnalysisResponse | null
    >();
    expectTypeOf<UseMapSelectionControllerResult['isLoading']>().toEqualTypeOf<boolean>();
    expectTypeOf<UseMapSelectionControllerResult['notification']>().toEqualTypeOf<
      MapNotification | null
    >();
  });

  it('carrega grades globais T2M (thermal) e GWETTOP (hydrological) com estilos compatíveis', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/T2M_grid.json')) {
        return new Response(JSON.stringify(t2mGridJson), { status: 200 });
      }
      if (url.endsWith('/GWETTOP_grid.json')) {
        return new Response(JSON.stringify(gwettopGridJson), { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    });

    const adapter = createRegionDataAdapter({
      mode: 'offline',
      fetchFn: fetchMock as unknown as typeof fetch,
      cache: new RegionAnalysisCache(),
    });

    const t2mGrid = await adapter.getGlobalGrid('T2M');
    const gwettopGrid = await adapter.getGlobalGrid('GWETTOP');

    expect(t2mGrid.variable_id).toBe('T2M');
    expect(gwettopGrid.variable_id).toBe('GWETTOP');
    expect(validateGlobalGrid(gwettopGrid).points.length).toBeGreaterThan(0);

    // Polaridade oposta verificada nos pontos reais dos JSONs
    const gwettopNegPoint = gwettopGrid.points.find((p) => p.slope_sen_decade < 0);
    expect(gwettopNegPoint).toBeDefined();
    if (gwettopNegPoint) {
      expect(getGlobalPointStyle(gwettopNegPoint, 'GWETTOP').fillColor).toBe('#d9480f');
    }
  });

  it('fluxo offline completo: clique em Manaus (Região A) preenche analysisData válido para PROD-2', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/mock_analysis.json')) {
        return new Response(JSON.stringify(mockAnalysisJson), { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    });

    const adapter = createRegionDataAdapter({
      mode: 'offline',
      fetchFn: fetchMock as unknown as typeof fetch,
      cache: new RegionAnalysisCache(),
    });

    let state = createInitialMapSelectionState({ activeSlot: 'A', variableA: 'T2M', variableB: 'T2M_MAX' });
    state = applyCellToggle(state, 'A', -3.12, -60.02);

    expect(state.cellsA).toHaveLength(1);
    expect(state.cellsA[0]?.lat).toBeCloseTo(-3.0, 6);
    expect(state.cellsA[0]?.lon).toBeCloseTo(-60.0, 6);
    expect(state.lastNotification).toBeNull();

    const outcome = await executeStateAnalysis(state, adapter.getRegionData);
    expect(outcome.notification).toBeNull();
    expect(outcome.analysisData).not.toBeNull();
    expect(outcome.analysisData?.request_meta.source).toBe('offline_fallback');
    expect(outcome.analysisData?.region_a_analysis.series.dates.length).toBeGreaterThan(0);
    expect(outcome.analysisData?.comparison_pair).not.toBeNull();
  });

  it('alterna para Região B em Uberlândia (K=3 adjacentes) e entrega comparison_pair via backend API', async () => {
    const capturedBodies: unknown[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/analyze')) {
        capturedBodies.push(JSON.parse(String(init?.body ?? '{}')));
        const dynamicResponse = structuredClone(mockAnalysisJson) as {
          request_meta: Record<string, unknown>;
          region_b_analysis: { region_id?: string };
        };
        dynamicResponse.request_meta.source = 'backend_api';
        dynamicResponse.request_meta.cells_count_a = 1;
        dynamicResponse.request_meta.cells_count_b = 3;
        return new Response(JSON.stringify(dynamicResponse), { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    });

    const adapter = createRegionDataAdapter({
      mode: 'api',
      apiBaseUrl: 'http://localhost:8000',
      fetchFn: fetchMock as unknown as typeof fetch,
      cache: new RegionAnalysisCache(),
    });

    let state = createInitialMapSelectionState({
      activeSlot: 'A',
      variableA: 'GWETTOP',
      variableB: 'T2M_MAX',
    });
    // Região A: Manaus (K=1)
    state = applyCellToggle(state, 'A', -3.12, -60.02);

    // Alterna para Região B: Uberlândia com 3 células adjacentes (formato em L)
    state = { ...state, activeSlot: 'B' };
    state = applyCellToggle(state, 'B', -18.91, -48.27);
    state = applyCellToggle(state, 'B', -18.91, -47.65);
    state = applyCellToggle(state, 'B', -18.41, -47.65);

    expect(state.cellsB).toHaveLength(3);
    expect(isConnectedComponent(state.cellsB)).toBe(true);
    expect(state.lastNotification).toBeNull();

    const outcome = await executeStateAnalysis(state, adapter.getRegionData);
    expect(outcome.notification).toBeNull();
    expect(outcome.analysisData?.request_meta.source).toBe('backend_api');
    expect(outcome.analysisData?.request_meta.cells_count_b).toBe(3);
    expect(outcome.analysisData?.region_b_analysis).not.toBeNull();
    expect(outcome.analysisData?.comparison_pair?.multiscale_correlation.long_term_secular_r).toBe(-0.74);

    expect(capturedBodies).toHaveLength(1);
    const sent = capturedBodies[0] as { region_a: { cells: unknown[] }; region_b: { cells: unknown[] } };
    expect(sent.region_a.cells).toHaveLength(1);
    expect(sent.region_b.cells).toHaveLength(3);
  });

  it('limpa seleção incompatível ao trocar T2M (MERRA-2) -> CLDTOT (CERES) e recarrega grid sem erro', async () => {
    const cldtotGrid = { ...t2mGridJson, variable_id: 'CLDTOT', unit: '%', trend_unit: 'p.p./década' };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/CLDTOT_grid.json')) {
        return new Response(JSON.stringify(cldtotGrid), { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    });

    const adapter = createRegionDataAdapter({
      mode: 'offline',
      fetchFn: fetchMock as unknown as typeof fetch,
      cache: new RegionAnalysisCache(),
    });

    let state = createInitialMapSelectionState({ activeSlot: 'A', variableA: 'T2M', variableB: null });
    state = applyCellToggle(state, 'A', -3.12, -60.02);
    expect(state.cellsA).toHaveLength(1);

    // Troca de MERRA-2 (0.5°×0.625°) para CERES (1.0°×1.0°)
    state = applySlotVariableChange(state, 'A', 'CLDTOT');
    expect(state.variableA).toBe('CLDTOT');
    expect(state.cellsA).toHaveLength(0);
    expect(state.lastNotification?.level).toBe('info');
    expect(buildAnalyzeRequestInput(state)).toBeNull();

    const outcome = await executeStateAnalysis(state, adapter.getRegionData);
    expect(outcome.analysisData).toBeNull();
    expect(outcome.notification).toBeNull();

    const reloadedGrid = await adapter.getGlobalGrid('CLDTOT');
    expect(reloadedGrid.variable_id).toBe('CLDTOT');
  });

  it('trata clique oceânico (HTTP 422 OCEAN_MASK_NO_DATA) gerando notification amigável sem fallback falso', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/analyze')) {
        return new Response(
          JSON.stringify({
            code: 'OCEAN_MASK_NO_DATA',
            error: 'As células selecionadas cobrem apenas oceano para GWETTOP.',
          }),
          { status: 422, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify(mockAnalysisJson), { status: 200 });
    });

    const adapter = createRegionDataAdapter({
      mode: 'api',
      apiBaseUrl: 'http://localhost:8000',
      fetchFn: fetchMock as unknown as typeof fetch,
      cache: new RegionAnalysisCache(),
    });

    let state = createInitialMapSelectionState({ activeSlot: 'A', variableA: 'GWETTOP', variableB: null });
    state = applyCellToggle(state, 'A', 0.0, -30.0);

    const outcome = await executeStateAnalysis(state, adapter.getRegionData);
    expect(outcome.analysisData).toBeNull();
    expect(outcome.notification).toEqual({
      code: 'OCEAN_MASK_NO_DATA',
      level: 'error',
      message: 'As células selecionadas cobrem apenas oceano para GWETTOP.',
    });
    // Confirma que NÃO houve chamada de fallback offline
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:8000/api/analyze');
  });
});
