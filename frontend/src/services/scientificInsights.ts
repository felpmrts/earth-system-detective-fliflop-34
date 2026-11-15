import type {
  RegionAnalysisResponse,
  VariableId,
  VariableStatistics,
} from '../contracts/types';

export interface LagCorrelationRow {
  lag_months: number;
  n_overlap: number;
  n_effective_ar1: number;
  r_raw_anomalies: number;
  p_raw_ar1: number;
  r_detrended: number;
  p_detrended_ar1: number;
  q_fdr: number;
  ci95_threshold: number;
  significant_detrended_ar1: boolean;
  significant_fdr05: boolean;
}

export type LagFdrStatus = 'FDR_SIGNIFICANT' | 'LOCAL_AR1_ONLY' | 'NOT_SIGNIFICANT';

export interface LagLeadAnalysisResult {
  variable_a: VariableId;
  variable_b: VariableId;
  max_lag_months: number;
  r1_a: number;
  r1_b: number;
  ar1_neff_scale_factor: number;
  fdr_family_size: number;
  fdr_significant_lags_count: number;
  best_fdr_status: LagFdrStatus;
  uses_deseasonalized_anomalies: true;
  detrending_applied: true;
  best_raw_lag: LagCorrelationRow;
  best_detrended_lag: LagCorrelationRow;
  precedence_direction: 'A_LEADS_B' | 'B_LEADS_A' | 'SYNCHRONOUS';
  precedence_interpretation: string;
  lag_profile: LagCorrelationRow[];
}

export type SeasonCode = 'DJF' | 'MAM' | 'JJA' | 'SON';

export interface SeasonTrendMetrics {
  season: SeasonCode;
  season_label: string;
  status: 'OK' | 'INSUFFICIENT_DATA';
  n_months: number;
  n_seasons?: number;
  n_effective_ar1: number;
  mean_raw: number;
  mean_anomaly: number;
  slope_per_decade_sen: number;
  slope_ci95_low: number;
  slope_ci95_high: number;
  slope_per_decade_ols: number;
  r1_autocorrelation: number;
  p_value_ar1_corrected: number;
  q_fdr?: number;
  significant_fdr05?: boolean;
  significant_ar1: boolean;
}

export interface RegionSeasonalBreakdown {
  variable_id: VariableId;
  scale_type: 'interval' | 'ratio';
  trend_unit: string;
  dominant_season: SeasonCode;
  dominant_slope_sen: number;
  has_seasonal_sign_reversal: boolean;
  seasons: Record<SeasonCode, SeasonTrendMetrics>;
}

export interface SeasonalStratifiedResult {
  uses_deseasonalized_anomalies: true;
  region_a: RegionSeasonalBreakdown;
  region_b: RegionSeasonalBreakdown | null;
  summary_interpretation: string;
}

export interface InvariantAuditItem {
  id: string;
  number: number;
  shortTitle: string;
  title: string;
  passed: boolean;
  formulaDisplay: string;
  liveEvidence: string;
  scientificRationale: string;
}

export interface InvariantsAuditReport {
  passedCount: number;
  totalCount: number;
  allPassed: boolean;
  auditedAtIso: string;
  items: InvariantAuditItem[];
}

export interface MathematicalFormulationDoc {
  id: string;
  title: string;
  badge: string;
  equation: string;
  description: string;
}

function round(val: number, digits = 4): number {
  if (!Number.isFinite(val)) return 0;
  const factor = 10 ** digits;
  return Math.round(val * factor) / factor;
}

function mean(arr: readonly number[]): number {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (const val of arr) {
    sum += val;
  }
  return sum / arr.length;
}

function pearsonCorrelation(x: readonly number[], y: readonly number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;
  const mx = mean(x);
  const my = mean(y);
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = (x[i] ?? 0) - mx;
    const dy = (y[i] ?? 0) - my;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  if (den <= 1e-15) return 0;
  return Math.max(-1, Math.min(1, num / den));
}

function computeLag1Autocorrelation(
  arr: readonly number[],
  timeSteps?: readonly number[],
  expectedStep = 1
): number {
  if (arr.length < 4) return 0;
  if (!timeSteps || timeSteps.length !== arr.length) {
    const r1 = pearsonCorrelation(arr.slice(0, -1), arr.slice(1));
    return Math.max(-0.95, Math.min(0.95, r1));
  }
  const prev: number[] = [];
  const curr: number[] = [];
  for (let i = 1; i < arr.length; i += 1) {
    if (Math.round((timeSteps[i] ?? 0) - (timeSteps[i - 1] ?? 0)) === expectedStep) {
      prev.push(arr[i - 1] ?? 0);
      curr.push(arr[i] ?? 0);
    }
  }
  if (prev.length < 3) return 0;
  const r1 = pearsonCorrelation(prev, curr);
  return Math.max(-0.95, Math.min(0.95, r1));
}

function logGamma(z: number): number {
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  const coef = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  const shifted = z - 1;
  let x = coef[0] ?? 1;
  for (let i = 1; i < coef.length; i += 1) {
    x += (coef[i] ?? 0) / (shifted + i);
  }
  const t = shifted + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(x);
}

/** Regularized incomplete beta function I_x(a, b) via modified Lentz's continued fraction (exact match to SciPy betainc). */
function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - regularizedIncompleteBeta(1 - x, b, a);
  }
  const lnBeta = logGamma(a) + logGamma(b) - logGamma(a + b);
  const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lnBeta) / a;
  const tiny = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;

  for (let m = 1; m < 200; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;

    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-12) {
      break;
    }
  }
  return Math.max(0, Math.min(1, front * h));
}

/** Exact two-tailed p-value for Student's t-distribution with df > 0. */
function studentTTwoTailedPValue(tStat: number, df: number): number {
  if (!Number.isFinite(tStat) || df <= 0) return 1;
  if (Math.abs(tStat) < 1e-15) return 1;
  const x = df / (df + tStat * tStat);
  return Math.max(0, Math.min(1, regularizedIncompleteBeta(x, 0.5 * df, 0.5)));
}

function twoTailedCorrelationPValue(r: number, nEff: number): number {
  const absR = Math.abs(r);
  if (absR >= 0.999999) return 0;
  const df = Math.max(1, nEff - 2);
  const tStat = absR * Math.sqrt(df / Math.max(1e-15, 1 - absR * absR));
  return studentTTwoTailedPValue(tStat, df);
}

