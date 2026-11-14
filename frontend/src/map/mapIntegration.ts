import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getIntersectingDateBounds, getVariableMetadata } from '../contracts/catalog.ts';
import type {
  GlobalGridFile,
  GridCell,
  MapNotification,
  MapViewContractProps,
  RegionAnalysisResponse,
  RegionSlot,
  SemanticErrorCode,
  VariableId,
} from '../contracts/types.ts';
import {
  buildRegionSelection,
  reconcileCellsOnVariableChange,
  snapCoordToCell,
  toggleCellInSelection,
} from '../geo/gridGeometry.ts';
import {
  getGlobalGrid as defaultGetGlobalGrid,
  getRegionData as defaultGetRegionData,
  SemanticApiError,
  type GetRegionDataParams,
} from '../services/regionDataAdapter.ts';

export interface MapSelectionState {
  readonly activeSlot: RegionSlot;
  readonly variableA: VariableId | null;
  readonly variableB: VariableId | null;
  readonly cellsA: readonly GridCell[];
  readonly cellsB: readonly GridCell[];
  readonly lastNotification: MapNotification | null;
}

const SELECTION_ERROR_MESSAGES: Readonly<Record<SemanticErrorCode, string>> = {
  MAX_CELLS_EXCEEDED: 'Limite máximo de 9 células adjacentes atingido para este local.',
  NOT_ADJACENT: 'A célula clicada precisa ser adjacente (8 vizinhos) à seleção atual.',
  WOULD_DISCONNECT: 'Remover esta célula quebraria a conectividade contígua da região.',
  OCEAN_MASK_NO_DATA: 'Célula oceânica ou sem cobertura terrestre válida para esta variável.',
  INVALID_DATE_INTERSECTION: 'Intervalo de datas sem sobreposição entre as variáveis escolhidas.',
  CONTRACT_VIOLATION: 'Os dados retornados não correspondem ao contrato da API.',
  BACKEND_UNAVAILABLE: 'Backend indisponível no momento.',
};

export function createInitialMapSelectionState(
  initial: Partial<Pick<MapSelectionState, 'activeSlot' | 'variableA' | 'variableB'>> = {},
): MapSelectionState {
  return {
    activeSlot: initial.activeSlot ?? 'A',
    variableA: initial.variableA === undefined ? 'T2M' : initial.variableA,
    variableB: initial.variableB === undefined ? 'T2M' : initial.variableB,
    cellsA: [],
    cellsB: [],
    lastNotification: null,
  };
}

export function applyCellToggle(
  state: MapSelectionState,
  slot: RegionSlot,
  lat: number,
  lon: number,
): MapSelectionState {
  const variableId = slot === 'A' ? state.variableA : state.variableB;
  if (!variableId) {
    return {
      ...state,
      lastNotification: {
        level: 'warn',
        message: `Selecione uma variável para o Local ${slot} antes de escolher células no mapa.`,
      },
    };
  }

  const currentCells = slot === 'A' ? state.cellsA : state.cellsB;
  const snapped = snapCoordToCell(lat, lon, variableId);
  const toggleResult = toggleCellInSelection(currentCells, snapped);

  if (!toggleResult.ok) {
    const code = toggleResult.reason ?? 'NOT_ADJACENT';
    return {
      ...state,
      lastNotification: {
        code,
        level: 'warn',
        message: SELECTION_ERROR_MESSAGES[code],
      },
    };
  }

  return slot === 'A'
    ? { ...state, cellsA: toggleResult.cells, lastNotification: null }
    : { ...state, cellsB: toggleResult.cells, lastNotification: null };
}

export function applyClearSlot(state: MapSelectionState, slot: RegionSlot): MapSelectionState {
  return slot === 'A'
    ? { ...state, cellsA: [], lastNotification: null }
    : { ...state, cellsB: [], lastNotification: null };
}

