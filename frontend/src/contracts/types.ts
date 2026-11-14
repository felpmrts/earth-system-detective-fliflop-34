/** Variáveis NASA POWER em tempo real expostas pelo catálogo do backend de dados. */
export type VariableId =
  | 'T2M'
  | 'T2M_MAX'
  | 'T2M_MIN'
  | 'T2M_RANGE'
  | 'TS'
  | 'T2MDEW'
  | 'PRECTOTCORR'
  | 'GWETTOP'
  | 'GWETROOT'
  | 'GWETPROF'
  | 'RH2M'
  | 'QV2M'
  | 'TQV'
  | 'WS2M'
  | 'WS10M'
  | 'WS50M'
  | 'PS'
  | 'ALLSKY_SRF_ALB'
  | 'ALLSKY_SFC_SW_DWN'
  | 'CLRSKY_SFC_SW_DWN'
  | 'CLDTOT'
  | 'CLOUD_AMT'
  | 'ALLSKY_SFC_LW_DWN';

export type SourceModel = 'MERRA-2' | 'CERES_SYN1deg';
export type ScaleType = 'interval' | 'ratio';
export type RegionSlot = 'A' | 'B';
export type DataMode = 'api' | 'offline';
export type DataSourceOrigin = 'backend_api' | 'idb_cache' | 'offline_fallback';

/** Coordenada no padrão Leaflet: [latitude, longitude]. */
export type LeafletLatLng = readonly [lat: number, lon: number];

/** Retângulo delimitador no padrão Leaflet: [[south, west], [north, east]]. */
export type LeafletBounds = readonly [southWest: LeafletLatLng, northEast: LeafletLatLng];

/** Coordenada no padrão GeoJSON: [longitude, latitude]. */
export type GeoJsonLonLat = readonly [lon: number, lat: number];

export interface GridResolution {
  readonly dLat: number;
  readonly dLon: number;
}

export interface GridOrigin {
  readonly lat0: number;
  readonly lon0: number;
}

export interface VariableMetadata {
  readonly variable_id: VariableId;
  readonly variable_name: string;
  readonly domain: string;
  readonly source_model: SourceModel;
  readonly resolution: GridResolution;
  /** Origem parametrizável da grade (alinhada com DADOS-1 no endpoint NASA POWER). */
  readonly grid_origin: GridOrigin;
  readonly min_year: number;
  readonly scale_type: ScaleType;
  readonly unit: string;
  readonly trend_unit: string;
  readonly allow_percentage_change: boolean;
  readonly land_only_mask: boolean;
}

export interface GridCell {
  readonly cell_id: string;
  readonly row: number;
  readonly col: number;
  readonly lat: number;
  readonly lon: number;
  readonly bounds_leaflet: LeafletBounds;
  /** Anel fechado de 5 vértices no formato GeoJSON [lon, lat]. */
  readonly geojson_ring: readonly GeoJsonLonLat[];
}

export interface BackendCellRef {
  readonly cell_id: string;
  readonly row: number;
  readonly col: number;
  readonly lat: number;
  readonly lon: number;
}

export interface RegionSelection {
  readonly slot: RegionSlot;
  readonly region_id: string;
  readonly variable_id: VariableId;
  readonly source_model: SourceModel;
  readonly grid_resolution: GridResolution;
  readonly cells: readonly GridCell[];
}

/** Fluxo A: ponto pré-processado da camada global Canvas ({var_id}_grid.json). */
export interface GlobalGridPoint {
  readonly lat: number;
  readonly lon: number;
  readonly slope_sen_decade: number;
  readonly q_value_fdr: number;
  readonly is_sig: boolean;
}

export interface GlobalGridFile {
  readonly variable_id: VariableId;
  readonly unit: string;
  readonly trend_unit: string;
  readonly period: {
    readonly start: string;
    readonly end: string;
  };
  readonly points: readonly GlobalGridPoint[];
}

