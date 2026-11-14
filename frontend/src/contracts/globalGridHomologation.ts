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

/**
 * Homologa um JSON de grade global ({var_id}_grid.json) segundo o contrato de DADOS-1/2:
 * valida schema + Invariante #3, exige points > 0 e verifica alinhamento do variable_id e trend_unit.
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
      `Arquivo de grade incompatível: esperado variable_id="${resolvedVariableId}", recebido "${validated.variable_id}".`,
    );
  }
  if (validated.points.length === 0) {
    throw new ContractValidationError(
      `Grade global de ${resolvedVariableId} não possui pontos em "points".`,
    );
  }

  const meta = getVariableMetadata(resolvedVariableId);
  if (validated.trend_unit !== meta.trend_unit) {
    throw new ContractValidationError(
      `trend_unit divergente em ${resolvedVariableId}: esperado "${meta.trend_unit}", recebido "${validated.trend_unit}".`,
    );
  }

  return {
    requestedVariableId,
    resolvedVariableId,
    pointsCount: validated.points.length,
    isRealDensity: validated.points.length >= minRealPoints,
    validated,
  };
}

/** Lista única das 12 variáveis NASA POWER esperadas para homologação global + verificação de alias. */
export const HOMOLOGATION_REQUIRED_GRIDS: readonly VariableId[] = CORE_GLOBAL_GRID_VARIABLES;