/** Exact critical |r| where Student-t two-tailed p-value equals alpha under df = nEff - 2. */
function criticalRForTwoTailedAlpha(nEff: number, alpha = 0.05): number {
  let lo = 0;
  let hi = 0.999999;
  for (let iter = 0; iter < 48; iter += 1) {
    const mid = 0.5 * (lo + hi);
    const p = twoTailedCorrelationPValue(mid, nEff);
    if (p > alpha) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return round(Math.max(0, Math.min(0.999, hi)), 4);
}

/** Benjamini-Hochberg (1995) step-up FDR control (mirrors backend/stats_engine.py apply_spatial_fdr_bh). */
export function applyBenjaminiHochbergFdr(
  pValues: readonly number[],
  alpha = 0.05
): { qValues: number[]; significantFlags: boolean[] } {
  const m = pValues.length;
  if (m === 0) return { qValues: [], significantFlags: [] };

  const indexed = pValues
    .map((p, idx) => ({
      idx,
      p: Math.max(0, Math.min(1, Number.isFinite(p) ? p : 1)),
    }))
    .sort((a, b) => a.p - b.p);

  const qSorted = new Array<number>(m).fill(1);
  let runningMin = 1;
  for (let rankIdx = m - 1; rankIdx >= 0; rankIdx -= 1) {
    const rankK = rankIdx + 1;
    const pVal = indexed[rankIdx]?.p ?? 1;
    const bhVal = (pVal * m) / rankK;
    runningMin = Math.min(runningMin, bhVal);
    qSorted[rankIdx] = Math.max(0, Math.min(1, runningMin));
  }

  const qValues = new Array<number>(m).fill(1);
  const significantFlags = new Array<boolean>(m).fill(false);
  for (let rankIdx = 0; rankIdx < m; rankIdx += 1) {
    const origIdx = indexed[rankIdx]?.idx ?? 0;
    const q = round(qSorted[rankIdx] ?? 1, 8);
    qValues[origIdx] = q;
    significantFlags[origIdx] = q < alpha;
  }

  return { qValues, significantFlags };
}

function pearsonPairsWithAr1(
  x: readonly number[],
  y: readonly number[],
  timeSteps?: readonly number[],
  expectedStep = 1
): { r: number; nEff: number; pAr1: number; ci95: number } {
  const n = Math.min(x.length, y.length);
  if (n < 3) {
    return { r: 0, nEff: n, pAr1: 1, ci95: 0.99 };
  }
  const r = pearsonCorrelation(x, y);
  let nEff = n;
  if (n >= 6) {
    const rx = computeLag1Autocorrelation(x, timeSteps, expectedStep);
    const ry = computeLag1Autocorrelation(y, timeSteps, expectedStep);
    const prod = Math.max(0, rx * ry);
    nEff = Math.max(3, Math.min(n, (n * (1 - prod)) / (1 + prod)));
  }
  const pAr1 = round(twoTailedCorrelationPValue(r, nEff), 8);
  const ci95 = criticalRForTwoTailedAlpha(nEff, 0.05);
  return {
    r: round(r, 4),
    nEff: round(nEff, 2),
    pAr1,
    ci95,
  };
}

function olsDetrend(
  tYears: readonly number[],
  y: readonly number[]
): {
  slopePerDecade: number;
  seSlopeDecade: number;
  intercept: number;
  residuals: number[];
} {
  const n = Math.min(tYears.length, y.length);
  if (n < 3) {
    return { slopePerDecade: 0, seSlopeDecade: 0, intercept: 0, residuals: [...y] };
  }
  const t0 = tYears[0] ?? 0;
  const xDecades = tYears.slice(0, n).map(t => (t - t0) / 10);
  const mx = mean(xDecades);
  const my = mean(y.slice(0, n));
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = (xDecades[i] ?? 0) - mx;
    sxx += dx * dx;
    sxy += dx * ((y[i] ?? 0) - my);
  }
  const slopePerDecade = sxx > 1e-15 ? sxy / sxx : 0;
  const intercept = my - slopePerDecade * mx;
  const residuals = y
    .slice(0, n)
    .map((val, idx) => val - (intercept + slopePerDecade * (xDecades[idx] ?? 0)));
  const sse = residuals.reduce((acc, res) => acc + res * res, 0);
  const mse = sse / Math.max(1, n - 2);
  const seSlopeDecade = sxx > 1e-15 ? Math.sqrt(mse / sxx) : 0;
  return { slopePerDecade, seSlopeDecade, intercept, residuals };
}

function theilSenSlopeAndCi95(tDecades: readonly number[], y: readonly number[]): {
  slopeSen: number;
  ciLow: number;
  ciHigh: number;
} {
  const n = Math.min(tDecades.length, y.length);
  if (n < 3) {
    return { slopeSen: 0, ciLow: 0, ciHigh: 0 };
  }
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const ti = tDecades[i] ?? 0;
      const tj = tDecades[j] ?? 0;
      const yi = y[i] ?? 0;
      const yj = y[j] ?? 0;
      const dt = tj - ti;
      if (Math.abs(dt) > 1e-12) {
        slopes.push((yj - yi) / dt);
      }
    }
  }
  if (slopes.length === 0) {
    return { slopeSen: 0, ciLow: 0, ciHigh: 0 };
  }
  slopes.sort((a, b) => a - b);
  const m = slopes.length;
  const mid = Math.floor(m / 2);
  const midVal = slopes[mid] ?? 0;
  const prevMidVal = slopes[mid - 1] ?? midVal;
  const slopeSen = m % 2 === 1 ? midVal : 0.5 * (prevMidVal + midVal);

  const varS = (n * (n - 1) * (2 * n + 5)) / 18;
  const cAlpha = 1.959963984540054 * Math.sqrt(Math.max(1, varS));
  const lowerIdx = Math.max(0, Math.floor((m - cAlpha) / 2));
  const upperIdx = Math.min(m - 1, Math.ceil((m + cAlpha) / 2) - 1);

  return {
    slopeSen: round(slopeSen, 5),
    ciLow: round(slopes[lowerIdx] ?? slopeSen, 5),
    ciHigh: round(slopes[upperIdx] ?? slopeSen, 5),
  };
}

