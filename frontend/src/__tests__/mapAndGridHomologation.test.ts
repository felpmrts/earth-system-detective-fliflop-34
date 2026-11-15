import { describe, expect, it, vi } from 'vitest';
import {
  CORE_GLOBAL_GRID_VARIABLES,
  getVariableMetadata,
  resolveGridVariableId,
} from '../contracts/catalog.ts';
import { ContractValidationError } from '../contracts/contractValidator.ts';
import {
  HOMOLOGATION_REQUIRED_GRIDS,
  validateHomologatedGrid,
} from '../contracts/globalGridHomologation.ts';
import type { GlobalGridFile, VariableId } from '../contracts/types.ts';
import {
  buildRegionSelection,
  isConnectedComponent,
  MAX_CELLS_PER_REGION,
  mirrorRegionSelection,
  snapCoordToCell,
} from '../geo/gridGeometry.ts';
import { getGlobalPointStyle, getSelectedCellStyle } from '../map/mapStyles.ts';
import { buildGlobalGridUrl, createRegionDataAdapter } from '../services/regionDataAdapter.ts';

const presentGridModules = import.meta.glob('../../public/data/*_grid.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

function buildSampleGrid(variableId: VariableId, count = 120): GlobalGridFile {
  const resolvedId = resolveGridVariableId(variableId);
  const meta = getVariableMetadata(resolvedId);
  const points = Array.from({ length: count }, (_, idx) => {
    const lat = -40 + (idx % 10) * 8;
    const lon = -100 + Math.floor(idx / 10) * 15;
    return {
      lat,
      lon,
      slope_sen_decade: idx % 2 === 0 ? 0.35 : -0.25,
      q_value_fdr: idx % 3 === 0 ? 0.01 : 0.42,
      is_sig: idx % 3 === 0,
    };
  });

  return {
    variable_id: resolvedId,
    unit: meta.unit,
    trend_unit: meta.trend_unit,
    period: { start: `${meta.min_year}-01`, end: '2025-12' },
    points,
  };
}

describe('Alias CLOUD_AMT -> CLDTOT_grid.json e estilo visual', () => {
  it('resolve CLOUD_AMT para CLDTOT sem fallback falso e compartilha referência visual', async () => {
    expect(resolveGridVariableId('CLOUD_AMT')).toBe('CLDTOT');
    expect(buildGlobalGridUrl('CLOUD_AMT')).toEqual({
      resolvedVariableId: 'CLDTOT',
      url: '/data/CLDTOT_grid.json',
    });

    const cldtotGrid = buildSampleGrid('CLDTOT', 2);
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(JSON.stringify(cldtotGrid), { status: 200 });
    });
    const adapter = createRegionDataAdapter({ fetchFn: fetchMock as unknown as typeof fetch });

    const loaded = await adapter.getGlobalGrid('CLOUD_AMT');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/data/CLDTOT_grid.json');
    expect(loaded.variable_id).toBe('CLDTOT');
    expect(loaded.points).toHaveLength(2);

    const point = loaded.points[0]!;
    expect(getGlobalPointStyle(point, 'CLOUD_AMT')).toEqual(getGlobalPointStyle(point, 'CLDTOT'));
  });
});

