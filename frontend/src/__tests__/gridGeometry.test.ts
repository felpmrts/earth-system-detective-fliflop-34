import { describe, expect, it } from 'vitest';
import {
  buildRegionSelection,
  isAdjacent8,
  isConnectedComponent,
  snapCoordToCell,
  toggleCellInSelection,
} from '../geo/gridGeometry.ts';
import type { GridCell } from '../contracts/types.ts';

describe('gridGeometry — snapping de grade NASA e composição K <= 9', () => {
  it('faz snapping correto para MERRA-2 (0.5° × 0.625°) e mantém Leaflet [lat, lon] vs GeoJSON [lon, lat]', () => {
    // Uberlândia (~ -18.91, -48.27)
    const cell = snapCoordToCell(-18.91, -48.27, 'GWETTOP');

    const [[south, west], [north, east]] = cell.bounds_leaflet;
    expect(north - south).toBeCloseTo(0.5, 6);
    expect(east - west).toBeCloseTo(0.625, 6);
    expect(cell.lat).toBeGreaterThanOrEqual(south);
    expect(cell.lat).toBeLessThanOrEqual(north);
    expect(cell.lon).toBeGreaterThanOrEqual(west);
    expect(cell.lon).toBeLessThanOrEqual(east);

    // GeoJSON deve ter [lon, lat] (longitude primeiro!) e polígono fechado (5 pontos)
    expect(cell.geojson_ring).toHaveLength(5);
    expect(cell.geojson_ring[0]).toEqual([west, south]);
    expect(cell.geojson_ring[4]).toEqual([west, south]);
  });

  it('faz snapping correto para CERES_SYN1deg (1.0° × 1.0°)', () => {
    const cell = snapCoordToCell(-3.2, -60.4, 'ALLSKY_SFC_SW_DWN');
    const [[south, west], [north, east]] = cell.bounds_leaflet;

    expect(north - south).toBeCloseTo(1.0, 6);
    expect(east - west).toBeCloseTo(1.0, 6);
  });

  it('rejeita coordenadas inválidas ou invertidas (lat > 90)', () => {
    expect(() => snapCoordToCell(-120, -48, 'T2M')).toThrow();
    expect(() => snapCoordToCell(Number.NaN, -48, 'T2M')).toThrow();
  });

  it('suporta conectividade de 8 vizinhos (ortogonal, diagonal, formato em L e 1x3) até K <= 9', () => {
    const c1 = snapCoordToCell(-18.75, -48.4375, 'T2M');
    const c2Ortho = snapCoordToCell(-18.75, -47.8125, 'T2M'); // leste
    const c3Diag = snapCoordToCell(-18.25, -47.1875, 'T2M'); // diagonal nordeste de c2Ortho
    const cFar = snapCoordToCell(-10.0, -48.4375, 'T2M');

    expect(isAdjacent8(c1, c2Ortho)).toBe(true);
    expect(isAdjacent8(c2Ortho, c3Diag)).toBe(true);
    expect(isAdjacent8(c1, c1)).toBe(false);

    let sel: readonly GridCell[] = [];
    sel = toggleCellInSelection(sel, c1).cells;
    sel = toggleCellInSelection(sel, c2Ortho).cells;
    const diagRes = toggleCellInSelection(sel, c3Diag);
    expect(diagRes.ok).toBe(true);
    expect(diagRes.cells).toHaveLength(3);
    expect(isConnectedComponent(diagRes.cells)).toBe(true);

    const farRes = toggleCellInSelection(diagRes.cells, cFar);
    expect(farRes.ok).toBe(false);
    expect(farRes.reason).toBe('NOT_ADJACENT');
  });

  it('bloqueia a 10ª célula (MAX_CELLS_EXCEEDED) e bloqueia remoção que desconecte o bloco (WOULD_DISCONNECT)', () => {
    // Monta linha 1x3
    const c1 = snapCoordToCell(0.25, 0.3, 'T2M');
    const c2 = snapCoordToCell(0.25, 0.9, 'T2M');
    const c3 = snapCoordToCell(0.25, 1.5, 'T2M');

    const line = [c1, c2, c3];
    // Remover c2 (ponte) quebraria [c1, c3] em 2 ilhas
    const removeBridge = toggleCellInSelection(line, c2);
    expect(removeBridge.ok).toBe(false);
    expect(removeBridge.reason).toBe('WOULD_DISCONNECT');

    // Remover ponta c3 mantém conexidade
    const removeTip = toggleCellInSelection(line, c3);
    expect(removeTip.ok).toBe(true);
    expect(removeTip.cells).toHaveLength(2);

    // Preenche 3x3 (9 células) e tenta adicionar a 10ª
    const grid3x3: GridCell[] = [];
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 3; c += 1) {
        grid3x3.push(snapCoordToCell(0.25 + r * 0.5, 0.3 + c * 0.625, 'T2M'));
      }
    }
    expect(grid3x3).toHaveLength(9);

    const tenth = snapCoordToCell(0.25, 0.3 + 3 * 0.625, 'T2M');
    const overLimit = toggleCellInSelection(grid3x3, tenth);
    expect(overLimit.ok).toBe(false);
    expect(overLimit.reason).toBe('MAX_CELLS_EXCEEDED');
  });

  it('gera region_id determinístico independentemente da ordem de clique', () => {
    const c1 = snapCoordToCell(-18.75, -48.4375, 'GWETTOP');
    const c2 = snapCoordToCell(-18.75, -47.8125, 'GWETTOP');

    const regOrderA = buildRegionSelection('A', 'GWETTOP', [c1, c2]);
    const regOrderB = buildRegionSelection('A', 'GWETTOP', [c2, c1]);

    expect(regOrderA.region_id).toBe(regOrderB.region_id);
  });
});
