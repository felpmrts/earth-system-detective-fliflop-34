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

/** Escalas típicas de magnitude decadal para normalização visual do raio no mapa global. */
const MAGNITUDE_REFERENCE_BY_VAR: Readonly<Record<VariableId, number>> = {
  T2M: 0.6,
  T2M_MAX: 0.7,
  T2M_MIN: 0.6,
  PRECTOTCORR: 15,
  GWETTOP: 0.05,
  GWETROOT: 0.05,
  RH2M: 3.0,
  WS10M: 0.4,
  PS: 0.15,
  ALLSKY_SFC_SW_DWN: 0.6,
  CLDTOT: 4.0,
  ALLSKY_SFC_LW_DWN: 0.6,
};

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
  const refScale = MAGNITUDE_REFERENCE_BY_VAR[variableId];
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
