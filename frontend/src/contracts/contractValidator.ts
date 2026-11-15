import { getVariableMetadata, isValidVariableId } from './catalog.ts';
import type {
  ComparisonPair,
  GlobalGridFile,
  RegionAnalysisResponse,
  VariableStatistics,
} from './types.ts';
import { assertValidLatLon, MAX_CELLS_PER_REGION } from '../geo/gridGeometry.ts';

export class ContractValidationError extends Error {
  readonly code = 'CONTRACT_VIOLATION' as const;

  constructor(message: string) {
    super(message);
    this.name = 'ContractValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertFiniteNumber(value: unknown, fieldPath: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ContractValidationError(`Campo numérico inválido em "${fieldPath}": ${String(value)}`);
  }
  return value;
}

function assertNumberInRange(
  value: unknown,
  min: number,
  max: number,
  fieldPath: string,
): number {
  const num = assertFiniteNumber(value, fieldPath);
  if (num < min || num > max) {
    throw new ContractValidationError(
      `Valor fora do intervalo [${min}, ${max}] em "${fieldPath}": ${num}`,
    );
  }
  return num;
}

function assertNonEmptyString(value: unknown, fieldPath: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ContractValidationError(`String obrigatória ausente em "${fieldPath}"`);
  }
  return value;
}

function assertMonthlyDates(value: unknown, fieldPath: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new ContractValidationError(`${fieldPath} deve ser um array.`);
  }
  let previous = '';
  return value.map((item, index) => {
    const date = assertNonEmptyString(item, `${fieldPath}[${index}]`);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(date)) {
      throw new ContractValidationError(`Mês inválido em ${fieldPath}[${index}]: ${date}`);
    }
    if (previous && date <= previous) {
      throw new ContractValidationError(`${fieldPath} deve estar em ordem crescente e sem duplicatas.`);
    }
    previous = date;
    return date;
  });
}

function assertNumericSeries(
  value: unknown,
  fieldPath: string,
  expectedLen: number,
  allowNull: boolean,
): void {
  if (!Array.isArray(value) || value.length !== expectedLen) {
    throw new ContractValidationError(`${fieldPath} deve conter ${expectedLen} observações.`);
  }
  value.forEach((item, index) => {
    if (allowNull && item === null) return;
    assertFiniteNumber(item, `${fieldPath}[${index}]`);
  });
}

/** Valida arquivo pré-processado da camada global Canvas ({var_id}_grid.json). */
export function validateGlobalGrid(data: unknown): GlobalGridFile {
  if (!isRecord(data)) {
    throw new ContractValidationError('Payload de grid global deve ser um objeto JSON.');
  }

  const varId = assertNonEmptyString(data.variable_id, 'variable_id');
  if (!isValidVariableId(varId)) {
    throw new ContractValidationError(`variable_id desconhecido no grid global: ${varId}`);
  }

  assertNonEmptyString(data.unit, 'unit');
  assertNonEmptyString(data.trend_unit, 'trend_unit');

  if (!isRecord(data.period)) {
    throw new ContractValidationError('Bloco "period" ausente no grid global.');
  }
  assertNonEmptyString(data.period.start, 'period.start');
  assertNonEmptyString(data.period.end, 'period.end');

  if (!Array.isArray(data.points)) {
    throw new ContractValidationError('Campo "points" deve ser um array no grid global.');
  }

  data.points.forEach((pt, idx) => {
    if (!isRecord(pt)) {
      throw new ContractValidationError(`Ponto [${idx}] inválido no grid global.`);
    }
    const lat = assertFiniteNumber(pt.lat, `points[${idx}].lat`);
    const lon = assertFiniteNumber(pt.lon, `points[${idx}].lon`);
    assertValidLatLon(lat, lon);
    assertFiniteNumber(pt.slope_sen_decade, `points[${idx}].slope_sen_decade`);
    assertNumberInRange(pt.q_value_fdr, 0, 1, `points[${idx}].q_value_fdr`);
    if (typeof pt.is_sig !== 'boolean') {
      throw new ContractValidationError(`points[${idx}].is_sig deve ser boolean.`);
    }
  });

  return data as unknown as GlobalGridFile;
}

