import { getVariableMetadata } from '../contracts/catalog.ts';
import type {
  BackendCellRef,
  GeoJsonLonLat,
  GridCell,
  LeafletBounds,
  RegionSelection,
  RegionSlot,
  SemanticErrorCode,
  VariableId,
} from '../contracts/types.ts';

export const MAX_CELLS_PER_REGION = 9;

export interface CellToggleResult {
  readonly ok: boolean;
  readonly cells: readonly GridCell[];
  readonly action: 'added' | 'removed' | 'rejected';
  readonly reason?: Extract<
    SemanticErrorCode,
    'MAX_CELLS_EXCEEDED' | 'NOT_ADJACENT' | 'WOULD_DISCONNECT'
  >;
}

/** Arredonda com precisão fixa para evitar ruído de ponto flutuante (ex.: 0.625 * 3). */
function roundCoord(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/** Valida latitude [-90, 90] e longitude [-180, 180] contra NaN/Infinity/inversão. */
export function assertValidLatLon(lat: number, lon: number): void {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error(`Coordenadas inválidas (não finitas): lat=${lat}, lon=${lon}`);
  }
  if (lat < -90 || lat > 90) {
    throw new Error(`Latitude fora do intervalo [-90, 90]: ${lat}`);
  }
  if (lon < -180 || lon > 180) {
    throw new Error(`Longitude fora do intervalo [-180, 180]: ${lon}`);
  }
}

/**
 * Converte um clique (lat, lon) para a célula nativa exata da variável NASA selecionada.
 * Mantém Leaflet em [lat, lon] e anel GeoJSON em [lon, lat].
 */
export function snapCoordToCell(lat: number, lon: number, variableId: VariableId): GridCell {
  assertValidLatLon(lat, lon);

  const meta = getVariableMetadata(variableId);
  const { dLat, dLon } = meta.resolution;
  const { lat0, lon0 } = meta.grid_origin;

  const maxRow = Math.round(180 / dLat) - 1;
  const maxCol = Math.round(360 / dLon) - 1;

  // Clamp no limite superior (+90 / +180) para cair dentro da última célula válida.
  const rawRow = Math.floor((lat - lat0) / dLat);
  const rawCol = Math.floor((lon - lon0) / dLon);
  const row = Math.min(Math.max(rawRow, 0), maxRow);
  const col = Math.min(Math.max(rawCol, 0), maxCol);

  const south = roundCoord(lat0 + row * dLat);
  const north = roundCoord(south + dLat);
  const west = roundCoord(lon0 + col * dLon);
  const east = roundCoord(west + dLon);

  const centerLat = roundCoord(south + dLat / 2);
  const centerLon = roundCoord(west + dLon / 2);

  const boundsLeaflet: LeafletBounds = [
    [south, west],
    [north, east],
  ];

  // GeoJSON exige estritamente [longitude, latitude] com polígono fechado.
  const geojsonRing: readonly GeoJsonLonLat[] = [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];

  return {
    cell_id: `r${row}_c${col}`,
    row,
    col,
    lat: centerLat,
    lon: centerLon,
    bounds_leaflet: boundsLeaflet,
    geojson_ring: geojsonRing,
  };
}

/**
 * Conectividade de 8 vizinhos (ortogonais + diagonais com vértice em comum).
 * Não considera a mesma célula como vizinha de si própria.
 */
export function isAdjacent8(a: Pick<GridCell, 'row' | 'col'>, b: Pick<GridCell, 'row' | 'col'>): boolean {
  const dRow = Math.abs(a.row - b.row);
  const dCol = Math.abs(a.col - b.col);
  return dRow <= 1 && dCol <= 1 && (dRow !== 0 || dCol !== 0);
}

/** Verifica via BFS se todas as células formam um único componente conexo em 8-vizinhos. */
export function isConnectedComponent(cells: readonly GridCell[]): boolean {
  if (cells.length <= 1) {
    return true;
  }

  const visited = new Set<string>();
  const start = cells[0];
  if (!start) {
    return true;
  }

  const queue: GridCell[] = [start];
  visited.add(start.cell_id);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    for (const candidate of cells) {
      if (!visited.has(candidate.cell_id) && isAdjacent8(current, candidate)) {
        visited.add(candidate.cell_id);
        queue.push(candidate);
      }
    }
  }

  return visited.size === cells.length;
}

/**
 * Adiciona ou remove uma célula respeitando:
 * - Teto K <= 9
 * - Adjacência de 8 vizinhos ao adicionar
 * - Manutenção da conexidade ao remover (não permite partir o polígono em 2 ilhas)
 */
export function toggleCellInSelection(
  current: readonly GridCell[],
  target: GridCell,
  maxCells = MAX_CELLS_PER_REGION,
): CellToggleResult {
  const exists = current.some((cell) => cell.cell_id === target.cell_id);

  if (exists) {
    const remaining = current.filter((cell) => cell.cell_id !== target.cell_id);
    if (!isConnectedComponent(remaining)) {
      return {
        ok: false,
        cells: current,
        action: 'rejected',
        reason: 'WOULD_DISCONNECT',
      };
    }
    return {
      ok: true,
      cells: remaining,
      action: 'removed',
    };
  }

  if (current.length >= maxCells) {
    return {
      ok: false,
      cells: current,
      action: 'rejected',
      reason: 'MAX_CELLS_EXCEEDED',
    };
  }

  if (current.length > 0 && !current.some((cell) => isAdjacent8(cell, target))) {
    return {
      ok: false,
      cells: current,
      action: 'rejected',
      reason: 'NOT_ADJACENT',
    };
  }

  return {
    ok: true,
    cells: [...current, target],
    action: 'added',
  };
}

/**
 * Gera um region_id determinístico ordenando os cell_ids, garantindo mesma chave de cache
 * independentemente da ordem em que o usuário clicou nas células.
 */
export function buildRegionSelection(
  slot: RegionSlot,
  variableId: VariableId,
  cells: readonly GridCell[],
): RegionSelection {
  if (cells.length === 0) {
    throw new Error('RegionSelection exige ao menos 1 célula selecionada.');
  }
  if (cells.length > MAX_CELLS_PER_REGION) {
    throw new Error(`RegionSelection excede o limite de ${MAX_CELLS_PER_REGION} células.`);
  }
  if (!isConnectedComponent(cells)) {
    throw new Error('RegionSelection contém células desconexas (exige conectividade de 8 vizinhos).');
  }

  const meta = getVariableMetadata(variableId);
  const sortedCells = [...cells].sort((a, b) => a.cell_id.localeCompare(b.cell_id));
  const regionId = `${meta.source_model}__${sortedCells.map((c) => c.cell_id).join('+')}`;

  return {
    slot,
    region_id: regionId,
    variable_id: variableId,
    source_model: meta.source_model,
    grid_resolution: meta.resolution,
    cells: sortedCells,
  };
}

export function toBackendCells(cells: readonly GridCell[]): readonly BackendCellRef[] {
  return cells.map(({ cell_id, row, col, lat, lon }) => ({
    cell_id,
    row,
    col,
    lat,
    lon,
  }));
}
