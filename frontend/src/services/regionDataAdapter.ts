import {
  getIntersectingDateBounds,
  resolveGridVariableId,
  VARIABLE_LIST,
} from '../contracts/catalog.ts';
import { validateAnalysisResponse, validateGlobalGrid } from '../contracts/contractValidator.ts';
import type {
  CopilotHistoryTurn,
  CopilotResponse,
  CopilotToolExecution,
  DataMode,
  GlobalGridFile,
  RegionAnalysisRequest,
  RegionAnalysisResponse,
  RegionSelection,
  VariableId,
  VariableStatistics,
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

export function getConfiguredDataMode(): DataMode {
  return readEnvConfig().mode;
}

export function buildLocalCatalog(): BackendCatalog {
  const byDomain = new Map<string, BackendCatalogVariable[]>();
  for (const meta of VARIABLE_LIST) {
    const items = byDomain.get(meta.domain) ?? [];
    items.push({
      code: meta.variable_id,
      ui_name: meta.variable_name,
      connector_id: 'nasa_power',
      mode: 'realtime',
      grid_type: meta.source_model,
      unit: meta.unit,
    });
    byDomain.set(meta.domain, items);
  }

  const families: BackendCatalogFamily[] = [...byDomain.entries()].map(([domain, variables], index) => ({
    family_id: `local_${index + 1}`,
    name: domain,
    variables,
  }));

  return {
    total_variables: VARIABLE_LIST.length,
    families,
  };
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
    timeoutMs: overrides.timeoutMs ?? 90000,
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

    const contentType = res.headers?.get('content-type') ?? '';
    const text = await res.text();
    const trimmed = text.trimStart().toLowerCase();
    if (contentType.includes('text/html') || trimmed.startsWith('<!doctype') || trimmed.startsWith('<html')) {
      throw new GlobalGridLoadError(404, resolvedVariableId);
    }

    const raw: unknown = JSON.parse(text);
    return validateGlobalGrid(raw);
  }

  /**
   * Fluxo B: consulta exclusivamente o backend Python (stats_engine.py) em modo "api"
   * ou pacotes locais em public/data/ em modo "offline", com cache em IndexedDB.
   */
  async function getRegionData(params: GetRegionDataParams): Promise<RegionAnalysisResponse> {
    const requestBody = buildRequestBody(params);
    const cacheKey = `analysis-v2|${config.mode}|${buildRegionCacheKey({
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
    if (config.mode === 'offline') {
      if (signal?.aborted) {
        throw signal.reason ?? new DOMException('Aborted', 'AbortError');
      }
      return buildLocalCatalog();
    }

    const res = await config.fetchFn(`${config.apiBaseUrl}/api/catalog`, { signal });
    if (!res.ok) throw new Error(`Catálogo do backend indisponível (HTTP ${res.status})`);
    const raw: unknown = await res.json();
    if (!raw || typeof raw !== 'object' || !Array.isArray((raw as BackendCatalog).families)) {
      throw new Error('Resposta inválida de /api/catalog');
    }
    return raw as BackendCatalog;
  }

  const cachedAnalysisKeys = new WeakMap<RegionAnalysisResponse, string>();

  async function askStatisticalCopilot(params: AskCopilotParams): Promise<CopilotResponse> {
    const baseline = buildClientCopilotResponse(params);
    if (config.mode === 'offline') {
      if (params.signal?.aborted) {
        throw params.signal.reason ?? new DOMException('Aborted', 'AbortError');
      }
      return baseline;
    }

    const compactHistory = params.history?.slice(-6).map(turn => ({
      role: turn.role,
      content: turn.content,
    }));
    const knownKey = cachedAnalysisKeys.get(params.analysis);
    const { controller, cleanup } = createLinkedController(params.signal, 15000);

    const postCopilot = async (includeFullAnalysis: boolean) => {
      const payload =
        !includeFullAnalysis && knownKey
          ? {
              analysis_key: knownKey,
              question: params.question?.trim() || undefined,
              language: params.language ?? 'pt',
              history: compactHistory,
            }
          : {
              analysis: params.analysis,
              ...(knownKey ? { analysis_key: knownKey } : {}),
              question: params.question?.trim() || undefined,
              language: params.language ?? 'pt',
              history: compactHistory,
            };

      return config.fetchFn(`${config.apiBaseUrl}/api/copilot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    };

    try {
      let res = await postCopilot(!knownKey);
      if (res.status === 404 && knownKey) {
        res = await postCopilot(true);
      }
      if (!res.ok) return baseline;
      const raw: unknown = await res.json();
      const adapted = adaptServerCopilotPayload(raw, baseline);
      if (adapted.analysis_key) {
        cachedAnalysisKeys.set(params.analysis, adapted.analysis_key);
      }
      return adapted;
    } catch (err) {
      if (params.signal?.aborted) throw err;
      return baseline;
    } finally {
      cleanup();
    }
  }

  return {
    getGlobalGrid,
    getRegionData,
    getBackendCatalog,
    askStatisticalCopilot,
  };
}

