import type { GridOrigin, GridResolution, VariableId, VariableMetadata } from './types.ts';

const MERRA2_RESOLUTION: GridResolution = { dLat: 0.5, dLon: 0.625 };
const CERES_RESOLUTION: GridResolution = { dLat: 1.0, dLon: 1.0 };
const REGIONAL_RESOLUTION: GridResolution = { dLat: 0.5, dLon: 0.5 };

/**
 * Default origin for grid rectangles.
 * Parameterized in a single place to allow fine-tuning after final validation with DATA-1.
 */
const MERRA2_ORIGIN: GridOrigin = { lat0: -90, lon0: -180 };
const CERES_ORIGIN: GridOrigin = { lat0: -90, lon0: -180 };
const STANDARD_ORIGIN: GridOrigin = { lat0: -90, lon0: -180 };

export const VARIABLE_CATALOG: Readonly<Record<VariableId, VariableMetadata>> = {
  T2M: {
    variable_id: 'T2M',
    variable_name: 'Mean Air Temperature at 2m',
    domain: 'Atmosphere',
    source_model: 'MERRA-2',
    resolution: MERRA2_RESOLUTION,
    grid_origin: MERRA2_ORIGIN,
    min_year: 1981,
    scale_type: 'interval',
    unit: '°C',
    trend_unit: '°C/decade',
    allow_percentage_change: false,
    land_only_mask: false,
  },
  T2M_MAX: {
    variable_id: 'T2M_MAX',
    variable_name: 'Daily Maximum Temperature at 2m',
    domain: 'Climatology / Extremes',
    source_model: 'MERRA-2',
    resolution: MERRA2_RESOLUTION,
    grid_origin: MERRA2_ORIGIN,
    min_year: 1981,
    scale_type: 'interval',
    unit: '°C',
    trend_unit: '°C/decade',
    allow_percentage_change: false,
    land_only_mask: false,
  },
  T2M_MIN: {
    variable_id: 'T2M_MIN',
    variable_name: 'Daily Minimum Temperature at 2m',
    domain: 'Climatology / Extremes',
    source_model: 'MERRA-2',
    resolution: MERRA2_RESOLUTION,
    grid_origin: MERRA2_ORIGIN,
    min_year: 1981,
    scale_type: 'interval',
    unit: '°C',
    trend_unit: '°C/decade',
    allow_percentage_change: false,
    land_only_mask: false,
  },
  T2M_RANGE: {
    variable_id: 'T2M_RANGE', variable_name: 'Diurnal Temperature Range', domain: 'Temperature & Heat',
    source_model: 'MERRA-2', resolution: MERRA2_RESOLUTION, grid_origin: MERRA2_ORIGIN, min_year: 1981,
    scale_type: 'interval', unit: '°C', trend_unit: '°C/decade', allow_percentage_change: false, land_only_mask: false,
    is_alias_of: 'T2M',
  },
  TS: {
    variable_id: 'TS', variable_name: 'Surface Skin Temperature', domain: 'Temperature & Heat',
    source_model: 'MERRA-2', resolution: MERRA2_RESOLUTION, grid_origin: MERRA2_ORIGIN, min_year: 1981,
    scale_type: 'interval', unit: '°C', trend_unit: '°C/decade', allow_percentage_change: false, land_only_mask: false,
    is_alias_of: 'T2M',
  },
  LST_Day_CMG: {
    variable_id: 'LST_Day_CMG', variable_name: 'Daytime Land Surface Temp. (Satellite)', domain: 'Temperature & Heat',
    source_model: 'MODIS_AppEEARS', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 2000,
    scale_type: 'interval', unit: '°C', trend_unit: '°C/decade', allow_percentage_change: false, land_only_mask: true,
    is_alias_of: 'T2M_MAX',
  },
  LST_Night_CMG: {
    variable_id: 'LST_Night_CMG', variable_name: 'Nighttime Land Surface Temp. (Satellite)', domain: 'Temperature & Heat',
    source_model: 'MODIS_AppEEARS', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 2000,
    scale_type: 'interval', unit: '°C', trend_unit: '°C/decade', allow_percentage_change: false, land_only_mask: true,
    is_alias_of: 'T2M_MIN',
  },
  T2MDEW: {
    variable_id: 'T2MDEW', variable_name: 'Dew Point Temperature at 2m', domain: 'Temperature & Heat',
    source_model: 'MERRA-2', resolution: MERRA2_RESOLUTION, grid_origin: MERRA2_ORIGIN, min_year: 1981,
    scale_type: 'interval', unit: '°C', trend_unit: '°C/decade', allow_percentage_change: false, land_only_mask: false,
    is_alias_of: 'T2M',
  },
  PRECTOTCORR: {
    variable_id: 'PRECTOTCORR',
    variable_name: 'Corrected Total Precipitation',
    domain: 'Hydrology / Rain',
    source_model: 'MERRA-2',
    resolution: MERRA2_RESOLUTION,
    grid_origin: MERRA2_ORIGIN,
    min_year: 1981,
    scale_type: 'ratio',
    unit: 'mm/month',
    trend_unit: 'mm/month/decade',
    allow_percentage_change: true,
    land_only_mask: false,
  },
  GPM_3IMERGM: {
    variable_id: 'GPM_3IMERGM', variable_name: 'Satellite Precipitation (High Res.)', domain: 'Rain & Moisture',
    source_model: 'NASA_Giovanni', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 2000,
    scale_type: 'ratio', unit: 'mm/month', trend_unit: 'mm/month/decade', allow_percentage_change: true, land_only_mask: false,
    is_alias_of: 'PRECTOTCORR',
  },
  GWETTOP: {
    variable_id: 'GWETTOP',
    variable_name: 'Surface Soil Moisture (0–5 cm)',
    domain: 'Hydrology / Agronomy',
    source_model: 'MERRA-2',
    resolution: MERRA2_RESOLUTION,
    grid_origin: MERRA2_ORIGIN,
    min_year: 1981,
    scale_type: 'ratio',
    unit: 'fraction (0–1)',
    trend_unit: 'fraction/decade',
    allow_percentage_change: false,
    land_only_mask: true,
  },
  GWETROOT: {
    variable_id: 'GWETROOT',
    variable_name: 'Root-Zone Soil Moisture (0–100 cm)',
    domain: 'Hydrology / Geology',
    source_model: 'MERRA-2',
    resolution: MERRA2_RESOLUTION,
    grid_origin: MERRA2_ORIGIN,
    min_year: 1981,
    scale_type: 'ratio',
    unit: 'fraction (0–1)',
    trend_unit: 'fraction/decade',
    allow_percentage_change: false,
    land_only_mask: true,
  },
  GWETPROF: {
    variable_id: 'GWETPROF', variable_name: 'Deep Soil Profile Moisture', domain: 'Soil & Drought',
    source_model: 'MERRA-2', resolution: MERRA2_RESOLUTION, grid_origin: MERRA2_ORIGIN, min_year: 1981,
    scale_type: 'ratio', unit: 'fraction (0–1)', trend_unit: 'fraction/decade', allow_percentage_change: false, land_only_mask: true,
    is_alias_of: 'GWETROOT',
  },
  Evap_tavg: {
    variable_id: 'Evap_tavg', variable_name: 'Total Evapotranspiration', domain: 'Soil & Drought',
    source_model: 'NASA_Giovanni', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 2000,
    scale_type: 'ratio', unit: 'mm/day', trend_unit: 'mm/day/decade', allow_percentage_change: true, land_only_mask: true,
    is_alias_of: 'GWETTOP',
  },
  Qs_acc: {
    variable_id: 'Qs_acc', variable_name: 'Surface Runoff', domain: 'Soil & Drought',
    source_model: 'NASA_Giovanni', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 2000,
    scale_type: 'ratio', unit: 'kg/m²', trend_unit: 'kg/m²/decade', allow_percentage_change: true, land_only_mask: true,
    is_alias_of: 'PRECTOTCORR',
  },
  river_discharge: {
    variable_id: 'river_discharge', variable_name: 'River Discharge (Historical Series)', domain: 'Rivers & Watersheds',
    source_model: 'GloFAS', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 1984,
    scale_type: 'ratio', unit: 'm³/s', trend_unit: 'm³/s/decade', allow_percentage_change: true, land_only_mask: true,
    is_alias_of: 'PRECTOTCORR',
  },
  river_discharge_mean: {
    variable_id: 'river_discharge_mean', variable_name: 'Mean River Discharge', domain: 'Rivers & Watersheds',
    source_model: 'GloFAS', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 1984,
    scale_type: 'ratio', unit: 'm³/s', trend_unit: 'm³/s/decade', allow_percentage_change: true, land_only_mask: true,
    is_alias_of: 'PRECTOTCORR',
  },
  river_discharge_max: {
    variable_id: 'river_discharge_max', variable_name: 'Peak Flood Discharge', domain: 'Rivers & Watersheds',
    source_model: 'GloFAS', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 1984,
    scale_type: 'ratio', unit: 'm³/s', trend_unit: 'm³/s/decade', allow_percentage_change: true, land_only_mask: true,
    is_alias_of: 'PRECTOTCORR',
  },
  river_discharge_min: {
    variable_id: 'river_discharge_min', variable_name: 'Critical Low-Flow Discharge (Drought)', domain: 'Rivers & Watersheds',
    source_model: 'GloFAS', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 1984,
    scale_type: 'ratio', unit: 'm³/s', trend_unit: 'm³/s/decade', allow_percentage_change: true, land_only_mask: true,
    is_alias_of: 'PRECTOTCORR',
  },
  _1_km_monthly_NDVI: {
    variable_id: '_1_km_monthly_NDVI', variable_name: 'Vegetation Index (NDVI)', domain: 'Vegetation & Land Use',
    source_model: 'MODIS_AppEEARS', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 2000,
    scale_type: 'interval', unit: 'Index (-1 to +1)', trend_unit: 'NDVI/decade', allow_percentage_change: false, land_only_mask: true,
    is_alias_of: 'GWETROOT',
  },
  _1_km_monthly_EVI: {
    variable_id: '_1_km_monthly_EVI', variable_name: 'Enhanced Vegetation Index (EVI)', domain: 'Vegetation & Land Use',
    source_model: 'MODIS_AppEEARS', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 2000,
    scale_type: 'interval', unit: 'Index (-1 to +1)', trend_unit: 'EVI/decade', allow_percentage_change: false, land_only_mask: true,
    is_alias_of: 'GWETROOT',
  },
  Lai_500m: {
    variable_id: 'Lai_500m', variable_name: 'Leaf Area Index (LAI)', domain: 'Vegetation & Land Use',
    source_model: 'MODIS_AppEEARS', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 2000,
    scale_type: 'ratio', unit: 'm²/m²', trend_unit: 'm²/m²/decade', allow_percentage_change: true, land_only_mask: true,
    is_alias_of: 'GWETROOT',
  },
  RH2M: {
    variable_id: 'RH2M',
    variable_name: 'Relative Humidity at 2m',
    domain: 'Meteorology',
    source_model: 'MERRA-2',
    resolution: MERRA2_RESOLUTION,
    grid_origin: MERRA2_ORIGIN,
    min_year: 1981,
    scale_type: 'ratio',
    unit: '%',
    trend_unit: 'p.p./decade',
    allow_percentage_change: false,
    land_only_mask: false,
  },
  QV2M: {
    variable_id: 'QV2M', variable_name: 'Specific Humidity at 2m', domain: 'Rain & Moisture',
    source_model: 'MERRA-2', resolution: MERRA2_RESOLUTION, grid_origin: MERRA2_ORIGIN, min_year: 1981,
    scale_type: 'ratio', unit: 'g/kg', trend_unit: 'g/kg/decade', allow_percentage_change: true, land_only_mask: false,
    is_alias_of: 'RH2M',
  },
  TQV: {
    variable_id: 'TQV', variable_name: 'Total Precipitable Water', domain: 'Rain & Moisture',
    source_model: 'MERRA-2', resolution: MERRA2_RESOLUTION, grid_origin: MERRA2_ORIGIN, min_year: 1981,
    scale_type: 'ratio', unit: 'kg/m²', trend_unit: 'kg/m²/decade', allow_percentage_change: true, land_only_mask: false,
    is_alias_of: 'PRECTOTCORR',
  },
  WS2M: {
    variable_id: 'WS2M', variable_name: 'Wind Speed at 2m', domain: 'Winds & Atmosphere',
    source_model: 'MERRA-2', resolution: MERRA2_RESOLUTION, grid_origin: MERRA2_ORIGIN, min_year: 1981,
    scale_type: 'ratio', unit: 'm/s', trend_unit: 'm/s/decade', allow_percentage_change: true, land_only_mask: false,
    is_alias_of: 'WS10M',
  },
  WS10M: {
    variable_id: 'WS10M',
    variable_name: 'Wind Speed at 10m',
    domain: 'Atmospheric Dynamics',
    source_model: 'MERRA-2',
    resolution: MERRA2_RESOLUTION,
    grid_origin: MERRA2_ORIGIN,
    min_year: 1981,
    scale_type: 'ratio',
    unit: 'm/s',
    trend_unit: 'm/s/decade',
    allow_percentage_change: true,
    land_only_mask: false,
  },
  WS50M: {
    variable_id: 'WS50M', variable_name: 'Wind Speed at 50m', domain: 'Winds & Atmosphere',
    source_model: 'MERRA-2', resolution: MERRA2_RESOLUTION, grid_origin: MERRA2_ORIGIN, min_year: 1981,
    scale_type: 'ratio', unit: 'm/s', trend_unit: 'm/s/decade', allow_percentage_change: true, land_only_mask: false,
    is_alias_of: 'WS10M',
  },
  PS: {
    variable_id: 'PS',
    variable_name: 'Surface Pressure',
    domain: 'Atmospheric Dynamics',
    source_model: 'MERRA-2',
    resolution: MERRA2_RESOLUTION,
    grid_origin: MERRA2_ORIGIN,
    min_year: 1981,
    scale_type: 'interval',
    unit: 'kPa',
    trend_unit: 'kPa/decade',
    allow_percentage_change: false,
    land_only_mask: false,
  },
  ALLSKY_SFC_SW_DWN: {
    variable_id: 'ALLSKY_SFC_SW_DWN',
    variable_name: 'All-Sky Surface Shortwave Downward Irradiance',
    domain: 'Energy / Solar Radiation',
    source_model: 'CERES_SYN1deg',
    resolution: CERES_RESOLUTION,
    grid_origin: CERES_ORIGIN,
    min_year: 1984,
    scale_type: 'ratio',
    unit: 'MJ/m²/day',
    trend_unit: 'MJ/m²/day/decade',
    allow_percentage_change: true,
    land_only_mask: false,
  },
  ALLSKY_SRF_ALB: {
    variable_id: 'ALLSKY_SRF_ALB', variable_name: 'Surface Albedo', domain: 'Vegetation & Land Use',
    source_model: 'CERES_SYN1deg', resolution: CERES_RESOLUTION, grid_origin: CERES_ORIGIN, min_year: 1984,
    scale_type: 'ratio', unit: 'fraction (0–1)', trend_unit: 'fraction/decade', allow_percentage_change: false, land_only_mask: false,
    is_alias_of: 'ALLSKY_SFC_SW_DWN',
  },
  CLRSKY_SFC_SW_DWN: {
    variable_id: 'CLRSKY_SFC_SW_DWN', variable_name: 'Clear-Sky Solar Radiation', domain: 'Radiation & Clouds',
    source_model: 'CERES_SYN1deg', resolution: CERES_RESOLUTION, grid_origin: CERES_ORIGIN, min_year: 1984,
    scale_type: 'ratio', unit: 'MJ/m²/day', trend_unit: 'MJ/m²/day/decade', allow_percentage_change: true, land_only_mask: false,
    is_alias_of: 'ALLSKY_SFC_SW_DWN',
  },
  CLDTOT: {
    variable_id: 'CLDTOT',
    variable_name: 'Total Cloud Cover',
    domain: 'Atmosphere / Clouds',
    source_model: 'CERES_SYN1deg',
    resolution: CERES_RESOLUTION,
    grid_origin: CERES_ORIGIN,
    min_year: 1984,
    scale_type: 'ratio',
    unit: '%',
    trend_unit: 'p.p./decade',
    allow_percentage_change: false,
    land_only_mask: false,
  },
  CLOUD_AMT: {
    variable_id: 'CLOUD_AMT', variable_name: 'Cloud Cover Amount', domain: 'Radiation & Clouds',
    source_model: 'CERES_SYN1deg', resolution: CERES_RESOLUTION, grid_origin: CERES_ORIGIN, min_year: 1984,
    scale_type: 'ratio', unit: '%', trend_unit: 'p.p./decade', allow_percentage_change: false, land_only_mask: false,
    is_alias_of: 'CLDTOT',
  },
  ALLSKY_SFC_LW_DWN: {
    variable_id: 'ALLSKY_SFC_LW_DWN',
    variable_name: 'All-Sky Surface Longwave Downward Irradiance',
    domain: 'Energy Budget',
    source_model: 'CERES_SYN1deg',
    resolution: CERES_RESOLUTION,
    grid_origin: CERES_ORIGIN,
    min_year: 1984,
    scale_type: 'ratio',
    unit: 'MJ/m²/day',
    trend_unit: 'MJ/m²/day/decade',
    allow_percentage_change: true,
    land_only_mask: false,
  },
  AOD_550: {
    variable_id: 'AOD_550', variable_name: 'Aerosol Optical Depth (Smoke)', domain: 'Radiation & Clouds',
    source_model: 'NASA_Giovanni', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 2000,
    scale_type: 'ratio', unit: 'Dimensionless', trend_unit: 'AOD/decade', allow_percentage_change: true, land_only_mask: false,
    is_alias_of: 'ALLSKY_SFC_SW_DWN',
  },
  PRCP: {
    variable_id: 'PRCP', variable_name: 'Station Precipitation (Rain Gauge)', domain: 'Ground Stations',
    source_model: 'NOAA_CDO', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 1981,
    scale_type: 'ratio', unit: 'mm', trend_unit: 'mm/decade', allow_percentage_change: true, land_only_mask: true,
    is_alias_of: 'PRECTOTCORR',
  },
  TAVG: {
    variable_id: 'TAVG', variable_name: 'Station Mean Temperature', domain: 'Ground Stations',
    source_model: 'NOAA_CDO', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 1981,
    scale_type: 'interval', unit: '°C', trend_unit: '°C/decade', allow_percentage_change: false, land_only_mask: true,
    is_alias_of: 'T2M',
  },
  TMAX: {
    variable_id: 'TMAX', variable_name: 'Station Maximum Temperature', domain: 'Ground Stations',
    source_model: 'NOAA_CDO', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 1981,
    scale_type: 'interval', unit: '°C', trend_unit: '°C/decade', allow_percentage_change: false, land_only_mask: true,
    is_alias_of: 'T2M_MAX',
  },
  TMIN: {
    variable_id: 'TMIN', variable_name: 'Station Minimum Temperature', domain: 'Ground Stations',
    source_model: 'NOAA_CDO', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 1981,
    scale_type: 'interval', unit: '°C', trend_unit: '°C/decade', allow_percentage_change: false, land_only_mask: true,
    is_alias_of: 'T2M_MIN',
  },
  SNOW: {
    variable_id: 'SNOW', variable_name: 'Snowfall (Station)', domain: 'Ground Stations',
    source_model: 'NOAA_CDO', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 1981,
    scale_type: 'ratio', unit: 'mm', trend_unit: 'mm/decade', allow_percentage_change: true, land_only_mask: true,
    is_alias_of: 'PRECTOTCORR',
  },
  SNWD: {
    variable_id: 'SNWD', variable_name: 'Snow Depth on Ground', domain: 'Ground Stations',
    source_model: 'NOAA_CDO', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 1981,
    scale_type: 'ratio', unit: 'mm', trend_unit: 'mm/decade', allow_percentage_change: true, land_only_mask: true,
    is_alias_of: 'PRECTOTCORR',
  },
  AWND: {
    variable_id: 'AWND', variable_name: 'Mean Wind Speed (Ground)', domain: 'Ground Stations',
    source_model: 'NOAA_CDO', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 1981,
    scale_type: 'ratio', unit: 'm/s', trend_unit: 'm/s/decade', allow_percentage_change: true, land_only_mask: true,
    is_alias_of: 'WS10M',
  },
};