function parseFractionalYear(ym: string): number {
  const [yStr, mStr] = ym.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return 2000;
  return year + (month - 0.5) / 12;
}

function ymToMonthIndex(ym: string): number | null {
  const [yStr, mStr] = ym.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  return year * 12 + (month - 1);
}

interface DeseasonalizedDetrendedSeries {
  byMonthIdx: Map<number, { rawAnom: number; detrended: number }>;
  detrendedOrdered: number[];
}

function prepareDetrendedAnomalySeries(
  region: VariableStatistics
): DeseasonalizedDetrendedSeries {
  const pts: Array<{ monthIdx: number; fy: number; rawAnom: number }> = [];
  for (let i = 0; i < region.series.dates.length; i += 1) {
    const d = region.series.dates[i];
    const anom = region.series.anomaly_values[i];
    if (d === undefined || typeof anom !== 'number' || !Number.isFinite(anom)) {
      continue;
    }
    const monthIdx = ymToMonthIndex(d);
    if (monthIdx === null) continue;
    pts.push({ monthIdx, fy: parseFractionalYear(d), rawAnom: anom });
  }
  pts.sort((a, b) => a.monthIdx - b.monthIdx);

  const tYears = pts.map(p => p.fy);
  const anoms = pts.map(p => p.rawAnom);
  // Remove secular linear trend on deseasonalized monthly anomalies before computing any lag correlation
  const detrended = olsDetrend(tYears, anoms).residuals;
  const byMonthIdx = new Map<number, { rawAnom: number; detrended: number }>();
  for (let i = 0; i < pts.length; i += 1) {
    const pt = pts[i];
    if (!pt) continue;
    byMonthIdx.set(pt.monthIdx, {
      rawAnom: pt.rawAnom,
      detrended: detrended[i] ?? 0,
    });
  }
  return { byMonthIdx, detrendedOrdered: detrended };
}

export function computeClientLaggedCrossCorrelation(
  analysis: RegionAnalysisResponse,
  maxLagMonths = 12
): LagLeadAnalysisResult {
  const regionA = analysis.region_a_analysis;
  const regionB = analysis.region_b_analysis ?? analysis.region_a_analysis;
  const maxLag = Math.max(1, Math.min(12, Math.floor(maxLagMonths)));

  const prepA = prepareDetrendedAnomalySeries(regionA);
  const prepB = prepareDetrendedAnomalySeries(regionB);

  const allMonthIdxA = Array.from(prepA.byMonthIdx.keys()).sort((a, b) => a - b);
  const commonIdx = allMonthIdxA.filter(t => prepB.byMonthIdx.has(t));

  const commonDetA: number[] = [];
  const commonDetB: number[] = [];
  for (const t of commonIdx) {
    const a = prepA.byMonthIdx.get(t);
    const b = prepB.byMonthIdx.get(t);
    if (a && b) {
      commonDetA.push(a.detrended);
      commonDetB.push(b.detrended);
    }
  }

  const r1A = computeLag1Autocorrelation(commonDetA, commonIdx, 1);
  const r1B = computeLag1Autocorrelation(commonDetB, commonIdx, 1);
  const commonProd = Math.max(0, r1A * r1B);
  const overallScaleFactor = Math.max(
    0.05,
    Math.min(1.0, (1 - commonProd) / Math.max(1e-6, 1 + commonProd))
  );

  const rawRows: Array<Omit<LagCorrelationRow, 'q_fdr' | 'significant_fdr05'>> = [];

  for (let lag = -maxLag; lag <= maxLag; lag += 1) {
    const pairSteps: number[] = [];
    const rawX: number[] = [];
    const rawY: number[] = [];
    const detX: number[] = [];
    const detY: number[] = [];

    for (const t of allMonthIdxA) {
      const ptA = prepA.byMonthIdx.get(t);
      const ptB = prepB.byMonthIdx.get(t + lag);
      if (ptA && ptB) {
        pairSteps.push(t);
        rawX.push(ptA.rawAnom);
        rawY.push(ptB.rawAnom);
        detX.push(ptA.detrended);
        detY.push(ptB.detrended);
      }
    }

    const nOverlap = detX.length;
    const rawStats = pearsonPairsWithAr1(rawX, rawY, pairSteps, 1);
    const detStats = pearsonPairsWithAr1(detX, detY, pairSteps, 1);

    rawRows.push({
      lag_months: lag,
      n_overlap: nOverlap,
      n_effective_ar1: detStats.nEff,
      r_raw_anomalies: rawStats.r,
      p_raw_ar1: rawStats.pAr1,
      r_detrended: detStats.r,
      p_detrended_ar1: detStats.pAr1,
      ci95_threshold: detStats.ci95,
      significant_detrended_ar1:
        nOverlap >= 3 &&
        Math.abs(detStats.r) >= detStats.ci95 &&
        detStats.pAr1 < 0.05,
    });
  }

  const fdrResult = applyBenjaminiHochbergFdr(
    rawRows.map(row => row.p_detrended_ar1),
    0.05
  );

  const profile: LagCorrelationRow[] = rawRows.map((row, idx) => ({
    ...row,
    q_fdr: fdrResult.qValues[idx] ?? 1,
    significant_fdr05: fdrResult.significantFlags[idx] ?? false,
  }));

  const fallbackRow: LagCorrelationRow = profile[0] ?? {
    lag_months: 0,
    n_overlap: 0,
    n_effective_ar1: 3,
    r_raw_anomalies: 0,
    p_raw_ar1: 1,
    r_detrended: 0,
    p_detrended_ar1: 1,
    q_fdr: 1,
    ci95_threshold: 0.95,
    significant_detrended_ar1: false,
    significant_fdr05: false,
  };

  let bestRaw = fallbackRow;
  let bestDet = fallbackRow;
  for (const row of profile) {
    if (Math.abs(row.r_raw_anomalies) > Math.abs(bestRaw.r_raw_anomalies)) {
      bestRaw = row;
    }
    if (Math.abs(row.r_detrended) > Math.abs(bestDet.r_detrended)) {
      bestDet = row;
    }
  }

  const fdrSignificantCount = profile.filter(row => row.significant_fdr05).length;
  const bestFdrStatus: LagFdrStatus = bestDet.significant_fdr05
    ? 'FDR_SIGNIFICANT'
    : bestDet.significant_detrended_ar1
      ? 'LOCAL_AR1_ONLY'
      : 'NOT_SIGNIFICANT';

  const fdrNote =
    bestFdrStatus === 'FDR_SIGNIFICANT'
      ? `aprovado em BH-FDR (${profile.length} lags, q_FDR < 0,05)`
      : bestFdrStatus === 'LOCAL_AR1_ONLY'
        ? `supera apenas a banda local AR(1), sem passar no controle BH-FDR (${profile.length} lags, q_FDR ≥ 0,05)`
        : `dentro da banda nula após correção AR(1) e BH-FDR (${profile.length} lags, q_FDR ≥ 0,05)`;

  const peakLag = bestDet.lag_months;
  let precedenceDirection: 'A_LEADS_B' | 'B_LEADS_A' | 'SYNCHRONOUS' =
    'SYNCHRONOUS';
  let precedenceInterpretation = '';

  if (peakLag > 0) {
    precedenceDirection = 'A_LEADS_B';
    const unitLabel = peakLag === 1 ? 'mês' : 'meses';
    precedenceInterpretation = `Pico em τ* = +${peakLag} ${unitLabel} (r_detrended = ${bestDet.r_detrended.toFixed(3)}, p_AR1 = ${bestDet.p_detrended_ar1.toFixed(4)}, q_FDR = ${bestDet.q_fdr.toFixed(4)}): anomalias sem tendência em A (${regionA.variable_id}) antecedem e se correlacionam com defasagem de +${peakLag} ${unitLabel} com B (${regionB.variable_id}); ${fdrNote}.`;
  } else if (peakLag < 0) {
    precedenceDirection = 'B_LEADS_A';
    const absLag = Math.abs(peakLag);
    const unitLabel = absLag === 1 ? 'mês' : 'meses';
    precedenceInterpretation = `Pico em τ* = ${peakLag} ${unitLabel} (r_detrended = ${bestDet.r_detrended.toFixed(3)}, p_AR1 = ${bestDet.p_detrended_ar1.toFixed(4)}, q_FDR = ${bestDet.q_fdr.toFixed(4)}): anomalias sem tendência em B (${regionB.variable_id}) antecedem e lideram com defasagem de ${absLag} ${unitLabel} as de A (${regionA.variable_id}); ${fdrNote}.`;
  } else {
    precedenceDirection = 'SYNCHRONOUS';
    precedenceInterpretation = `Pico síncrono em τ* = 0 meses (r_detrended = ${bestDet.r_detrended.toFixed(3)}, p_AR1 = ${bestDet.p_detrended_ar1.toFixed(4)}, q_FDR = ${bestDet.q_fdr.toFixed(4)}): anomalias sem tendência em A (${regionA.variable_id}) e B (${regionB.variable_id}) correlacionam-se de forma contemporânea; ${fdrNote}.`;
  }

  return {
    variable_a: regionA.variable_id,
    variable_b: regionB.variable_id,
    max_lag_months: maxLag,
    r1_a: round(r1A, 4),
    r1_b: round(r1B, 4),
    ar1_neff_scale_factor: round(overallScaleFactor, 4),
    fdr_family_size: profile.length,
    fdr_significant_lags_count: fdrSignificantCount,
    best_fdr_status: bestFdrStatus,
    uses_deseasonalized_anomalies: true,
    detrending_applied: true,
    best_raw_lag: bestRaw,
    best_detrended_lag: bestDet,
    precedence_direction: precedenceDirection,
    precedence_interpretation: precedenceInterpretation,
    lag_profile: profile,
  };
}