export interface AskCopilotParams {
  readonly analysis: RegionAnalysisResponse;
  readonly question?: string;
  readonly language?: 'pt' | 'en';
  readonly history?: readonly CopilotHistoryTurn[];
  readonly signal?: AbortSignal;
}

type CopilotLang = 'pt' | 'en';
type CopilotIntent = 'scale' | 'outliers' | 'significance' | 'regime' | 'comparison' | 'trend' | 'general';

const COPILOT_REGIME_LABELS: Readonly<Record<CopilotLang, Readonly<Record<string, string>>>> = {
  pt: {
    linear: 'tendência linear persistente',
    linear_trend: 'tendência linear persistente',
    accelerating_rise: 'elevação acelerada (não-linear, B₂ > 0)',
    accelerating_increase: 'elevação acelerada (não-linear, B₂ > 0)',
    accelerating_decline: 'queda acelerada (não-linear, B₂ < 0)',
    saturating: 'desaceleração / saturação ou inflexão',
    decelerating_or_shifting: 'desaceleração, saturação ou inflexão de regime',
    non_monotonic: 'comportamento não monotônico',
    stable: 'regime estacionário sem aceleração expressiva',
  },
  en: {
    linear: 'persistent linear trend',
    linear_trend: 'persistent linear trend',
    accelerating_rise: 'accelerating rise (nonlinear, B₂ > 0)',
    accelerating_increase: 'accelerating rise (nonlinear, B₂ > 0)',
    accelerating_decline: 'accelerating decline (nonlinear, B₂ < 0)',
    saturating: 'deceleration / saturation or regime shift',
    decelerating_or_shifting: 'deceleration, saturation, or regime shift',
    non_monotonic: 'non-monotonic behavior',
    stable: 'stationary regime without substantial acceleration',
  },
};

const COPILOT_PARADOX_LABELS: Readonly<Record<CopilotLang, Readonly<Record<string, string>>>> = {
  pt: {
    OPPOSING_SECULAR_AND_COUPLED_DIPOLE: 'Dipolo de divergência espacial e acoplamento inverso',
    MULTISCALE_PARADOX_POS_GLOBAL_NEG_LOCAL:
      'Paradoxo Multiescala (correlação secular positiva vs. oposição interanual negativa)',
    MULTISCALE_PARADOX_NEG_GLOBAL_POS_LOCAL:
      'Paradoxo Multiescala (oposição secular negativa vs. sincronia interanual positiva)',
    COHERENT_MULTISCALE_COUPLING: 'Acoplamento coerente em longo e curto prazo',
    LOCAL_PHYSICAL_COUPLING: 'Acoplamento físico local entre variáveis na mesma região',
  },
  en: {
    OPPOSING_SECULAR_AND_COUPLED_DIPOLE: 'Spatial divergence dipole and inverse coupling',
    MULTISCALE_PARADOX_POS_GLOBAL_NEG_LOCAL:
      'Multiscale Paradox (positive secular correlation vs. negative short-term opposition)',
    MULTISCALE_PARADOX_NEG_GLOBAL_POS_LOCAL:
      'Multiscale Paradox (negative secular opposition vs. positive short-term synchrony)',
    COHERENT_MULTISCALE_COUPLING: 'Coherent long- and short-term coupling',
    LOCAL_PHYSICAL_COUPLING: 'Local physical coupling across variables in the same region',
  },
};

