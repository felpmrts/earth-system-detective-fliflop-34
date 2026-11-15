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
    statisticalNote: 'Trend: Theil-Sen/decade | Significance: AR(1) + FDR q < 0.05',
    directionItems: [
      {
        label: `Positive Trend (+ ${meta.trend_unit})`,
        color: '#d9480f',
        styleHint: 'solid',
      },
      {
        label: `Negative Trend (- ${meta.trend_unit})`,
        color: '#1864ab',
        styleHint: 'solid',
      },
    ],
    significanceItems: [
      {
        label: 'Significant (q < 0.05 — solid fill)',
        color: '#0f172a',
        styleHint: 'solid',
      },
      {
        label: 'Not significant / noise (q ≥ 0.05 — translucent dashed)',
        color: '#64748b',
        styleHint: 'dashed',
      },
    ],
    magnitudeNote: `Marker size proportional to |slope| in ${meta.trend_unit}.`,
  };
}