export function applySlotVariableChange(
  state: MapSelectionState,
  slot: RegionSlot,
  nextVariable: VariableId | null,
): MapSelectionState {
  const prevVariable = slot === 'A' ? state.variableA : state.variableB;
  const currentCells = slot === 'A' ? state.cellsA : state.cellsB;
  const reconciled = reconcileCellsOnVariableChange(prevVariable, nextVariable, currentCells);

  let notification: MapNotification | null = null;
  if (reconciled.clearedForResolutionChange && nextVariable) {
    const nextMeta = getVariableMetadata(nextVariable);
    notification = {
      level: 'info',
      message: `Seleção do Local ${slot} limpa devido à mudança de grade nativa para ${nextMeta.resolution.dLat.toFixed(1)}° × ${nextMeta.resolution.dLon}° (${nextMeta.source_model}).`,
    };
  }

  return slot === 'A'
    ? {
        ...state,
        variableA: nextVariable,
        cellsA: reconciled.cells,
        lastNotification: notification,
      }
    : {
        ...state,
        variableB: nextVariable,
        cellsB: reconciled.cells,
        lastNotification: notification,
      };
}

/**
 * Monta o payload pronto para `getRegionData()` sem executar nenhum cálculo estatístico no browser.
 * Retorna `null` enquanto o Local A não possuir variável e ao menos 1 célula selecionada.
 */
export function buildAnalyzeRequestInput(
  state: MapSelectionState,
  options: { readonly startDate?: string; readonly endDate?: string } = {},
): GetRegionDataParams | null {
  if (!state.variableA || state.cellsA.length === 0) {
    return null;
  }

  const hasValidRegionB = Boolean(state.variableB && state.cellsB.length > 0);
  const variableB = hasValidRegionB ? state.variableB : null;
  const bounds = getIntersectingDateBounds(state.variableA, variableB);

  const region = buildRegionSelection('A', state.variableA, state.cellsA);
  const regionB =
    hasValidRegionB && state.variableB
      ? buildRegionSelection('B', state.variableB, state.cellsB)
      : null;

  return {
    variable: state.variableA,
    variableB,
    region,
    regionB,
    startDate: options.startDate ?? bounds.startDate,
    endDate: options.endDate ?? bounds.endDate,
  };
}

export function mapErrorToNotification(err: unknown): MapNotification {
  if (err instanceof SemanticApiError) {
    return {
      code: err.code,
      level: 'error',
      message: err.message || SELECTION_ERROR_MESSAGES[err.code],
    };
  }
  if (err instanceof Error) {
    return {
      level: 'error',
      message: err.message,
    };
  }
  return {
    level: 'error',
    message: 'Falha inesperada ao consultar o serviço de análise.',
  };
}

export interface UseMapSelectionControllerOptions {
  readonly initialSlot?: RegionSlot;
  readonly initialVariableA?: VariableId | null;
  readonly initialVariableB?: VariableId | null;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly fetchGlobalGrid?: typeof defaultGetGlobalGrid;
  readonly fetchRegionData?: typeof defaultGetRegionData;
  readonly autoAnalyzeOnSelection?: boolean;
}

/**
 * Orquestrador React tipado para plugar o componente MapView do Dev Núcleo ao contrato PROD-1.
 * Gerencia slots A/B, reconciliação de grade nativa, AbortController e erros semânticos do backend.
 */
