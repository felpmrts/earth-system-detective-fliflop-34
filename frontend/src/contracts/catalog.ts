import type { GridOrigin, GridResolution, VariableId, VariableMetadata } from './types.ts';

const MERRA2_RESOLUTION: GridResolution = { dLat: 0.5, dLon: 0.625 };
const CERES_RESOLUTION: GridResolution = { dLat: 1.0, dLon: 1.0 };
const REGIONAL_RESOLUTION: GridResolution = { dLat: 0.5, dLon: 0.5 };

/**
 * Origem padrão dos retângulos de grade.
 * Parametrizada em um único ponto para facilitar ajuste fino após validação final com DADOS-1.
 */
const MERRA2_ORIGIN: GridOrigin = { lat0: -90, lon0: -180 };
const CERES_ORIGIN: GridOrigin = { lat0: -90, lon0: -180 };
const STANDARD_ORIGIN: GridOrigin = { lat0: -90, lon0: -180 };

export const VARIABLE_CATALOG: Readonly<Record<VariableId, VariableMetadata>> = {
  T2M: {
    variable_id: 'T2M',
    variable_name: 'Temperatura Média do Ar a 2m',
    domain: 'Atmosfera',
    source_model: 'MERRA-2',
    resolution: MERRA2_RESOLUTION,
    grid_origin: MERRA2_ORIGIN,
    min_year: 1981,
    scale_type: 'interval',
    unit: '°C',
    trend_unit: '°C/década',
    allow_percentage_change: false,
    land_only_mask: false,
  },
  T2M_MAX: {
    variable_id: 'T2M_MAX',
    variable_name: 'Temperatura Máxima Diária a 2m',
    domain: 'Climatologia / Extremos',
    source_model: 'MERRA-2',
    resolution: MERRA2_RESOLUTION,
    grid_origin: MERRA2_ORIGIN,
    min_year: 1981,
    scale_type: 'interval',
    unit: '°C',
    trend_unit: '°C/década',
    allow_percentage_change: false,
    land_only_mask: false,
  },
  T2M_MIN: {
    variable_id: 'T2M_MIN',
    variable_name: 'Temperatura Mínima Diária a 2m',
    domain: 'Climatologia / Extremos',
    source_model: 'MERRA-2',
    resolution: MERRA2_RESOLUTION,
    grid_origin: MERRA2_ORIGIN,
    min_year: 1981,
    scale_type: 'interval',
    unit: '°C',
    trend_unit: '°C/década',
    allow_percentage_change: false,
    land_only_mask: false,
  },
  T2M_RANGE: {
    variable_id: 'T2M_RANGE', variable_name: 'Amplitude Térmica Diária', domain: 'Temperatura e Calor',
    source_model: 'MERRA-2', resolution: MERRA2_RESOLUTION, grid_origin: MERRA2_ORIGIN, min_year: 1981,
    scale_type: 'interval', unit: '°C', trend_unit: '°C/década', allow_percentage_change: false, land_only_mask: false,
    is_alias_of: 'T2M',
  },
  TS: {
    variable_id: 'TS', variable_name: 'Temperatura da Superfície', domain: 'Temperatura e Calor',
    source_model: 'MERRA-2', resolution: MERRA2_RESOLUTION, grid_origin: MERRA2_ORIGIN, min_year: 1981,
    scale_type: 'interval', unit: '°C', trend_unit: '°C/década', allow_percentage_change: false, land_only_mask: false,
    is_alias_of: 'T2M',
  },
  LST_Day_CMG: {
    variable_id: 'LST_Day_CMG', variable_name: 'Temp. de Superfície Diurna (Satélite)', domain: 'Temperatura e Calor',
    source_model: 'MODIS_AppEEARS', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 2000,
    scale_type: 'interval', unit: '°C', trend_unit: '°C/década', allow_percentage_change: false, land_only_mask: true,
    is_alias_of: 'T2M_MAX',
  },
  LST_Night_CMG: {
    variable_id: 'LST_Night_CMG', variable_name: 'Temp. de Superfície Noturna (Satélite)', domain: 'Temperatura e Calor',
    source_model: 'MODIS_AppEEARS', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 2000,
    scale_type: 'interval', unit: '°C', trend_unit: '°C/década', allow_percentage_change: false, land_only_mask: true,
    is_alias_of: 'T2M_MIN',
  },
  T2MDEW: {
    variable_id: 'T2MDEW', variable_name: 'Ponto de Orvalho a 2m', domain: 'Temperatura e Calor',
    source_model: 'MERRA-2', resolution: MERRA2_RESOLUTION, grid_origin: MERRA2_ORIGIN, min_year: 1981,
    scale_type: 'interval', unit: '°C', trend_unit: '°C/década', allow_percentage_change: false, land_only_mask: false,
    is_alias_of: 'T2M',
  },
  PRECTOTCORR: {
    variable_id: 'PRECTOTCORR',
    variable_name: 'Precipitação Total Corrigida',
    domain: 'Hidrologia / Chuva',
    source_model: 'MERRA-2',
    resolution: MERRA2_RESOLUTION,
    grid_origin: MERRA2_ORIGIN,
    min_year: 1981,
    scale_type: 'ratio',
    unit: 'mm/mês',
    trend_unit: 'mm/mês/década',
    allow_percentage_change: true,
    land_only_mask: false,
  },
  GPM_3IMERGM: {
    variable_id: 'GPM_3IMERGM', variable_name: 'Precipitação por Satélite (Alta Res.)', domain: 'Chuva e Umidade',
    source_model: 'NASA_Giovanni', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 2000,
    scale_type: 'ratio', unit: 'mm/mês', trend_unit: 'mm/mês/década', allow_percentage_change: true, land_only_mask: false,
    is_alias_of: 'PRECTOTCORR',
  },
  GWETTOP: {
    variable_id: 'GWETTOP',
    variable_name: 'Umidade do Solo Superficial (0–5 cm)',
    domain: 'Hidrologia / Agronomia',
    source_model: 'MERRA-2',
    resolution: MERRA2_RESOLUTION,
    grid_origin: MERRA2_ORIGIN,
    min_year: 1981,
    scale_type: 'ratio',
    unit: 'fração (0–1)',
    trend_unit: 'fração/década',
    allow_percentage_change: false,
    land_only_mask: true,
  },
  GWETROOT: {
    variable_id: 'GWETROOT',
    variable_name: 'Umidade do Solo Radicular (0–100 cm)',
    domain: 'Hidrologia / Geologia',
    source_model: 'MERRA-2',
    resolution: MERRA2_RESOLUTION,
    grid_origin: MERRA2_ORIGIN,
    min_year: 1981,
    scale_type: 'ratio',
    unit: 'fração (0–1)',
    trend_unit: 'fração/década',
    allow_percentage_change: false,
    land_only_mask: true,
  },
  GWETPROF: {
    variable_id: 'GWETPROF', variable_name: 'Umidade Profunda do Solo', domain: 'Solo e Seca',
    source_model: 'MERRA-2', resolution: MERRA2_RESOLUTION, grid_origin: MERRA2_ORIGIN, min_year: 1981,
    scale_type: 'ratio', unit: 'fração (0–1)', trend_unit: 'fração/década', allow_percentage_change: false, land_only_mask: true,
    is_alias_of: 'GWETROOT',
  },
  Evap_tavg: {
    variable_id: 'Evap_tavg', variable_name: 'Evapotranspiração Total', domain: 'Solo e Seca',
    source_model: 'NASA_Giovanni', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 2000,
    scale_type: 'ratio', unit: 'mm/dia', trend_unit: 'mm/dia/década', allow_percentage_change: true, land_only_mask: true,
    is_alias_of: 'GWETTOP',
  },
  Qs_acc: {
    variable_id: 'Qs_acc', variable_name: 'Escoamento Superficial (Runoff)', domain: 'Solo e Seca',
    source_model: 'NASA_Giovanni', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 2000,
    scale_type: 'ratio', unit: 'kg/m²', trend_unit: 'kg/m²/década', allow_percentage_change: true, land_only_mask: true,
    is_alias_of: 'PRECTOTCORR',
  },
  river_discharge: {
    variable_id: 'river_discharge', variable_name: 'Vazão do Rio (Série Histórica)', domain: 'Rios e Bacias',
    source_model: 'GloFAS', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 1984,
    scale_type: 'ratio', unit: 'm³/s', trend_unit: 'm³/s/década', allow_percentage_change: true, land_only_mask: true,
    is_alias_of: 'PRECTOTCORR',
  },
  river_discharge_mean: {
    variable_id: 'river_discharge_mean', variable_name: 'Vazão Média do Rio', domain: 'Rios e Bacias',
    source_model: 'GloFAS', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 1984,
    scale_type: 'ratio', unit: 'm³/s', trend_unit: 'm³/s/década', allow_percentage_change: true, land_only_mask: true,
    is_alias_of: 'PRECTOTCORR',
  },
  river_discharge_max: {
    variable_id: 'river_discharge_max', variable_name: 'Pico Máximo de Cheia', domain: 'Rios e Bacias',
    source_model: 'GloFAS', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 1984,
    scale_type: 'ratio', unit: 'm³/s', trend_unit: 'm³/s/década', allow_percentage_change: true, land_only_mask: true,
    is_alias_of: 'PRECTOTCORR',
  },
  river_discharge_min: {
    variable_id: 'river_discharge_min', variable_name: 'Vazão Mínima Crítica (Estiagem)', domain: 'Rios e Bacias',
    source_model: 'GloFAS', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 1984,
    scale_type: 'ratio', unit: 'm³/s', trend_unit: 'm³/s/década', allow_percentage_change: true, land_only_mask: true,
    is_alias_of: 'PRECTOTCORR',
  },
  _1_km_monthly_NDVI: {
    variable_id: '_1_km_monthly_NDVI', variable_name: 'Índice de Vegetação (NDVI)', domain: 'Vegetação e Uso da Terra',
    source_model: 'MODIS_AppEEARS', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 2000,
    scale_type: 'interval', unit: 'Índice (-1 a +1)', trend_unit: 'NDVI/década', allow_percentage_change: false, land_only_mask: true,
    is_alias_of: 'GWETROOT',
  },
  _1_km_monthly_EVI: {
    variable_id: '_1_km_monthly_EVI', variable_name: 'Índice de Vegetação Melhorado (EVI)', domain: 'Vegetação e Uso da Terra',
    source_model: 'MODIS_AppEEARS', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 2000,
    scale_type: 'interval', unit: 'Índice (-1 a +1)', trend_unit: 'EVI/década', allow_percentage_change: false, land_only_mask: true,
    is_alias_of: 'GWETROOT',
  },
  Lai_500m: {
    variable_id: 'Lai_500m', variable_name: 'Índice de Área Foliar (LAI)', domain: 'Vegetação e Uso da Terra',
    source_model: 'MODIS_AppEEARS', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 2000,
    scale_type: 'ratio', unit: 'm²/m²', trend_unit: 'm²/m²/década', allow_percentage_change: true, land_only_mask: true,
    is_alias_of: 'GWETROOT',
  },
  RH2M: {
    variable_id: 'RH2M',
    variable_name: 'Umidade Relativa do Ar a 2m',
    domain: 'Meteorologia',
    source_model: 'MERRA-2',
    resolution: MERRA2_RESOLUTION,
    grid_origin: MERRA2_ORIGIN,
    min_year: 1981,
    scale_type: 'ratio',
    unit: '%',
    trend_unit: 'p.p./década',
    allow_percentage_change: false,
    land_only_mask: false,
  },
  QV2M: {
    variable_id: 'QV2M', variable_name: 'Umidade Específica do Ar a 2m', domain: 'Chuva e Umidade',
    source_model: 'MERRA-2', resolution: MERRA2_RESOLUTION, grid_origin: MERRA2_ORIGIN, min_year: 1981,
    scale_type: 'ratio', unit: 'g/kg', trend_unit: 'g/kg/década', allow_percentage_change: true, land_only_mask: false,
    is_alias_of: 'RH2M',
  },
  TQV: {
    variable_id: 'TQV', variable_name: 'Água Precipitável na Atmosfera', domain: 'Chuva e Umidade',
    source_model: 'MERRA-2', resolution: MERRA2_RESOLUTION, grid_origin: MERRA2_ORIGIN, min_year: 1981,
    scale_type: 'ratio', unit: 'kg/m²', trend_unit: 'kg/m²/década', allow_percentage_change: true, land_only_mask: false,
    is_alias_of: 'PRECTOTCORR',
  },
  WS2M: {
    variable_id: 'WS2M', variable_name: 'Velocidade do Vento a 2m', domain: 'Ventos e Atmosfera',
    source_model: 'MERRA-2', resolution: MERRA2_RESOLUTION, grid_origin: MERRA2_ORIGIN, min_year: 1981,
    scale_type: 'ratio', unit: 'm/s', trend_unit: 'm/s/década', allow_percentage_change: true, land_only_mask: false,
    is_alias_of: 'WS10M',
  },
  WS10M: {
    variable_id: 'WS10M',
    variable_name: 'Velocidade do Vento a 10m',
    domain: 'Dinâmica Atmosférica',
    source_model: 'MERRA-2',
    resolution: MERRA2_RESOLUTION,
    grid_origin: MERRA2_ORIGIN,
    min_year: 1981,
    scale_type: 'ratio',
    unit: 'm/s',
    trend_unit: 'm/s/década',
    allow_percentage_change: true,
    land_only_mask: false,
  },
  WS50M: {
    variable_id: 'WS50M', variable_name: 'Velocidade do Vento a 50m', domain: 'Ventos e Atmosfera',
    source_model: 'MERRA-2', resolution: MERRA2_RESOLUTION, grid_origin: MERRA2_ORIGIN, min_year: 1981,
    scale_type: 'ratio', unit: 'm/s', trend_unit: 'm/s/década', allow_percentage_change: true, land_only_mask: false,
    is_alias_of: 'WS10M',
  },
  PS: {
    variable_id: 'PS',
    variable_name: 'Pressão de Superfície',
    domain: 'Dinâmica Atmosférica',
    source_model: 'MERRA-2',
    resolution: MERRA2_RESOLUTION,
    grid_origin: MERRA2_ORIGIN,
    min_year: 1981,
    scale_type: 'interval',
    unit: 'kPa',
    trend_unit: 'kPa/década',
    allow_percentage_change: false,
    land_only_mask: false,
  },
  ALLSKY_SFC_SW_DWN: {
    variable_id: 'ALLSKY_SFC_SW_DWN',
    variable_name: 'Irradiância Solar de Onda Curta Descendente',
    domain: 'Energia / Radiação Solar',
    source_model: 'CERES_SYN1deg',
    resolution: CERES_RESOLUTION,
    grid_origin: CERES_ORIGIN,
    min_year: 1984,
    scale_type: 'ratio',
    unit: 'MJ/m²/dia',
    trend_unit: 'MJ/m²/dia/década',
    allow_percentage_change: true,
    land_only_mask: false,
  },
  ALLSKY_SRF_ALB: {
    variable_id: 'ALLSKY_SRF_ALB', variable_name: 'Albedo da Superfície', domain: 'Vegetação e Uso da Terra',
    source_model: 'CERES_SYN1deg', resolution: CERES_RESOLUTION, grid_origin: CERES_ORIGIN, min_year: 1984,
    scale_type: 'ratio', unit: 'fração (0–1)', trend_unit: 'fração/década', allow_percentage_change: false, land_only_mask: false,
    is_alias_of: 'ALLSKY_SFC_SW_DWN',
  },
  CLRSKY_SFC_SW_DWN: {
    variable_id: 'CLRSKY_SFC_SW_DWN', variable_name: 'Radiação Solar de Céu Limpo', domain: 'Radiação e Nuvens',
    source_model: 'CERES_SYN1deg', resolution: CERES_RESOLUTION, grid_origin: CERES_ORIGIN, min_year: 1984,
    scale_type: 'ratio', unit: 'MJ/m²/dia', trend_unit: 'MJ/m²/dia/década', allow_percentage_change: true, land_only_mask: false,
    is_alias_of: 'ALLSKY_SFC_SW_DWN',
  },
  CLDTOT: {
    variable_id: 'CLDTOT',
    variable_name: 'Cobertura Total de Nuvens',
    domain: 'Atmosfera / Nuvens',
    source_model: 'CERES_SYN1deg',
    resolution: CERES_RESOLUTION,
    grid_origin: CERES_ORIGIN,
    min_year: 1984,
    scale_type: 'ratio',
    unit: '%',
    trend_unit: 'p.p./década',
    allow_percentage_change: false,
    land_only_mask: false,
  },
  CLOUD_AMT: {
    variable_id: 'CLOUD_AMT', variable_name: 'Cobertura de Nuvens', domain: 'Radiação e Nuvens',
    source_model: 'CERES_SYN1deg', resolution: CERES_RESOLUTION, grid_origin: CERES_ORIGIN, min_year: 1984,
    scale_type: 'ratio', unit: '%', trend_unit: 'p.p./década', allow_percentage_change: false, land_only_mask: false,
    is_alias_of: 'CLDTOT',
  },
  ALLSKY_SFC_LW_DWN: {
    variable_id: 'ALLSKY_SFC_LW_DWN',
    variable_name: 'Irradiância Térmica de Onda Longa Descendente',
    domain: 'Balanço Energético',
    source_model: 'CERES_SYN1deg',
    resolution: CERES_RESOLUTION,
    grid_origin: CERES_ORIGIN,
    min_year: 1984,
    scale_type: 'ratio',
    unit: 'MJ/m²/dia',
    trend_unit: 'MJ/m²/dia/década',
    allow_percentage_change: true,
    land_only_mask: false,
  },
  AOD_550: {
    variable_id: 'AOD_550', variable_name: 'Espessura Óptica de Aerossóis (Fumaça)', domain: 'Radiação e Nuvens',
    source_model: 'NASA_Giovanni', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 2000,
    scale_type: 'ratio', unit: 'Adimensional', trend_unit: 'AOD/década', allow_percentage_change: true, land_only_mask: false,
    is_alias_of: 'ALLSKY_SFC_SW_DWN',
  },
  PRCP: {
    variable_id: 'PRCP', variable_name: 'Chuva na Estação (Pluviômetro)', domain: 'Estações em Solo',
    source_model: 'NOAA_CDO', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 1981,
    scale_type: 'ratio', unit: 'mm', trend_unit: 'mm/década', allow_percentage_change: true, land_only_mask: true,
    is_alias_of: 'PRECTOTCORR',
  },
  TAVG: {
    variable_id: 'TAVG', variable_name: 'Temperatura Média na Estação', domain: 'Estações em Solo',
    source_model: 'NOAA_CDO', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 1981,
    scale_type: 'interval', unit: '°C', trend_unit: '°C/década', allow_percentage_change: false, land_only_mask: true,
    is_alias_of: 'T2M',
  },
  TMAX: {
    variable_id: 'TMAX', variable_name: 'Temperatura Máxima na Estação', domain: 'Estações em Solo',
    source_model: 'NOAA_CDO', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 1981,
    scale_type: 'interval', unit: '°C', trend_unit: '°C/década', allow_percentage_change: false, land_only_mask: true,
    is_alias_of: 'T2M_MAX',
  },
  TMIN: {
    variable_id: 'TMIN', variable_name: 'Temperatura Mínima na Estação', domain: 'Estações em Solo',
    source_model: 'NOAA_CDO', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 1981,
    scale_type: 'interval', unit: '°C', trend_unit: '°C/década', allow_percentage_change: false, land_only_mask: true,
    is_alias_of: 'T2M_MIN',
  },
  SNOW: {
    variable_id: 'SNOW', variable_name: 'Queda de Neve (Estação)', domain: 'Estações em Solo',
    source_model: 'NOAA_CDO', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 1981,
    scale_type: 'ratio', unit: 'mm', trend_unit: 'mm/década', allow_percentage_change: true, land_only_mask: true,
    is_alias_of: 'PRECTOTCORR',
  },
  SNWD: {
    variable_id: 'SNWD', variable_name: 'Acúmulo de Neve no Solo', domain: 'Estações em Solo',
    source_model: 'NOAA_CDO', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 1981,
    scale_type: 'ratio', unit: 'mm', trend_unit: 'mm/década', allow_percentage_change: true, land_only_mask: true,
    is_alias_of: 'PRECTOTCORR',
  },
  AWND: {
    variable_id: 'AWND', variable_name: 'Velocidade Média do Vento (Solo)', domain: 'Estações em Solo',
    source_model: 'NOAA_CDO', resolution: REGIONAL_RESOLUTION, grid_origin: STANDARD_ORIGIN, min_year: 1981,
    scale_type: 'ratio', unit: 'm/s', trend_unit: 'm/s/década', allow_percentage_change: true, land_only_mask: true,
    is_alias_of: 'WS10M',
  },
};

/** 12 variáveis NASA POWER principais esperadas na camada global ({var_id}_grid.json). */
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

/** Resolve o variable_id efetivo para arquivos de grade global (ex.: CLOUD_AMT -> CLDTOT). */
export function resolveGridVariableId(variableId: VariableId): VariableId {
  return VARIABLE_CATALOG[variableId].is_alias_of ?? variableId;
}

export function isValidVariableId(value: string): value is VariableId {
  return Object.prototype.hasOwnProperty.call(VARIABLE_CATALOG, value);
}

/**
 * Calcula a janela temporal válida na interseção entre variável A e (opcional) variável B.
 * Ex.: MERRA-2 (1981) + CERES (1984) => início travado em "1984-01".
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