/** Valida um bloco estatístico individual garantindo os 7 Invariantes Estatísticos. */
export function validateVariableStatistics(data: unknown, prefix = 'statistics'): VariableStatistics {
  if (!isRecord(data)) {
    throw new ContractValidationError(`${prefix} deve ser um objeto.`);
  }

  const varId = assertNonEmptyString(data.variable_id, `${prefix}.variable_id`);
  if (!isValidVariableId(varId)) {
    throw new ContractValidationError(`variable_id desconhecido em ${prefix}: ${varId}`);
  }

  const scaleType = assertNonEmptyString(data.scale_type, `${prefix}.scale_type`);
  if (scaleType !== 'interval' && scaleType !== 'ratio') {
    throw new ContractValidationError(`${prefix}.scale_type inválido: ${scaleType}`);
  }
  const expectedScaleType = getVariableMetadata(varId).scale_type;
  if (scaleType !== expectedScaleType) {
    throw new ContractValidationError(
      `${prefix}.scale_type diverge do catálogo para ${varId}: ${scaleType} != ${expectedScaleType}`,
    );
  }

  if (typeof data.allow_percentage_change !== 'boolean') {
    throw new ContractValidationError(`${prefix}.allow_percentage_change deve ser boolean.`);
  }

  const unit = assertNonEmptyString(data.unit, `${prefix}.unit`);
  const trendUnit = assertNonEmptyString(data.trend_unit, `${prefix}.trend_unit`);

  // Trava do Invariante #3: proibido exibir variação percentual ou unidade "%" em escalas intervalares (°C, kPa).
  if (scaleType === 'interval' && (data.allow_percentage_change || unit.includes('%') || trendUnit.includes('%'))) {
    throw new ContractValidationError(
      `Violação do Invariante #3 em ${prefix}: scale_type="interval" (${varId}) não pode usar variação ou unidade "%".`,
    );
  }

  if (!isRecord(data.period)) {
    throw new ContractValidationError(`${prefix}.period ausente.`);
  }
  assertFiniteNumber(data.period.n_observations, `${prefix}.period.n_observations`);
  assertFiniteNumber(data.period.n_effective_ar1, `${prefix}.period.n_effective_ar1`);

  if (!isRecord(data.regression)) {
    throw new ContractValidationError(`${prefix}.regression ausente.`);
  }
  assertFiniteNumber(data.regression.intercept_at_start_A0, `${prefix}.regression.intercept_at_start_A0`);
  assertFiniteNumber(data.regression.slope_per_decade_ols, `${prefix}.regression.slope_per_decade_ols`);
  assertFiniteNumber(data.regression.slope_per_decade_sen, `${prefix}.regression.slope_per_decade_sen`);
  assertFiniteNumber(data.regression.slope_ci95_low, `${prefix}.regression.slope_ci95_low`);
  assertFiniteNumber(data.regression.slope_ci95_high, `${prefix}.regression.slope_ci95_high`);
  assertFiniteNumber(data.regression.cumulative_model_change, `${prefix}.regression.cumulative_model_change`);
  assertFiniteNumber(data.regression.quadratic_acceleration_B2, `${prefix}.regression.quadratic_acceleration_B2`);
  const regime = assertNonEmptyString(data.regression.regime_shape, `${prefix}.regression.regime_shape`);
  if (!['linear', 'accelerating_rise', 'accelerating_decline', 'saturating', 'non_monotonic'].includes(regime)) {
    throw new ContractValidationError(`${prefix}.regression.regime_shape inválido: ${regime}`);
  }

  if (!isRecord(data.correlation_and_coupling)) {
    throw new ContractValidationError(`${prefix}.correlation_and_coupling ausente.`);
  }
  assertNumberInRange(data.correlation_and_coupling.pearson_r, -1, 1, `${prefix}.correlation_and_coupling.pearson_r`);
  assertNumberInRange(data.correlation_and_coupling.kendall_tau, -1, 1, `${prefix}.correlation_and_coupling.kendall_tau`);
  assertNumberInRange(data.correlation_and_coupling.r_squared, 0, 1, `${prefix}.correlation_and_coupling.r_squared`);
  assertFiniteNumber(
    data.correlation_and_coupling.ellipse_aspect_ratio,
    `${prefix}.correlation_and_coupling.ellipse_aspect_ratio`,
  );

  if (!isRecord(data.significance)) {
    throw new ContractValidationError(`${prefix}.significance ausente.`);
  }
  assertNumberInRange(data.significance.p_value_naive, 0, 1, `${prefix}.significance.p_value_naive`);
  assertNumberInRange(
    data.significance.p_value_ar1_corrected,
    0,
    1,
    `${prefix}.significance.p_value_ar1_corrected`,
  );
  assertNumberInRange(data.significance.fdr_q_value, 0, 1, `${prefix}.significance.fdr_q_value`);
  if (typeof data.significance.is_significant_fdr05 !== 'boolean') {
    throw new ContractValidationError(`${prefix}.significance.is_significant_fdr05 deve ser boolean.`);
  }
  const tier = assertNonEmptyString(data.significance.confidence_tier, `${prefix}.significance.confidence_tier`);
  if (!['CONFIRMED_HIGH', 'CONFIRMED_MODERATE', 'INSUFFICIENT_SIGNAL', 'NO_TREND'].includes(tier)) {
    throw new ContractValidationError(`${prefix}.significance.confidence_tier inválido: ${tier}`);
  }

  if (!Array.isArray(data.outliers_mahalanobis)) {
    throw new ContractValidationError(`${prefix}.outliers_mahalanobis deve ser um array.`);
  }
  data.outliers_mahalanobis.forEach((outlier, index) => {
    if (!isRecord(outlier)) {
      throw new ContractValidationError(`${prefix}.outliers_mahalanobis[${index}] deve ser objeto.`);
    }
    assertNonEmptyString(outlier.date, `${prefix}.outliers_mahalanobis[${index}].date`);
    assertFiniteNumber(outlier.mahalanobis_d, `${prefix}.outliers_mahalanobis[${index}].mahalanobis_d`);
  });

  if (!isRecord(data.series)) {
    throw new ContractValidationError(`${prefix}.series ausente.`);
  }

  const { dates, raw_values, anomaly_values, linear_fit, gam_smooth_fit, sen_fit, z_scores } = data.series;
  const validDates = assertMonthlyDates(dates, `${prefix}.series.dates`);
  const expectedLen = validDates.length;
  assertNumericSeries(raw_values, `${prefix}.series.raw_values`, expectedLen, true);
  assertNumericSeries(anomaly_values, `${prefix}.series.anomaly_values`, expectedLen, true);
  assertNumericSeries(linear_fit, `${prefix}.series.linear_fit`, expectedLen, false);
  assertNumericSeries(gam_smooth_fit, `${prefix}.series.gam_smooth_fit`, expectedLen, false);
  if (sen_fit !== undefined) {
    assertNumericSeries(sen_fit, `${prefix}.series.sen_fit`, expectedLen, false);
  }
  if (z_scores !== undefined) {
    assertNumericSeries(z_scores, `${prefix}.series.z_scores`, expectedLen, true);
  }

  return data as unknown as VariableStatistics;
}

