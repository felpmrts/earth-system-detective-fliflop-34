import { getIntersectingDateBounds, getVariableMetadata } from '../contracts/catalog';
import type { RegionSelection, VariableId } from '../contracts/types';
import type { TrendMode } from '../bench/benchMeta';
import { buildRegionSelection, snapCoordToCell } from '../geo/gridGeometry';

export type ArchetypeId =
  | 'spatial_dipole'
  | 'local_coupling'
  | 'cross_teleconnection'
  | 'univariate_xray'
  | 'configuring';

export interface ExperimentArchetype {
  readonly id: ArchetypeId;
  readonly formula: string;
  readonly label: string;
  readonly summary: string;
}

export interface StoryTrapItem {
  readonly id: 'noise' | 'nonlinear' | 'multiscale';
  readonly number: string;
  readonly title: string;
  readonly trapSummary: string;
  readonly solutionBadge: string;
  readonly solutionText: string;
}

export interface StatisticalEngineStage {
  readonly id: 'preprocess' | 'trends' | 'audit' | 'multiscale';
  readonly stepNumber: string;
  readonly badge: string;
  readonly title: string;
  readonly tagline: string;
  readonly howItWorks: string;
  readonly benchSpecialty: string;
  readonly outputMetrics: readonly string[];
}

export interface EngineSpecialtyItem {
  readonly id: string;
  readonly kicker: string;
  readonly title: string;
  readonly summary: string;
}

export interface MatrixModeCard {
  readonly id: Exclude<ArchetypeId, 'configuring'>;
  readonly formula: string;
  readonly title: string;
  readonly tagline: string;
  readonly example: string;
  readonly recommendedPresetId: string;
  readonly defaultSameLocation: boolean;
}

export interface StoryPresetSeedCoord {
  readonly lat: number;
  readonly lon: number;
}

export interface StoryPreset {
  readonly id: string;
  readonly archetypeId: Exclude<ArchetypeId, 'configuring'>;
  readonly archetypeLabel: string;
  readonly formula: string;
  readonly title: string;
  readonly subtitle: string;
  readonly question: string;
  readonly highlightBadge: string;
  readonly variableA: VariableId;
  readonly variableB: VariableId;
  readonly regionALabel: string;
  readonly regionBLabel: string;
  readonly coordsA: readonly StoryPresetSeedCoord[];
  readonly coordsB: readonly StoryPresetSeedCoord[];
  readonly sameLocation: boolean;
  readonly startMonth: string;
  readonly endMonth: string;
  readonly recommendedBench: {
    readonly anomaly: boolean;
    readonly separate: boolean;
    readonly dual: boolean;
    readonly trendMode: TrendMode;
  };
}

export const STORY_TRAPS: readonly StoryTrapItem[] = [
  {
    id: 'noise',
    number: '01',
    title: 'Natural oscillation masquerades as a trend',
    trapSummary:
      'Natural rainfall and temperature cycles create apparent upward drifts that fool ordinary regression lines.',
    solutionBadge: 'AR(1) + FDR (q < 0.05)',
    solutionText:
      'We discount month-to-month temporal memory and suppress false alarms before confirming any trend.',
  },
  {
    id: 'nonlinear',
    number: '02',
    title: 'A straight line hides regime shifts',
    trapSummary:
      'Climate can remain steady for decades and then accelerate abruptly — something a simple straight line misses.',
    solutionBadge: 'Theil–Sen + GAM Curve (B₂)',
    solutionText:
      'We combine an outlier-resistant median slope with a flexible GAM smooth curve to reveal accelerations.',
  },
  {
    id: 'multiscale',
    number: '03',
    title: 'Rising together over 40 years, diverging year to year',
    trapSummary:
      'Two regions can warm together over the long term yet react in opposite directions during El Niño events.',
    solutionBadge: 'r_global × r_detrended + Mahalanobis',
    solutionText:
      'We separate long-term secular trends from short-term shocks and flag extreme months (D_M > 2.5).',
  },
];

