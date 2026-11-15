import type { ConfidenceTier, RegimeShape, RegionSelection, VariableStatistics } from '../contracts/types';

export type TrendMode = 'none' | 'ols' | 'sen' | 'both';
export type MetricMode = 'raw' | 'anomaly' | 'zscore';
export type ScaleMode = 'linear' | 'symlog';
export type ViewMode = 'timeseries' | 'scatter' | 'both' | 'lag' | 'seasonal';

export const REGIME_LABELS: Readonly<Record<RegimeShape, string>> = {
  linear: 'Steady linear trend',
  accelerating_rise: 'Accelerating rise',
  accelerating_decline: 'Accelerating decline',
  saturating: 'Deceleration / saturation',
  non_monotonic: 'Non-monotonic behavior',
};

export const CONFIDENCE_LABELS: Readonly<
  Record<ConfidenceTier, { readonly label: string; readonly tone: 'high' | 'moderate' | 'low' | 'neutral' }>
> = {
  CONFIRMED_HIGH: { label: 'Significant (high confidence)', tone: 'high' },
  CONFIRMED_MODERATE: { label: 'Significant (moderate confidence)', tone: 'moderate' },
  INSUFFICIENT_SIGNAL: { label: 'Insufficient signal', tone: 'low' },
  NO_TREND: { label: 'No trend detected', tone: 'neutral' },
};

export interface GlossaryEntry {
  readonly term: string;
  readonly summary: string;
}

export const SCIENTIFIC_GLOSSARY: readonly GlossaryEntry[] = [
  {
    term: 'Climatological anomaly',
    summary:
      'Difference of each month from its historical seasonal mean. Removes the natural summer/winter cycle to reveal real trends.',
  },
  {
    term: 'OLS (Ordinary Least Squares)',
    summary:
      'Line fitted across the full point cloud. Measures the average rate of change per decade, sensitive to extremes.',
  },
  {
    term: 'Theil–Sen',
    summary:
      'Median slope across all pairs of points. Robust against outlier years (such as El Niño or La Niña).',
  },
  {
    term: 'AR(1) and Effective N',
    summary:
      'Adjusts statistical significance for climate memory: consecutive months are not fully independent, reducing false positives.',
  },
  {
    term: 'FDR (q < 0.05)',
    summary:
      'False Discovery Rate control (Benjamini–Hochberg). Ensures fewer than 5% of significant map points are due to chance.',
  },
  {
    term: 'Mahalanobis (D_M > 2.5)',
    summary:
      'Measures how far a month lies from expected behavior inside the trend ellipse, highlighting extreme events without erasing them.',
  },
  {
    term: 'Z-Score (σ)',
    summary:
      'Standardizes the anomaly by historical standard deviation, placing variables with different physical units on the same vertical scale.',
  },
  {
    term: 'GAM / Spline & Acceleration (B₂)',
    summary:
      'Smooth non-linear curve capturing acceleration, deceleration, or oscillatory cycles beyond the long-term linear trend.',
  },
];

export function formatSignedNumber(value: number, decimals = 3): string {
  if (!Number.isFinite(value)) return '—';
  const threshold = 0.5 * 10 ** -decimals;
  const normalized = Math.abs(value) < threshold ? 0 : value;
  const formatted = normalized.toFixed(decimals);
  return normalized > 0 ? `+${formatted}` : formatted;
}

export function formatPValue(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value > 0 && value < 0.0001) return value.toExponential(1);
  return value.toFixed(4);
}

export function countMissingValues(values: readonly (number | null)[]): number {
  return values.reduce<number>((acc, val) => (val === null || !Number.isFinite(val) ? acc + 1 : acc), 0);
}

export function summarizeRegionCoords(region: RegionSelection | null): string {
  if (!region || region.cells.length === 0) return 'Region not specified';
  const count = region.cells.length;
  const avgLat = region.cells.reduce((sum, c) => sum + c.lat, 0) / count;
  const avgLon = region.cells.reduce((sum, c) => sum + c.lon, 0) / count;
  return `${count} cell${count > 1 ? 's' : ''} · center (${avgLat.toFixed(2)}°, ${avgLon.toFixed(2)}°)`;
}

export function toSymlog(val: number): number {
  return Math.sign(val) * Math.log1p(Math.abs(val));
}

