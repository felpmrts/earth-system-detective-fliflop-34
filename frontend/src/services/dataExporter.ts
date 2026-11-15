import { computeMeanStd, formatPValue, formatSignedNumber } from '../bench/benchMeta';
import { getVariableMetadata, isValidVariableId } from '../contracts/catalog';
import type {
  ComparisonPair,
  GridResolution,
  LeafletBounds,
  OutlierMahalanobis,
  RegionAnalysisResponse,
  RegionSelection,
  ScaleType,
  SourceModel,
  VariableId,
  VariableStatistics,
} from '../contracts/types';

export interface ExportAnalysisOptions {
  readonly regionA?: RegionSelection | null;
  readonly regionB?: RegionSelection | null;
  readonly startMonth?: string;
  readonly endMonth?: string;
  readonly analyzedAt?: string | null;
  readonly exportedAt?: string;
}

export interface ExportArtifact {
  readonly filename: string;
  readonly mimeType: string;
  readonly content: string;
}

export interface ExportedVariableMetadata {
  readonly variable_id: VariableId;
  readonly variable_name: string;
  readonly domain: string;
  readonly scale_type: ScaleType;
  readonly unit: string;
  readonly trend_unit: string;
  readonly allow_percentage_change: boolean;
  readonly relative_percentage_allowed: boolean;
}

export interface ExportedCellMetadata {
  readonly cell_id: string;
  readonly row: number;
  readonly col: number;
  readonly lat: number;
  readonly lon: number;
  readonly bounds_leaflet: LeafletBounds;
}

export interface ExportedRegionMetadata {
  readonly slot: 'A' | 'B';
  readonly region_id: string;
  readonly variable_id: VariableId;
  readonly variable_name: string;
  readonly source_model: SourceModel | null;
  readonly grid_resolution: GridResolution | null;
  readonly cells_count: number;
  readonly centroid: { readonly lat: number; readonly lon: number } | null;
  readonly cells: readonly ExportedCellMetadata[];
}

export interface ExportedAlignedObservation {
  readonly date: string;
  readonly a_raw: number | null;
  readonly a_anomaly: number | null;
  readonly a_z_score: number | null;
  readonly a_linear_fit: number | null;
  readonly a_sen_fit: number | null;
  readonly a_gam_smooth: number | null;
  readonly a_is_outlier_dm25: boolean;
  readonly a_mahalanobis_d: number | null;
  readonly a_outlier_hint: string | null;
  readonly b_raw?: number | null;
  readonly b_anomaly?: number | null;
  readonly b_z_score?: number | null;
  readonly b_linear_fit?: number | null;
  readonly b_sen_fit?: number | null;
  readonly b_gam_smooth?: number | null;
  readonly b_is_outlier_dm25?: boolean;
  readonly b_mahalanobis_d?: number | null;
  readonly b_outlier_hint?: string | null;
}

export interface ExportedSeriesBlock {
  readonly dates: readonly string[];
  readonly raw_values: readonly (number | null)[];
  readonly anomaly_values: readonly (number | null)[];
  readonly z_scores: readonly (number | null)[];
  readonly linear_fit: readonly (number | null)[];
  readonly sen_fit: readonly (number | null)[] | null;
  readonly gam_smooth_fit: readonly (number | null)[];
}

export interface ExportedStatisticsBlock {
  readonly period: VariableStatistics['period'];
  readonly regression: VariableStatistics['regression'];
  readonly correlation_and_coupling: VariableStatistics['correlation_and_coupling'];
  readonly significance: VariableStatistics['significance'];
  readonly outliers_mahalanobis: readonly OutlierMahalanobis[];
}

