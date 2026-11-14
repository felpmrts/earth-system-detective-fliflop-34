import type { ConfidenceTier, RegimeShape, RegionSelection } from '../contracts/types';

export type TrendMode = 'none' | 'ols' | 'sen' | 'both';

export const REGIME_LABELS: Readonly<Record<RegimeShape, string>> = {
  linear: 'Tendência linear constante',
  accelerating_rise: 'Alta em aceleração',
  accelerating_decline: 'Queda em aceleração',
  saturating: 'Desaceleração / saturação',
  non_monotonic: 'Comportamento não monotônico',
};

export const CONFIDENCE_LABELS: Readonly<
  Record<ConfidenceTier, { readonly label: string; readonly tone: 'high' | 'moderate' | 'low' | 'neutral' }>
> = {
  CONFIRMED_HIGH: { label: 'Significativa (alta confiança)', tone: 'high' },
  CONFIRMED_MODERATE: { label: 'Significativa (confiança moderada)', tone: 'moderate' },
  INSUFFICIENT_SIGNAL: { label: 'Sinal insuficiente', tone: 'low' },
  NO_TREND: { label: 'Sem tendência detectada', tone: 'neutral' },
};

export interface GlossaryEntry {
  readonly term: string;
  readonly summary: string;
}

export const SCIENTIFIC_GLOSSARY: readonly GlossaryEntry[] = [
  {
    term: 'Anomalia climatológica',
    summary:
      'Diferença de cada mês em relação à sua média histórica. Remove o ciclo natural de verão e inverno para revelar tendências reais.',
  },
  {
    term: 'OLS (Mínimos Quadrados)',
    summary:
      'Reta ajustada sobre toda a nuvem de pontos. Mede a taxa média de mudança por década, sensível a extremos.',
  },
  {
    term: 'Theil–Sen',
    summary:
      'Inclinação mediana entre pares de pontos. É robusta contra anos atípicos (como El Niño ou La Niña).',
  },
  {
    term: 'AR(1) e N efetivo',
    summary:
      'Corrige o teste estatístico para a memória climática: meses seguidos não são totalmente independentes, reduzindo falsos positivos.',
  },
  {
    term: 'FDR (q < 0,05)',
    summary:
      'Controle da Taxa de Falsas Descobertas (Benjamini–Hochberg). Garante que menos de 5% dos pontos significativos no mapa sejam acaso.',
  },
  {
    term: 'Mahalanobis (D_M > 2,5)',
    summary:
      'Mede quão distante um mês está do comportamento esperado na elipse de tendência, destacando eventos extremos sem apagá-los.',
  },
];

export function formatSignedNumber(value: number, decimals = 3): string {
  const formatted = value.toFixed(decimals);
  return value > 0 ? `+${formatted}` : formatted;
}

export function formatPValue(value: number): string {
  if (value < 0.0001) return value.toExponential(1);
  return value.toFixed(4);
}

export function countMissingValues(values: readonly (number | null)[]): number {
  return values.reduce<number>((acc, val) => (val === null || !Number.isFinite(val) ? acc + 1 : acc), 0);
}

export function summarizeRegionCoords(region: RegionSelection | null): string {
  if (!region || region.cells.length === 0) return 'Região não informada';
  const count = region.cells.length;
  const avgLat = region.cells.reduce((sum, c) => sum + c.lat, 0) / count;
  const avgLon = region.cells.reduce((sum, c) => sum + c.lon, 0) / count;
  return `${count} célula${count > 1 ? 's' : ''} · centro (${avgLat.toFixed(2)}°, ${avgLon.toFixed(2)}°)`;
}
