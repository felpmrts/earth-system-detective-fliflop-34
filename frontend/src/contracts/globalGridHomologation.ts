import {
  CORE_GLOBAL_GRID_VARIABLES,
  getVariableMetadata,
  resolveGridVariableId,
} from './catalog.ts';
import { ContractValidationError, validateGlobalGrid } from './contractValidator.ts';
import type { GlobalGridFile, VariableId } from './types.ts';

export interface GridHomologationReport {
  readonly requestedVariableId: VariableId;
  readonly resolvedVariableId: VariableId;
  readonly pointsCount: number;
  readonly isRealDensity: boolean;
  readonly validated: GlobalGridFile;
}

function normalizeTrendUnit(unit: string): string {
  return unit
    .replaceAll('década', 'decade')
    .replaceAll('dia', 'day')
    .replaceAll('mês', 'month')
    .replaceAll('fração', 'fraction');
}

/**
 * Homologates a global grid JSON ({var_id}_grid.json) according to the DATA-1/2 contract:
 * validates schema + Invariant #3, requires points > 0, and verifies variable_id and trend_unit alignment.
 */
export function validateHomologatedGrid(
  requestedVariableId: VariableId,
  rawPayload: unknown,
  minRealPoints = 100,
): GridHomologationReport {
  const resolvedVariableId = resolveGridVariableId(requestedVariableId);
  const validated = validateGlobalGrid(rawPayload);
  if (validated.variable_id !== resolvedVariableId) {
    throw new ContractValidationError(
      `Incompatible grid file: expected variable_id="${resolvedVariableId}", received "${validated.variable_id}".`,
    );
  }
  if (validated.points.length === 0) {
    throw new ContractValidationError(
      `Global grid for ${resolvedVariableId} has no points in "points".`,
    );
  }

  const meta = getVariableMetadata(resolvedVariableId);
  if (normalizeTrendUnit(validated.trend_unit) !== normalizeTrendUnit(meta.trend_unit)) {
    throw new ContractValidationError(
      `Mismatched trend_unit in ${resolvedVariableId}: expected "${meta.trend_unit}", received "${validated.trend_unit}".`,
    );
  }

  const normalizedGrid = validated.trend_unit === meta.trend_unit
    ? validated
    : { ...validated, trend_unit: meta.trend_unit };

  return {
    requestedVariableId,
    resolvedVariableId,
    pointsCount: validated.points.length,
    isRealDensity: validated.points.length >= minRealPoints,
    validated: normalizedGrid,
  };
}

/** Canonical list of the 12 NASA POWER variables expected for global homologation + alias verification. */
export const HOMOLOGATION_REQUIRED_GRIDS: readonly VariableId[] = CORE_GLOBAL_GRID_VARIABLES;