export interface StructuredAnalysisExport {
  readonly schema_version: '1.0.0';
  readonly exported_at: string;
  readonly analyzed_at: string | null;
  readonly source: RegionAnalysisResponse['request_meta']['source'];
  readonly spatial_aggregation: RegionAnalysisResponse['request_meta']['spatial_aggregation'];
  readonly source_models: {
    readonly region_a: SourceModel | null;
    readonly region_b: SourceModel | null;
  };
  readonly period: {
    readonly start: string;
    readonly end: string;
    readonly n_aligned_observations: number;
    readonly n_observations_a: number;
    readonly n_effective_ar1_a: number;
    readonly n_observations_b: number | null;
    readonly n_effective_ar1_b: number | null;
  };
  readonly regions: {
    readonly region_a: ExportedRegionMetadata;
    readonly region_b: ExportedRegionMetadata | null;
  };
  readonly variables: {
    readonly region_a: ExportedVariableMetadata;
    readonly region_b: ExportedVariableMetadata | null;
  };
  readonly statistics: {
    readonly region_a: ExportedStatisticsBlock;
    readonly region_b: ExportedStatisticsBlock | null;
    readonly comparison_pair: ComparisonPair | null;
  };
  readonly outliers_mahalanobis: {
    readonly region_a: readonly OutlierMahalanobis[];
    readonly region_b: readonly OutlierMahalanobis[];
  };
  readonly series: {
    readonly dates: readonly string[];
    readonly region_a: ExportedSeriesBlock;
    readonly region_b: ExportedSeriesBlock | null;
  };
  readonly observations: readonly ExportedAlignedObservation[];
}

interface PreparedSlotPoint {
  readonly raw: number | null;
  readonly anomaly: number | null;
  readonly zScore: number | null;
  readonly linearFit: number | null;
  readonly senFit: number | null;
  readonly gamSmooth: number | null;
  readonly isOutlierDm25: boolean;
  readonly mahalanobisD: number | null;
  readonly outlierHint: string | null;
}

interface PreparedSlot {
  readonly stats: VariableStatistics;
  readonly regionMeta: ExportedRegionMetadata;
  readonly variableMeta: ExportedVariableMetadata;
  readonly byDate: ReadonlyMap<string, PreparedSlotPoint>;
  readonly dates: readonly string[];
}

interface PreparedExport {
  readonly exportedAt: string;
  readonly analyzedAt: string | null;
  readonly source: RegionAnalysisResponse['request_meta']['source'];
  readonly spatialAggregation: RegionAnalysisResponse['request_meta']['spatial_aggregation'];
  readonly start: string;
  readonly end: string;
  readonly alignedDates: readonly string[];
  readonly slotA: PreparedSlot;
  readonly slotB: PreparedSlot | null;
  readonly comparisonPair: ComparisonPair | null;
}

const MAHALANOBIS_THRESHOLD = 2.5;

function sanitizeFilenameToken(raw: string): string {
  const cleaned = raw.trim().replace(/[^A-Za-z0-9_-]+/g, '_');
  return cleaned.length > 0 ? cleaned : 'unknown';
}

