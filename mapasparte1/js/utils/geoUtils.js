/**
 * geoUtils.js — Snapping Nativo NASA, Geometria em 8-Vizinhos (K <= 9) e Regiões Conexas
 * Em conformidade estrita com CONTRATO_DE_DADOS.md e NASA_POWER_API_SPECS.md
 */
import { getVariableMetadata } from '../catalog.js';

export const MAX_CELLS_PER_REGION = 9;

export function assertValidLatLon(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number' || Number.isNaN(lat) || Number.isNaN(lon)) {
    throw new Error(`Coordenadas inválidas: lat=${lat}, lon=${lon}`);
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new Error(`Coordenadas geográficas fora dos limites [-90,90]/[-180,180]: lat=${lat}, lon=${lon}`);
  }
}

/**
 * Snapping geográfico conforme NASA_POWER_API_SPECS.md Seção 6:
 * - MERRA-2 (0.5° × 0.625°): round(coord / step) * step (4 casas decimais)
 * - CERES (1.0° × 1.0°, centros em meio-grau): floor(coord) + 0.5
 * Retorna bounds_leaflet em [lat, lon] e geojson_ring em [lon, lat].
 */
export function snapCoordToCell(lat, lon, variableId) {
  assertValidLatLon(lat, lon);
  const meta = getVariableMetadata(variableId);
  const { dLat, dLon } = meta.resolution;

  let row;
  let col;
  let cellLat;
  let cellLon;

  if (meta.source_model === 'CERES_SYN1deg') {
    // Clamping leve para evitar lat=90 gerar +90.5 ou lon=180 gerar +180.5
    const safeLat = Math.min(lat, 89.9999);
    const safeLon = Math.min(lon, 179.9999);
    row = Math.floor(safeLat);
    col = Math.floor(safeLon);
    cellLat = Number((row + 0.5).toFixed(4));
    cellLon = Number((col + 0.5).toFixed(4));
  } else {
    row = Math.round(lat / dLat);
    col = Math.round(lon / dLon);
    cellLat = Number((row * dLat).toFixed(4));
    cellLon = Number((col * dLon).toFixed(4));
  }

  const south = Number((cellLat - dLat / 2).toFixed(4));
  const north = Number((cellLat + dLat / 2).toFixed(4));
  const west = Number((cellLon - dLon / 2).toFixed(4));
  const east = Number((cellLon + dLon / 2).toFixed(4));

  return {
    cell_id: `r${row}_c${col}`,
    row,
    col,
    lat: cellLat,
    lon: cellLon,
    bounds_leaflet: [
      [south, west],
      [north, east]
    ],
    geojson_ring: [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south]
    ]
  };
}

export function isAdjacent8(a, b) {
  return Math.abs(a.row - b.row) <= 1 && Math.abs(a.col - b.col) <= 1;
}

export function isConnectedComponent(cells) {
  if (cells.length <= 1) return true;

  const visited = new Set();
  const queue = [cells[0]];
  visited.add(cells[0].cell_id);

  while (queue.length > 0) {
    const current = queue.shift();
    for (const other of cells) {
      if (!visited.has(other.cell_id) && isAdjacent8(current, other)) {
        visited.add(other.cell_id);
        queue.push(other);
      }
    }
  }

  return visited.size === cells.length;
}

export function toggleCellInSelection(current, target, maxCells = MAX_CELLS_PER_REGION) {
  const existingIndex = current.findIndex(c => c.cell_id === target.cell_id);

  // Remoção
  if (existingIndex >= 0) {
    if (current.length === 1) {
      return { ok: true, cells: [], action: 'removed' };
    }
    const remaining = current.filter((_, idx) => idx !== existingIndex);
    if (!isConnectedComponent(remaining)) {
      return { ok: false, error: 'WOULD_DISCONNECT' };
    }
    return { ok: true, cells: remaining, action: 'removed' };
  }

  // Inserção
  if (current.length >= maxCells) {
    return { ok: false, error: 'MAX_CELLS_EXCEEDED' };
  }

  if (current.length > 0) {
    const touchesAny = current.some(c => isAdjacent8(c, target));
    if (!touchesAny) {
      return { ok: false, error: 'NOT_ADJACENT' };
    }
  }

  return { ok: true, cells: [...current, target], action: 'added' };
}

/**
 * Constrói o payload de seleção padronizado com region_id determinístico ordenado lexicograficamente
 */
export function buildRegionSelection(slot, variableId, cells) {
  const meta = getVariableMetadata(variableId);
  const sortedCells = [...cells].sort((a, b) => a.cell_id.localeCompare(b.cell_id));
  const region_id = `${meta.source_model}__${sortedCells.map(c => c.cell_id).join('+')}`;

  return {
    slot,
    region_id,
    source_model: meta.source_model,
    grid_resolution: meta.resolution,
    cells: sortedCells
  };
}

/**
 * Escala de referência aproximada por tipo de variável para normalização visual (Fluxo A)
 */
function getVisualScaleReference(variableId) {
  const refMap = {
    T2M: 0.6,
    T2M_MAX: 0.6,
    T2M_MIN: 0.6,
    PRECTOTCORR: 25.0,
    GWETTOP: 0.05,
    GWETROOT: 0.05,
    RH2M: 3.0,
    WS10M: 0.4,
    PS: 0.3,
    ALLSKY_SFC_SW_DWN: 1.0,
    CLDTOT: 4.0,
    ALLSKY_SFC_LW_DWN: 1.0
  };
  return refMap[variableId] || 1.0;
}

/**
 * Dimensão Visual 1 (Direção & Polaridade Física por Variável)
 */
export function calculateTrendColor(slope, variableId = 'T2M') {
  const meta = getVariableMetadata(variableId);
  const scaleRef = getVisualScaleReference(variableId);
  const norm = Math.max(-1, Math.min(1, slope / scaleRef));

  // Variáveis térmicas/intervalares: positivo = aquecimento (vermelho/laranja), negativo = resfriamento (azul)
  if (meta.scale_type === 'interval' || variableId === 'ALLSKY_SFC_SW_DWN' || variableId === 'ALLSKY_SFC_LW_DWN') {
    if (norm >= 0.5) return '#ff3d00';
    if (norm > 0.1) return '#ff9100';
    if (norm >= -0.1) return '#ffd600';
    if (norm > -0.5) return '#40c4ff';
    return '#2979ff';
  }

  // Variáveis hídricas/umidade/nuvens: positivo = umedecimento (azul), negativo = secagem (vermelho/laranja)
  if (norm >= 0.5) return '#2979ff';
  if (norm > 0.1) return '#00b0ff';
  if (norm >= -0.1) return '#ffd600';
  if (norm > -0.5) return '#ff9100';
  return '#ff3d00';
}

/**
 * Dimensão Visual 2 (Magnitude proporcional a |slope|)
 */
export function calculatePointRadius(slope, variableId = 'T2M') {
  const scaleRef = getVisualScaleReference(variableId);
  const normAbs = Math.min(1.5, Math.abs(slope) / scaleRef);
  return Number((5 + normAbs * 6).toFixed(2)); // 5px a 14px
}
