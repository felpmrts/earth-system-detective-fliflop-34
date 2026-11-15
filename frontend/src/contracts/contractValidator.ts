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
    throw new ContractValidationError(`Invalid numeric field at "${fieldPath}": ${String(value)}`);
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
      `Value out of range [${min}, ${max}] at "${fieldPath}": ${num}`,
    );
  }
  return num;
}

function assertNonEmptyString(value: unknown, fieldPath: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ContractValidationError(`Missing required string at "${fieldPath}"`);
  }
  return value;
}

function assertMonthlyDates(value: unknown, fieldPath: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new ContractValidationError(`${fieldPath} must be an array.`);
  }
  let previous = '';
  return value.map((item, index) => {
    const date = assertNonEmptyString(item, `${fieldPath}[${index}]`);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(date)) {
      throw new ContractValidationError(`Invalid month at ${fieldPath}[${index}]: ${date}`);
    }
    if (previous && date <= previous) {
      throw new ContractValidationError(`${fieldPath} must be in strictly ascending order with no duplicates.`);
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
    throw new ContractValidationError(`${fieldPath} must contain ${expectedLen} observations.`);
  }
  value.forEach((item, index) => {
    if (allowNull && item === null) return;
    assertFiniteNumber(item, `${fieldPath}[${index}]`);
  });
}

/** Validates a preprocessed global Canvas layer file ({var_id}_grid.json). */
export function validateGlobalGrid(data: unknown): GlobalGridFile {
  if (!isRecord(data)) {
    throw new ContractValidationError('Global grid payload must be a JSON object.');
  }

  const varId = assertNonEmptyString(data.variable_id, 'variable_id');
  if (!isValidVariableId(varId)) {
    throw new ContractValidationError(`Unknown variable_id in global grid: ${varId}`);
  }

  assertNonEmptyString(data.unit, 'unit');
  assertNonEmptyString(data.trend_unit, 'trend_unit');

  if (!isRecord(data.period)) {
    throw new ContractValidationError('Missing "period" block in global grid.');
  }
  assertNonEmptyString(data.period.start, 'period.start');
  assertNonEmptyString(data.period.end, 'period.end');

  if (!Array.isArray(data.points)) {
    throw new ContractValidationError('Field "points" must be an array in global grid.');
  }

  data.points.forEach((pt, idx) => {
    if (!isRecord(pt)) {
      throw new ContractValidationError(`Invalid point [${idx}] in global grid.`);
    }
    const lat = assertFiniteNumber(pt.lat, `points[${idx}].lat`);
    const lon = assertFiniteNumber(pt.lon, `points[${idx}].lon`);
    assertValidLatLon(lat, lon);
    assertFiniteNumber(pt.slope_sen_decade, `points[${idx}].slope_sen_decade`);
    assertNumberInRange(pt.q_value_fdr, 0, 1, `points[${idx}].q_value_fdr`);
    if (typeof pt.is_sig !== 'boolean') {
      throw new ContractValidationError(`points[${idx}].is_sig must be a boolean.`);
    }
  });

  return data as unknown as GlobalGridFile;
}