function fmtSigned(value: number, decimals = 4): string {
  const fixed = value.toFixed(decimals);
  return value > 0 ? `+${fixed}` : fixed;
}

function fmtPVal(value: number): string {
  return value < 0.0001 ? value.toExponential(1) : value.toFixed(4);
}

function getCopilotGuardrails(lang: CopilotLang): readonly string[] {
  return lang === 'en'
    ? [
        'OLS & Theil-Sen fitted across all monthly climatological anomalies (no endpoint subtraction)',
        'Interval scale rule enforced: percentages (%) strictly blocked when allow_percentage_change=false',
        'Autocorrelation-corrected significance via AR(1) effective sample size (n_eff) & Benjamini-Hochberg FDR',
        'GAM curvature (B2) and Mahalanobis extremes (D_M > 2.5) preserved without outlier trimming',
        'Multiscale separation between secular decadal coupling (r_global) and detrended noise (r_detrended)',
      ]
    : [
        'Regressões OLS e Theil–Sen sobre toda a nuvem de anomalias climatológicas mensais (proibido Y_fim − Y_início)',
        'Invariante de escala intervalar: variação em % estritamente bloqueada quando allow_percentage_change=false',
        'Significância corrigida para memória temporal AR(1) (N_efetivo) e controle Benjamini–Hochberg FDR',
        'Curvatura GAM (B₂) e extremos de Mahalanobis (D_M > 2,5) preservados sem descarte de picos',
        'Separação multiescala entre acoplamento secular de longo prazo (r_global) e curto prazo (r_detrended)',
      ];
}

function getSuggestedQuestions(hasComparison: boolean, lang: CopilotLang): readonly string[] {
  if (lang === 'en') {
    const base = [
      'Why use Theil-Sen and OLS instead of endpoint minus start?',
      'Is this trend statistically real or natural El Nino noise?',
      'What do the Mahalanobis extreme events tell us in this series?',
      'Why are percentages (%) forbidden on interval scales?',
    ];
    return hasComparison
      ? ['How do I interpret the multiscale comparison between A and B?', ...base.slice(0, 3)]
      : base;
  }
  const base = [
    'Por que usar Theil–Sen e OLS em vez de ponto final menos inicial?',
    'Essa tendência é mudança estrutural real ou ruído de El Niño?',
    'O que indicam os eventos extremos de Mahalanobis nesta série?',
    'Por que não usamos variação percentual em temperatura (°C)?',
  ];
  return hasComparison
    ? ['Como interpretar o paradoxo multiescala entre A e B?', ...base.slice(0, 3)]
    : base;
}

function classifyCopilotIntent(question: string, hasComparison: boolean): CopilotIntent {
  const q = question.toLowerCase();
  if (/porcent|%|percent|escala|scale|interval|ratio|raz[aã]o|celsius|°c/.test(q)) return 'scale';
  if (/outlier|extremo|extreme|mahalanobis|pico|elipse|ellipse/.test(q)) return 'outliers';
  if (/ru[ií]do|noise|el\s*ni[nñ]o|enso|signific|ar\(?1\)?|fdr|p-?valor|q-?valor|confian[cç]a/.test(q)) {
    return 'significance';
  }
  if (/gam|spline|acelera|accelerat|regime|curva|curve|n[aã]o-?linear|nonlinear|satur|b2/.test(q)) return 'regime';
  if (hasComparison && /paradox|multiescala|multiscale|compar|regi[aã]o\s*b|region\s*b|diverg|dipolo|coupling|acoplamento/.test(q)) {
    return 'comparison';
  }
  if (/theil|sen|ols|inclina|slope|taxa|rate|tend[eê]ncia|trend|quanto|how\s*much|ponto\s*final|endpoint/.test(q)) {
    return 'trend';
  }
  return 'general';
}

