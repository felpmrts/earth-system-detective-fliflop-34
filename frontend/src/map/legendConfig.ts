import { getVariableMetadata } from '../contracts/catalog.ts';
import type { VariableId, VisualPolarity } from '../contracts/types.ts';
import { getPolarityPalette } from './mapStyles.ts';

export interface LegendItem {
  readonly label: string;
  readonly color: string;
  readonly styleHint: 'solid' | 'dashed';
}

export interface MapLegendConfig {
  readonly variableId: VariableId;
  readonly title: string;
  readonly trendUnit: string;
  readonly statisticalNote: string;
  readonly directionItems: readonly LegendItem[];
  readonly significanceItems: readonly LegendItem[];
  readonly magnitudeNote: string;
}

const DIRECTION_LABELS: Readonly<
  Record<VisualPolarity, { readonly positive: string; readonly negative: string }>
> = {
  thermal: {
    positive: 'Tendência Positiva — Aquecendo',
    negative: 'Tendência Negativa — Resfriando',
  },
  hydrological: {
    positive: 'Tendência Positiva — Umedecendo',
    negative: 'Tendência Negativa — Secando',
  },
  neutral: {
    positive: 'Tendência Positiva — Aumento',
    negative: 'Tendência Negativa — Queda',
  },
};

export function buildMapLegendConfig(variableId: VariableId): MapLegendConfig {
  const meta = getVariableMetadata(variableId);
  const palette = getPolarityPalette(meta.visual_polarity);
  const labels = DIRECTION_LABELS[meta.visual_polarity];

  return {
    variableId,
    title: meta.variable_name,
    trendUnit: meta.trend_unit,
    statisticalNote: 'Tendência: Theil-Sen/década | Significância: AR(1) + FDR q < 0,05',
    directionItems: [
      {
        label: `${labels.positive} (+ ${meta.trend_unit})`,
        color: palette.positiveColor,
        styleHint: 'solid',
      },
      {
        label: `${labels.negative} (- ${meta.trend_unit})`,
        color: palette.negativeColor,
        styleHint: 'solid',
      },
    ],
    significanceItems: [
      {
        label: 'Significativo (q < 0,05 — preenchimento sólido)',
        color: '#0f172a',
        styleHint: 'solid',
      },
      {
        label: 'Não significativo / ruído (q ≥ 0,05 — tracejado translúcido)',
        color: '#64748b',
        styleHint: 'dashed',
      },
    ],
    magnitudeNote: `Tamanho do marcador proporcional a |inclinação| em ${meta.trend_unit}.`,
  };
}
