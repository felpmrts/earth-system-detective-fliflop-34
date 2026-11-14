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

/** Arredonda para 4 casas decimais e normaliza -0 para +0 (paridade com data/connectors/base.py). */
function roundCoord4(value: number): number {
  const rounded = Math.round(value * 10_000) / 10_000;
  return rounded === 0 ? 0 : rounded;
}

/** Normaliza -0 para +0 em índices inteiros (evita cell_id "r-0_c0"). */
function normInt(value: number): number {
  return value === 0 ? 0 : value;
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
 * Converte um clique (lat, lon) para a célula nativa exata da variável NASA selecionada,
 * seguindo estritamente NASA_POWER_API_SPECS.md Seção 6 (e data/connectors/base.py):
 * - MERRA-2 (0.5° × 0.625°): round(lat / 0.5) * 0.5 e round(lon / 0.625) * 0.625
 * - CERES_SYN1deg (1.0° × 1.0°): floor(lat) + 0.5 e floor(lon) + 0.5
 * Mantém Leaflet em [lat, lon] e anel GeoJSON em [lon, lat].
 */
export function snapCoordToCell(lat: number, lon: number, variableId: VariableId): GridCell {
  assertValidLatLon(lat, lon);

  const meta = getVariableMetadata(variableId);
  const { dLat, dLon } = meta.resolution;

  let row: number;
  let col: number;
  let centerLat: number;
  let centerLon: number;

  if (meta.source_model === 'CERES_SYN1deg') {
    const safeLat = Math.min(lat, 89.9999);
    const safeLon = Math.min(lon, 179.9999);
    row = normInt(Math.floor(safeLat));
    col = normInt(Math.floor(safeLon));
    centerLat = roundCoord4(row + 0.5);
    centerLon = roundCoord4(col + 0.5);
  } else {
    row = normInt(Math.round(lat / dLat));
    col = normInt(Math.round(lon / dLon));
    centerLat = roundCoord4(row * dLat);
    centerLon = roundCoord4(col * dLon);
  }

  const south = Math.max(-90, roundCoord4(centerLat - dLat / 2));
  const north = Math.min(90, roundCoord4(centerLat + dLat / 2));
  const west = Math.max(-180, roundCoord4(centerLon - dLon / 2));
  const east = Math.min(180, roundCoord4(centerLon + dLon / 2));

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
 * Quando o usuário troca a variável do slot A ou B:
 * - Se o modelo/resolução mudou (ex.: MERRA-2 <-> CERES), limpa a seleção para evitar
 *   polígonos de 0.5°×0.625° misturados com 1.0°×1.0°.
 * - Se a resolução permanece a mesma, preserva as células já selecionadas.
 */
export function reconcileCellsOnVariableChange(
  previousVar: VariableId | null,
  nextVar: VariableId | null,
  currentCells: readonly GridCell[],
): { readonly cells: readonly GridCell[]; readonly clearedForResolutionChange: boolean } {
  if (!nextVar || currentCells.length === 0) {
    return { cells: nextVar ? currentCells : [], clearedForResolutionChange: false };
  }
  if (!previousVar) {
    return { cells: currentCells, clearedForResolutionChange: false };
  }

  const prevRes = getVariableMetadata(previousVar).resolution;
  const nextRes = getVariableMetadata(nextVar).resolution;
  const sameResolution = prevRes.dLat === nextRes.dLat && prevRes.dLon === nextRes.dLon;

  if (!sameResolution) {
    return { cells: [], clearedForResolutionChange: true };
  }
  return { cells: currentCells, clearedForResolutionChange: false };
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