export function applyScale(val: number | null, scaleMode: ScaleMode): number | null {
  if (val === null || !Number.isFinite(val)) return null;
  return scaleMode === 'symlog' ? toSymlog(val) : val;
}

export function computeMeanStd(values: readonly (number | null)[]): { mean: number; std: number } {
  const valid = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (valid.length === 0) return { mean: 0, std: 1 };
  const mean = valid.reduce((acc, v) => acc + v, 0) / valid.length;
  if (valid.length < 2) return { mean, std: 1 };
  const variance = valid.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (valid.length - 1);
  const std = Math.sqrt(variance);
  return { mean, std: std > 1e-12 ? std : 1 };
}

export interface TransformedRegionSeries {
  readonly dates: readonly string[];
  readonly xDates: readonly string[];
  readonly yMain: readonly (number | null)[];
  readonly rawHoverValues: readonly (number | null)[];
  readonly yOls: readonly (number | null)[];
  readonly ySen: readonly (number | null)[] | null;
  readonly yGam: readonly (number | null)[];
  readonly outliers: readonly {
    readonly xDate: string;
    readonly date: string;
    readonly yPlot: number;
    readonly observedDisplay: number;
    readonly mahalanobisD: number;
    readonly diagnosticHint: string;
  }[];
  readonly unitLabel: string;
}

export function transformRegionSeries(
  region: VariableStatistics,
  indices: readonly number[],
  metricMode: MetricMode,
  scaleMode: ScaleMode,
): TransformedRegionSeries {
  const { series } = region;
  const rawStats = computeMeanStd(series.raw_values);
  const anomStats = computeMeanStd(series.anomaly_values);

  const convertVal = (anomOrRawVal: number | null, isRawMain = false): number | null => {
    if (anomOrRawVal === null || !Number.isFinite(anomOrRawVal)) return null;
    if (metricMode === 'raw') {
      // Translate anomaly fits to historical raw mean to isolate seasonal cycle cleanly
      return isRawMain ? anomOrRawVal : anomOrRawVal - anomStats.mean + rawStats.mean;
    }
    if (metricMode === 'zscore') {
      return (anomOrRawVal - anomStats.mean) / anomStats.std;
    }
    return anomOrRawVal;
  };

  const mapIndices = (arr: readonly (number | null)[], isRawMain = false) =>
    indices.map(i => convertVal(arr[i] ?? null, isRawMain));

  const mainDisplay =
    metricMode === 'raw'
      ? mapIndices(series.raw_values, true)
      : metricMode === 'zscore' && series.z_scores
        ? indices.map(i => series.z_scores?.[i] ?? null)
        : mapIndices(series.anomaly_values, false);

  const olsDisplay = mapIndices(series.linear_fit, false);
  const senDisplay = series.sen_fit ? mapIndices(series.sen_fit, false) : null;
  const gamDisplay = mapIndices(series.gam_smooth_fit, false);

  const dateIndexMap = new Map<string, number>();
  indices.forEach((origIdx, pos) => {
    const d = series.dates[origIdx];
    if (d) dateIndexMap.set(d, pos);
  });

  const outliers = region.outliers_mahalanobis.flatMap(outlier => {
    const pos = dateIndexMap.get(outlier.date);
    if (pos === undefined) return [];
    const obsDisplay =
      metricMode === 'raw'
        ? (mainDisplay[pos] ?? convertVal(outlier.observed_anomaly, false) ?? 0)
        : (convertVal(outlier.observed_anomaly, false) ?? 0);
    const yPlot = applyScale(obsDisplay, scaleMode);
    if (yPlot === null) return [];
    return [
      {
        xDate: `${outlier.date}-01`,
        date: outlier.date,
        yPlot,
        observedDisplay: obsDisplay,
        mahalanobisD: outlier.mahalanobis_d,
        diagnosticHint: outlier.diagnostic_hint,
      },
    ];
  });

  const baseUnit =
    metricMode === 'zscore'
      ? 'Standard Deviations (σ)'
      : metricMode === 'anomaly'
        ? `${region.unit} (anomaly)`
        : region.unit;

  return {
    dates: indices.map(i => series.dates[i] ?? ''),
    xDates: indices.map(i => `${series.dates[i] ?? ''}-01`),
    yMain: mainDisplay.map(v => applyScale(v, scaleMode)),
    rawHoverValues: mainDisplay,
    yOls: olsDisplay.map(v => applyScale(v, scaleMode)),
    ySen: senDisplay ? senDisplay.map(v => applyScale(v, scaleMode)) : null,
    yGam: gamDisplay.map(v => applyScale(v, scaleMode)),
    outliers,
    unitLabel: scaleMode === 'symlog' ? `symlog(${baseUnit})` : baseUnit,
  };
}

