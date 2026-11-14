/**
 * catalog.js — Catálogo Oficial Completo das 12 Variáveis NASA POWER (NASA Space Apps 2026)
 * Em conformidade estrita com a Seção 1 do CONTRATO_DE_DADOS.md
 */

export const VARIABLE_CATALOG = {
  T2M: {
    id: 'T2M',
    name: 'Temperatura Média do Ar a 2m',
    source_model: 'MERRA-2',
    resolution: { dLat: 0.5, dLon: 0.625 },
    start_year: 1981,
    scale_type: 'interval',
    unit: '°C',
    trend_unit: '°C/década',
    allow_percentage_change: false,
    land_only_mask: false
  },
  T2M_MAX: {
    id: 'T2M_MAX',
    name: 'Temperatura Máxima Diária a 2m',
    source_model: 'MERRA-2',
    resolution: { dLat: 0.5, dLon: 0.625 },
    start_year: 1981,
    scale_type: 'interval',
    unit: '°C',
    trend_unit: '°C/década',
    allow_percentage_change: false,
    land_only_mask: false
  },
  T2M_MIN: {
    id: 'T2M_MIN',
    name: 'Temperatura Mínima Diária a 2m',
    source_model: 'MERRA-2',
    resolution: { dLat: 0.5, dLon: 0.625 },
    start_year: 1981,
    scale_type: 'interval',
    unit: '°C',
    trend_unit: '°C/década',
    allow_percentage_change: false,
    land_only_mask: false
  },
  PRECTOTCORR: {
    id: 'PRECTOTCORR',
    name: 'Precipitação Total Corrigida',
    source_model: 'MERRA-2',
    resolution: { dLat: 0.5, dLon: 0.625 },
    start_year: 1981,
    scale_type: 'ratio',
    unit: 'mm/mês',
    trend_unit: 'mm/mês/década',
    allow_percentage_change: true,
    land_only_mask: false
  },
  GWETTOP: {
    id: 'GWETTOP',
    name: 'Umidade do Solo Superficial (0–5 cm)',
    source_model: 'MERRA-2',
    resolution: { dLat: 0.5, dLon: 0.625 },
    start_year: 1981,
    scale_type: 'ratio',
    unit: 'fração (0–1)',
    trend_unit: 'fração/década',
    allow_percentage_change: false,
    land_only_mask: true
  },
  GWETROOT: {
    id: 'GWETROOT',
    name: 'Umidade do Solo Radicular (0–100 cm)',
    source_model: 'MERRA-2',
    resolution: { dLat: 0.5, dLon: 0.625 },
    start_year: 1981,
    scale_type: 'ratio',
    unit: 'fração (0–1)',
    trend_unit: 'fração/década',
    allow_percentage_change: false,
    land_only_mask: true
  },
  RH2M: {
    id: 'RH2M',
    name: 'Umidade Relativa do Ar a 2m',
    source_model: 'MERRA-2',
    resolution: { dLat: 0.5, dLon: 0.625 },
    start_year: 1981,
    scale_type: 'ratio',
    unit: '%',
    trend_unit: 'p.p./década',
    allow_percentage_change: false,
    land_only_mask: false
  },
  WS10M: {
    id: 'WS10M',
    name: 'Velocidade do Vento a 10m',
    source_model: 'MERRA-2',
    resolution: { dLat: 0.5, dLon: 0.625 },
    start_year: 1981,
    scale_type: 'ratio',
    unit: 'm/s',
    trend_unit: 'm/s/década',
    allow_percentage_change: true,
    land_only_mask: false
  },
  PS: {
    id: 'PS',
    name: 'Pressão de Superfície',
    source_model: 'MERRA-2',
    resolution: { dLat: 0.5, dLon: 0.625 },
    start_year: 1981,
    scale_type: 'interval',
    unit: 'kPa',
    trend_unit: 'kPa/década',
    allow_percentage_change: false,
    land_only_mask: false
  },
  ALLSKY_SFC_SW_DWN: {
    id: 'ALLSKY_SFC_SW_DWN',
    name: 'Irradiância Solar Onda Curta Descendente',
    source_model: 'CERES_SYN1deg',
    resolution: { dLat: 1.0, dLon: 1.0 },
    start_year: 1984,
    scale_type: 'ratio',
    unit: 'MJ/m²/dia',
    trend_unit: 'MJ/m²/dia/década',
    allow_percentage_change: true,
    land_only_mask: false
  },
  CLDTOT: {
    id: 'CLDTOT',
    name: 'Cobertura Total de Nuvens',
    source_model: 'CERES_SYN1deg',
    resolution: { dLat: 1.0, dLon: 1.0 },
    start_year: 1984,
    scale_type: 'ratio',
    unit: '%',
    trend_unit: 'p.p./década',
    allow_percentage_change: false,
    land_only_mask: false
  },
  ALLSKY_SFC_LW_DWN: {
    id: 'ALLSKY_SFC_LW_DWN',
    name: 'Irradiância Térmica Onda Longa Descendente',
    source_model: 'CERES_SYN1deg',
    resolution: { dLat: 1.0, dLon: 1.0 },
    start_year: 1984,
    scale_type: 'ratio',
    unit: 'MJ/m²/dia',
    trend_unit: 'MJ/m²/dia/década',
    allow_percentage_change: true,
    land_only_mask: false
  }
};

export const VARIABLE_LIST = Object.values(VARIABLE_CATALOG);

export function isValidVariableId(value) {
  return value in VARIABLE_CATALOG;
}

export function getVariableMetadata(variableId) {
  return VARIABLE_CATALOG[variableId] || VARIABLE_CATALOG['T2M'];
}

export function getIntersectingDateBounds(varA, varB = null, maxYear = 2025) {
  const metaA = getVariableMetadata(varA);
  let startYear = metaA.start_year;

  if (varB) {
    const metaB = getVariableMetadata(varB);
    startYear = Math.max(startYear, metaB.start_year);
  }

  return {
    start_year: startYear,
    end_year: maxYear,
    start: `${startYear}-01`,
    end: `${maxYear}-12`
  };
}
