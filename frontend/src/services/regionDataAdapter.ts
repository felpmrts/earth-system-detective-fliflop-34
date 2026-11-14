import {
  getIntersectingDateBounds,
  resolveCanonicalGridVariableId,
} from '../contracts/catalog.ts';
import {
  isSemanticErrorPayload,
  validateAnalysisResponse,
  validateGlobalGrid,
} from '../contracts/contractValidator.ts';
import type {
  DataMode,
  GlobalGridFile,
  RegionAnalysisRequest,
  RegionAnalysisResponse,
  RegionSelection,
  SemanticErrorCode,
  VariableId,
} from '../contracts/types.ts';
import { toBackendCells } from '../geo/gridGeometry.ts';
import { defaultRegionCache, type RegionAnalysisCache } from './idbCache.ts';

export class SemanticApiError extends Error {
  readonly code: SemanticErrorCode;
  readonly status: number;

  constructor(code: SemanticErrorCode, message: string, status: number) {
    super(message);
    this.name = 'SemanticApiError';
    this.code = code;
    this.status = status;
  }
}

export interface GetRegionDataParams {
  readonly variable: VariableId;
  readonly variableB?: VariableId | null;
  readonly region: RegionSelection;
  readonly regionB?: RegionSelection | null;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly signal?: AbortSignal;
}

export interface AdapterConfig {
  readonly mode: DataMode;
  readonly apiBaseUrl: string;
  readonly timeoutMs: number;
  readonly fetchFn: typeof fetch;
  readonly cache: RegionAnalysisCache;
}

function readEnvConfig(): Pick<AdapterConfig, 'mode' | 'apiBaseUrl'> {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const rawMode = env?.VITE_DATA_MODE;
  const mode: DataMode = rawMode === 'api' ? 'api' : 'offline';
  const apiBaseUrl = (env?.VITE_API_BASE_URL ?? 'http://localhost:8000').replace(/\/+$/, '');
  return { mode, apiBaseUrl };
}

export function buildRegionCacheKey(params: {
  variableA: VariableId;
  variableB: VariableId | null;
  regionAId: string;
  regionBId: string | null;
  startDate: string;
  endDate: string;
}): string {
  return [
    params.variableA,
    params.variableB ?? 'none',
    params.regionAId,
    params.regionBId ?? 'none',
    params.startDate,
    params.endDate,
  ].join('|');
}

function buildRequestBody(params: GetRegionDataParams): RegionAnalysisRequest {
  const variableB = params.variableB ?? null;
  const bounds = getIntersectingDateBounds(params.variable, variableB);
  const startDate =
    params.startDate && params.startDate >= bounds.startDate ? params.startDate : bounds.startDate;
  const endDate = params.endDate && params.endDate <= bounds.endDate ? params.endDate : bounds.endDate;

  if (startDate > endDate) {
    throw new Error(`INVALID_DATE_INTERSECTION: ${startDate} > ${endDate}`);
  }

  return {
    variable_a: params.variable,
    variable_b: variableB,
    region_a: {
      slot: 'A',
      region_id: params.region.region_id,
      source_model: params.region.source_model,
      grid_resolution: params.region.grid_resolution,
      cells: toBackendCells(params.region.cells),
    },
    region_b: params.regionB
      ? {
          slot: 'B',
          region_id: params.regionB.region_id,
          source_model: params.regionB.source_model,
          grid_resolution: params.regionB.grid_resolution,
          cells: toBackendCells(params.regionB.cells),
        }
      : null,
    start_date: startDate,
    end_date: endDate,
  };
}

/** Mescla o AbortSignal externo do chamador com o timeout de segurança da requisição. */
function createLinkedController(
  externalSignal: AbortSignal | undefined,
  timeoutMs: number,
): { controller: AbortController; cleanup: () => void } {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error('REQUEST_TIMEOUT')), timeoutMs);

  const onExternalAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  const cleanup = () => {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  };

  return { controller, cleanup };
}