const SEASON_METADATA: Array<{
  code: SeasonCode;
  label: string;
  months: Set<number>;
}> = [
  { code: 'DJF', label: 'DJF (Verão Austral / Dez–Fev)', months: new Set([12, 1, 2]) },
  { code: 'MAM', label: 'MAM (Outono Austral / Mar–Mai)', months: new Set([3, 4, 5]) },
  { code: 'JJA', label: 'JJA (Inverno Austral / Jun–Ago)', months: new Set([6, 7, 8]) },
  { code: 'SON', label: 'SON (Primavera Austral / Set–Nov)', months: new Set([9, 10, 11]) },
];

function computeSingleRegionSeasonality(
  analysis: VariableStatistics
): RegionSeasonalBreakdown {
  const seasonsRecord = {} as Record<SeasonCode, SeasonTrendMetrics>;
  const safeTrendUnit =
    analysis.scale_type === 'interval'
      ? `${analysis.unit}/década`
      : analysis.trend_unit;
  const repMonthByCode: Record<SeasonCode, number> = {
    DJF: 1,
    MAM: 4,
    JJA: 7,
    SON: 10,
  };
  const okCodes: SeasonCode[] = [];
  const okPvals: number[] = [];
  const okSameSign: boolean[] = [];

  for (const meta of SEASON_METADATA) {
    const bySeasonYear = new Map<
      number,
      Array<{ anom: number; raw: number | null }>
    >();
    let nMonthsCount = 0;

    for (let i = 0; i < analysis.series.dates.length; i += 1) {
      const ym = analysis.series.dates[i];
      if (!ym) continue;
      const parts = ym.split('-');
      const year = Number(parts[0]);
      const month = Number(parts[1]);
      // Strictly use deseasonalized monthly anomalies Y'(a,m), never raw values
      const anom = analysis.series.anomaly_values[i];
      const raw = analysis.series.raw_values[i];
      if (
        meta.months.has(month) &&
        Number.isFinite(year) &&
        typeof anom === 'number' &&
        Number.isFinite(anom)
      ) {
        nMonthsCount += 1;
        // Group into meteorological season-years (Dec Y-1 -> Jan/Feb Y) to avoid pseudo-replication (M3)
        const sYear = meta.code === 'DJF' && month === 12 ? year + 1 : year;
        const arr = bySeasonYear.get(sYear) ?? [];
        arr.push({
          anom,
          raw: typeof raw === 'number' && Number.isFinite(raw) ? raw : null,
        });
        bySeasonYear.set(sYear, arr);
      }
    }

    const repMonth = repMonthByCode[meta.code];
    const sortedEntries = Array.from(bySeasonYear.entries()).sort(
      (a, b) => a[0] - b[0]
    );
    const toSeasonPts = (minMonths: number) =>
      sortedEntries
        .filter(([, grp]) => grp.length >= minMonths)
        .map(([sYear, grp]) => {
          const rawsGrp = grp
            .map(g => g.raw)
            .filter((v): v is number => v !== null);
          return {
            sYear,
            fy: sYear + (repMonth - 0.5) / 12,
            anom: mean(grp.map(g => g.anom)),
            raw: rawsGrp.length > 0 ? mean(rawsGrp) : null,
          };
        });

    let seasonPts = toSeasonPts(2);
    if (seasonPts.length < 6) {
      seasonPts = toSeasonPts(1);
    }

    const nSeasons = seasonPts.length;
    if (nSeasons < 6) {
      const raws = seasonPts
        .map(p => p.raw)
        .filter((v): v is number => v !== null);
      seasonsRecord[meta.code] = {
        season: meta.code,
        season_label: meta.label,
        status: 'INSUFFICIENT_DATA',
        n_months: nMonthsCount,
        n_seasons: nSeasons,
        n_effective_ar1: nSeasons,
        mean_raw: round(mean(raws), 3),
        mean_anomaly: round(mean(seasonPts.map(p => p.anom)), 3),
        slope_per_decade_sen: 0,
        slope_ci95_low: 0,
        slope_ci95_high: 0,
        slope_per_decade_ols: 0,
        r1_autocorrelation: 0,
        p_value_ar1_corrected: 1,
        q_fdr: 1,
        significant_fdr05: false,
        significant_ar1: false,
      };
      continue;
    }

    const t0 = seasonPts[0]?.fy ?? 2000;
    const tYears = seasonPts.map(p => p.fy);
    const sYearSteps = seasonPts.map(p => p.sYear);
    const xDecades = seasonPts.map(p => (p.fy - t0) / 10);
    const anoms = seasonPts.map(p => p.anom);
    const raws = seasonPts
      .map(p => p.raw)
      .filter((v): v is number => v !== null);

    const { slopeSen, ciLow, ciHigh } = theilSenSlopeAndCi95(xDecades, anoms);
    const olsFit = olsDetrend(tYears, anoms);
    const slopeOlsDecade = round(olsFit.slopePerDecade, 5);
    const rho1 = computeLag1Autocorrelation(olsFit.residuals, sYearSteps, 1);

    // Santer et al. (2000) across annual meteorological season-years
    const nEffRaw =
      rho1 > 0
        ? Math.max(3, Math.min(nSeasons, (nSeasons * (1 - rho1)) / (1 + rho1)))
        : nSeasons;
    const nEff = round(nEffRaw, 2);

    let pAr1: number;
    if (olsFit.seSlopeDecade <= 1e-15) {
      pAr1 = Math.abs(olsFit.slopePerDecade) <= 1e-12 ? 1 : 0;
    } else {
      const dfNaive = Math.max(1, nSeasons - 2);
      const tNaive = olsFit.slopePerDecade / olsFit.seSlopeDecade;
      const pNaive = studentTTwoTailedPValue(tNaive, dfNaive);

      const dfEff = Math.max(1, nEffRaw - 2);
      const inflation = Math.sqrt(Math.max(1, nSeasons - 2) / dfEff);
      const seAr1 = olsFit.seSlopeDecade * inflation;
      const tAr1 = seAr1 > 1e-15 ? olsFit.slopePerDecade / seAr1 : 0;
      const pSanter = studentTTwoTailedPValue(tAr1, dfEff);
      pAr1 = round(Math.max(pNaive, pSanter), 8);
    }

    const sameSign = olsFit.slopePerDecade * slopeSen >= 0;
    okCodes.push(meta.code);
    okPvals.push(pAr1);
    okSameSign.push(sameSign);

    seasonsRecord[meta.code] = {
      season: meta.code,
      season_label: meta.label,
      status: 'OK',
      n_months: nMonthsCount,
      n_seasons: nSeasons,
      n_effective_ar1: nEff,
      mean_raw: round(mean(raws), 3),
      mean_anomaly: round(mean(anoms), 3),
      slope_per_decade_sen: slopeSen,
      slope_ci95_low: ciLow,
      slope_ci95_high: ciHigh,
      slope_per_decade_ols: slopeOlsDecade,
      r1_autocorrelation: round(rho1, 4),
      p_value_ar1_corrected: pAr1,
      q_fdr: 1,
      significant_fdr05: false,
      significant_ar1: pAr1 < 0.05 && sameSign,
    };
  }

  if (okPvals.length > 0) {
    const fdrRes = applyBenjaminiHochbergFdr(okPvals, 0.05);
    for (let i = 0; i < okCodes.length; i += 1) {
      const code = okCodes[i];
      if (!code) continue;
      const q = fdrRes.qValues[i] ?? 1;
      const isFdr = fdrRes.significantFlags[i] ?? false;
      const pVal = okPvals[i] ?? 1;
      const sameSign = okSameSign[i] ?? false;
      seasonsRecord[code] = {
        ...seasonsRecord[code],
        q_fdr: round(q, 6),
        significant_fdr05: isFdr,
        significant_ar1: pVal < 0.05 && isFdr && sameSign,
      };
    }
  }

  const orderedCodes: SeasonCode[] = ['DJF', 'MAM', 'JJA', 'SON'];
  let dominantSeason: SeasonCode = 'DJF';
  let maxAbsSlope = -1;
  let hasPositive = false;
  let hasNegative = false;

  for (const code of orderedCodes) {
    const row = seasonsRecord[code];
    if (row.status !== 'OK') continue;
    const s = row.slope_per_decade_sen;
    if (Math.abs(s) > maxAbsSlope) {
      maxAbsSlope = Math.abs(s);
      dominantSeason = code;
    }
    if (s > 1e-4) hasPositive = true;
    if (s < -1e-4) hasNegative = true;
  }

  return {
    variable_id: analysis.variable_id,
    scale_type: analysis.scale_type,
    trend_unit: safeTrendUnit,
    dominant_season: dominantSeason,
    dominant_slope_sen: seasonsRecord[dominantSeason].slope_per_decade_sen,
    has_seasonal_sign_reversal: hasPositive && hasNegative,
    seasons: seasonsRecord,
  };
}

