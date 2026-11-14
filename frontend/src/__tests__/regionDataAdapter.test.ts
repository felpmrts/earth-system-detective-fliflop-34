import { describe, expect, it, vi } from 'vitest';
import mockAnalysisJson from '../../public/data/mock_analysis.json';
import { buildRegionSelection, snapCoordToCell } from '../geo/gridGeometry.ts';
import { RegionAnalysisCache } from '../services/idbCache.ts';
import { createRegionDataAdapter } from '../services/regionDataAdapter.ts';

describe('regionDataAdapter — modo API, cache e AbortController', () => {
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

  it('não reutiliza entrada expirada do cache', async () => {
    const cache = new RegionAnalysisCache(-1);
    await cache.set('expired', mockAnalysisJson as never);
    await expect(cache.get('expired')).resolves.toBeNull();
  });

  it('propaga erro do backend sem mascarar a falha com dados mock', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/analyze')) {
        return new Response(JSON.stringify({ error: 'NASA POWER indisponível' }), { status: 500 });
      }
      return new Response(JSON.stringify({ error: 'NASA POWER indisponível' }), { status: 500 });
    });

    const adapter = createRegionDataAdapter({
      mode: 'api',
      apiBaseUrl: 'http://localhost:8000',
      fetchFn: fetchMock as unknown as typeof fetch,
      cache: new RegionAnalysisCache(),
    });

    await expect(adapter.getRegionData({ variable: 'GWETTOP', region: regionA }))
      .rejects.toThrow('NASA POWER indisponível');
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
