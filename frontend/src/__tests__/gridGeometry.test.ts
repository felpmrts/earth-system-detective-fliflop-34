import { describe, expect, it } from 'vitest';
import {
  buildRegionSelection,
  clampLatLon,
  isAdjacent8,
  isConnectedComponent,
  MAX_CELLS_PER_REGION,
  mirrorRegionSelection,
  selectCellsInBoundingBox,
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

  it('bloqueia a 26ª célula (MAX_CELLS_EXCEEDED) e bloqueia remoção que desconecte o bloco (WOULD_DISCONNECT)', () => {
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

    // Preenche 5x5 (25 células) e tenta adicionar a 26ª
    const grid5x5: GridCell[] = [];
    for (let r = 0; r < 5; r += 1) {
      for (let c = 0; c < 5; c += 1) {
        grid5x5.push(snapCoordToCell(0.25 + r * 0.5, 0.3 + c * 0.625, 'T2M'));
      }
    }
    expect(grid5x5).toHaveLength(MAX_CELLS_PER_REGION);

    const twentySixth = snapCoordToCell(0.25, 0.3 + 5 * 0.625, 'T2M');
    const overLimit = toggleCellInSelection(grid5x5, twentySixth);
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

  it('converte bounding box para células nativas MERRA-2 e CERES mantendo conexidade', () => {
    // Caixa pequena MERRA-2 (2 linhas × 2 colunas = 4 células)
    const merraBox = selectCellsInBoundingBox(
      { lat: -19.0, lon: -48.75 },
      { lat: -18.5, lon: -48.125 },
      'T2M',
    );
    expect(merraBox.wasClamped).toBe(false);
    expect(merraBox.totalInBox).toBe(4);
    expect(merraBox.cells).toHaveLength(4);
    expect(isConnectedComponent(merraBox.cells)).toBe(true);
    expect(buildRegionSelection('A', 'T2M', merraBox.cells).cells).toHaveLength(4);

    // Caixa CERES_SYN1deg (2° × 3° = 6 células 1.0° × 1.0°)
    const ceresBox = selectCellsInBoundingBox(
      { lat: -3.2, lon: -60.2 },
      { lat: -2.2, lon: -58.2 },
      'CLOUD_AMT',
    );
    expect(ceresBox.wasClamped).toBe(false);
    expect(ceresBox.totalInBox).toBe(6);
    expect(ceresBox.cells).toHaveLength(6);
    expect(isConnectedComponent(ceresBox.cells)).toBe(true);
    expect(buildRegionSelection('B', 'CLOUD_AMT', ceresBox.cells).source_model).toBe('CERES_SYN1deg');
  });

  it('limita bounding box grande às 9 células conexas mais próximas do ponto inicial do arraste', () => {
    // Caixa grande em MERRA-2 arrastada do nordeste para sudoeste
    const startNE = { lat: -15.0, lon: -45.0 };
    const endSW = { lat: -22.0, lon: -53.0 };
    const clamped = selectCellsInBoundingBox(startNE, endSW, 'GWETTOP');

    expect(clamped.wasClamped).toBe(true);
    expect(clamped.totalInBox).toBeGreaterThan(MAX_CELLS_PER_REGION);
    expect(clamped.cells).toHaveLength(MAX_CELLS_PER_REGION);
    expect(isConnectedComponent(clamped.cells)).toBe(true);

    const anchor = snapCoordToCell(startNE.lat, startNE.lon, 'GWETTOP');
    expect(clamped.cells.some(c => c.cell_id === anchor.cell_id)).toBe(true);

    // Nenhuma célula selecionada deve estar mais longe do ponto inicial do que o quadrado 3x3 esperado
    const region = buildRegionSelection('A', 'GWETTOP', clamped.cells);
    expect(region.cells).toHaveLength(MAX_CELLS_PER_REGION);

    // Caixa gigante em CERES também respeita K <= MAX_CELLS_PER_REGION e mantém ponto inicial
    const ceresStart = { lat: -10.5, lon: -70.5 };
    const ceresClamped = selectCellsInBoundingBox(
      ceresStart,
      { lat: 5.5, lon: -50.5 },
      'ALLSKY_SFC_SW_DWN',
    );
    expect(ceresClamped.wasClamped).toBe(true);
    expect(ceresClamped.cells).toHaveLength(MAX_CELLS_PER_REGION);
    expect(isConnectedComponent(ceresClamped.cells)).toBe(true);
    const ceresAnchor = snapCoordToCell(ceresStart.lat, ceresStart.lon, 'ALLSKY_SFC_SW_DWN');
    expect(ceresClamped.cells.some(c => c.cell_id === ceresAnchor.cell_id)).toBe(true);
  });

  it('normaliza coordenadas fora de faixa durante arraste livre sem lançar erro', () => {
    expect(clampLatLon(98, -210)).toEqual({ lat: 90, lon: -180 });
    expect(clampLatLon(12, 195)).toEqual({ lat: 12, lon: 180 });
    expect(clampLatLon(-120, 540)).toEqual({ lat: -90, lon: 180 });
    expect(clampLatLon(Number.NaN, Number.POSITIVE_INFINITY)).toEqual({ lat: 0, lon: 0 });

    const extreme = clampLatLon(-10, -245);
    expect(() => snapCoordToCell(extreme.lat, extreme.lon, 'T2M')).not.toThrow();

    const clampedBox = selectCellsInBoundingBox(
      { lat: -95, lon: -185 },
      { lat: -88, lon: -178 },
      'T2M',
    );
    expect(clampedBox.cells.length).toBeGreaterThanOrEqual(1);
    expect(clampedBox.cells.length).toBeLessThanOrEqual(MAX_CELLS_PER_REGION);
    expect(isConnectedComponent(clampedBox.cells)).toBe(true);
  });

  it('AUD-07: preserva conexidade e teto MAX_CELLS_PER_REGION no re-snap côncavo (U-shape) entre CERES e MERRA-2/MODIS', () => {
    // Monta seleção em formato U no CERES_SYN1deg (1.0° × 1.0°), com 16 células conexas e miolo vazio
    const ceresU: GridCell[] = [
      // Braço esquerdo (6 células: lat -5.5 .. -10.5, lon -60.5)
      snapCoordToCell(-5.5, -60.5, 'ALLSKY_SFC_SW_DWN'),
      snapCoordToCell(-6.5, -60.5, 'ALLSKY_SFC_SW_DWN'),
      snapCoordToCell(-7.5, -60.5, 'ALLSKY_SFC_SW_DWN'),
      snapCoordToCell(-8.5, -60.5, 'ALLSKY_SFC_SW_DWN'),
      snapCoordToCell(-9.5, -60.5, 'ALLSKY_SFC_SW_DWN'),
      snapCoordToCell(-10.5, -60.5, 'ALLSKY_SFC_SW_DWN'),
      // Base horizontal (4 células: lat -10.5, lon -59.5 .. -56.5)
      snapCoordToCell(-10.5, -59.5, 'ALLSKY_SFC_SW_DWN'),
      snapCoordToCell(-10.5, -58.5, 'ALLSKY_SFC_SW_DWN'),
      snapCoordToCell(-10.5, -57.5, 'ALLSKY_SFC_SW_DWN'),
      snapCoordToCell(-10.5, -56.5, 'ALLSKY_SFC_SW_DWN'),
      // Braço direito (6 células até -5.5, lon -56.5)
      snapCoordToCell(-9.5, -56.5, 'ALLSKY_SFC_SW_DWN'),
      snapCoordToCell(-8.5, -56.5, 'ALLSKY_SFC_SW_DWN'),
      snapCoordToCell(-7.5, -56.5, 'ALLSKY_SFC_SW_DWN'),
      snapCoordToCell(-6.5, -56.5, 'ALLSKY_SFC_SW_DWN'),
      snapCoordToCell(-5.5, -56.5, 'ALLSKY_SFC_SW_DWN'),
    ];
    expect(isConnectedComponent(ceresU)).toBe(true);

    const sourceRegion = buildRegionSelection('A', 'ALLSKY_SFC_SW_DWN', ceresU);
    const mirroredMerra = mirrorRegionSelection(sourceRegion, 'B', 'T2M');
    const mirroredModis = mirrorRegionSelection(sourceRegion, 'B', 'LST_Day_CMG');

    expect(MAX_CELLS_PER_REGION).toBe(25);
    expect(mirroredMerra.source_model).toBe('MERRA-2');
    expect(mirroredMerra.cells).toHaveLength(MAX_CELLS_PER_REGION);
    expect(isConnectedComponent(mirroredMerra.cells)).toBe(true);

    expect(mirroredModis.source_model).toBe('MODIS_AppEEARS');
    expect(mirroredModis.cells).toHaveLength(MAX_CELLS_PER_REGION);
    expect(isConnectedComponent(mirroredModis.cells)).toBe(true);

    // O centroide geométrico do U cai no vazio central, fora do contorno re-snapped
    const avgLat = ceresU.reduce((s, c) => s + c.lat, 0) / ceresU.length;
    const avgLon = ceresU.reduce((s, c) => s + c.lon, 0) / ceresU.length;
    const emptyHoleMerra = snapCoordToCell(avgLat, avgLon, 'T2M');
    const emptyHoleModis = snapCoordToCell(avgLat, avgLon, 'LST_Day_CMG');
    expect(mirroredMerra.cells.some(c => c.cell_id === emptyHoleMerra.cell_id)).toBe(false);
    expect(mirroredModis.cells.some(c => c.cell_id === emptyHoleModis.cell_id)).toBe(false);
  });
});