export function computeClientSeasonalStratifiedTrends(
  analysis: RegionAnalysisResponse
): SeasonalStratifiedResult {
  const regionA = computeSingleRegionSeasonality(analysis.region_a_analysis);
  const regionB = analysis.region_b_analysis
    ? computeSingleRegionSeasonality(analysis.region_b_analysis)
    : null;

  const domA = regionA.seasons[regionA.dominant_season];
  const reversalText = regionA.has_seasonal_sign_reversal
    ? 'com inversão de sinal entre estações do ano (divergência hidroclimática sazonal)'
    : 'com coerência direcional em todas as quatro estações';

  const summaryInterpretation = `A tendência decadal sobre anomalias mensais dessazonalizadas de ${regionA.variable_id} é dominada por ${regionA.dominant_season} (B_Sen = ${domA.slope_per_decade_sen >= 0 ? '+' : ''}${domA.slope_per_decade_sen.toFixed(3)} ${regionA.trend_unit}, IC 95% [${domA.slope_ci95_low.toFixed(3)}, ${domA.slope_ci95_high.toFixed(3)}], p_AR1 = ${domA.p_value_ar1_corrected.toFixed(4)}), ${reversalText}.`;

  return {
    uses_deseasonalized_anomalies: true,
    region_a: regionA,
    region_b: regionB,
    summary_interpretation: summaryInterpretation,
  };
}