/** Valida os campos internos de comparison_pair (r_global, r_detrended e eventuais p-valores). */
export function validateComparisonPair(data: unknown): ComparisonPair {
  if (!isRecord(data)) {
    throw new ContractValidationError('comparison_pair deve ser um objeto.');
  }

  assertNonEmptyString(data.region_a_id, 'comparison_pair.region_a_id');
  assertNonEmptyString(data.region_b_id, 'comparison_pair.region_b_id');

  if (typeof data.spatial_divergence_detected !== 'boolean') {
    throw new ContractValidationError('comparison_pair.spatial_divergence_detected deve ser boolean.');
  }

  if (data.slope_difference_per_decade !== null) {
    assertFiniteNumber(
      data.slope_difference_per_decade,
      'comparison_pair.slope_difference_per_decade',
    );
  }

  if (!isRecord(data.multiscale_correlation)) {
    throw new ContractValidationError('comparison_pair.multiscale_correlation ausente.');
  }

  const mc = data.multiscale_correlation;
  assertNumberInRange(
    mc.long_term_secular_r,
    -1,
    1,
    'comparison_pair.multiscale_correlation.long_term_secular_r',
  );
  assertNumberInRange(
    mc.short_term_detrended_r,
    -1,
    1,
    'comparison_pair.multiscale_correlation.short_term_detrended_r',
  );
  assertNonEmptyString(mc.paradox_type, 'comparison_pair.multiscale_correlation.paradox_type');
  assertNonEmptyString(mc.interpretation, 'comparison_pair.multiscale_correlation.interpretation');

  // Se o backend enviar p-valores de correlação multiescala no comparison_pair, valida intervalo [0, 1].
  for (const pField of [
    'p_value_naive',
    'p_value_ar1_corrected',
    'fdr_q_value',
    'long_term_p_value',
    'short_term_p_value',
  ] as const) {
    if (mc[pField] !== undefined && mc[pField] !== null) {
      assertNumberInRange(mc[pField], 0, 1, `comparison_pair.multiscale_correlation.${pField}`);
    }
  }

  return data as unknown as ComparisonPair;
}

