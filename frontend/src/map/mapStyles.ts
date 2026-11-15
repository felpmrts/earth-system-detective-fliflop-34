import { resolveGridVariableId } from '../contracts/catalog.ts';
import type { GlobalGridPoint, RegionSlot, VariableId } from '../contracts/types.ts';

export interface CircleMarkerVisualStyle {
  readonly color: string;
  readonly fillColor: string;
  readonly fillOpacity: number;
  readonly weight: number;
  readonly radius: number;
  readonly dashArray: string | undefined;
}

export interface RegionPolygonVisualStyle {
  readonly color: string;
  readonly fillColor: string;
  readonly fillOpacity: number;
  readonly weight: number;
  readonly dashArray: string | undefined;
}

/**
 * Escalas típicas de magnitude decadal para normalização visual do raio no mapa global.
 * Tipagem estrita `Record<VariableId, number>` obriga calibração de todas as variáveis do catálogo.
 */
export const MAGNITUDE_REFERENCE_BY_VAR: Readonly<Record<VariableId, number>> = {
  // Temperatura (°C/década)
  T2M: 0.6,
  T2M_MAX: 0.7,
  T2M_MIN: 0.6,
  T2M_RANGE: 0.4,
  TS: 0.7,
  LST_Day_CMG: 1.0,
  LST_Night_CMG: 0.8,
  T2MDEW: 0.5,
  TAVG: 0.6,
  TMAX: 0.7,
  TMIN: 0.6,

  // Precipitação, evapotranspiração, água atmosférica e neve
  PRECTOTCORR: 15,
  GPM_3IMERGM: 15,
  PRCP: 15,
  SNOW: 10,
  SNWD: 15,
  Evap_tavg: 0.25,
  Qs_acc: 5.0,
  TQV: 1.2,
  QV2M: 0.5,
  RH2M: 3.0,

  // Umidade do solo (fração/década) e vegetação
  GWETTOP: 0.05,
  GWETROOT: 0.05,
  GWETPROF: 0.04,
  _1_km_monthly_NDVI: 0.05,
  _1_km_monthly_EVI: 0.04,
  Lai_500m: 0.35,

  // Hidrologia e rios (m³/s/década)
  river_discharge: 120,
  river_discharge_mean: 120,
  river_discharge_max: 250,
  river_discharge_min: 40,

  // Vento (m/s/década) e pressão (kPa/década)
  WS2M: 0.3,
  WS10M: 0.4,
  WS50M: 0.5,
  AWND: 0.4,
  PS: 0.15,

  // Radiação, albedo, nuvens e aerossóis
  ALLSKY_SFC_SW_DWN: 0.6,
  ALLSKY_SRF_ALB: 0.02,
  CLRSKY_SFC_SW_DWN: 0.15,
  CLDTOT: 4.0,
  CLOUD_AMT: 4.0,
  ALLSKY_SFC_LW_DWN: 0.6,
  AOD_550: 0.05,
};

/** Retorna a escala física decadal usada na normalização de raio do mapa global. */
export function getMagnitudeReference(variableId: VariableId, resolveProxy = false): number {
  const key = resolveProxy ? resolveGridVariableId(variableId) : variableId;
  return MAGNITUDE_REFERENCE_BY_VAR[key];
}

/**
 * Paleta divergente acessível (azul/teal para negativo vs. laranja/vermelho para positivo).
 * Separa rigorosamente Direção (cor), Magnitude (raio) e Significância (opacidade e borda).
 */
export function getGlobalPointStyle(
  point: GlobalGridPoint,
  variableId: VariableId,
): CircleMarkerVisualStyle {
  const isPositive = point.slope_sen_decade > 0;
  const isNeutral = point.slope_sen_decade === 0;

  const baseColor = isNeutral ? '#64748b' : isPositive ? '#d9480f' : '#1864ab';
  const refScale =
    MAGNITUDE_REFERENCE_BY_VAR[variableId] ??
    MAGNITUDE_REFERENCE_BY_VAR[resolveGridVariableId(variableId)] ??
    1;
  const normalizedMag = Math.min(Math.abs(point.slope_sen_decade) / refScale, 1.5);
  const radius = Math.round((3.5 + normalizedMag * 4.5) * 10) / 10;

  // Significância nunca altera a magnitude (radius); altera apenas clareza/opacidade/contorno.
  if (point.is_sig) {
    return {
      color: '#0f172a',
      fillColor: baseColor,
      fillOpacity: 0.88,
      weight: 1.2,
      radius,
      dashArray: undefined,
    };
  }

  return {
    color: baseColor,
    fillColor: baseColor,
    fillOpacity: 0.22,
    weight: 1,
    radius,
    dashArray: '3 3',
  };
}

/** Estilo dos retângulos de grade nativa selecionados para Local A ou Local B. */
export function getSelectedCellStyle(slot: RegionSlot): RegionPolygonVisualStyle {
  if (slot === 'A') {
    return {
      color: '#0284c7',
      fillColor: '#38bdf8',
      fillOpacity: 0.28,
      weight: 2.5,
      dashArray: undefined,
    };
  }

  return {
    color: '#c2410c',
    fillColor: '#fb923c',
    fillOpacity: 0.28,
    weight: 2.5,
    dashArray: '6 4',
  };
}