describe('Toggle "Mesmo Local (A=B)" — distinção visual e re-snap entre grades', () => {
  it('mantém distinção visual A (azul sólido) vs B (laranja tracejado) e espelha mesma grade', () => {
    const styleA = getSelectedCellStyle('A');
    const styleB = getSelectedCellStyle('B');
    expect(styleA.color).toBe('#0284c7');
    expect(styleA.dashArray).toBeUndefined();
    expect(styleB.color).toBe('#c2410c');
    expect(styleB.dashArray).toBe('6 4');

    const c1 = snapCoordToCell(-18.91, -48.27, 'T2M');
    const c2 = snapCoordToCell(-18.41, -48.27, 'T2M');
    const regionA = buildRegionSelection('A', 'T2M', [c1, c2]);

    const mirroredB = mirrorRegionSelection(regionA, 'B', 'GWETTOP');
    expect(mirroredB.slot).toBe('B');
    expect(mirroredB.source_model).toBe('MERRA-2');
    expect(mirroredB.cells.map(c => c.cell_id)).toEqual(regionA.cells.map(c => c.cell_id));
  });

  it('faz re-snap e deduplicação válidos ao espelhar MERRA-2 <-> CERES_SYN1deg sem quebrar conexidade', () => {
    // 2 células MERRA-2 próximas (Uberlândia) espelhadas para CERES_SYN1deg (CLOUD_AMT)
    const m1 = snapCoordToCell(-18.75, -48.4375, 'T2M');
    const m2 = snapCoordToCell(-18.75, -47.8125, 'T2M');
    const regionMerra = buildRegionSelection('A', 'T2M', [m1, m2]);

    const mirroredCeres = mirrorRegionSelection(regionMerra, 'B', 'CLOUD_AMT');
    expect(mirroredCeres.source_model).toBe('CERES_SYN1deg');
    expect(mirroredCeres.grid_resolution).toEqual({ dLat: 1.0, dLon: 1.0 });
    expect(mirroredCeres.cells.length).toBeGreaterThanOrEqual(1);
    expect(mirroredCeres.cells.length).toBeLessThanOrEqual(MAX_CELLS_PER_REGION);
    expect(isConnectedComponent(mirroredCeres.cells)).toBe(true);

    // 2 células CERES adjacentes cuja distância 1.0° deixaria lacuna de 1 passo no grid MERRA-2
    const c1 = snapCoordToCell(-3.5, -60.5, 'CLDTOT');
    const c2 = snapCoordToCell(-3.5, -59.5, 'CLDTOT');
    const regionCeres2 = buildRegionSelection('A', 'CLDTOT', [c1, c2]);
    const mirroredMerraFrom2 = mirrorRegionSelection(regionCeres2, 'B', 'T2M');
    expect(mirroredMerraFrom2.source_model).toBe('MERRA-2');
    expect(mirroredMerraFrom2.grid_resolution).toEqual({ dLat: 0.5, dLon: 0.625 });
    expect(isConnectedComponent(mirroredMerraFrom2.cells)).toBe(true);
    expect(mirroredMerraFrom2.cells.length).toBeLessThanOrEqual(MAX_CELLS_PER_REGION);

    // Bloco 3x3 CERES grande (>9 células MERRA-2 equivalentes) garante corte conexo <= 9 células
    const ceres3x3 = [];
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 3; c += 1) {
        ceres3x3.push(snapCoordToCell(-4.5 + r, -61.5 + c, 'CLDTOT'));
      }
    }
    const regionCeres9 = buildRegionSelection('A', 'CLDTOT', ceres3x3);
    const mirroredMerraCapped = mirrorRegionSelection(regionCeres9, 'B', 'T2M');
    expect(mirroredMerraCapped.cells.length).toBeGreaterThan(0);
    expect(mirroredMerraCapped.cells.length).toBeLessThanOrEqual(MAX_CELLS_PER_REGION);
    expect(isConnectedComponent(mirroredMerraCapped.cells)).toBe(true);
  });
});

describe('Homologação das 12 grades globais via validateGlobalGrid', () => {
  it('homologa todas as 12 variáveis NASA POWER esperadas e os arquivos presentes em public/data/', () => {
    expect(HOMOLOGATION_REQUIRED_GRIDS).toHaveLength(12);
    expect(CORE_GLOBAL_GRID_VARIABLES).toEqual(HOMOLOGATION_REQUIRED_GRIDS);

    for (const varId of HOMOLOGATION_REQUIRED_GRIDS) {
      const sample = buildSampleGrid(varId, 120);
      const report = validateHomologatedGrid(varId, sample, 100);
      expect(report.resolvedVariableId).toBe(varId);
      expect(report.isRealDensity).toBe(true);
    }

    // Valida todos os 12 {var_id}_grid.json homologados presentes em frontend/public/data/ (>= 100 pontos cada)
    const entries = Object.entries(presentGridModules);
    expect(entries).toHaveLength(HOMOLOGATION_REQUIRED_GRIDS.length);
    const foundIds = new Set<string>();
    for (const [modulePath, payload] of entries) {
      const match = /\/([A-Z0-9_]+)_grid\.json$/.exec(modulePath);
      expect(match?.[1]).toBeTruthy();
      const fileVarId = match![1] as VariableId;
      foundIds.add(fileVarId);
      const report = validateHomologatedGrid(fileVarId, payload, 100);
      expect(report.pointsCount).toBeGreaterThanOrEqual(100);
      expect(report.isRealDensity).toBe(true);
    }
    for (const requiredId of HOMOLOGATION_REQUIRED_GRIDS) {
      expect(foundIds.has(requiredId)).toBe(true);
    }
  });

  it('rejeita arquivo trocado, trend_unit divergente ou points vazio na homologação', () => {
    const wrongVar = buildSampleGrid('PRECTOTCORR', 10);
    expect(() => validateHomologatedGrid('T2M', wrongVar)).toThrow(ContractValidationError);

    const emptyGrid = buildSampleGrid('T2M', 0);
    expect(() => validateHomologatedGrid('T2M', emptyGrid)).toThrow(ContractValidationError);

    const badUnit = { ...buildSampleGrid('PS', 5), trend_unit: 'kPa / década' };
    expect(() => validateHomologatedGrid('PS', badUnit)).toThrow(ContractValidationError);
  });
});