export function createRegionDataAdapter(overrides: Partial<AdapterConfig> = {}) {
  const envDefaults = readEnvConfig();
  const config: AdapterConfig = {
    mode: overrides.mode ?? envDefaults.mode,
    apiBaseUrl: overrides.apiBaseUrl ?? envDefaults.apiBaseUrl,
    timeoutMs: overrides.timeoutMs ?? 5000,
    fetchFn: overrides.fetchFn ?? fetch,
    cache: overrides.cache ?? defaultRegionCache,
  };

  async function loadOfflineFallback(signal?: AbortSignal): Promise<RegionAnalysisResponse> {
    const res = await config.fetchFn('/data/mock_analysis.json', { signal });
    if (!res.ok) {
      throw new Error(`BACKEND_UNAVAILABLE: fallback offline falhou (${res.status})`);
    }
    const raw: unknown = await res.json();
    const validated = validateAnalysisResponse(raw);
    return {
      ...validated,
      request_meta: {
        ...validated.request_meta,
        source: 'offline_fallback',
      },
    };
  }

  /** Fluxo A: carrega a camada global pré-processada ({var_id}_grid.json) de public/data/. */
  async function getGlobalGrid(variableId: VariableId, signal?: AbortSignal): Promise<GlobalGridFile> {
    const canonicalId = resolveCanonicalGridVariableId(variableId);
    const res = await config.fetchFn(`/data/${canonicalId}_grid.json`, { signal });
    if (!res.ok) {
      throw new Error(`Falha ao carregar grid global de ${canonicalId} (${res.status})`);
    }
    const raw: unknown = await res.json();
    return validateGlobalGrid(raw);
  }

  /**
   * Fluxo B: consulta exclusivamente o backend Python (stats_engine.py) em modo "api"
   * ou pacotes locais em public/data/ em modo "offline", com cache em IndexedDB.
   */
  async function getRegionData(params: GetRegionDataParams): Promise<RegionAnalysisResponse> {
    const requestBody = buildRequestBody(params);
    const cacheKey = buildRegionCacheKey({
      variableA: requestBody.variable_a,
      variableB: requestBody.variable_b,
      regionAId: requestBody.region_a.region_id,
      regionBId: requestBody.region_b?.region_id ?? null,
      startDate: requestBody.start_date,
      endDate: requestBody.end_date,
    });

    const cached = await config.cache.get(cacheKey);
    if (params.signal?.aborted) {
      throw params.signal.reason ?? new DOMException('Aborted', 'AbortError');
    }
    if (cached) {
      return {
        ...cached,
        request_meta: {
          ...cached.request_meta,
          source: 'idb_cache',
        },
      };
    }

    if (config.mode === 'offline') {
      const offlineData = await loadOfflineFallback(params.signal);
      await config.cache.set(cacheKey, offlineData);
      return offlineData;
    }

    const { controller, cleanup } = createLinkedController(params.signal, config.timeoutMs);
    try {
      if (controller.signal.aborted) {
        throw controller.signal.reason ?? new DOMException('Aborted', 'AbortError');
      }
      const res = await config.fetchFn(`${config.apiBaseUrl}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!res.ok) {
        if (res.status >= 400 && res.status < 500) {
          let errBody: unknown = null;
          try {
            errBody = await res.json();
          } catch {
            errBody = null;
          }
          if (isSemanticErrorPayload(errBody)) {
            throw new SemanticApiError(errBody.code, errBody.error, res.status);
          }
        }
        throw new Error(`HTTP ${res.status} do backend Python`);
      }

      const raw: unknown = await res.json();
      const validated = validateAnalysisResponse(raw);
      await config.cache.set(cacheKey, validated);
      return validated;
    } catch (err) {
      // Se o próprio chamador cancelou a requisição ou o backend retornou erro semântico 4xx
      // (ex.: OCEAN_MASK_NO_DATA), propaga o erro sem mascarar com fallback offline.
      if (params.signal?.aborted || err instanceof SemanticApiError) {
        throw err;
      }
      // Em falha de rede, 5xx ou timeout do backend, aciona o fallback offline local garantido.
      return await loadOfflineFallback(params.signal);
    } finally {
      cleanup();
    }
  }

  return {
    getGlobalGrid,
    getRegionData,
  };
}

const defaultAdapter = createRegionDataAdapter();
export const getGlobalGrid = defaultAdapter.getGlobalGrid;
export const getRegionData = defaultAdapter.getRegionData;