/** Valida a resposta completa do backend Python ou do fallback offline. */
export function validateAnalysisResponse(data: unknown): RegionAnalysisResponse {
  if (!isRecord(data)) {
    throw new ContractValidationError('Resposta de análise deve ser um objeto JSON.');
  }

  if (!isRecord(data.request_meta)) {
    throw new ContractValidationError('Bloco "request_meta" ausente na resposta.');
  }

  assertNumberInRange(data.request_meta.cells_count_a, 1, MAX_CELLS_PER_REGION, 'request_meta.cells_count_a');

  const hasRegionBId =
    data.request_meta.region_b_id !== null && data.request_meta.region_b_id !== undefined;
  const hasRegionBAnalysis =
    data.region_b_analysis !== null && data.region_b_analysis !== undefined;

  if (hasRegionBId) {
    assertNonEmptyString(data.request_meta.region_b_id, 'request_meta.region_b_id');
    assertNumberInRange(data.request_meta.cells_count_b, 1, MAX_CELLS_PER_REGION, 'request_meta.cells_count_b');
    if (!hasRegionBAnalysis) {
      throw new ContractValidationError(
        'region_b_analysis é obrigatório quando request_meta.region_b_id está presente.',
      );
    }
  } else if (data.request_meta.cells_count_b !== undefined) {
    assertNumberInRange(data.request_meta.cells_count_b, 0, MAX_CELLS_PER_REGION, 'request_meta.cells_count_b');
  }

  validateVariableStatistics(data.region_a_analysis, 'region_a_analysis');

  if (hasRegionBAnalysis) {
    validateVariableStatistics(data.region_b_analysis, 'region_b_analysis');
    if (data.comparison_pair === null || data.comparison_pair === undefined) {
      throw new ContractValidationError(
        'comparison_pair é obrigatório quando region_b_analysis está presente.',
      );
    }
  }

  if (data.comparison_pair !== null && data.comparison_pair !== undefined) {
    validateComparisonPair(data.comparison_pair);
  }

  return data as unknown as RegionAnalysisResponse;
}