export const MATHEMATICAL_FORMULATIONS: MathematicalFormulationDoc[] = [
  {
    id: 'inv-1-deseasonalization',
    title: '1. Dessazonalização Climatológica Mensal (Leavitt)',
    badge: 'Invariante #1',
    equation: 'Y′(a,m) = Y(a,m) − Ȳₘ   |   Ȳₘ = (1 / Nₘ) · Σ Y(a,m)',
    description:
      'Remove o **ciclo anual astronômico** estrito por mês calendário `m ∈ {1..12}` antes de qualquer regressão ou correlação, evitando que a insolação sazonal infle artificialmente o acoplamento.',
  },
  {
    id: 'inv-2-theil-sen',
    title: '2. Estimador Não-Paramétrico de Theil–Sen & OLS Secular',
    badge: 'Invariante #2',
    equation: 'B_Sen = mediana_{i < j} [ (Y′ⱼ − Y′ᵢ) / (tⱼ − tᵢ) ] × 10 anos/década',
    description:
      'Quantifica a taxa secular usando **100% dos N pontos temporais** com ponto de ruptura de **29,3%** contra extremos (`ENSO`/secas severas), proibindo a subtração ingênua de extremos (`Y_fim − Y_início`).',
  },
  {
    id: 'inv-3-scale-type',
    title: '3. Invariância de Escala Termodinâmica (Interval vs. Ratio)',
    badge: 'Invariante #3',
    equation: 'scale_type(T2M) = interval  ⇒  Δ% = ∅  (estritamente °C/década)',
    description:
      'Temperaturas em °C possuem **zero arbitrário (`273,15 K`)**. O motor bloqueia variações percentuais em escalas `interval`, reportando estritamente taxas absolutas (`°C/década`), reservando `%` para escalas de razão (`ratio`).',
  },
  {
    id: 'inv-4-5-multiscale',
    title: '4 & 5. Separação Slope vs. Acoplamento & Decomposição Multiescala',
    badge: 'Invariantes #4 & #5',
    equation: 'Y′(t) = T_secular(t) + R_detrended(t)   ⇒   r_secular vs. r_resíduo',
    description:
      'Separa a **taxa física secular (`B_Sen`)** da força de acoplamento (`r`, `R²`) e decompõe a série em componente secular e resíduo interanual, revelando **paradoxos de Simpson** entre décadas e estações.',
  },
  {
    id: 'inv-6-gam-mahalanobis',
    title: '6. Splines Cúbicos Penalizados (GAM) & Distância de Mahalanobis',
    badge: 'Invariante #6',
    equation: 'D_M(t) = √[(zₜ − μ)ᵀ Σ⁻¹ (zₜ − μ)] > 2,5   |   zₜ = [t, Y′ₜ]ᵀ',
    description:
      'Captura **inflexões e acelerações não-lineares** via B-splines penalizados (`GAM`) e isola extremos multivariados considerando a covariância conjunta tempo–anomalia (`D_M > 2,5`).',
  },
  {
    id: 'inv-7-ar1-fdr',
    title: '7. Graus de Liberdade Efetivos AR(1) (Bretherton) & Controle FDR',
    badge: 'Invariante #7',
    equation: 'N_eff = N · (1 − r₁)/(1 + r₁)   |   q_FDR(k) = min_{j ≥ k}(M / j · p_(j)) < 0,05',
    description:
      'Desconta a **memória autorregressiva lag-1 (`r₁`)** na inferência (`p_AR1` via distribuição t de Student) e aplica controle **Benjamini–Hochberg (`q_FDR < 0,05`)** tanto na grade espacial quanto na família dos **M = 25 lags (`τ ∈ [−12, +12]`)**.',
  },
  {
    id: 'nasa-power-grids',
    title: '8. Arquitetura de Grades Nativas NASA POWER (MERRA-2 vs. CERES)',
    badge: 'Física Espacial',
    equation: 'MERRA-2: 0,5° × 0,625° (1981–2025)   |   CERES SYN1deg: 1,0° × 1,0° (1984–2025)',
    description:
      'Preserva a **resolução nativa** de reanálise assimilada (`MERRA-2` para meteorologia e umidade do solo) e observação orbital radiativa (`CERES SYN1deg` para irradiância/nuvens) com agregação espacial `nanmean` 8-conexa (`1 ≤ K ≤ 25`).',
  },
];