function formatSlotEvidence(
  slot: 'A' | 'B',
  stats: VariableStatistics,
  regionId: string,
  lang: CopilotLang,
): string {
  const { regression: reg, significance: sig, correlation_and_coupling: corr, period } = stats;
  const senStr = `${fmtSigned(reg.slope_per_decade_sen)} ${stats.trend_unit}`;
  const ciStr = `[${fmtSigned(reg.slope_ci95_low)}, ${fmtSigned(reg.slope_ci95_high)}]`;
  const olsStr = `${fmtSigned(reg.slope_per_decade_ols)} ${stats.trend_unit}`;
  const sigFlag = sig.is_significant_fdr05;

  if (lang === 'en') {
    return (
      `Region ${slot} (${regionId} · ${stats.variable_id}): Theil-Sen = ${senStr} (95% CI ${ciStr}), ` +
      `OLS = ${olsStr}, cumulative model delta = ${fmtSigned(reg.cumulative_model_change)} ${stats.unit}. ` +
      `Coupling r = ${fmtSigned(corr.pearson_r, 3)}, tau = ${fmtSigned(corr.kendall_tau, 3)}, ` +
      `n = ${period.n_observations} months (AR(1) n_eff = ${period.n_effective_ar1.toFixed(1)}), ` +
      `p_AR1 = ${fmtPVal(sig.p_value_ar1_corrected)}, q_FDR = ${fmtPVal(sig.fdr_q_value)} ` +
      `(${sigFlag ? 'FDR-significant' : 'not FDR-significant'}; tier ${sig.confidence_tier}).`
    );
  }
  return (
    `Região ${slot} (${regionId} · ${stats.variable_id}): Theil–Sen = ${senStr} (IC 95% ${ciStr}), ` +
    `OLS = ${olsStr}, variação acumulada do modelo = ${fmtSigned(reg.cumulative_model_change)} ${stats.unit}. ` +
    `Acoplamento r = ${fmtSigned(corr.pearson_r, 3)}, τ = ${fmtSigned(corr.kendall_tau, 3)}, ` +
    `n = ${period.n_observations} meses (N_efetivo AR(1) = ${period.n_effective_ar1.toFixed(1)}), ` +
    `p_AR1 = ${fmtPVal(sig.p_value_ar1_corrected)}, q_FDR = ${fmtPVal(sig.fdr_q_value)} ` +
    `(${sigFlag ? 'significativa em FDR < 0,05' : 'sem significância FDR < 0,05'}; nível ${sig.confidence_tier}).`
  );
}

