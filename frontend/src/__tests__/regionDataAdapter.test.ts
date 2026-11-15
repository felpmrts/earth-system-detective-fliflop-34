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

  it('Co-Piloto reutiliza analysis_key em turns subsequentes e preserva tools_used e answer do servidor', async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const parsed = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      requestBodies.push(parsed);
      const turnIdx = requestBodies.length;
      return new Response(
        JSON.stringify({
          analysis_key: 'ak_test_1',
          mode: 'llm_gemini',
          model: 'gemini-2.5-flash',
          language: 'pt',
          answer: `Resposta real do servidor Turno ${turnIdx}`,
          reply_markdown: `Markdown Turno ${turnIdx}`,
          synthesis: {
            mathematical_evidence: 'Sen = -0.0363/década',
            physical_meaning: 'Dessecação superficial sazonal',
            false_conclusion_risk: 'Não usar % em T2M_MAX',
          },
          four_answers: {
            what: 'Declínio em GWETTOP',
            where: 'Região A vs Região B',
            how_much: '-0.0363 fração/década',
            is_significant: 'p_AR1 = 0.0 (CONFIRMED_HIGH)',
          },
          suggested_questions: ['Testar sem 2015?'],
          guardrails_applied: ['invariant_3_scale_type'],
          invariant_warnings: ['Percentual suprimido em T2M_MAX'],
          tools_used: [
            {
              name: 'compute_seasonal_stratified_trends',
              label: 'Tendência Sazonal (DJF/MAM/JJA/SON)',
              summary: 'JJA dominante (-0.0372/década)',
              status: 'ok',
              duration_ms: 4.2,
            },
          ],
        }),
        { status: 200 },
      );
    });

    const adapter = createRegionDataAdapter({
      mode: 'api',
      apiBaseUrl: 'http://localhost:8000',
      fetchFn: fetchMock as unknown as typeof fetch,
      cache: new RegionAnalysisCache(),
    });

    const analysisObj = structuredClone(mockAnalysisJson) as never;
    const res1 = await adapter.askStatisticalCopilot({
      analysis: analysisObj,
      question: 'Qual estação dirige a tendência?',
      language: 'pt',
    });

    expect(res1.mode).toBe('llm_gemini');
    expect(res1.answer).toBe('Resposta real do servidor Turno 1');
    expect(res1.tools_used).toHaveLength(1);
    expect(res1.tools_used?.[0]?.name).toBe('compute_seasonal_stratified_trends');
    expect(res1.invariant_warnings).toEqual(['Percentual suprimido em T2M_MAX']);
    expect(requestBodies[0]?.analysis).toBeDefined();
    expect(requestBodies[0]?.analysis_key).toBeUndefined();

    const res2 = await adapter.askStatisticalCopilot({
      analysis: analysisObj,
      question: 'E sem 2015?',
      language: 'pt',
      history: [{ role: 'user', content: 'Qual estação dirige a tendência?' }],
    });

    expect(res2.answer).toBe('Resposta real do servidor Turno 2');
    expect(requestBodies).toHaveLength(2);
    expect(requestBodies[1]?.analysis_key).toBe('ak_test_1');
    expect(requestBodies[1]?.analysis).toBeUndefined();
  });

  it('Co-Piloto reenvia analysis completo em retry transparente após 404 ANALYSIS_CACHE_MISS', async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const parsed = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      requestBodies.push(parsed);
      if (requestBodies.length === 1) {
        return new Response(
          JSON.stringify({
            analysis_key: 'ak_stale',
            mode: 'heuristic_fallback',
            model: 'heuristic',
            language: 'pt',
            answer: 'Turno 1 inicial',
            reply_markdown: 'Turno 1 inicial',
            four_answers: {
              what: 'w',
              where: 'r',
              how_much: 'h',
              is_significant: 's',
            },
            suggested_questions: [],
            guardrails_applied: [],
          }),
          { status: 200 },
        );
      }
      if (requestBodies.length === 2) {
        return new Response(
          JSON.stringify({ code: 'ANALYSIS_CACHE_MISS', error: 'Cache expirado' }),
          { status: 404 },
        );
      }
      return new Response(
        JSON.stringify({
          analysis_key: 'ak_fresh',
          mode: 'llm_gemini',
          model: 'gemini-2.5-flash',
          language: 'pt',
          answer: 'Recuperado após retry',
          reply_markdown: 'Recuperado após retry',
          four_answers: {
            what: 'w',
            where: 'r',
            how_much: 'h',
            is_significant: 's',
          },
          suggested_questions: [],
          guardrails_applied: [],
        }),
        { status: 200 },
      );
    });

    const adapter = createRegionDataAdapter({
      mode: 'api',
      apiBaseUrl: 'http://localhost:8000',
      fetchFn: fetchMock as unknown as typeof fetch,
      cache: new RegionAnalysisCache(),
    });

    const analysisObj = structuredClone(mockAnalysisJson) as never;
    await adapter.askStatisticalCopilot({ analysis: analysisObj, question: 'Turno 1', language: 'pt' });
    const recovered = await adapter.askStatisticalCopilot({
      analysis: analysisObj,
      question: 'Turno 2 após reiniciar servidor',
      language: 'pt',
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(requestBodies[1]?.analysis_key).toBe('ak_stale');
    expect(requestBodies[1]?.analysis).toBeUndefined();
    expect(requestBodies[2]?.analysis).toBeDefined();
    expect(recovered.answer).toBe('Recuperado após retry');
  });
});