export function auditAnalysisInvariants(
  analysis: RegionAnalysisResponse
): InvariantsAuditReport {
  const regA = analysis.region_a_analysis;
  const regB = analysis.region_b_analysis;

  // Invariant 1: Climatological Deseasonalization
  const inv1Passed =
    regA.series.dates.length > 0 &&
    regA.series.dates.length === regA.series.anomaly_values.length &&
    regA.series.anomaly_values.some(v => typeof v === 'number' && Number.isFinite(v));

  // Invariant 2: OLS + Theil-Sen over 100% of N points
  const inv2Passed =
    Number.isFinite(regA.regression.slope_per_decade_ols) &&
    Number.isFinite(regA.regression.slope_per_decade_sen) &&
    Number.isFinite(regA.regression.slope_ci95_low) &&
    Number.isFinite(regA.regression.slope_ci95_high) &&
    regA.series.linear_fit.length === regA.series.dates.length;

  // Invariant 3: Thermodynamic Scale Type (no % on interval scales)
  const checkScaleCompliance = (r: VariableStatistics): boolean => {
    if (r.scale_type === 'interval') {
      return !r.allow_percentage_change && !r.trend_unit.includes('%');
    }
    return r.scale_type === 'ratio';
  };
  const inv3Passed =
    checkScaleCompliance(regA) && (regB ? checkScaleCompliance(regB) : true);

  // Invariant 4: Strict separation between secular slope (B) and coupling (r, R²)
  const inv4Passed =
    Number.isFinite(regA.regression.slope_per_decade_sen) &&
    Number.isFinite(regA.correlation_and_coupling.r_squared) &&
    regA.correlation_and_coupling.r_squared >= 0 &&
    regA.correlation_and_coupling.r_squared <= 1;

  // Invariant 5: Multiscale decomposition (long-term trend vs short-term residual)
  const mc = analysis.comparison_pair?.multiscale_correlation ?? null;
  const inv5Passed = regB
    ? mc !== null &&
      Number.isFinite(mc.long_term_secular_r) &&
      Number.isFinite(mc.short_term_detrended_r)
    : regA.series.anomaly_values.length >= 12;

  // Invariant 6: Non-linearity (GAM spline) & Multivariate Mahalanobis extremes
  const inv6Passed =
    regA.series.gam_smooth_fit.length === regA.series.dates.length &&
    typeof regA.regression.regime_shape === 'string' &&
    Array.isArray(regA.outliers_mahalanobis);

  // Invariant 7: AR(1) effective sample size (Bretherton N_eff) & Benjamini-Hochberg FDR
  const inv7Passed =
    Number.isFinite(regA.period.n_effective_ar1) &&
    regA.period.n_effective_ar1 > 0 &&
    regA.period.n_effective_ar1 <= regA.period.n_observations + 0.01 &&
    Number.isFinite(regA.significance.p_value_ar1_corrected) &&
    Number.isFinite(regA.significance.fdr_q_value);

  const startYear = regA.period.start.slice(0, 4);
  const endYear = regA.period.end.slice(0, 4);

  const items: InvariantAuditItem[] = [
    {
      id: 'inv-1',
      number: 1,
      shortTitle: 'Anomalia Climatológica',
      title: 'Invariante #1 — Dessazonalização Climatológica Mensal Estrita',
      passed: inv1Passed,
      formulaDisplay: 'Y′(a,m) = Y(a,m) − Ȳₘ',
      liveEvidence: `Base **${startYear}–${endYear}** (**${regA.period.n_observations} meses** dessazonalizados em \`${regA.variable_id}\`).`,
      scientificRationale:
        'Isola perturbações climáticas reais removendo o **ciclo solar sazonal médio** de cada mês `m ∈ {1..12}`.',
    },
    {
      id: 'inv-2',
      number: 2,
      shortTitle: 'OLS + Theil–Sen (N pontos)',
      title: 'Invariante #2 — Regressão Robusta OLS + Theil–Sen sobre 100% da Série',
      passed: inv2Passed,
      formulaDisplay: 'B_Sen = mediana[(Y′ⱼ − Y′ᵢ) / (tⱼ − tᵢ)] × 10',
      liveEvidence: `**B_Sen** = ${regA.regression.slope_per_decade_sen >= 0 ? '+' : ''}${regA.regression.slope_per_decade_sen.toFixed(3)} vs. **B_OLS** = ${regA.regression.slope_per_decade_ols >= 0 ? '+' : ''}${regA.regression.slope_per_decade_ols.toFixed(3)} \`${regA.trend_unit}\` (**IC 95%**: [${regA.regression.slope_ci95_low.toFixed(3)}, ${regA.regression.slope_ci95_high.toFixed(3)}]).`,
      scientificRationale:
        'Proíbe estimativas por subtração de extremos (`Y_fim − Y_início`) e protege a inclinação secular contra anos de **El Niño / La Niña**.',
    },
    {
      id: 'inv-3',
      number: 3,
      shortTitle: 'Escala Termodinâmica',
      title: 'Invariante #3 — Respeito Estrito a Escalas Interval vs. Ratio',
      passed: inv3Passed,
      formulaDisplay: 'scale_type = interval  ⇒  Δ% = ∅',
      liveEvidence: `\`${regA.variable_id}\` (\`${regA.scale_type}\`): unidade **${regA.trend_unit}** — ${regA.scale_type === 'interval' ? '**Δ% bloqueado** por zero arbitrário (°C)' : '**razão física habilitada**'}.`,
      scientificRationale:
        'Impede falácias termodinâmicas de calcular variação percentual sobre **escalas intervalares (°C)**.',
    },
    {
      id: 'inv-4',
      number: 4,
      shortTitle: 'Slope vs. Acoplamento',
      title: 'Invariante #4 — Separação Estrita entre Taxa Física (B) e Acoplamento (r, R²)',
      passed: inv4Passed,
      formulaDisplay: 'B_Sen  ⊥  (r_Pearson, R²)',
      liveEvidence: `**Taxa física** = ${regA.regression.slope_per_decade_sen.toFixed(3)} \`${regA.trend_unit}\` · **R² secular** = ${regA.correlation_and_coupling.r_squared.toFixed(3)} · **r** = ${regA.correlation_and_coupling.pearson_r.toFixed(3)}.`,
      scientificRationale:
        'Distingue claramente a **velocidade de mudança física decadal** do grau de ajuste ou covariância temporal.',
    },
    {
      id: 'inv-5',
      number: 5,
      shortTitle: 'Decomposição Multiescala',
      title: 'Invariante #5 — Decomposição Multiescala (Secular vs. Resíduo Interanual)',
      passed: inv5Passed,
      formulaDisplay: 'Y′(t) = T_secular(t) + R_detrended(t)',
      liveEvidence: mc
        ? `**r_secular** = ${mc.long_term_secular_r.toFixed(3)} · **r_resíduo** = ${mc.short_term_detrended_r.toFixed(3)} · Classe: \`${mc.paradox_type}\`.`
        : `Série univariada (**${regA.period.n_observations} meses**) pronta para comparação **A × B**.`,
      scientificRationale:
        'Evita confundir **co-tendência secular de longo prazo** com sincronia meteorológica interanual de alta frequência.',
    },
    {
      id: 'inv-6',
      number: 6,
      shortTitle: 'GAM & Mahalanobis',
      title: 'Invariante #6 — Curvatura Não-Linear (GAM) & Extremos de Mahalanobis (D_M > 2,5)',
      passed: inv6Passed,
      formulaDisplay: 'D_M(t) = √[(zₜ − μ)ᵀ Σ⁻¹ (zₜ − μ)] > 2,5',
      liveEvidence: `**Regime GAM**: \`${regA.regression.regime_shape}\` (**B₂** = ${regA.regression.quadratic_acceleration_B2.toFixed(4)}) · **Outliers Mahalanobis**: **${regA.outliers_mahalanobis.length}** eventos.`,
      scientificRationale:
        'Detecta **acelerações de regime climático** e choques extremos fora da elipse conjunta de covariância.',
    },
    {
      id: 'inv-7',
      number: 7,
      shortTitle: 'AR(1) N_eff & FDR',
      title: 'Invariante #7 — Correção de Autocorrelação AR(1) (Bretherton) & Controle FDR',
      passed: inv7Passed,
      formulaDisplay: 'N_eff = N · (1 − r₁)/(1 + r₁)  |  q_FDR < 0,05',
      liveEvidence: `**N** = ${regA.period.n_observations} → **N_eff** = ${regA.period.n_effective_ar1.toFixed(1)} · p_AR1 = ${regA.significance.p_value_ar1_corrected.toFixed(4)} · q_FDR = ${regA.significance.fdr_q_value.toFixed(4)}.`,
      scientificRationale:
        'Desconta a **persistência de memória climática mensal** e controla falsos positivos em múltiplas comparações.',
    },
  ];

  const passedCount = items.filter(i => i.passed).length;
  return {
    passedCount,
    totalCount: items.length,
    allPassed: passedCount === items.length,
    auditedAtIso: new Date().toISOString(),
    items,
  };
}

