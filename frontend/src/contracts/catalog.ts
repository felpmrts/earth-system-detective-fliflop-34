import type { GridResolution, VariableId, VariableMetadata } from './types.ts';

const MERRA2_RESOLUTION: GridResolution = { dLat: 0.5, dLon: 0.625 };
const CERES_RESOLUTION: GridResolution = { dLat: 1.0, dLon: 1.0 };

export const VARIABLE_CATALOG: Readonly<Record<VariableId, VariableMetadata>> = {
  T2M: {
    variable_id: 'T2M',
    variable_name: 'Temperatura Média do Ar a 2m',
    domain: 'Atmosfera',
    source_model: 'MERRA-2',
    resolution: MERRA2_RESOLUTION,
    min_year: 1981,
    scale_type: 'interval',
    visual_polarity: 'thermal',
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
    min_year: 1981,
    scale_type: 'interval',
    visual_polarity: 'thermal',
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
    min_year: 1981,
    scale_type: 'interval',
    visual_polarity: 'thermal',
    unit: '°C',
    trend_unit: '°C/década',
    allow_percentage_change: false,
    land_only_mask: false,
  },
  PRECTOTCORR: {
    variable_id: 'PRECTOTCORR',
    variable_name: 'Precipitação Total Corrigida',
    domain: 'Hidrologia / Chuva',
    source_model: 'MERRA-2',
    resolution: MERRA2_RESOLUTION,
    min_year: 1981,
    scale_type: 'ratio',
    visual_polarity: 'hydrological',
    unit: 'mm/mês',
    trend_unit: 'mm/mês/década',
    allow_percentage_change: true,
    land_only_mask: false,
  },
  GWETTOP: {
    variable_id: 'GWETTOP',
    variable_name: 'Umidade do Solo Superficial (0–5 cm)',
    domain: 'Hidrologia / Agronomia',
    source_model: 'MERRA-2',
    resolution: MERRA2_RESOLUTION,
    min_year: 1981,
    scale_type: 'ratio',
    visual_polarity: 'hydrological',
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
    min_year: 1981,
    scale_type: 'ratio',
    visual_polarity: 'hydrological',
    unit: 'fração (0–1)',
    trend_unit: 'fração/década',
    allow_percentage_change: false,
    land_only_mask: true,
  },
  RH2M: {
    variable_id: 'RH2M',
    variable_name: 'Umidade Relativa do Ar a 2m',
    domain: 'Meteorologia',
    source_model: 'MERRA-2',
    resolution: MERRA2_RESOLUTION,
    min_year: 1981,
    scale_type: 'ratio',
    visual_polarity: 'hydrological',
    unit: '%',
    trend_unit: 'p.p./década',
    allow_percentage_change: false,
    land_only_mask: false,
  },
  WS10M: {
    variable_id: 'WS10M',
    variable_name: 'Velocidade do Vento a 10m',
    domain: 'Dinâmica Atmosférica',
    source_model: 'MERRA-2',
    resolution: MERRA2_RESOLUTION,
    min_year: 1981,
    scale_type: 'ratio',
    visual_polarity: 'neutral',
    unit: 'm/s',
    trend_unit: 'm/s/década',
    allow_percentage_change: true,
    land_only_mask: false,
  },
  PS: {
    variable_id: 'PS',
    variable_name: 'Pressão de Superfície',
    domain: 'Dinâmica Atmosférica',
    source_model: 'MERRA-2',
    resolution: MERRA2_RESOLUTION,
    min_year: 1981,
    scale_type: 'interval',
    visual_polarity: 'neutral',
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
    min_year: 1984,
    scale_type: 'ratio',
    visual_polarity: 'thermal',
    unit: 'MJ/m²/dia',
    trend_unit: 'MJ/m²/dia/década',
    allow_percentage_change: true,
    land_only_mask: false,
  },
  CLDTOT: {
    variable_id: 'CLDTOT',
    variable_name: 'Cobertura Total de Nuvens',
    domain: 'Atmosfera / Nuvens',
    source_model: 'CERES_SYN1deg',
    resolution: CERES_RESOLUTION,
    min_year: 1984,
    scale_type: 'ratio',
    visual_polarity: 'hydrological',
    unit: '%',
    trend_unit: 'p.p./década',
    allow_percentage_change: false,
    land_only_mask: false,
  },
  CLOUD_AMT: {
    variable_id: 'CLOUD_AMT',
    variable_name: 'Cobertura de Nuvens',
    domain: 'Atmosfera / Nuvens',
    source_model: 'CERES_SYN1deg',
    resolution: CERES_RESOLUTION,
    min_year: 1984,
    scale_type: 'ratio',
    visual_polarity: 'hydrological',
    unit: '%',
    trend_unit: 'p.p./década',
    allow_percentage_change: false,
    land_only_mask: false,
    is_alias_of: 'CLDTOT',
  },
  ALLSKY_SFC_LW_DWN: {
    variable_id: 'ALLSKY_SFC_LW_DWN',
    variable_name: 'Irradiância Térmica de Onda Longa Descendente',
    domain: 'Balanço Energético',
    source_model: 'CERES_SYN1deg',
    resolution: CERES_RESOLUTION,
    min_year: 1984,
    scale_type: 'ratio',
    visual_polarity: 'thermal',
    unit: 'MJ/m²/dia',
    trend_unit: 'MJ/m²/dia/década',
    allow_percentage_change: true,
    land_only_mask: false,
  },
};

export const VARIABLE_LIST: readonly VariableMetadata[] = Object.values(VARIABLE_CATALOG);

export function getVariableMetadata(variableId: VariableId): VariableMetadata {
  return VARIABLE_CATALOG[variableId];
}

export function resolveCanonicalGridVariableId(variableId: VariableId): VariableId {
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
  maxYear = 2025,
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
