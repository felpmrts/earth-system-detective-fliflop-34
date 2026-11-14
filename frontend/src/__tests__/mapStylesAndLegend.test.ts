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

  it('aplica polaridade visual correta para thermal (T2M), hydrological (GWETTOP/PRECTOTCORR) e neutral (WS10M)', () => {
    const posPoint = { lat: -3.0, lon: -60.0, slope_sen_decade: 0.4, q_value_fdr: 0.01, is_sig: true };
    const negPoint = { lat: -19.0, lon: -48.125, slope_sen_decade: -0.4, q_value_fdr: 0.01, is_sig: true };

    expect(getGlobalPointStyle(posPoint, 'T2M').fillColor).toBe('#d9480f');
    expect(getGlobalPointStyle(negPoint, 'T2M').fillColor).toBe('#1864ab');

    expect(getGlobalPointStyle(posPoint, 'GWETTOP').fillColor).toBe('#1864ab');
    expect(getGlobalPointStyle(negPoint, 'GWETTOP').fillColor).toBe('#d9480f');
    expect(getGlobalPointStyle(negPoint, 'PRECTOTCORR').fillColor).toBe('#d9480f');

    expect(getGlobalPointStyle(posPoint, 'WS10M').fillColor).toBe('#0f766e');
    expect(getGlobalPointStyle(negPoint, 'WS10M').fillColor).toBe('#6d28d9');
    expect(getGlobalPointStyle(posPoint, 'CLOUD_AMT').fillColor).toBe('#1864ab');

    expect(buildMapLegendConfig('GWETTOP').directionItems[0]?.label).toContain('Umedecendo');
    expect(buildMapLegendConfig('T2M').directionItems[0]?.label).toContain('Aquecendo');
    expect(buildMapLegendConfig('WS10M').directionItems[0]?.label).toContain('Aumento');
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