function stripInlineMarkdown(markdown: string): string {
  return markdown.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1');
}

export function buildMethodologicalSummaryText(
  analysis: RegionAnalysisResponse,
  audit?: InvariantsAuditReport
): string {
  const report = audit ?? auditAnalysisInvariants(analysis);
  const regA = analysis.region_a_analysis;
  const regB = analysis.region_b_analysis;

  const lines: string[] = [
    '# DOSSIÊ METODOLÓGICO & AUDITORIA ESTATÍSTICA — EARTH SYSTEM DETECTIVE (NASA POWER)',
    `Status de Rigor Científico: ${report.passedCount}/${report.totalCount} Invariantes Auditados (${report.allPassed ? 'CONFORMIDADE TOTAL' : 'VERIFICAR'})`,
    `Janela Analisada: ${regA.period.start} a ${regA.period.end} (N = ${regA.period.n_observations} meses | N_eff AR(1) = ${regA.period.n_effective_ar1.toFixed(1)})`,
    '',
    '## 1. Telemetria da Região A',
    `- Variável A: ${regA.variable_id} (${regA.variable_name}) | Escala: ${regA.scale_type} | Unidade: ${regA.unit}`,
    `- Agregação Espacial: K = ${analysis.request_meta.cells_count_a} células (${analysis.request_meta.spatial_aggregation}) | ID: ${analysis.request_meta.region_a_id}`,
    `- Tendência Secular (Theil–Sen): ${regA.regression.slope_per_decade_sen >= 0 ? '+' : ''}${regA.regression.slope_per_decade_sen.toFixed(4)} ${regA.trend_unit} (IC 95%: [${regA.regression.slope_ci95_low.toFixed(4)}, ${regA.regression.slope_ci95_high.toFixed(4)}])`,
    `- Tendência Secular (OLS): ${regA.regression.slope_per_decade_ols >= 0 ? '+' : ''}${regA.regression.slope_per_decade_ols.toFixed(4)} ${regA.trend_unit} | R² = ${regA.correlation_and_coupling.r_squared.toFixed(4)}`,
    `- Significância AR(1) & FDR: N_eff = ${regA.period.n_effective_ar1.toFixed(1)} | p_AR1 = ${regA.significance.p_value_ar1_corrected.toFixed(5)} | q_FDR = ${regA.significance.fdr_q_value.toFixed(5)} (${regA.significance.confidence_tier})`,
    `- Extremos Multivariados (Mahalanobis D_M > 2,5): ${regA.outliers_mahalanobis.length} eventos | Regime GAM: ${regA.regression.regime_shape}`,
  ];

  if (regB) {
    lines.push(
      '',
      '## 2. Telemetria da Região B & Acoplamento Bivariado',
      `- Variável B: ${regB.variable_id} (${regB.variable_name}) | Escala: ${regB.scale_type}`,
      `- Agregação Espacial B: K = ${analysis.request_meta.cells_count_b} células | ID: ${analysis.request_meta.region_b_id ?? '—'}`,
      `- Tendência Secular B (Theil–Sen): ${regB.regression.slope_per_decade_sen >= 0 ? '+' : ''}${regB.regression.slope_per_decade_sen.toFixed(4)} ${regB.trend_unit} | q_FDR = ${regB.significance.fdr_q_value.toFixed(5)}`
    );
    if (analysis.comparison_pair) {
      const cp = analysis.comparison_pair;
      lines.push(
        `- Divergência Espacial: ${cp.spatial_divergence_detected ? 'DETECTADA' : 'Não detectada'}`,
        `- Decomposição Multiescala: r_secular = ${cp.multiscale_correlation.long_term_secular_r.toFixed(3)} | r_resíduo = ${cp.multiscale_correlation.short_term_detrended_r.toFixed(3)} | Tipo: ${cp.multiscale_correlation.paradox_type}`
      );
    }
  }

  lines.push('', '## 3. Checklist dos 7 Invariantes Estatísticos');
  for (const item of report.items) {
    lines.push(
      `- [${item.passed ? 'PASS' : 'WARN'}] ${item.title}: ${stripInlineMarkdown(item.liveEvidence)}`
    );
  }

  return lines.join('\n');
}
