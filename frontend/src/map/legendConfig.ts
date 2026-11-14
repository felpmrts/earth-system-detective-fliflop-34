import { getVariableMetadata } from '../contracts/catalog.ts';
import type { VariableId } from '../contracts/types.ts';

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

export function buildMapLegendConfig(variableId: VariableId): MapLegendConfig {
  const meta = getVariableMetadata(variableId);

  return {
    variableId,
    title: meta.variable_name,
    trendUnit: meta.trend_unit,
    statisticalNote: 'Tendência: Theil-Sen/década | Significância: AR(1) + FDR q < 0,05',
    directionItems: [
      {
        label: `Tendência Positiva (+ ${meta.trend_unit})`,
        color: '#d9480f',
        styleHint: 'solid',
      },
      {
        label: `Tendência Negativa (- ${meta.trend_unit})`,
        color: '#1864ab',
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