/** Validates an individual statistics block enforcing the 7 Statistical Invariants. */
export function validateVariableStatistics(data: unknown, prefix = 'statistics'): VariableStatistics {
  if (!isRecord(data)) {
    throw new ContractValidationError(`${prefix} must be an object.`);
  }

  const varId = assertNonEmptyString(data.variable_id, `${prefix}.variable_id`);
  if (!isValidVariableId(varId)) {
    throw new ContractValidationError(`Unknown variable_id in ${prefix}: ${varId}`);
  }

  const scaleType = assertNonEmptyString(data.scale_type, `${prefix}.scale_type`);
  if (scaleType !== 'interval' && scaleType !== 'ratio') {
    throw new ContractValidationError(`Invalid ${prefix}.scale_type: ${scaleType}`);
  }
  const expectedScaleType = getVariableMetadata(varId).scale_type;
  if (scaleType !== expectedScaleType) {
    throw new ContractValidationError(
      `${prefix}.scale_type diverges from catalog for ${varId}: ${scaleType} != ${expectedScaleType}`,
    );
  }

  if (typeof data.allow_percentage_change !== 'boolean') {
    throw new ContractValidationError(`${prefix}.allow_percentage_change must be a boolean.`);
  }

  const unit = assertNonEmptyString(data.unit, `${prefix}.unit`);
  const trendUnit = assertNonEmptyString(data.trend_unit, `${prefix}.trend_unit`);

  // Invariant #3 guard: disallow percentage change or "%" unit on interval scales (°C, kPa).
  if (scaleType === 'interval' && (data.allow_percentage_change || unit.includes('%') || trendUnit.includes('%'))) {
    throw new ContractValidationError(
      `Invariant #3 violation in ${prefix}: scale_type="interval" (${varId}) cannot use percentage change or "%" unit.`,
    );
  }

  if (!isRecord(data.period)) {
    throw new ContractValidationError(`Missing ${prefix}.period.`);
  }
  assertFiniteNumber(data.period.n_observations, `${prefix}.period.n_observations`);
  assertFiniteNumber(data.period.n_effective_ar1, `${prefix}.period.n_effective_ar1`);

  if (!isRecord(data.regression)) {
    throw new ContractValidationError(`Missing ${prefix}.regression.`);
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
    throw new ContractValidationError(`Invalid ${prefix}.regression.regime_shape: ${regime}`);
  }

  if (!isRecord(data.correlation_and_coupling)) {
    throw new ContractValidationError(`Missing ${prefix}.correlation_and_coupling.`);
  }
  assertNumberInRange(data.correlation_and_coupling.pearson_r, -1, 1, `${prefix}.correlation_and_coupling.pearson_r`);
  assertNumberInRange(data.correlation_and_coupling.kendall_tau, -1, 1, `${prefix}.correlation_and_coupling.kendall_tau`);
  assertNumberInRange(data.correlation_and_coupling.r_squared, 0, 1, `${prefix}.correlation_and_coupling.r_squared`);
  assertFiniteNumber(
    data.correlation_and_coupling.ellipse_aspect_ratio,
    `${prefix}.correlation_and_coupling.ellipse_aspect_ratio`,
  );

  if (!isRecord(data.significance)) {
    throw new ContractValidationError(`Missing ${prefix}.significance.`);
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
    throw new ContractValidationError(`${prefix}.significance.is_significant_fdr05 must be a boolean.`);
  }
  const tier = assertNonEmptyString(data.significance.confidence_tier, `${prefix}.significance.confidence_tier`);
  if (!['CONFIRMED_HIGH', 'CONFIRMED_MODERATE', 'INSUFFICIENT_SIGNAL', 'NO_TREND'].includes(tier)) {
    throw new ContractValidationError(`Invalid ${prefix}.significance.confidence_tier: ${tier}`);
  }

  if (!Array.isArray(data.outliers_mahalanobis)) {
    throw new ContractValidationError(`${prefix}.outliers_mahalanobis must be an array.`);
  }
  data.outliers_mahalanobis.forEach((outlier, index) => {
    if (!isRecord(outlier)) {
      throw new ContractValidationError(`${prefix}.outliers_mahalanobis[${index}] must be an object.`);
    }
    assertNonEmptyString(outlier.date, `${prefix}.outliers_mahalanobis[${index}].date`);
    assertFiniteNumber(outlier.mahalanobis_d, `${prefix}.outliers_mahalanobis[${index}].mahalanobis_d`);
  });

  if (!isRecord(data.series)) {
    throw new ContractValidationError(`Missing ${prefix}.series.`);
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

/** Validates internal fields of comparison_pair (r_global, r_detrended, and optional p-values). */
export function validateComparisonPair(data: unknown): ComparisonPair {
  if (!isRecord(data)) {
    throw new ContractValidationError('comparison_pair must be an object.');
  }

  assertNonEmptyString(data.region_a_id, 'comparison_pair.region_a_id');
  assertNonEmptyString(data.region_b_id, 'comparison_pair.region_b_id');

  if (typeof data.spatial_divergence_detected !== 'boolean') {
    throw new ContractValidationError('comparison_pair.spatial_divergence_detected must be a boolean.');
  }

  if (data.slope_difference_per_decade !== null) {
    assertFiniteNumber(
      data.slope_difference_per_decade,
      'comparison_pair.slope_difference_per_decade',
    );
  }

  if (!isRecord(data.multiscale_correlation)) {
    throw new ContractValidationError('Missing comparison_pair.multiscale_correlation.');
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

  // If the backend provides multiscale correlation p-values in comparison_pair, validate [0, 1] range.
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

/** Validates the full response from the Python backend or offline fallback. */
export function validateAnalysisResponse(data: unknown): RegionAnalysisResponse {
  if (!isRecord(data)) {
    throw new ContractValidationError('Analysis response must be a JSON object.');
  }

  if (!isRecord(data.request_meta)) {
    throw new ContractValidationError('Missing "request_meta" block in response.');
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
        'region_b_analysis is required when request_meta.region_b_id is present.',
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
        'comparison_pair is required when region_b_analysis is present.',
      );
    }
  }

  if (data.comparison_pair !== null && data.comparison_pair !== undefined) {
    validateComparisonPair(data.comparison_pair);
  }

  return data as unknown as RegionAnalysisResponse;
}
