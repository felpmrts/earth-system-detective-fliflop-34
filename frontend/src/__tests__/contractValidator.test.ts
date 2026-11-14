import { describe, expect, it } from 'vitest';
import mockAnalysisJson from '../../public/data/mock_analysis.json';
import t2mGridJson from '../../public/data/T2M_grid.json';
import { getIntersectingDateBounds, VARIABLE_LIST } from '../contracts/catalog.ts';
import {
  ContractValidationError,
  validateAnalysisResponse,
  validateGlobalGrid,
} from '../contracts/contractValidator.ts';

describe('catalog & contractValidator — blindagem dos 7 Invariantes', () => {
  it('catálogo cobre as variáveis NASA POWER em tempo real e proíbe % em variáveis intervalares', () => {
    expect(VARIABLE_LIST).toHaveLength(23);
    for (const v of VARIABLE_LIST) {
      if (v.scale_type === 'interval') {
        expect(v.allow_percentage_change).toBe(false);
      }
    }
  });

  it('calcula interseção temporal entre MERRA-2 (1981) e CERES (1984)', () => {
    const sameModel = getIntersectingDateBounds('T2M', 'GWETTOP');
    expect(sameModel.minYear).toBe(1981);
    expect(sameModel.startDate).toBe('1981-01');

    const crossModel = getIntersectingDateBounds('T2M', 'ALLSKY_SFC_SW_DWN');
    expect(crossModel.minYear).toBe(1984);
    expect(crossModel.startDate).toBe('1984-01');
  });

  it('valida os arquivos JSON reais de public/data/', () => {
    const validatedGrid = validateGlobalGrid(t2mGridJson);
    expect(validatedGrid.points.length).toBeGreaterThan(0);

    const validatedAnalysis = validateAnalysisResponse(mockAnalysisJson);
    expect(validatedAnalysis.region_a_analysis.variable_id).toBe('GWETTOP');
    expect(validatedAnalysis.region_b_analysis?.variable_id).toBe('T2M_MAX');
    expect(validatedAnalysis.comparison_pair?.multiscale_correlation.long_term_secular_r).toBe(-0.74);
  });

  it('rejeita payload que tente permitir % em variável intervalar (Invariante #3)', () => {
    const broken = structuredClone(mockAnalysisJson) as {
      region_b_analysis: { scale_type: string; allow_percentage_change: boolean };
    };
    broken.region_b_analysis.scale_type = 'interval';
    broken.region_b_analysis.allow_percentage_change = true;

    expect(() => validateAnalysisResponse(broken)).toThrow(ContractValidationError);
  });

  it('rejeita séries com vetores de tamanhos divergentes', () => {
    const broken = structuredClone(mockAnalysisJson) as {
      region_a_analysis: { series: { dates: string[] } };
    };
    broken.region_a_analysis.series.dates.pop();

    expect(() => validateAnalysisResponse(broken)).toThrow(ContractValidationError);
  });

  it('rejeita cells_count_b inválido quando Região B está presente', () => {
    const zeroCellsB = structuredClone(mockAnalysisJson) as {
      request_meta: { cells_count_b: number };
    };
    zeroCellsB.request_meta.cells_count_b = 0;
    expect(() => validateAnalysisResponse(zeroCellsB)).toThrow(ContractValidationError);

    const overCellsB = structuredClone(mockAnalysisJson) as {
      request_meta: { cells_count_b: number };
    };
    overCellsB.request_meta.cells_count_b = 10;
    expect(() => validateAnalysisResponse(overCellsB)).toThrow(ContractValidationError);
  });

  it('rejeita comparison_pair com r_global, r_detrended ou p-valores inválidos', () => {
    const badRGlobal = structuredClone(mockAnalysisJson) as {
      comparison_pair: { multiscale_correlation: { long_term_secular_r: number } };
    };
    badRGlobal.comparison_pair.multiscale_correlation.long_term_secular_r = 1.25;
    expect(() => validateAnalysisResponse(badRGlobal)).toThrow(ContractValidationError);

    const badRDetrended = structuredClone(mockAnalysisJson) as {
      comparison_pair: { multiscale_correlation: { short_term_detrended_r: number } };
    };
    badRDetrended.comparison_pair.multiscale_correlation.short_term_detrended_r = -1.5;
    expect(() => validateAnalysisResponse(badRDetrended)).toThrow(ContractValidationError);

    const badPValue = structuredClone(mockAnalysisJson) as {
      region_b_analysis: { significance: { p_value_naive: number } };
    };
    badPValue.region_b_analysis.significance.p_value_naive = 1.1;
    expect(() => validateAnalysisResponse(badPValue)).toThrow(ContractValidationError);

    const badComparisonP = structuredClone(mockAnalysisJson) as {
      comparison_pair: { multiscale_correlation: Record<string, unknown> };
    };
    badComparisonP.comparison_pair.multiscale_correlation.long_term_p_value = -0.01;
    expect(() => validateAnalysisResponse(badComparisonP)).toThrow(ContractValidationError);
  });
});
