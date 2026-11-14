import { describe, expect, it, vi } from 'vitest';
import mockAnalysisJson from '../../public/data/mock_analysis.json';
import t2mGridJson from '../../public/data/T2M_grid.json';
import { buildRegionSelection, snapCoordToCell } from '../geo/gridGeometry.ts';
import { RegionAnalysisCache } from '../services/idbCache.ts';
import { createRegionDataAdapter, SemanticApiError } from '../services/regionDataAdapter.ts';

describe('regionDataAdapter — modo API, cache, AbortController e fallback offline', () => {
  const cell = snapCoordToCell(-18.91, -48.27, 'GWETTOP');
  const regionA = buildRegionSelection('A', 'GWETTOP', [cell]);

  it('consulta backend Python no modo api, grava em cache e serve segunda chamada sem rede', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(JSON.stringify(mockAnalysisJson), { status: 200 });
    });
    const cache = new RegionAnalysisCache();

    const adapter = createRegionDataAdapter({
      mode: 'api',
      apiBaseUrl: 'http://localhost:8000',
      fetchFn: fetchMock as unknown as typeof fetch,
      cache,
    });

    const first = await adapter.getRegionData({ variable: 'GWETTOP', region: regionA });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:8000/api/analyze');
    expect(first.region_a_analysis.variable_id).toBe('GWETTOP');

    const second = await adapter.getRegionData({ variable: 'GWETTOP', region: regionA });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.request_meta.source).toBe('idb_cache');
  });

  it('propaga SemanticApiError em HTTP 422 sem mascarar com fallback offline', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({ code: 'OCEAN_MASK_NO_DATA', error: 'Ponto sem cobertura terrestre.' }),
        { status: 422, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const adapter = createRegionDataAdapter({
      mode: 'api',
      apiBaseUrl: 'http://localhost:8000',
      fetchFn: fetchMock as unknown as typeof fetch,
      cache: new RegionAnalysisCache(),
    });

    const promise = adapter.getRegionData({ variable: 'GWETTOP', region: regionA });
    await expect(promise).rejects.toBeInstanceOf(SemanticApiError);
    await expect(promise).rejects.toMatchObject({ code: 'OCEAN_MASK_NO_DATA', status: 422 });
    // Garante que NÃO chamou /data/mock_analysis.json
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('resolve alias CLOUD_AMT para /data/CLDTOT_grid.json em getGlobalGrid', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => {
      return new Response(JSON.stringify({ ...t2mGridJson, variable_id: 'CLDTOT' }), { status: 200 });
    });

    const adapter = createRegionDataAdapter({
      mode: 'offline',
      fetchFn: fetchMock as unknown as typeof fetch,
      cache: new RegionAnalysisCache(),
    });

    const grid = await adapter.getGlobalGrid('CLOUD_AMT');
    expect(fetchMock).toHaveBeenCalledWith('/data/CLDTOT_grid.json', { signal: undefined });
    expect(grid.variable_id).toBe('CLDTOT');
  });

  it('aciona fallback offline automaticamente quando o backend retorna HTTP 500', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/analyze')) {
        return new Response('Internal Error', { status: 500 });
      }
      return new Response(JSON.stringify(mockAnalysisJson), { status: 200 });
    });

    const adapter = createRegionDataAdapter({
      mode: 'api',
      apiBaseUrl: 'http://localhost:8000',
      fetchFn: fetchMock as unknown as typeof fetch,
      cache: new RegionAnalysisCache(),
    });

    const res = await adapter.getRegionData({ variable: 'GWETTOP', region: regionA });
    expect(res.request_meta.source).toBe('offline_fallback');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('propaga cancelamento quando AbortController externo é abortado antes ou durante o fetch', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        if (init?.signal?.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    const adapter = createRegionDataAdapter({
      mode: 'api',
      apiBaseUrl: 'http://localhost:8000',
      fetchFn: fetchMock as unknown as typeof fetch,
      cache: new RegionAnalysisCache(),
    });

    // Abort antes do fetch disparar
    const preAbortedPromise = adapter.getRegionData({
      variable: 'GWETTOP',
      region: regionA,
      signal: controller.signal,
    });
    controller.abort();
    await expect(preAbortedPromise).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(0);

    // Abort em voo (durante o fetch)
    const inFlightController = new AbortController();
    const inFlightPromise = adapter.getRegionData({
      variable: 'GWETTOP',
      region: regionA,
      signal: inFlightController.signal,
    });
    await new Promise((r) => setTimeout(r, 0));
    inFlightController.abort();
    await expect(inFlightPromise).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
