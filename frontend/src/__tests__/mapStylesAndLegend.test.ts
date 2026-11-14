import { describe, expect, it } from 'vitest';
import { buildMapLegendConfig } from '../map/legendConfig.ts';
import { getGlobalPointStyle, getSelectedCellStyle } from '../map/mapStyles.ts';

describe('mapStyles & legendConfig — 3 dimensões independentes', () => {
  it('mantém magnitude (radius) independente da significância estatística', () => {
    const sigPoint = {
      lat: -18.75,
      lon: -48.125,
      slope_sen_decade: 0.45,
      q_value_fdr: 0.002,
      is_sig: true,
    };
    const nonSigSameSlope = {
      ...sigPoint,
      q_value_fdr: 0.35,
      is_sig: false,
    };

    const styleSig = getGlobalPointStyle(sigPoint, 'T2M');
    const styleNonSig = getGlobalPointStyle(nonSigSameSlope, 'T2M');

    // Mesma magnitude => mesmo raio; significância muda apenas opacidade e borda tracejada
    expect(styleSig.radius).toBe(styleNonSig.radius);
    expect(styleSig.fillOpacity).toBeGreaterThan(styleNonSig.fillOpacity);
    expect(styleSig.dashArray).toBeUndefined();
    expect(styleNonSig.dashArray).toBe('3 3');
  });

  it('gera legenda de temperatura sem menção a porcentagem e diferencia estilos A vs B', () => {
    const legend = buildMapLegendConfig('T2M');
    expect(legend.trendUnit).toBe('°C/década');
    expect(legend.trendUnit).not.toContain('%');
    expect(legend.statisticalNote).toContain('FDR');

    const styleA = getSelectedCellStyle('A');
    const styleB = getSelectedCellStyle('B');
    expect(styleA.color).not.toBe(styleB.color);
  });
});