function answerQuestionFromAnalysis(
  question: string,
  analysis: RegionAnalysisResponse,
  lang: CopilotLang,
): string {
  const regA = analysis.region_a_analysis;
  const regB = analysis.region_b_analysis;
  const comp = analysis.comparison_pair;
  const intent = classifyCopilotIntent(question, Boolean(comp));
  const topOutlierA = [...regA.outliers_mahalanobis].sort((a, b) => b.mahalanobis_d - a.mahalanobis_d)[0];
  const regimeA = COPILOT_REGIME_LABELS[lang][regA.regression.regime_shape] ?? regA.regression.regime_shape;

  switch (intent) {
    case 'trend':
      return lang === 'en'
        ? `Using all ${regA.period.n_observations} deseasonalized monthly anomalies of ${regA.variable_id}, ` +
            `robust Theil-Sen gives ${fmtSigned(regA.regression.slope_per_decade_sen)} ${regA.trend_unit} ` +
            `(95% CI [${fmtSigned(regA.regression.slope_ci95_low)}, ${fmtSigned(regA.regression.slope_ci95_high)}]) ` +
            `and OLS gives ${fmtSigned(regA.regression.slope_per_decade_ols)} ${regA.trend_unit}. ` +
            `Endpoint subtraction is rejected because ENSO peaks at either boundary corrupt naive deltas.`
        : `Usando todas as ${regA.period.n_observations} anomalias mensais dessazonalizadas de ${regA.variable_id}, ` +
            `a mediana robusta Theil–Sen mede ${fmtSigned(regA.regression.slope_per_decade_sen)} ${regA.trend_unit} ` +
            `(IC 95% [${fmtSigned(regA.regression.slope_ci95_low)}, ${fmtSigned(regA.regression.slope_ci95_high)}]) ` +
            `e o ajuste OLS indica ${fmtSigned(regA.regression.slope_per_decade_ols)} ${regA.trend_unit}. ` +
            `Evitamos (Y_fim − Y_início) porque extremos nas pontas da série distorcem o sinal climático.`;
    case 'outliers': {
      const countA = regA.outliers_mahalanobis.length;
      const countB = regB?.outliers_mahalanobis.length ?? 0;
      const peakMsg = topOutlierA
        ? lang === 'en'
          ? ` Peak event in A: ${topOutlierA.date} (D_M=${topOutlierA.mahalanobis_d.toFixed(2)}, ${topOutlierA.diagnostic_hint}).`
          : ` Pico em A: ${topOutlierA.date} (D_M=${topOutlierA.mahalanobis_d.toFixed(2)}, ${topOutlierA.diagnostic_hint}).`
        : '';
      return lang === 'en'
        ? `Mahalanobis distance (D_M > 2.5) flags extreme months outside the joint trend ellipse without removing them: ` +
            `${countA} outlier(s) in A${regB ? ` and ${countB} in B` : ''}.${peakMsg}`
        : `A Distância de Mahalanobis (D_M > 2,5) sinaliza meses extremos fora da elipse de tendência sem apagá-los: ` +
            `${countA} evento(s) extremo(s) em A${regB ? ` e ${countB} em B` : ''}.${peakMsg}`;
    }
    case 'significance':
      return lang === 'en'
        ? `Climate anomalies carry serial memory. AR(1) compresses ${regA.period.n_observations} raw months to ` +
            `n_eff = ${regA.period.n_effective_ar1.toFixed(1)}, yielding p_AR1 = ${fmtPVal(regA.significance.p_value_ar1_corrected)} ` +
            `and Benjamini-Hochberg q_FDR = ${fmtPVal(regA.significance.fdr_q_value)} (${regA.significance.confidence_tier}). ` +
            `Coupling is r = ${fmtSigned(regA.correlation_and_coupling.pearson_r, 3)}.`
        : `Séries climáticas possuem memória temporal. A correção AR(1) ajusta os ${regA.period.n_observations} meses ` +
            `para N_efetivo = ${regA.period.n_effective_ar1.toFixed(1)}, resultando em p_AR1 = ${fmtPVal(regA.significance.p_value_ar1_corrected)} ` +
            `e q_FDR = ${fmtPVal(regA.significance.fdr_q_value)} (${regA.significance.confidence_tier}). ` +
            `O acoplamento r = ${fmtSigned(regA.correlation_and_coupling.pearson_r, 3)} quantifica a dispersão em torno dessa tendência.`;
    case 'scale':
      return !regA.allow_percentage_change || (regB && !regB.allow_percentage_change)
        ? lang === 'en'
          ? `Interval variables (${regA.variable_id} in ${regA.unit}) lack a physical zero point, so dividing changes to get relative ratios is mathematically invalid (Invariant #3). All slopes use ${regA.trend_unit}.`
          : `Variáveis em escala intervalar (${regA.variable_id} em ${regA.unit}) não têm zero físico absoluto; expressar mudanças em variação relativa percentual é matematicamente inválido (Invariante #3). Todas as taxas permanecem em ${regA.trend_unit}.`
        : lang === 'en'
          ? `${regA.variable_id} uses a ratio scale (${regA.unit}) with true physical zero; however, all rates remain audited in ${regA.trend_unit}.`
          : `${regA.variable_id} está em escala de razão (${regA.unit}) com zero físico definido; mantemos as taxas auditadas em ${regA.trend_unit}.`;
    case 'regime':
      return lang === 'en'
        ? `The GAM smoothing fit reports regime "${regimeA}" for ${regA.variable_id} with quadratic acceleration B₂ = ${fmtSigned(regA.regression.quadratic_acceleration_B2, 5)}, avoiding artificial edge oscillations.`
        : `A curva suave GAM identifica regime "${regimeA}" para ${regA.variable_id} com aceleração quadrática B₂ = ${fmtSigned(regA.regression.quadratic_acceleration_B2, 5)}, evitando oscilações artificiais nas pontas.`;
    case 'comparison':
      if (comp) {
        const mc = comp.multiscale_correlation;
        const paradoxDesc = COPILOT_PARADOX_LABELS[lang][mc.paradox_type] ?? mc.paradox_type;
        return lang === 'en'
          ? `${paradoxDesc} (${mc.paradox_type}): long-term secular r = ${fmtSigned(mc.long_term_secular_r, 3)} vs. detrended short-term r = ${fmtSigned(mc.short_term_detrended_r, 3)}. ${mc.interpretation}`
          : `${paradoxDesc} (${mc.paradox_type}): correlação secular r_global = ${fmtSigned(mc.long_term_secular_r, 3)} vs. curto prazo sem tendência r_detrended = ${fmtSigned(mc.short_term_detrended_r, 3)}. ${mc.interpretation}`;
      }
      break;
    case 'general':
      break;
  }

  return lang === 'en'
    ? `For ${regA.variable_id} in ${analysis.request_meta.region_a_id}, Theil-Sen is ${fmtSigned(regA.regression.slope_per_decade_sen)} ${regA.trend_unit} (${regimeA}, q_FDR = ${fmtPVal(regA.significance.fdr_q_value)}). ` +
        `Ask specifically about trends, AR(1) significance, Mahalanobis extremes, GAM acceleration, or multiscale A vs B coupling.`
    : `Para ${regA.variable_id} em ${analysis.request_meta.region_a_id}, Theil–Sen indica ${fmtSigned(regA.regression.slope_per_decade_sen)} ${regA.trend_unit} (${regimeA}, q_FDR = ${fmtPVal(regA.significance.fdr_q_value)}). ` +
        `Você pode perguntar sobre declive, significância AR(1)/FDR, extremos de Mahalanobis, curvatura GAM ou comparação A × B.`;
}

