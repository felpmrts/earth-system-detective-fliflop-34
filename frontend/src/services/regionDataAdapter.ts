import { getIntersectingDateBounds, resolveGridVariableId } from '../contracts/catalog.ts';
import { validateAnalysisResponse, validateGlobalGrid } from '../contracts/contractValidator.ts';
import type {
  DataMode,
  GlobalGridFile,
  RegionAnalysisRequest,
  RegionAnalysisResponse,
  RegionSelection,
  VariableId,
} from '../contracts/types.ts';
import { toBackendCells } from '../geo/gridGeometry.ts';
import { defaultRegionCache, type RegionAnalysisCache } from './idbCache.ts';

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

export interface BackendCatalogVariable {
  readonly code: string;
  readonly ui_name: string;
  readonly connector_id: string;
  readonly mode: string;
  readonly grid_type: string;
  readonly unit: string;
}

export interface BackendCatalogFamily {
  readonly family_id: string;
  readonly name: string;
  readonly variables: readonly BackendCatalogVariable[];
}

export interface BackendCatalog {
  readonly total_variables: number;
  readonly families: readonly BackendCatalogFamily[];
}

export class GlobalGridLoadError extends Error {
  readonly status: number;
  readonly gridVariableId: VariableId;

  constructor(status: number, gridVariableId: VariableId) {
    super(`Falha ao carregar grid global de ${gridVariableId} (${status})`);
    this.name = 'GlobalGridLoadError';
    this.status = status;
    this.gridVariableId = gridVariableId;
  }
}

export function buildGlobalGridUrl(
  variableId: VariableId,
  baseUrl?: string,
): { readonly resolvedVariableId: VariableId; readonly url: string } {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const resolvedVariableId = resolveGridVariableId(variableId);
  const rawBase = baseUrl ?? env?.BASE_URL ?? '/';
  const normalizedBase = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
  return {
    resolvedVariableId,
    url: `${normalizedBase}data/${resolvedVariableId}_grid.json`,
  };
}

function readEnvConfig(): Pick<AdapterConfig, 'mode' | 'apiBaseUrl'> {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const rawMode = env?.VITE_DATA_MODE;
  const mode: DataMode = rawMode === 'offline' ? 'offline' : 'api';
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
    // A primeira consulta pode incluir duas séries mensais e preencher o cache do backend.
    timeoutMs: overrides.timeoutMs ?? 30000,
    // Não armazene `window.fetch` diretamente: alguns navegadores exigem que ele
    // seja invocado com o contexto global e lançam "Illegal invocation" caso contrário.
    fetchFn: overrides.fetchFn ?? ((input, init) => globalThis.fetch(input, init)),
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

  /** Fluxo A: carrega a camada global pré-processada ({var_id}_grid.json) de public/data/, resolvendo aliases. */
  async function getGlobalGrid(variableId: VariableId, signal?: AbortSignal): Promise<GlobalGridFile> {
    const { resolvedVariableId, url } = buildGlobalGridUrl(variableId);
    const res = await config.fetchFn(url, { signal });
    if (!res.ok) {
      throw new GlobalGridLoadError(res.status, resolvedVariableId);
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
    const cacheKey = `${config.mode}|${buildRegionCacheKey({
      variableA: requestBody.variable_a,
      variableB: requestBody.variable_b,
      regionAId: requestBody.region_a.region_id,
      regionBId: requestBody.region_b?.region_id ?? null,
      startDate: requestBody.start_date,
      endDate: requestBody.end_date,
    })}`;

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
        let message = `HTTP ${res.status} do backend Python`;
        try {
          const payload = await res.json() as { error?: unknown };
          if (typeof payload.error === 'string' && payload.error.trim()) message = payload.error;
        } catch {
          // Mantém a mensagem HTTP quando a resposta não contém JSON.
        }
        throw new Error(message);
      }

      const raw: unknown = await res.json();
      const validated = validateAnalysisResponse(raw);
      await config.cache.set(cacheKey, validated);
      return validated;
    } catch (err) {
      // Em modo API, nunca substitui silenciosamente dados reais pelo mock.
      throw err;
    } finally {
      cleanup();
    }
  }

  async function getBackendCatalog(signal?: AbortSignal): Promise<BackendCatalog> {
    const res = await config.fetchFn(`${config.apiBaseUrl}/api/catalog`, { signal });
    if (!res.ok) throw new Error(`Catálogo do backend indisponível (HTTP ${res.status})`);
    const raw: unknown = await res.json();
    if (!raw || typeof raw !== 'object' || !Array.isArray((raw as BackendCatalog).families)) {
      throw new Error('Resposta inválida de /api/catalog');
    }
    return raw as BackendCatalog;
  }

  return {
    getGlobalGrid,
    getRegionData,
    getBackendCatalog,
  };
}

const defaultAdapter = createRegionDataAdapter();
export const getGlobalGrid = defaultAdapter.getGlobalGrid;
export const getRegionData = defaultAdapter.getRegionData;
export const getBackendCatalog = defaultAdapter.getBackendCatalog;