export const STAT_ENGINE_STAGES: readonly StatisticalEngineStage[] = [
  {
    id: 'preprocess',
    stepNumber: 'STEP 01',
    badge: 'ANOMALY · Z-SCORE (σ) · SYMLOG',
    title: 'Seasonal Cleaning & Standardization',
    tagline: 'Removes summer/winter cycles to isolate true departures',
    howItWorks:
      'For each selected cell and month, the engine computes the climatological anomaly by subtracting the historical mean for that calendar month. Rainfall and heat can then be compared in physical units, standard deviations (Z-Score σ), or symmetric Symlog scale.',
    benchSpecialty:
      'In the Scientific Workbench you can switch instantly between Raw Value, Anomaly, Z-Score (σ), and Linear/Symlog scale — aligning variables with different units on the same chart without distorting zero.',
    outputMetrics: ['Monthly Anomaly', 'Z-Score (σ)', 'Symlog Scale', 'Dual / Single Y-Axis'],
  },
  {
    id: 'trends',
    stepNumber: 'STEP 02',
    badge: 'OLS · THEIL–SEN · GAM CURVE (B₂)',
    title: 'Dual Regression & Nonlinear Acceleration',
    tagline: 'Measures decadal velocity and regime shifts',
    howItWorks:
      'The engine fits three complementary views simultaneously: the OLS mean line, the median Theil–Sen slope with 95% Confidence Interval (immune to extreme years like El Niño), and the smooth GAM curve with quadratic term B₂.',
    benchSpecialty:
      'Automatically classifies the physical regime into 5 states: Steady linear trend, Accelerating rise, Accelerating decline, Decelerating / saturating, or Non-monotonic behavior.',
    outputMetrics: ['Theil–Sen Rate + 95% CI', 'OLS Rate', 'B₂ Curvature (GAM)', 'Physical Regime'],
  },
  {
    id: 'audit',
    stepNumber: 'STEP 03',
    badge: 'AR(1) · EFFECTIVE N · FDR (q < 0.05)',
    title: 'Memory & False-Alarm Audit',
    tagline: 'Confirms a trend only after correcting temporal dependence',
    howItWorks:
      'Consecutive months of drought or heat retain climatic memory (autocorrelation). The engine discounts this dependence via an AR(1) model, reducing raw N to effective N, recomputes p_AR(1), and applies Benjamini–Hochberg (FDR) control.',
    benchSpecialty:
      'Issues the final auditable confidence badge: Significant (high confidence), Significant (moderate confidence), Insufficient signal, or No trend detected — blocking false positives.',
    outputMetrics: ['Raw N → Effective N', 'p_naive vs p_AR(1)', 'q_FDR (< 0.05)', 'Confidence Badge'],
  },
  {
    id: 'multiscale',
    stepNumber: 'STEP 04',
    badge: 'MAHALANOBIS · r_global × r_detrended · INVARIANT #3',
    title: 'Extremes, Coupling & Multiscale Paradox',
    tagline: 'Detects atypical months and inversions between decades and years',
    howItWorks:
      'Computes the covariance ellipse and Mahalanobis Distance (D_M > 2.5) to flag extreme events without erasing the trend. When comparing Region A × Region B, it contrasts secular correlation (r_global) against short-term correlation (r_detrended).',
    benchSpecialty:
      'Enforces physical guard Invariant #3 (blocking invalid % changes on interval scales like °C), switches to X vs Y Scatter with ellipse aspect ratio, and exports complete series and diagnostics in CSV and JSON.',
    outputMetrics: ['Outliers D_M > 2.5', 'Pearson r · Kendall τ · R²', 'Δ Slope (A − B)', 'Scientific CSV / JSON'],
  },
];