function sanitizeCommentValue(raw: string): string {
  return raw.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function resolveSafeVariableMeta(stats: VariableStatistics): ExportedVariableMetadata {
  const catalogMeta = isValidVariableId(stats.variable_id)
    ? getVariableMetadata(stats.variable_id)
    : null;
  const scaleType: ScaleType = catalogMeta?.scale_type ?? stats.scale_type;
  const allowPercentageChange =
    scaleType === 'interval' ? false : stats.allow_percentage_change;

  let unit = stats.unit;
  let trendUnit = stats.trend_unit;

  // Invariant #3: interval scales (°C, PS/kPa) never display "%" change or units.
  if (scaleType === 'interval') {
    if (unit.includes('%')) {
      unit =
        catalogMeta && !catalogMeta.unit.includes('%')
          ? catalogMeta.unit
          : unit.replace(/%/g, '').trim() || 'interval unit';
    }
    if (trendUnit.includes('%')) {
      trendUnit =
        catalogMeta && !catalogMeta.trend_unit.includes('%')
          ? catalogMeta.trend_unit
          : trendUnit.replace(/%/g, '').trim() || 'unit/decade';
    }
  }

  return {
    variable_id: stats.variable_id,
    variable_name: stats.variable_name,
    domain: catalogMeta?.domain ?? 'Climatology',
    scale_type: scaleType,
    unit,
    trend_unit: trendUnit,
    allow_percentage_change: allowPercentageChange,
    relative_percentage_allowed: scaleType === 'ratio' && allowPercentageChange,
  };
}

function buildRegionMetadata(
  slot: 'A' | 'B',
  regionSel: RegionSelection | null | undefined,
  stats: VariableStatistics,
  regionId: string,
  cellsCountFallback: number,
): ExportedRegionMetadata {
  const catalogMeta = isValidVariableId(stats.variable_id)
    ? getVariableMetadata(stats.variable_id)
    : null;
  const matchingSelection =
    regionSel && (regionSel.region_id === regionId || regionSel.variable_id === stats.variable_id)
      ? regionSel
      : null;

  const cells: ExportedCellMetadata[] = (matchingSelection?.cells ?? []).map(cell => ({
    cell_id: cell.cell_id,
    row: cell.row,
    col: cell.col,
    lat: cell.lat,
    lon: cell.lon,
    bounds_leaflet: cell.bounds_leaflet,
  }));

  const centroid =
    cells.length > 0
      ? {
          lat: Number((cells.reduce((sum, c) => sum + c.lat, 0) / cells.length).toFixed(4)),
          lon: Number((cells.reduce((sum, c) => sum + c.lon, 0) / cells.length).toFixed(4)),
        }
      : null;

  return {
    slot,
    region_id: regionId,
    variable_id: stats.variable_id,
    variable_name: stats.variable_name,
    source_model: matchingSelection?.source_model ?? catalogMeta?.source_model ?? null,
    grid_resolution: matchingSelection?.grid_resolution ?? catalogMeta?.resolution ?? null,
    cells_count: cells.length > 0 ? cells.length : cellsCountFallback,
    centroid,
    cells,
  };
}

function buildOutlierMap(outliers: readonly OutlierMahalanobis[]): ReadonlyMap<string, OutlierMahalanobis> {
  const byDate = new Map<string, OutlierMahalanobis>();
  for (const outlier of outliers) {
    const existing = byDate.get(outlier.date);
    if (!existing || outlier.mahalanobis_d > existing.mahalanobis_d) {
      byDate.set(outlier.date, outlier);
    }
  }
  return byDate;
}

function resolveZScoreAt(
  stats: VariableStatistics,
  idx: number,
  anomStats: { readonly mean: number; readonly std: number },
): number | null {
  const provided = stats.series.z_scores?.[idx];
  if (isFiniteNumber(provided)) return provided;
  const anomaly = stats.series.anomaly_values[idx];
  if (!isFiniteNumber(anomaly)) return null;
  return Number(((anomaly - anomStats.mean) / anomStats.std).toFixed(6));
}

function prepareSlot(
  slot: 'A' | 'B',
  stats: VariableStatistics,
  regionSel: RegionSelection | null | undefined,
  regionId: string,
  cellsCountFallback: number,
): PreparedSlot {
  const variableMeta = resolveSafeVariableMeta(stats);
  const regionMeta = buildRegionMetadata(slot, regionSel, stats, regionId, cellsCountFallback);
  const anomStats = computeMeanStd(stats.series.anomaly_values);
  const outlierMap = buildOutlierMap(stats.outliers_mahalanobis);
  const byDate = new Map<string, PreparedSlotPoint>();

  stats.series.dates.forEach((date, idx) => {
    const outlier = outlierMap.get(date);
    const isOutlierDm25 = outlier !== undefined && outlier.mahalanobis_d > MAHALANOBIS_THRESHOLD;
    const rawVal = stats.series.raw_values[idx];
    const anomVal = stats.series.anomaly_values[idx];
    const linearVal = stats.series.linear_fit[idx];
    const senVal = stats.series.sen_fit?.[idx];
    const gamVal = stats.series.gam_smooth_fit[idx];

    byDate.set(date, {
      raw: isFiniteNumber(rawVal) ? rawVal : null,
      anomaly: isFiniteNumber(anomVal) ? anomVal : null,
      zScore: resolveZScoreAt(stats, idx, anomStats),
      linearFit: isFiniteNumber(linearVal) ? linearVal : null,
      senFit: isFiniteNumber(senVal) ? senVal : null,
      gamSmooth: isFiniteNumber(gamVal) ? gamVal : null,
      isOutlierDm25,
      mahalanobisD: isOutlierDm25 ? outlier.mahalanobis_d : null,
      outlierHint: isOutlierDm25 ? outlier.diagnostic_hint : null,
    });
  });

  return {
    stats,
    regionMeta,
    variableMeta,
    byDate,
    dates: stats.series.dates,
  };
}

function collectAlignedDates(
  slotA: PreparedSlot,
  slotB: PreparedSlot | null,
  startMonth?: string,
  endMonth?: string,
): readonly string[] {
  const unique = new Set<string>(slotA.dates);
  if (slotB) {
    for (const d of slotB.dates) {
      unique.add(d);
    }
  }
  const sorted = [...unique].sort();

  if (startMonth && endMonth && startMonth <= endMonth) {
    const sliced = sorted.filter(date => date >= startMonth && date <= endMonth);
    if (sliced.length > 0) return sliced;
  }

  return sorted;
}

function prepareExportData(
  analysis: RegionAnalysisResponse,
  options: ExportAnalysisOptions = {},
): PreparedExport {
  const slotA = prepareSlot(
    'A',
    analysis.region_a_analysis,
    options.regionA,
    analysis.request_meta.region_a_id,
    analysis.request_meta.cells_count_a,
  );

  const slotB = analysis.region_b_analysis
    ? prepareSlot(
        'B',
        analysis.region_b_analysis,
        options.regionB,
        analysis.request_meta.region_b_id ?? `${analysis.region_b_analysis.variable_id}_B`,
        analysis.request_meta.cells_count_b || analysis.request_meta.cells_count_a,
      )
    : null;

  const alignedDates = collectAlignedDates(slotA, slotB, options.startMonth, options.endMonth);
  const start = alignedDates[0] ?? analysis.region_a_analysis.period.start;
  const end = alignedDates[alignedDates.length - 1] ?? analysis.region_a_analysis.period.end;

  return {
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    analyzedAt: options.analyzedAt ?? null,
    source: analysis.request_meta.source,
    spatialAggregation: analysis.request_meta.spatial_aggregation,
    start,
    end,
    alignedDates,
    slotA,
    slotB,
    comparisonPair: analysis.comparison_pair,
  };
}

/** Constrói nome de arquivo descritivo reproduzível no padrão `trend-detective_{varA}_vs_{varB}_{t0}-{tf}.{ext}`. */
export function buildExportFilename(
  analysis: RegionAnalysisResponse,
  extension: 'csv' | 'json',
  options: ExportAnalysisOptions = {},
): string {
  const prepared = prepareExportData(analysis, options);
  const varA = sanitizeFilenameToken(prepared.slotA.stats.variable_id);
  const varB = prepared.slotB?.stats.variable_id ?? analysis.request_meta.variable_b;
  const t0 = sanitizeFilenameToken(prepared.start);
  const tf = sanitizeFilenameToken(prepared.end);

  if (varB) {
    return `trend-detective_${varA}_vs_${sanitizeFilenameToken(varB)}_${t0}-${tf}.${extension}`;
  }
  return `trend-detective_${varA}_${t0}-${tf}.${extension}`;
}

export function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildAlignedSeriesBlock(
  slot: PreparedSlot,
  alignedDates: readonly string[],
): ExportedSeriesBlock {
  const hasSen = slot.stats.series.sen_fit !== undefined;
  return {
    dates: [...alignedDates],
    raw_values: alignedDates.map(d => slot.byDate.get(d)?.raw ?? null),
    anomaly_values: alignedDates.map(d => slot.byDate.get(d)?.anomaly ?? null),
    z_scores: alignedDates.map(d => slot.byDate.get(d)?.zScore ?? null),
    linear_fit: alignedDates.map(d => slot.byDate.get(d)?.linearFit ?? null),
    sen_fit: hasSen ? alignedDates.map(d => slot.byDate.get(d)?.senFit ?? null) : null,
    gam_smooth_fit: alignedDates.map(d => slot.byDate.get(d)?.gamSmooth ?? null),
  };
}

function buildStatisticsBlock(stats: VariableStatistics): ExportedStatisticsBlock {
  return {
    period: stats.period,
    regression: stats.regression,
    correlation_and_coupling: stats.correlation_and_coupling,
    significance: stats.significance,
    outliers_mahalanobis: stats.outliers_mahalanobis,
  };
}

function formatRegionCommentLine(region: ExportedRegionMetadata): string {
  const resText = region.grid_resolution
    ? `${region.grid_resolution.dLat}x${region.grid_resolution.dLon}deg`
    : 'unknown';
  const centroidText = region.centroid
    ? `(${region.centroid.lat.toFixed(4)}, ${region.centroid.lon.toFixed(4)})`
    : 'N/A';
  const cellsText =
    region.cells.length > 0
      ? `[${region.cells.map(c => `${c.cell_id}@(${c.lat.toFixed(3)},${c.lon.toFixed(3)})`).join('; ')}]`
      : '[]';

  return (
    `# region_${region.slot.toLowerCase()}: ` +
    `variable=${sanitizeCommentValue(region.variable_id)} (${sanitizeCommentValue(region.variable_name)}) | ` +
    `source_model=${sanitizeCommentValue(region.source_model ?? 'unknown')} (${resText}) | ` +
    `region_id=${sanitizeCommentValue(region.region_id)} | ` +
    `cells_count=${region.cells_count} | centroid=${centroidText} | cells=${cellsText}`
  );
}

function formatStatsCommentLine(slot: 'A' | 'B', prep: PreparedSlot): string {
  const { stats, variableMeta } = prep;
  const { regression, significance, correlation_and_coupling, period, outliers_mahalanobis } = stats;
  const relPolicy =
    variableMeta.scale_type === 'interval'
      ? 'bloqueada_escala_intervalar_invariante_3'
      : String(variableMeta.relative_percentage_allowed);
  const outliersCount = outliers_mahalanobis.filter(o => o.mahalanobis_d > MAHALANOBIS_THRESHOLD).length;

  return (
    `# region_${slot.toLowerCase()}_stats: ` +
    `scale_type=${variableMeta.scale_type} | ` +
    `unit=${sanitizeCommentValue(variableMeta.unit)} | ` +
    `trend_unit=${sanitizeCommentValue(variableMeta.trend_unit)} | ` +
    `allow_percentage_change=${variableMeta.allow_percentage_change} | ` +
    `relative_pct_policy=${relPolicy} | ` +
    `slope_sen=${formatSignedNumber(regression.slope_per_decade_sen, 4)} ${sanitizeCommentValue(variableMeta.trend_unit)} | ` +
    `slope_ols=${formatSignedNumber(regression.slope_per_decade_ols, 4)} ${sanitizeCommentValue(variableMeta.trend_unit)} | ` +
    `ci95=[${formatSignedNumber(regression.slope_ci95_low, 4)}, ${formatSignedNumber(regression.slope_ci95_high, 4)}] | ` +
    `A0=${regression.intercept_at_start_A0.toFixed(4)} | ` +
    `cumulative_change=${formatSignedNumber(regression.cumulative_model_change, 4)} ${sanitizeCommentValue(variableMeta.unit)} | ` +
    `B2=${formatSignedNumber(regression.quadratic_acceleration_B2, 6)} | ` +
    `regime=${regression.regime_shape} | ` +
    `p_naive=${formatPValue(significance.p_value_naive)} | ` +
    `p_ar1=${formatPValue(significance.p_value_ar1_corrected)} | ` +
    `q_fdr=${formatPValue(significance.fdr_q_value)} | ` +
    `sig_fdr05=${significance.is_significant_fdr05} | ` +
    `confidence=${significance.confidence_tier} | ` +
    `r=${formatSignedNumber(correlation_and_coupling.pearson_r, 4)} | ` +
    `tau=${formatSignedNumber(correlation_and_coupling.kendall_tau, 4)} | ` +
    `r2=${correlation_and_coupling.r_squared.toFixed(4)} | ` +
    `n_obs=${period.n_observations} | ` +
    `n_effective_ar1=${period.n_effective_ar1.toFixed(1)} | ` +
    `outliers_dm_gt_2_5=${outliersCount}`
  );
}

/** Constrói o payload completo estruturado em JSON para reprodutibilidade científica. */
export function buildStructuredExportPayload(
  analysis: RegionAnalysisResponse,
  options: ExportAnalysisOptions = {},
): StructuredAnalysisExport {
  const prepared = prepareExportData(analysis, options);
  const { slotA, slotB, alignedDates } = prepared;

  const observations: ExportedAlignedObservation[] = alignedDates.map(date => {
    const a = slotA.byDate.get(date);
    const b = slotB?.byDate.get(date);

    const row: ExportedAlignedObservation = {
      date,
      a_raw: a?.raw ?? null,
      a_anomaly: a?.anomaly ?? null,
      a_z_score: a?.zScore ?? null,
      a_linear_fit: a?.linearFit ?? null,
      a_sen_fit: a?.senFit ?? null,
      a_gam_smooth: a?.gamSmooth ?? null,
      a_is_outlier_dm25: a?.isOutlierDm25 ?? false,
      a_mahalanobis_d: a?.mahalanobisD ?? null,
      a_outlier_hint: a?.outlierHint ?? null,
      ...(slotB
        ? {
            b_raw: b?.raw ?? null,
            b_anomaly: b?.anomaly ?? null,
            b_z_score: b?.zScore ?? null,
            b_linear_fit: b?.linearFit ?? null,
            b_sen_fit: b?.senFit ?? null,
            b_gam_smooth: b?.gamSmooth ?? null,
            b_is_outlier_dm25: b?.isOutlierDm25 ?? false,
            b_mahalanobis_d: b?.mahalanobisD ?? null,
            b_outlier_hint: b?.outlierHint ?? null,
          }
        : {}),
    };
    return row;
  });

  return {
    schema_version: '1.0.0',
    exported_at: prepared.exportedAt,
    analyzed_at: prepared.analyzedAt,
    source: prepared.source,
    spatial_aggregation: prepared.spatialAggregation,
    source_models: {
      region_a: slotA.regionMeta.source_model,
      region_b: slotB?.regionMeta.source_model ?? null,
    },
    period: {
      start: prepared.start,
      end: prepared.end,
      n_aligned_observations: alignedDates.length,
      n_observations_a: slotA.stats.period.n_observations,
      n_effective_ar1_a: slotA.stats.period.n_effective_ar1,
      n_observations_b: slotB?.stats.period.n_observations ?? null,
      n_effective_ar1_b: slotB?.stats.period.n_effective_ar1 ?? null,
    },
    regions: {
      region_a: slotA.regionMeta,
      region_b: slotB?.regionMeta ?? null,
    },
    variables: {
      region_a: slotA.variableMeta,
      region_b: slotB?.variableMeta ?? null,
    },
    statistics: {
      region_a: buildStatisticsBlock(slotA.stats),
      region_b: slotB ? buildStatisticsBlock(slotB.stats) : null,
      comparison_pair: prepared.comparisonPair,
    },
    outliers_mahalanobis: {
      region_a: slotA.stats.outliers_mahalanobis,
      region_b: slotB?.stats.outliers_mahalanobis ?? [],
    },
    series: {
      dates: [...alignedDates],
      region_a: buildAlignedSeriesBlock(slotA, alignedDates),
      region_b: slotB ? buildAlignedSeriesBlock(slotB, alignedDates) : null,
    },
    observations,
  };
}

/** Generates the structured JSON artifact ready for download or pure serialization. */
export function createJsonExport(
  analysis: RegionAnalysisResponse,
  options: ExportAnalysisOptions = {},
): ExportArtifact {
  const payload = buildStructuredExportPayload(analysis, options);
  return {
    filename: buildExportFilename(analysis, 'json', options),
    mimeType: 'application/json;charset=utf-8',
    content: `${JSON.stringify(payload, null, 2)}\n`,
  };
}

/** Generates the scientific CSV artifact with a commented (#) header and timestamp-aligned table. */
export function createCsvExport(
  analysis: RegionAnalysisResponse,
  options: ExportAnalysisOptions = {},
): ExportArtifact {
  const prepared = prepareExportData(analysis, options);
  const { slotA, slotB, alignedDates, comparisonPair } = prepared;

  const comments: string[] = [
    '# Project Flipflop 34 - NASA Space Apps 2026 | Scientific Export (CSV)',
    `# exported_at: ${sanitizeCommentValue(prepared.exportedAt)} | analyzed_at: ${sanitizeCommentValue(prepared.analyzedAt ?? 'N/A')}`,
    `# source: ${prepared.source} | spatial_aggregation: ${prepared.spatialAggregation}`,
    `# period: ${prepared.start} to ${prepared.end} | aligned_observations=${alignedDates.length}`,
    formatRegionCommentLine(slotA.regionMeta),
    formatStatsCommentLine('A', slotA),
  ];

  if (slotB) {
    comments.push(formatRegionCommentLine(slotB.regionMeta));
    comments.push(formatStatsCommentLine('B', slotB));
  }

  if (comparisonPair) {
    const mc = comparisonPair.multiscale_correlation;
    const slopeDiff =
      comparisonPair.slope_difference_per_decade !== null
        ? formatSignedNumber(comparisonPair.slope_difference_per_decade, 4)
        : 'N/A';
    comments.push(
      `# comparison_pair: paradox_type=${sanitizeCommentValue(mc.paradox_type)} | ` +
        `r_global=${formatSignedNumber(mc.long_term_secular_r, 4)} | ` +
        `r_detrended=${formatSignedNumber(mc.short_term_detrended_r, 4)} | ` +
        `spatial_divergence=${comparisonPair.spatial_divergence_detected} | ` +
        `slope_diff_per_decade=${slopeDiff} | ` +
        `interpretation=${sanitizeCommentValue(mc.interpretation)}`,
    );
  }

  const baseHeaders = [
    'date',
    'a_raw',
    'a_anomaly',
    'a_z_score',
    'a_linear_fit',
    'a_sen_fit',
    'a_gam_smooth',
    'a_is_outlier_dm25',
    'a_mahalanobis_d',
    'a_outlier_hint',
  ];
  const bHeaders = slotB
    ? [
        'b_raw',
        'b_anomaly',
        'b_z_score',
        'b_linear_fit',
        'b_sen_fit',
        'b_gam_smooth',
        'b_is_outlier_dm25',
        'b_mahalanobis_d',
        'b_outlier_hint',
      ]
    : [];

  const headerRow = [...baseHeaders, ...bHeaders].map(escapeCsvCell).join(',');

  const dataRows = alignedDates.map(date => {
    const a = slotA.byDate.get(date);
    const cells: (string | number | boolean | null | undefined)[] = [
      date,
      a?.raw ?? null,
      a?.anomaly ?? null,
      a?.zScore ?? null,
      a?.linearFit ?? null,
      a?.senFit ?? null,
      a?.gamSmooth ?? null,
      a?.isOutlierDm25 ?? false,
      a?.mahalanobisD ?? null,
      a?.outlierHint ?? null,
    ];

    if (slotB) {
      const b = slotB.byDate.get(date);
      cells.push(
        b?.raw ?? null,
        b?.anomaly ?? null,
        b?.zScore ?? null,
        b?.linearFit ?? null,
        b?.senFit ?? null,
        b?.gamSmooth ?? null,
        b?.isOutlierDm25 ?? false,
        b?.mahalanobisD ?? null,
        b?.outlierHint ?? null,
      );
    }

    return cells.map(escapeCsvCell).join(',');
  });

  return {
    filename: buildExportFilename(analysis, 'csv', options),
    mimeType: 'text/csv;charset=utf-8',
    content: `${[...comments, headerRow, ...dataRows].join('\n')}\n`,
  };
}

export function triggerBrowserDownload(
  content: string,
  filename: string,
  mimeType: string,
): boolean {
  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return false;
  }

  const blob = new Blob([content], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
  return true;
}

export function exportAnalysisAsCsv(
  analysis: RegionAnalysisResponse,
  options: ExportAnalysisOptions = {},
): boolean {
  const artifact = createCsvExport(analysis, options);
  return triggerBrowserDownload(artifact.content, artifact.filename, artifact.mimeType);
}

export function exportAnalysisAsJson(
  analysis: RegionAnalysisResponse,
  options: ExportAnalysisOptions = {},
): boolean {
  const artifact = createJsonExport(analysis, options);
  return triggerBrowserDownload(artifact.content, artifact.filename, artifact.mimeType);
}