/** Garante no cliente o Invariante #3: remove números com '%' quando há variável intervalar bloqueada. */
function enforceIntervalGuardrail(text: string, analysis: RegionAnalysisResponse): string {
  const blockPct =
    !analysis.region_a_analysis.allow_percentage_change ||
    (analysis.region_b_analysis ? !analysis.region_b_analysis.allow_percentage_change : false);
  if (!blockPct) return text;
  return text.replace(/(?<!IC 95)(?<!95)\s*%/g, ' (unid. física)');
}

/**
 * Gera interpretação científica 100% determinística no cliente (< 5 ms), usando exclusivamente
 * os números já validados no `RegionAnalysisResponse` atual.
 */
export function buildClientCopilotResponse(params: AskCopilotParams): CopilotResponse {
  const lang: CopilotLang = params.language === 'en' ? 'en' : 'pt';
  const { analysis } = params;
  const regA = analysis.region_a_analysis;
  const regB = analysis.region_b_analysis;
  const comp = analysis.comparison_pair;
  const meta = analysis.request_meta;

  const evidenceA = formatSlotEvidence('A', regA, meta.region_a_id, lang);
  const evidenceB = regB && meta.region_b_id ? formatSlotEvidence('B', regB, meta.region_b_id, lang) : null;
  const mathematical_evidence = evidenceB ? `${evidenceA}\n${evidenceB}` : evidenceA;

  const regimeA = COPILOT_REGIME_LABELS[lang][regA.regression.regime_shape] ?? regA.regression.regime_shape;
  const regimeB = regB
    ? (COPILOT_REGIME_LABELS[lang][regB.regression.regime_shape] ?? regB.regression.regime_shape)
    : null;
  const compText = comp
    ? lang === 'en'
      ? ` Multiscale A vs B (${comp.multiscale_correlation.paradox_type}): r_global = ${fmtSigned(comp.multiscale_correlation.long_term_secular_r, 3)}, r_detrended = ${fmtSigned(comp.multiscale_correlation.short_term_detrended_r, 3)}. ${comp.multiscale_correlation.interpretation}`
      : ` Comparação multiescala A × B (${comp.multiscale_correlation.paradox_type}): r_global = ${fmtSigned(comp.multiscale_correlation.long_term_secular_r, 3)}, r_detrended = ${fmtSigned(comp.multiscale_correlation.short_term_detrended_r, 3)}. ${comp.multiscale_correlation.interpretation}`
    : '';
  const physical_meaning =
    (lang === 'en'
      ? `Trajectory computed on deseasonalized monthly anomalies: A (${regA.variable_name}) follows "${regimeA}" (B₂ = ${fmtSigned(regA.regression.quadratic_acceleration_B2, 5)})${regimeB && regB ? `; B (${regB.variable_name}) follows "${regimeB}"` : ''}.`
      : `Trajetória avaliada sobre anomalias mensais dessazonalizadas: A (${regA.variable_name}) segue "${regimeA}" (B₂ = ${fmtSigned(regA.regression.quadratic_acceleration_B2, 5)})${regimeB && regB ? `; B (${regB.variable_name}) segue "${regimeB}"` : ''}.`) +
    compText;

  const outlierCount = regA.outliers_mahalanobis.length + (regB?.outliers_mahalanobis.length ?? 0);
  const absR = Math.abs(regA.correlation_and_coupling.pearson_r);
  const riskNotes: string[] = [];
  if (!regA.significance.is_significant_fdr05) {
    riskNotes.push(
      lang === 'en'
        ? `q_FDR = ${fmtPVal(regA.significance.fdr_q_value)} >= 0.05 after AR(1) correction (n_eff = ${regA.period.n_effective_ar1.toFixed(1)}): trend could reflect natural variability.`
        : `q_FDR = ${fmtPVal(regA.significance.fdr_q_value)} >= 0,05 após correção AR(1) (N_efetivo = ${regA.period.n_effective_ar1.toFixed(1)}): sinal ainda indistinguível de variabilidade natural.`,
    );
  }
  if (absR < 0.35) {
    riskNotes.push(
      lang === 'en'
        ? `Low linear coupling (|r| = ${absR.toFixed(2)}, R² = ${regA.correlation_and_coupling.r_squared.toFixed(2)}): high month-to-month spread dominates the mean slope.`
        : `Baixo acoplamento linear (|r| = ${absR.toFixed(2)}, R² = ${regA.correlation_and_coupling.r_squared.toFixed(2)}): forte dispersão intermensal ao redor da reta média.`,
    );
  }
  if (outlierCount > 0) {
    riskNotes.push(
      lang === 'en'
        ? `${outlierCount} bivariate outlier(s) with Mahalanobis D_M > 2.5 detected; compare OLS vs. robust Theil-Sen before interpreting boundary shifts.`
        : `${outlierCount} extremo(s) bivariado(s) com Mahalanobis D_M > 2,5 detectado(s); compare OLS e Theil–Sen antes de interpretar saltos nas pontas.`,
    );
  }
  if (!regA.allow_percentage_change || (regB && !regB.allow_percentage_change)) {
    riskNotes.push(
      lang === 'en'
        ? `Interval scale (${regA.unit}) forbids relative percentage variation; cite only physical units per decade.`
        : `Escala intervalar (${regA.unit}) proíbe variação relativa percentual; utilize apenas unidades físicas por década.`,
    );
  }
  const false_conclusion_risk =
    riskNotes.length > 0
      ? riskNotes.join(' ')
      : lang === 'en'
        ? `AR(1)-corrected significance passed FDR threshold, yet correlation/trend rates never prove standalone physical causality without dynamical attribution.`
        : `Embora a significância corrigida por AR(1) supere o limiar FDR, tendências e correlações não provam causalidade física isolada sem análise de processos acoplados.`;

  const question = params.question?.trim() ?? '';
  const answer = question ? enforceIntervalGuardrail(answerQuestionFromAnalysis(question, analysis, lang), analysis) : null;

  const reply_markdown = [
    enforceIntervalGuardrail(mathematical_evidence, analysis),
    enforceIntervalGuardrail(physical_meaning, analysis),
    enforceIntervalGuardrail(false_conclusion_risk, analysis),
    ...(answer ? [answer] : []),
  ].join('\n\n');

  return {
    synthesis: {
      mathematical_evidence: enforceIntervalGuardrail(mathematical_evidence, analysis),
      physical_meaning: enforceIntervalGuardrail(physical_meaning, analysis),
      false_conclusion_risk: enforceIntervalGuardrail(false_conclusion_risk, analysis),
    },
    answer,
    reply_markdown,
    language: lang,
    mode: 'client_deterministic',
    model: 'client-statistical-synthesizer-v1',
    suggested_questions: getSuggestedQuestions(Boolean(comp), lang),
    guardrails_applied: getCopilotGuardrails(lang),
  };
}