export const STAT_ENGINE_SPECIALTIES: readonly EngineSpecialtyItem[] = [
  {
    id: 'robust-dual',
    kicker: 'ROBUSTNESS',
    title: 'Dual trend OLS + Theil–Sen (95% CI)',
    summary: 'Compares the global mean slope with the outlier-resistant median slope to prevent distortion from a single atypical year.',
  },
  {
    id: 'regime-gam',
    kicker: 'NONLINEARITY',
    title: 'GAM Curve & Quadratic Acceleration (B₂)',
    summary: 'Identifies whether change is accelerating, saturating, or oscillating when a straight line is not enough.',
  },
  {
    id: 'scatter-mahalanobis',
    kicker: 'COUPLING',
    title: 'X × Y Scatter & Mahalanobis Ellipse',
    summary: 'Crosses two variables or regions with Pearson r, Kendall τ, R², and automatic detection of D_M > 2.5 extremes.',
  },
  {
    id: 'safeguards',
    kicker: 'SAFEGUARDS & EXPORT',
    title: 'Invariant #3 + CSV / JSON Export',
    summary: 'Blocks invalid % change on interval variables like °C and exports the full series and auditable metadata.',
  },
];

export const MATRIX_MODES: readonly MatrixModeCard[] = [
  {
    id: 'spatial_dipole',
    formula: 'A ≠ B · X = Y',
    title: 'Spatial Contrast (Dipole)',
    tagline: 'Same variable in two places on the globe',
    example: 'E.g.: Soil moisture in Cerrado vs. Central Amazon',
    recommendedPresetId: 'cerrado-vs-amazonia',
    defaultSameLocation: false,
  },
  {
    id: 'local_coupling',
    formula: 'A = B · X ≠ Y',
    title: 'Local Cause & Effect',
    tagline: 'Two physical forces over the exact same cells',
    example: 'E.g.: Maximum temperature draining soil moisture',
    recommendedPresetId: 'heatwaves-soil-mg',
    defaultSameLocation: true,
  },
  {
    id: 'cross_teleconnection',
    formula: 'A ≠ B · X ≠ Y',
    title: 'Cross-Teleconnection',
    tagline: 'Phenomenon in A linked to a distant response in B',
    example: 'E.g.: Radiation in Amazon (CERES) × rainfall in Southern Brazil (MERRA-2)',
    recommendedPresetId: 'ceres-amazon-parana',
    defaultSameLocation: false,
  },
  {
    id: 'univariate_xray',
    formula: 'A = B · X = Y',
    title: 'Univariate X-Ray',
    tagline: 'Secular trend, acceleration, and extremes in 1 region',
    example: 'E.g.: Full diagnostic of any grid cell on Earth',
    recommendedPresetId: 'arctic-vs-tropics',
    defaultSameLocation: true,
  },
];