function medianOf(sortedVals: readonly number[]): number {
  const n = sortedVals.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  if (n % 2 === 0) {
    return 0.5 * ((sortedVals[mid - 1] ?? 0) + (sortedVals[mid] ?? 0));
  }
  return sortedVals[mid] ?? 0;
}

export function computeMahalanobisContourAndFit(
  pairs: readonly { readonly x: number; readonly y: number }[],
  threshold = 2.5,
): {
  ellipseX: number[];
  ellipseY: number[];
  fitX: number[];
  fitY: number[];
  distances: number[];
  outlierIndices: number[];
} | null {
  const n = pairs.length;
  if (n < 3) return null;

  let xMin = Infinity;
  let xMax = -Infinity;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of pairs) {
    xs.push(p.x);
    ys.push(p.y);
    if (p.x < xMin) xMin = p.x;
    if (p.x > xMax) xMax = p.x;
  }

  // Robust 1-step Reweighted MCD center & covariance so single extremes cannot inflate the ellipse (M1)
  const xsSorted = [...xs].sort((a, b) => a - b);
  const ysSorted = [...ys].sort((a, b) => a - b);
  const medX = medianOf(xsSorted);
  const medY = medianOf(ysSorted);
  const madX = 1.4826 * medianOf(xs.map(v => Math.abs(v - medX)).sort((a, b) => a - b));
  const madY = 1.4826 * medianOf(ys.map(v => Math.abs(v - medY)).sort((a, b) => a - b));

  const corePairs: { x: number; y: number }[] = [];
  if (n >= 6 && madX > 1e-12 && madY > 1e-12) {
    const gate = Math.max(3.0, threshold * 1.25);
    for (const p of pairs) {
      const z0 = Math.hypot((p.x - medX) / madX, (p.y - medY) / madY);
      if (z0 <= gate) {
        corePairs.push(p);
      }
    }
  }
  const active = corePairs.length >= Math.max(4, Math.ceil(0.5 * n)) ? corePairs : pairs;
  const m = active.length;

  let mx = 0;
  let my = 0;
  for (const p of active) {
    mx += p.x;
    my += p.y;
  }
  mx /= m;
  my /= m;

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of active) {
    const dx = p.x - mx;
    const dy = p.y - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  sxx = Math.max(1e-12, sxx / Math.max(1, m - 1));
  syy = Math.max(1e-12, syy / Math.max(1, m - 1));
  sxy /= Math.max(1, m - 1);

  const det = Math.max(1e-18, sxx * syy - sxy * sxy);
  const distances: number[] = [];
  const outlierIndices: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const pair = pairs[i];
    if (!pair) continue;
    const dx = pair.x - mx;
    const dy = pair.y - my;
    const d2 = (syy * dx * dx - 2 * sxy * dx * dy + sxx * dy * dy) / det;
    const dm = Math.sqrt(Math.max(0, d2));
    distances.push(dm);
    if (dm > threshold) {
      outlierIndices.push(i);
    }
  }

  const trace = sxx + syy;
  const disc = Math.sqrt(Math.max(0, (sxx - syy) ** 2 + 4 * sxy * sxy));
  const lambda1 = Math.max(1e-12, 0.5 * (trace + disc));
  const lambda2 = Math.max(1e-12, 0.5 * (trace - disc));
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  const ellipseX: number[] = [];
  const ellipseY: number[] = [];
  const steps = 120;
  for (let i = 0; i <= steps; i += 1) {
    const theta = (2 * Math.PI * i) / steps;
    const u = threshold * Math.sqrt(lambda1) * Math.cos(theta);
    const v = threshold * Math.sqrt(lambda2) * Math.sin(theta);
    ellipseX.push(mx + u * cosA - v * sinA);
    ellipseY.push(my + u * sinA + v * cosA);
  }

  const slope = sxx > 1e-12 ? sxy / sxx : 0;
  const intercept = my - slope * mx;
  return {
    ellipseX,
    ellipseY,
    fitX: [xMin, xMax],
    fitY: [intercept + slope * xMin, intercept + slope * xMax],
    distances,
    outlierIndices,
  };
}