/** Fluxo B: requisição tipada enviada exclusivamente ao backend Python (stats_engine.py). */
export interface RegionAnalysisRequest {
  readonly variable_a: VariableId;
  readonly variable_b: VariableId | null;
  readonly region_a: {
    readonly slot: 'A';
    readonly region_id: string;
    readonly source_model: SourceModel;
    readonly grid_resolution: GridResolution;
    readonly cells: readonly BackendCellRef[];
  };
  readonly region_b: {
    readonly slot: 'B';
    readonly region_id: string;
    readonly source_model: SourceModel;
    readonly grid_resolution: GridResolution;
    readonly cells: readonly BackendCellRef[];
  } | null;
  readonly start_date: string;
  readonly end_date: string;
}

export type RegimeShape =
  | 'linear'
  | 'accelerating_rise'
  | 'accelerating_decline'
  | 'saturating'
  | 'non_monotonic';

export type ConfidenceTier =
  | 'CONFIRMED_HIGH'
  | 'CONFIRMED_MODERATE'
  | 'INSUFFICIENT_SIGNAL'
  | 'NO_TREND';

export interface OutlierMahalanobis {
  readonly date: string;
  readonly observed_anomaly: number;
  readonly expected_regression: number;
  readonly mahalanobis_d: number;
  readonly direction: 'above_ellipse' | 'below_ellipse';
  readonly diagnostic_hint: string;
}

export interface VariableStatistics {
  readonly variable_id: VariableId;
  readonly variable_name: string;
  readonly scale_type: ScaleType;
  readonly unit: string;
  readonly trend_unit: string;
  readonly allow_percentage_change: boolean;
  readonly period: {
    readonly start: string;
    readonly end: string;
    readonly n_observations: number;
    readonly n_effective_ar1: number;
  };
  readonly regression: {
    readonly intercept_at_start_A0: number;
    readonly slope_per_decade_ols: number;
    readonly slope_per_decade_sen: number;
    readonly slope_ci95_low: number;
    readonly slope_ci95_high: number;
    readonly cumulative_model_change: number;
    readonly quadratic_acceleration_B2: number;
    readonly regime_shape: RegimeShape;
  };
  readonly correlation_and_coupling: {
    readonly pearson_r: number;
    readonly kendall_tau: number;
    readonly r_squared: number;
    readonly ellipse_aspect_ratio: number;
  };
  readonly significance: {
    readonly p_value_naive: number;
    readonly p_value_ar1_corrected: number;
    readonly fdr_q_value: number;
    readonly is_significant_fdr05: boolean;
    readonly confidence_tier: ConfidenceTier;
  };
  readonly outliers_mahalanobis: readonly OutlierMahalanobis[];
  readonly series: {
    readonly dates: readonly string[];
    readonly raw_values: readonly (number | null)[];
    readonly anomaly_values: readonly (number | null)[];
    readonly linear_fit: readonly number[];
    readonly gam_smooth_fit: readonly number[];
  };
}

export interface ComparisonPair {
  readonly region_a_id: string;
  readonly region_b_id: string;
  readonly spatial_divergence_detected: boolean;
  readonly slope_difference_per_decade: number | null;
  readonly multiscale_correlation: {
    readonly long_term_secular_r: number;
    readonly short_term_detrended_r: number;
    readonly paradox_type: string;
    readonly interpretation: string;
  };
}

export interface RegionAnalysisResponse {
  readonly request_meta: {
    readonly variable_a: VariableId;
    readonly variable_b: VariableId | null;
    readonly region_a_id: string;
    readonly region_b_id: string | null;
    readonly cells_count_a: number;
    readonly cells_count_b: number;
    readonly spatial_aggregation: 'nanmean';
    readonly source: DataSourceOrigin;
  };
  readonly region_a_analysis: VariableStatistics;
  readonly region_b_analysis: VariableStatistics | null;
  readonly comparison_pair: ComparisonPair | null;
}

export type SemanticErrorCode =
  | 'OCEAN_MASK_NO_DATA'
  | 'MAX_CELLS_EXCEEDED'
  | 'NOT_ADJACENT'
  | 'WOULD_DISCONNECT'
  | 'INVALID_DATE_INTERSECTION'
  | 'CONTRACT_VIOLATION'
  | 'BACKEND_UNAVAILABLE';