export const STORY_PRESETS: readonly StoryPreset[] = [
  {
    id: 'cerrado-vs-amazonia',
    archetypeId: 'spatial_dipole',
    archetypeLabel: 'Spatial Dipole',
    formula: 'A ≠ B · X = Y',
    title: 'Why is the Cerrado drying faster than the Amazon?',
    subtitle: 'Triângulo Mineiro (MG) × Central Amazon (AM) · Soil Moisture',
    question:
      'Compare surface soil water loss in the agricultural Cerrado against the Amazon rainforest since 1981.',
    highlightBadge: '45 years · NASA Satellite',
    variableA: 'GWETTOP',
    variableB: 'GWETTOP',
    regionALabel: 'Triângulo Mineiro (MG)',
    regionBLabel: 'Central Amazon (AM)',
    coordsA: [
      { lat: -19.0, lon: -48.125 },
      { lat: -19.0, lon: -48.75 },
    ],
    coordsB: [
      { lat: -3.0, lon: -60.0 },
      { lat: -3.0, lon: -60.625 },
    ],
    sameLocation: false,
    startMonth: '1981-01',
    endMonth: '2025-12',
    recommendedBench: {
      anomaly: true,
      separate: false,
      dual: false,
      trendMode: 'both',
    },
  },
  {
    id: 'heatwaves-soil-mg',
    archetypeId: 'local_coupling',
    archetypeLabel: 'Local Cause & Effect',
    formula: 'A = B · X ≠ Y',
    title: 'Are heatwaves drying out the soil in the same place?',
    subtitle: 'Northern Minas Gerais (Same Location A=B) · Moisture × Max Heat',
    question:
      'See how rising extreme heat drains surface soil moisture in the exact same grid cells.',
    highlightBadge: 'Same Location (A=B)',
    variableA: 'GWETTOP',
    variableB: 'T2M_MAX',
    regionALabel: 'Northern Minas (MG)',
    regionBLabel: 'Northern Minas (MG)',
    coordsA: [
      { lat: -16.5, lon: -43.75 },
      { lat: -16.5, lon: -44.375 },
    ],
    coordsB: [
      { lat: -16.5, lon: -43.75 },
      { lat: -16.5, lon: -44.375 },
    ],
    sameLocation: true,
    startMonth: '1981-01',
    endMonth: '2025-12',
    recommendedBench: {
      anomaly: true,
      separate: false,
      dual: true,
      trendMode: 'both',
    },
  },
  {
    id: 'ceres-amazon-parana',
    archetypeId: 'cross_teleconnection',
    archetypeLabel: 'Cross-Teleconnection',
    formula: 'A ≠ B · X ≠ Y',
    title: 'Sunlight in the Amazon × Rainfall in Southern Brazil',
    subtitle: 'Equatorial Amazon × Paraná Basin · Solar Radiation × Precipitation',
    question:
      'Discover how solar irradiance in the Amazon connects to rainfall regimes in Southern Brazil during El Niño years.',
    highlightBadge: '1984–2025 · 2 Satellites',
    variableA: 'ALLSKY_SFC_SW_DWN',
    variableB: 'PRECTOTCORR',
    regionALabel: 'Amazônia Equatorial',
    regionBLabel: 'Bacia do Paraná (PR/MS)',
    coordsA: [
      { lat: -3.5, lon: -60.5 },
      { lat: -3.5, lon: -59.5 },
    ],
    coordsB: [
      { lat: -25.5, lon: -54.375 },
      { lat: -25.5, lon: -53.75 },
    ],
    sameLocation: false,
    startMonth: '1984-01',
    endMonth: '2025-12',
    recommendedBench: {
      anomaly: true,
      separate: true,
      dual: true,
      trendMode: 'both',
    },
  },
  {
    id: 'arctic-vs-tropics',
    archetypeId: 'spatial_dipole',
    archetypeLabel: 'Planetary Scale',
    formula: 'A ≠ B · X = Y',
    title: 'Is the Arctic warming much faster than the Tropics?',
    subtitle: 'Svalbard (78°N) × Tropical Atlantic · Temperature (T2M)',
    question:
      'Compare the actual warming rate at the North Pole against the tropical Brazilian coast.',
    highlightBadge: 'North Pole × Tropics',
    variableA: 'T2M',
    variableB: 'T2M',
    regionALabel: 'Svalbard (Arctic, 78°N)',
    regionBLabel: 'Northeast Coast / Atlantic',
    coordsA: [
      { lat: 78.0, lon: 15.625 },
      { lat: 78.0, lon: 16.25 },
    ],
    coordsB: [
      { lat: -5.5, lon: -35.625 },
      { lat: -5.5, lon: -36.25 },
    ],
    sameLocation: false,
    startMonth: '1981-01',
    endMonth: '2025-12',
    recommendedBench: {
      anomaly: true,
      separate: false,
      dual: false,
      trendMode: 'both',
    },
  },
];