export function useMapSelectionController(options: UseMapSelectionControllerOptions = {}) {
  const fetchGlobalGrid = options.fetchGlobalGrid ?? defaultGetGlobalGrid;
  const fetchRegionData = options.fetchRegionData ?? defaultGetRegionData;
  const autoAnalyze = options.autoAnalyzeOnSelection ?? false;

  const [state, setState] = useState<MapSelectionState>(() =>
    createInitialMapSelectionState({
      activeSlot: options.initialSlot,
      variableA: options.initialVariableA,
      variableB: options.initialVariableB,
    }),
  );
  const [gridData, setGridData] = useState<GlobalGridFile | null>(null);
  const [analysis, setAnalysis] = useState<RegionAnalysisResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const analysisAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const activeVar = state.variableA;
    if (!activeVar) {
      setGridData(null);
      return;
    }

    const controller = new AbortController();
    fetchGlobalGrid(activeVar, controller.signal)
      .then((grid) => {
        if (!controller.signal.aborted) {
          setGridData(grid);
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setGridData(null);
        setState((prev) => ({
          ...prev,
          lastNotification: {
            level: 'warn',
            message:
              err instanceof Error
                ? `Panorama global indisponível para ${activeVar}; grade interativa segue ativa.`
                : 'Panorama global indisponível; grade interativa segue ativa.',
          },
        }));
      });

    return () => controller.abort();
  }, [fetchGlobalGrid, state.variableA]);

  const runAnalysis = useCallback(
    async (targetState: MapSelectionState = state) => {
      const requestInput = buildAnalyzeRequestInput(targetState, {
        startDate: options.startDate,
        endDate: options.endDate,
      });

      analysisAbortRef.current?.abort();

      if (!requestInput) {
        setAnalysis(null);
        setIsLoading(false);
        return null;
      }

      const controller = new AbortController();
      analysisAbortRef.current = controller;
      setIsLoading(true);

      try {
        const result = await fetchRegionData({
          ...requestInput,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setAnalysis(result);
        }
        return result;
      } catch (err: unknown) {
        if (controller.signal.aborted) {
          return null;
        }
        const notification = mapErrorToNotification(err);
        setState((prev) => ({ ...prev, lastNotification: notification }));
        return null;
      } finally {
        if (analysisAbortRef.current === controller) {
          setIsLoading(false);
        }
      }
    },
    [fetchRegionData, options.endDate, options.startDate, state],
  );

  const setActiveSlot = useCallback((slot: RegionSlot) => {
    setState((prev) => ({ ...prev, activeSlot: slot }));
  }, []);

  const setVariableA = useCallback((variableId: VariableId | null) => {
    setState((prev) => applySlotVariableChange(prev, 'A', variableId));
  }, []);

  const setVariableB = useCallback((variableId: VariableId | null) => {
    setState((prev) => applySlotVariableChange(prev, 'B', variableId));
  }, []);

  const onCellToggle = useCallback(
    (slot: RegionSlot, lat: number, lon: number) => {
      setState((prev) => {
        const next = applyCellToggle(prev, slot, lat, lon);
        if (autoAnalyze && next !== prev && !next.lastNotification) {
          void runAnalysis(next);
        }
        return next;
      });
    },
    [autoAnalyze, runAnalysis],
  );

  const onClearSlot = useCallback((slot: RegionSlot) => {
    setState((prev) => applyClearSlot(prev, slot));
  }, []);

  const onNotification = useCallback((notification: MapNotification) => {
    setState((prev) => ({ ...prev, lastNotification: notification }));
  }, []);

  const clearNotification = useCallback(() => {
    setState((prev) => ({ ...prev, lastNotification: null }));
  }, []);

  useEffect(() => () => analysisAbortRef.current?.abort(), []);

  const mapProps: MapViewContractProps = useMemo(
    () => ({
      activeSlot: state.activeSlot,
      variableA: state.variableA,
      variableB: state.variableB,
      gridData,
      cellsA: state.cellsA,
      cellsB: state.cellsB,
      onCellToggle,
      onClearSlot,
      onNotification,
    }),
    [
      gridData,
      onCellToggle,
      onClearSlot,
      onNotification,
      state.activeSlot,
      state.cellsA,
      state.cellsB,
      state.variableA,
      state.variableB,
    ],
  );

  return {
    state,
    gridData,
    analysis,
    isLoading,
    notification: state.lastNotification,
    setActiveSlot,
    setVariableA,
    setVariableB,
    clearNotification,
    runAnalysis,
    mapProps,
  };
}
