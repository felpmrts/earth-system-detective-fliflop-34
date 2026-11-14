import { getVariableMetadata } from '../contracts/catalog.ts';
import type { GlobalGridPoint, RegionSlot, VariableId, VisualPolarity } from '../contracts/types.ts';

export interface PolarityPalette {
  readonly positiveColor: string;
  readonly negativeColor: string;
  readonly neutralColor: string;
}

const POLARITY_PALETTES: Readonly<Record<VisualPolarity, PolarityPalette>> = {
  thermal: {
    positiveColor: '#d9480f',
    negativeColor: '#1864ab',
    neutralColor: '#64748b',
  },
  hydrological: {
    positiveColor: '#1864ab',
    negativeColor: '#d9480f',
    neutralColor: '#64748b',
  },
  neutral: {
    positiveColor: '#0f766e',
    negativeColor: '#6d28d9',
    neutralColor: '#64748b',
  },
};

export function getPolarityPalette(polarity: VisualPolarity): PolarityPalette {
  return POLARITY_PALETTES[polarity];
}

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
  CLOUD_AMT: 4.0,
  ALLSKY_SFC_LW_DWN: 0.6,
};

/**
 * Paleta divergente consciente de polaridade física (thermal vs. hydrological vs. neutral).
 * Separa rigorosamente Direção (cor), Magnitude (raio) e Significância (opacidade e borda).
 */
export function getGlobalPointStyle(
  point: GlobalGridPoint,
  variableId: VariableId,
): CircleMarkerVisualStyle {
  const isPositive = point.slope_sen_decade > 0;
  const isNeutral = point.slope_sen_decade === 0;
  const meta = getVariableMetadata(variableId);
  const palette = getPolarityPalette(meta.visual_polarity);

  const baseColor = isNeutral
    ? palette.neutralColor
    : isPositive
      ? palette.positiveColor
      : palette.negativeColor;
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

/** Estilo dos retângulos de grade nativa selecionados para Local A (Ciano) ou Local B (Magenta). */
export function getSelectedCellStyle(slot: RegionSlot): RegionPolygonVisualStyle {
  if (slot === 'A') {
    return {
      color: '#00e5ff',
      fillColor: '#00e5ff',
      fillOpacity: 0.28,
      weight: 2.5,
      dashArray: undefined,
    };
  }

  return {
    color: '#ff007f',
    fillColor: '#ff007f',
    fillOpacity: 0.28,
    weight: 2.5,
    dashArray: '6 4',
  };
}