export function materializeStoryPreset(
  preset: StoryPreset,
  maximumMonth: string,
): {
  readonly variableA: VariableId;
  readonly variableB: VariableId;
  readonly regionA: RegionSelection;
  readonly regionB: RegionSelection;
  readonly startMonth: string;
  readonly endMonth: string;
  readonly sameLocation: boolean;
} {
  const cellsA = preset.coordsA.map(coord => snapCoordToCell(coord.lat, coord.lon, preset.variableA));
  const cellsB = preset.coordsB.map(coord => snapCoordToCell(coord.lat, coord.lon, preset.variableB));

  const regionA = buildRegionSelection('A', preset.variableA, cellsA);
  const regionB = buildRegionSelection('B', preset.variableB, cellsB);

  const bounds = getIntersectingDateBounds(preset.variableA, preset.variableB);
  const clampedStart = preset.startMonth >= bounds.startDate ? preset.startMonth : bounds.startDate;
  const maxAllowed = maximumMonth <= bounds.endDate ? maximumMonth : bounds.endDate;
  const clampedEnd = preset.endMonth <= maxAllowed ? preset.endMonth : maxAllowed;

  return {
    variableA: preset.variableA,
    variableB: preset.variableB,
    regionA,
    regionB,
    startMonth: clampedStart,
    endMonth: clampedEnd >= clampedStart ? clampedEnd : clampedStart,
    sameLocation: preset.sameLocation,
  };
}

function areRegionsEquivalent(regionA: RegionSelection | null, regionB: RegionSelection | null): boolean {
  if (!regionA || !regionB) return false;
  if (regionA.region_id === regionB.region_id) return true;
  if (regionA.cells.length !== regionB.cells.length) return false;
  return regionA.cells.every((cellA, index) => {
    const cellB = regionB.cells[index];
    return Boolean(cellB && Math.abs(cellA.lat - cellB.lat) < 0.01 && Math.abs(cellA.lon - cellB.lon) < 0.01);
  });
}

export function classifyExperimentArchetype(params: {
  readonly variableA: string;
  readonly variableB: string;
  readonly regionA: RegionSelection | null;
  readonly regionB: RegionSelection | null;
  readonly sameLocation: boolean;
}): ExperimentArchetype {
  const { variableA, variableB, regionA, regionB, sameLocation } = params;

  if (!variableA || !variableB || !regionA || !regionB) {
    return {
      id: 'configuring',
      formula: '(A, X) × (B, Y)',
      label: 'Open Experiment in Progress',
      summary: 'Pick any two variables and mark two areas (or A=B) anywhere on Earth.',
    };
  }

  const sameLoc = sameLocation || areRegionsEquivalent(regionA, regionB);
  const sameVar = variableA === variableB;
  const nameA = getVariableMetadata(variableA as VariableId)?.variable_name ?? variableA;
  const nameB = getVariableMetadata(variableB as VariableId)?.variable_name ?? variableB;

  if (!sameLoc && sameVar) {
    return {
      id: 'spatial_dipole',
      formula: 'A ≠ B · X = Y',
      label: 'Spatial Contrast (Dipole)',
      summary: `Comparing ${nameA} between two distinct regions to detect spatial divergence.`,
    };
  }

  if (sameLoc && !sameVar) {
    return {
      id: 'local_coupling',
      formula: 'A = B · X ≠ Y',
      label: 'Local Cause & Effect',
      summary: `Crossing ${nameA} × ${nameB} over the exact same territory to test physical coupling.`,
    };
  }

  if (!sameLoc && !sameVar) {
    return {
      id: 'cross_teleconnection',
      formula: 'A ≠ B · X ≠ Y',
      label: 'Cross-Teleconnection',
      summary: `Relating ${nameA} in A with ${nameB} in B across distant scales and regions.`,
    };
  }

  return {
    id: 'univariate_xray',
    formula: 'A = B · X = Y',
    label: 'Deep Univariate X-Ray',
    summary: `Evaluating secular trend, GAM acceleration, and extremes of ${nameA} at the selected site.`,
  };
}