function adaptToolsUsed(rawTools: unknown): readonly CopilotToolExecution[] | undefined {
  if (!Array.isArray(rawTools)) return undefined;
  const parsed: CopilotToolExecution[] = [];
  for (const entry of rawTools) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    if (typeof item.name === 'string' && typeof item.label === 'string') {
      parsed.push({
        name: item.name,
        label: item.label,
        summary: typeof item.summary === 'string' ? item.summary : '',
        status:
          item.status === 'unavailable' || item.status === 'error' ? item.status : 'ok',
        duration_ms: typeof item.duration_ms === 'number' ? item.duration_ms : 0,
      });
    }
  }
  return parsed.length > 0 ? parsed : undefined;
}

function adaptServerCopilotPayload(raw: unknown, fallback: CopilotResponse): CopilotResponse {
  if (!raw || typeof raw !== 'object') return fallback;
  const obj = raw as Record<string, unknown>;
  const toolsUsed = adaptToolsUsed(obj.tools_used);
  const analysisKey = typeof obj.analysis_key === 'string' ? obj.analysis_key : undefined;
  const guardrails = Array.isArray(obj.guardrails_applied)
    ? (obj.guardrails_applied as string[])
    : fallback.guardrails_applied;
  const invariantWarnings = Array.isArray(obj.invariant_warnings)
    ? (obj.invariant_warnings as string[])
    : undefined;
  const serverMode: CopilotResponse['mode'] =
    obj.mode === 'llm_gemini'
      ? 'llm_gemini'
      : obj.mode === 'heuristic_fallback'
        ? 'heuristic_fallback'
        : fallback.mode;

  if (obj.synthesis && typeof obj.synthesis === 'object' && typeof obj.reply_markdown === 'string') {
    const synth = obj.synthesis as Record<string, unknown>;
    const serverAnswer =
      typeof obj.answer === 'string' && obj.answer.trim()
        ? obj.answer
        : obj.reply_markdown;
    return {
      ...fallback,
      ...(obj as Partial<CopilotResponse>),
      mode: serverMode,
      synthesis: {
        mathematical_evidence:
          typeof synth.mathematical_evidence === 'string'
            ? synth.mathematical_evidence
            : fallback.synthesis.mathematical_evidence,
        physical_meaning:
          typeof synth.physical_meaning === 'string'
            ? synth.physical_meaning
            : fallback.synthesis.physical_meaning,
        false_conclusion_risk:
          typeof synth.false_conclusion_risk === 'string'
            ? synth.false_conclusion_risk
            : fallback.synthesis.false_conclusion_risk,
      },
      answer: serverAnswer,
      guardrails_applied: guardrails,
      invariant_warnings: invariantWarnings,
      tools_used: toolsUsed,
      analysis_key: analysisKey,
    };
  }
  const four = (obj.four_answers ?? undefined) as CopilotResponse['four_answers'];
  const replyMarkdown = typeof obj.reply_markdown === 'string' ? obj.reply_markdown : fallback.reply_markdown;
  if (!four) return fallback;
  const serverAnswer =
    typeof obj.answer === 'string' && obj.answer.trim() ? obj.answer : replyMarkdown;
  return {
    synthesis: {
      mathematical_evidence: `${four.how_much}\n${four.is_significant}`,
      physical_meaning: `${four.what} (${four.where})`,
      false_conclusion_risk: fallback.synthesis.false_conclusion_risk,
    },
    answer: serverAnswer,
    reply_markdown: replyMarkdown,
    language: obj.language === 'en' ? 'en' : 'pt',
    mode: serverMode,
    model: typeof obj.model === 'string' ? obj.model : 'backend-copilot',
    four_answers: four,
    suggested_questions: Array.isArray(obj.suggested_questions)
      ? (obj.suggested_questions as string[])
      : fallback.suggested_questions,
    guardrails_applied: guardrails,
    invariant_warnings: invariantWarnings,
    tools_used: toolsUsed,
    analysis_key: analysisKey,
  };
}

const defaultAdapter = createRegionDataAdapter();
export const getGlobalGrid = defaultAdapter.getGlobalGrid;
export const getRegionData = defaultAdapter.getRegionData;
export const getBackendCatalog = defaultAdapter.getBackendCatalog;
export const askStatisticalCopilot = defaultAdapter.askStatisticalCopilot;