/** 12 core NASA POWER variables expected in the global layer ({var_id}_grid.json). */
export const CORE_GLOBAL_GRID_VARIABLES: readonly VariableId[] = [
  'T2M',
  'T2M_MAX',
  'T2M_MIN',
  'PRECTOTCORR',
  'GWETTOP',
  'GWETROOT',
  'RH2M',
  'WS10M',
  'PS',
  'ALLSKY_SFC_SW_DWN',
  'CLDTOT',
  'ALLSKY_SFC_LW_DWN',
];

export const VARIABLE_LIST: readonly VariableMetadata[] = Object.values(VARIABLE_CATALOG);

export function getVariableMetadata(variableId: VariableId): VariableMetadata {
  return VARIABLE_CATALOG[variableId];
}

/** Resolves the effective variable_id for global grid files (e.g., CLOUD_AMT -> CLDTOT). */
export function resolveGridVariableId(variableId: VariableId): VariableId {
  return VARIABLE_CATALOG[variableId].is_alias_of ?? variableId;
}

export function isValidVariableId(value: string): value is VariableId {
  return Object.prototype.hasOwnProperty.call(VARIABLE_CATALOG, value);
}

/**
 * Computes the valid temporal window at the intersection of variable A and (optional) variable B.
 * E.g.: MERRA-2 (1981) + CERES (1984) => start locked at "1984-01".
 */
export function getIntersectingDateBounds(
  variableA: VariableId,
  variableB: VariableId | null = null,
  maxYear = new Date().getUTCFullYear(),
): { readonly startDate: string; readonly endDate: string; readonly minYear: number } {
  const metaA = VARIABLE_CATALOG[variableA];
  const metaB = variableB ? VARIABLE_CATALOG[variableB] : null;
  const minYear = metaB ? Math.max(metaA.min_year, metaB.min_year) : metaA.min_year;

  return {
    minYear,
    startDate: `${minYear}-01`,
    endDate: `${maxYear}-12`,
  };
}
