import { describe, expect, it } from 'vitest';
import { VARIABLE_LIST } from '../contracts/catalog.ts';
import { buildMapLegendConfig } from '../map/legendConfig.ts';
import {
  getGlobalPointStyle,
  getMagnitudeReference,
  getSelectedCellStyle,
  MAGNITUDE_REFERENCE_BY_VAR,
} from '../map/mapStyles.ts';

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

  it('calibra escala decadal para todas as 43 variáveis sem distorção de raio', () => {
    expect(Object.keys(MAGNITUDE_REFERENCE_BY_VAR)).toHaveLength(VARIABLE_LIST.length);
    for (const meta of VARIABLE_LIST) {
      const ref = getMagnitudeReference(meta.variable_id);
      expect(Number.isFinite(ref)).toBe(true);
      expect(ref).toBeGreaterThan(0);
    }

    // NDVI (fração -1..1) e vazão (m³/s) mantêm diferenciação entre tendência fraca e forte
    const mildNdvi = getGlobalPointStyle(
      { lat: -10, lon: -50, slope_sen_decade: 0.015, q_value_fdr: 0.01, is_sig: true },
      '_1_km_monthly_NDVI',
    );
    const strongNdvi = getGlobalPointStyle(
      { lat: -10, lon: -50, slope_sen_decade: 0.06, q_value_fdr: 0.01, is_sig: true },
      '_1_km_monthly_NDVI',
    );
    expect(strongNdvi.radius).toBeGreaterThan(mildNdvi.radius);

    const mildRiver = getGlobalPointStyle(
      { lat: -3, lon: -60, slope_sen_decade: 15, q_value_fdr: 0.01, is_sig: true },
      'river_discharge',
    );
    const extremeRiver = getGlobalPointStyle(
      { lat: -3, lon: -60, slope_sen_decade: 150, q_value_fdr: 0.01, is_sig: true },
      'river_discharge',
    );
    expect(extremeRiver.radius).toBeGreaterThan(mildRiver.radius);
  });
});
