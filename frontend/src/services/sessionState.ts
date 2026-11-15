import { getVariableMetadata, isValidVariableId } from '../contracts/catalog';
import type { GridCell, RegionSelection } from '../contracts/types';
import type { TrendMode } from '../bench/benchMeta';
import { MAX_CELLS_PER_REGION } from '../geo/gridGeometry';

export interface PersistedSession {
  readonly variableA: string;
  readonly variableB: string;
  readonly startMonth: string;
  readonly endMonth: string;
  readonly regionA: RegionSelection | null;
  readonly regionB: RegionSelection | null;
  readonly tab: 'map' | 'bench';
  readonly anomaly: boolean;
  readonly separate: boolean;
  readonly dual: boolean;
  readonly trendMode: TrendMode;
  readonly sidebarOpen: boolean;
}

const SESSION_STORAGE_KEY = 'flipflop34:session:v1';
const YEAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const DEFAULT_SESSION: PersistedSession = {
  variableA: 'GWETTOP',
  variableB: 'T2M_MAX',
  startMonth: '',
  endMonth: '',
  regionA: null,
  regionB: null,
  tab: 'map',
  anomaly: false,
  separate: false,
  dual: true,
  trendMode: 'both',
  sidebarOpen: true,
};

function isValidYearMonth(value: unknown): value is string {
  return typeof value === 'string' && YEAR_MONTH_PATTERN.test(value);
}

function isFiniteLat(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90;
}

function isFiniteLon(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180;
}

function isValidGridCell(cell: unknown): cell is GridCell {
  if (!cell || typeof cell !== 'object') return false;
  const candidate = cell as Partial<GridCell>;
  const bounds = candidate.bounds_leaflet;
  return (
    typeof candidate.cell_id === 'string' &&
    candidate.cell_id.length > 0 &&
    isFiniteLat(candidate.lat) &&
    isFiniteLon(candidate.lon) &&
    Array.isArray(bounds) &&
    bounds.length === 2 &&
    Array.isArray(bounds[0]) &&
    bounds[0].length === 2 &&
    isFiniteLat(bounds[0][0]) &&
    isFiniteLon(bounds[0][1]) &&
    Array.isArray(bounds[1]) &&
    bounds[1].length === 2 &&
    isFiniteLat(bounds[1][0]) &&
    isFiniteLon(bounds[1][1])
  );
}

function isValidRegion(value: unknown, expectedSlot: 'A' | 'B'): value is RegionSelection {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RegionSelection>;
  if (
    candidate.slot !== expectedSlot ||
    typeof candidate.region_id !== 'string' ||
    candidate.region_id.length === 0 ||
    typeof candidate.variable_id !== 'string' ||
    !isValidVariableId(candidate.variable_id) ||
    !Array.isArray(candidate.cells) ||
    candidate.cells.length === 0 ||
    candidate.cells.length > MAX_CELLS_PER_REGION
  ) {
    return false;
  }
  const expectedModel = getVariableMetadata(candidate.variable_id).source_model;
  return (
    candidate.source_model === expectedModel &&
    candidate.cells.every(cell => isValidGridCell(cell))
  );
}

function isValidTrendMode(value: unknown): value is TrendMode {
  return value === 'none' || value === 'ols' || value === 'sen' || value === 'both';
}

export function loadPersistedSession(): PersistedSession {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return DEFAULT_SESSION;
    const parsedJson = JSON.parse(raw) as unknown;
    if (!parsedJson || typeof parsedJson !== 'object' || Array.isArray(parsedJson)) {
      return DEFAULT_SESSION;
    }
    const parsed = parsedJson as Partial<PersistedSession>;

    const variableA =
      typeof parsed.variableA === 'string' && (parsed.variableA === '' || isValidVariableId(parsed.variableA))
        ? parsed.variableA
        : DEFAULT_SESSION.variableA;
    const variableB =
      typeof parsed.variableB === 'string' && (parsed.variableB === '' || isValidVariableId(parsed.variableB))
        ? parsed.variableB
        : DEFAULT_SESSION.variableB;

    return {
      variableA,
      variableB,
      startMonth: isValidYearMonth(parsed.startMonth) ? parsed.startMonth : '',
      endMonth: isValidYearMonth(parsed.endMonth) ? parsed.endMonth : '',
      regionA: isValidRegion(parsed.regionA, 'A') && parsed.regionA.variable_id === variableA ? parsed.regionA : null,
      regionB: isValidRegion(parsed.regionB, 'B') && parsed.regionB.variable_id === variableB ? parsed.regionB : null,
      tab: parsed.tab === 'bench' ? 'bench' : 'map',
      anomaly: typeof parsed.anomaly === 'boolean' ? parsed.anomaly : DEFAULT_SESSION.anomaly,
      separate: typeof parsed.separate === 'boolean' ? parsed.separate : DEFAULT_SESSION.separate,
      dual: typeof parsed.dual === 'boolean' ? parsed.dual : DEFAULT_SESSION.dual,
      trendMode: isValidTrendMode(parsed.trendMode) ? parsed.trendMode : DEFAULT_SESSION.trendMode,
      sidebarOpen: typeof parsed.sidebarOpen === 'boolean' ? parsed.sidebarOpen : DEFAULT_SESSION.sidebarOpen,
    };
  } catch {
    return DEFAULT_SESSION;
  }
}

export function savePersistedSession(session: PersistedSession): void {
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Ignore storage quota or private-mode errors
  }
}
