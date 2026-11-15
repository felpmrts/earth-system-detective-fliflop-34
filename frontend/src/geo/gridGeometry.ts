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

export const MAX_CELLS_PER_REGION = 25;

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
  const rounded = Math.round(value * 10_000) / 10_000;
  return rounded === 0 ? 0 : rounded;
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

function buildCellFromRowCol(rawRow: number, rawCol: number, variableId: VariableId): GridCell {
  const meta = getVariableMetadata(variableId);
  const { dLat, dLon } = meta.resolution;
  const row = rawRow === 0 ? 0 : rawRow;
  const col = rawCol === 0 ? 0 : rawCol;

  const centerLat = meta.source_model === 'CERES_SYN1deg'
    ? roundCoord(row + 0.5)
    : roundCoord(row * dLat);
  const centerLon = meta.source_model === 'CERES_SYN1deg'
    ? roundCoord(col + 0.5)
    : roundCoord(col * dLon);

  const south = Math.max(-90, roundCoord(centerLat - dLat / 2));
  const north = Math.min(90, roundCoord(centerLat + dLat / 2));
  const west = Math.max(-180, roundCoord(centerLon - dLon / 2));
  const east = Math.min(180, roundCoord(centerLon + dLon / 2));

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
 * Converte um clique (lat, lon) para a célula nativa exata da variável NASA selecionada.
 * Mantém Leaflet em [lat, lon] e anel GeoJSON em [lon, lat].
 */
export function snapCoordToCell(lat: number, lon: number, variableId: VariableId): GridCell {
  assertValidLatLon(lat, lon);

  const meta = getVariableMetadata(variableId);
  const { dLat, dLon } = meta.resolution;

  // Mantém paridade com data/connectors/base.py e NASA_POWER_API_SPECS.md.
  if (meta.source_model === 'CERES_SYN1deg') {
    const row = Math.floor(Math.min(lat, 89.9999));
    const col = Math.floor(Math.min(lon, 179.9999));
    return buildCellFromRowCol(row, col, variableId);
  }

  const row = Math.round(lat / dLat);
  const col = Math.round(lon / dLon);
  return buildCellFromRowCol(row, col, variableId);
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

function deduplicateCells(cells: readonly GridCell[]): GridCell[] {
  const unique = new Map<string, GridCell>();
  for (const cell of cells) {
    unique.set(cell.cell_id, cell);
  }
  return [...unique.values()];
}

function computeCentroid(cells: readonly GridCell[]): { readonly lat: number; readonly lon: number } {
  let latSum = 0;
  let lonSum = 0;
  for (const cell of cells) {
    latSum += cell.lat;
    lonSum += cell.lon;
  }
  return {
    lat: latSum / cells.length,
    lon: lonSum / cells.length,
  };
}

function bridgeSourceMidpoints(
  sourceCells: readonly GridCell[],
  snappedCells: readonly GridCell[],
  targetVariableId: VariableId,
): GridCell[] {
  const bridged = [...snappedCells];
  for (let i = 0; i < sourceCells.length; i += 1) {
    const a = sourceCells[i];
    if (!a) continue;
    for (let j = i + 1; j < sourceCells.length; j += 1) {
      const b = sourceCells[j];
      if (!b || !isAdjacent8(a, b)) continue;
      bridged.push(snapCoordToCell((a.lat + b.lat) / 2, (a.lon + b.lon) / 2, targetVariableId));
    }
  }
  return deduplicateCells(bridged);
}

/** Constrói componente conexo até MAX_CELLS_PER_REGION priorizando células mais próximas do centroide. */
function selectConnectedCore(
  candidates: readonly GridCell[],
  centroid: { readonly lat: number; readonly lon: number },
  seedCell: GridCell,
  maxCells = MAX_CELLS_PER_REGION,
): GridCell[] {
  const distSq = (cell: GridCell) =>
    (cell.lat - centroid.lat) ** 2 + (cell.lon - centroid.lon) ** 2;
  const sortedPool = deduplicateCells([seedCell, ...candidates]).sort((a, b) => distSq(a) - distSq(b));
  const seed = sortedPool[0] ?? seedCell;
  const chosen: GridCell[] = [seed];
  const chosenIds = new Set<string>([seed.cell_id]);

  while (chosen.length < maxCells) {
    const nextCell = sortedPool.find(
      candidate =>
        !chosenIds.has(candidate.cell_id) && chosen.some(existing => isAdjacent8(existing, candidate)),
    );
    if (!nextCell) break;
    chosen.push(nextCell);
    chosenIds.add(nextCell.cell_id);
  }
  return chosen;
}

/**
 * Espelha uma seleção válida para outra variável/slot.
 * Se o modelo nativo diferir (ex.: MERRA-2 <-> CERES_SYN1deg), faz re-snap dos centroides
 * para a grade nativa da variável alvo com deduplicação e garantia de conexidade (K <= 9).
 */
export function mirrorRegionSelection(
  sourceRegion: RegionSelection,
  targetSlot: RegionSlot,
  targetVariableId: VariableId,
): RegionSelection {
  const targetMeta = getVariableMetadata(targetVariableId);
  if (sourceRegion.source_model === targetMeta.source_model) {
    return buildRegionSelection(targetSlot, targetVariableId, sourceRegion.cells);
  }

  const directSnapped = deduplicateCells(
    sourceRegion.cells.map(cell => snapCoordToCell(cell.lat, cell.lon, targetVariableId)),
  );
  if (directSnapped.length <= MAX_CELLS_PER_REGION && isConnectedComponent(directSnapped)) {
    return buildRegionSelection(targetSlot, targetVariableId, directSnapped);
  }

  // Em CERES (1.0°) -> MERRA-2 (0.5°×0.625°), células adjacentes podem deixar lacunas de 1 passo;
  // preenchemos pontos médios e garantimos componente conexo centrado até o teto K <= 9.
  const bridged = bridgeSourceMidpoints(sourceRegion.cells, directSnapped, targetVariableId);
  if (bridged.length <= MAX_CELLS_PER_REGION && isConnectedComponent(bridged)) {
    return buildRegionSelection(targetSlot, targetVariableId, bridged);
  }

  const centroid = computeCentroid(sourceRegion.cells);
  const seedCell = snapCoordToCell(centroid.lat, centroid.lon, targetVariableId);
  const core = selectConnectedCore(bridged, centroid, seedCell);
  return buildRegionSelection(targetSlot, targetVariableId, core);
}

export interface LatLonCoord {
  readonly lat: number;
  readonly lon: number;
}

export interface BoundingBoxSelectionResult {
  readonly cells: readonly GridCell[];
  readonly totalInBox: number;
  readonly wasClamped: boolean;
}

/** Garante coordenadas finitas dentro do domínio [-90, 90] × [-180, 180] durante arraste livre no mapa. */
export function clampLatLon(lat: number, lon: number): LatLonCoord {
  return {
    lat: Number.isFinite(lat) ? Math.max(-90, Math.min(90, lat)) : 0,
    lon: Number.isFinite(lon) ? Math.max(-180, Math.min(180, lon)) : 0,
  };
}

/**
 * Converte uma caixa arrastada (ponto inicial -> ponto final) nas células nativas da variável.
 * Se a área abranger mais de MAX_CELLS_PER_REGION (9) células, limita automaticamente às 9 mais
 * próximas do ponto inicial do arraste mantendo componente conexo em 8-vizinhos.
 */
export function selectCellsInBoundingBox(
  startCoord: LatLonCoord,
  endCoord: LatLonCoord,
  variableId: VariableId,
  maxCells = MAX_CELLS_PER_REGION,
): BoundingBoxSelectionResult {
  const start = clampLatLon(startCoord.lat, startCoord.lon);
  const end = clampLatLon(endCoord.lat, endCoord.lon);

  const south = Math.min(start.lat, end.lat);
  const north = Math.max(start.lat, end.lat);
  const west = Math.min(start.lon, end.lon);
  const east = Math.max(start.lon, end.lon);

  const swCell = snapCoordToCell(south, west, variableId);
  const neCell = snapCoordToCell(north, east, variableId);
  const anchorCell = snapCoordToCell(start.lat, start.lon, variableId);

  const totalInBox = (neCell.row - swCell.row + 1) * (neCell.col - swCell.col + 1);
  const rowStart = Math.max(swCell.row, anchorCell.row - maxCells);
  const rowEnd = Math.min(neCell.row, anchorCell.row + maxCells);
  const colStart = Math.max(swCell.col, anchorCell.col - maxCells);
  const colEnd = Math.min(neCell.col, anchorCell.col + maxCells);

  const candidates: GridCell[] = [];
  for (let row = rowStart; row <= rowEnd; row += 1) {
    for (let col = colStart; col <= colEnd; col += 1) {
      candidates.push(buildCellFromRowCol(row, col, variableId));
    }
  }

  if (totalInBox <= maxCells) {
    return {
      cells: candidates,
      totalInBox,
      wasClamped: false,
    };
  }

  const clampedCells = selectConnectedCore(candidates, start, anchorCell, maxCells);
  return {
    cells: clampedCells,
    totalInBox,
    wasClamped: true,
  };
}
