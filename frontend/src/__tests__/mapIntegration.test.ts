import { describe, expect, it } from 'vitest';
import {
  applyCellToggle,
  applyClearSlot,
  applySlotVariableChange,
  buildAnalyzeRequestInput,
  createInitialMapSelectionState,
  mapErrorToNotification,
} from '../map/mapIntegration.ts';
import { SemanticApiError } from '../services/regionDataAdapter.ts';

describe('mapIntegration — orquestração A/B, troca de grade e payload para getRegionData', () => {
  it('gerencia seleção independente para Local A e Local B com snapping nativo', () => {
    let state = createInitialMapSelectionState({
      activeSlot: 'A',
      variableA: 'GWETTOP',
      variableB: 'T2M_MAX',
    });

    state = applyCellToggle(state, 'A', -18.91, -48.27);
    state = applyCellToggle(state, 'A', -18.91, -47.65);
    state = applyCellToggle(state, 'B', -3.12, -60.02);

    expect(state.cellsA).toHaveLength(2);
    expect(state.cellsB).toHaveLength(1);
    expect(state.lastNotification).toBeNull();

    const params = buildAnalyzeRequestInput(state);
    expect(params).not.toBeNull();
    expect(params?.variable).toBe('GWETTOP');
    expect(params?.variableB).toBe('T2M_MAX');
    expect(params?.region.cells).toHaveLength(2);
    expect(params?.regionB?.cells).toHaveLength(1);
    expect(params?.startDate).toBe('1981-01');
  });

  it('limpa seleção do slot quando a troca de variável altera a resolução física (MERRA-2 <-> CERES)', () => {
    let state = createInitialMapSelectionState({ variableA: 'T2M', variableB: 'T2M' });
    state = applyCellToggle(state, 'A', -18.91, -48.27);
    expect(state.cellsA).toHaveLength(1);

    // Mesma grade (MERRA-2 -> MERRA-2): preserva células
    state = applySlotVariableChange(state, 'A', 'GWETTOP');
    expect(state.cellsA).toHaveLength(1);
    expect(state.lastNotification).toBeNull();

    // Grade diferente (MERRA-2 -> CERES 1.0°): limpa e notifica
    state = applySlotVariableChange(state, 'A', 'ALLSKY_SFC_SW_DWN');
    expect(state.cellsA).toHaveLength(0);
    expect(state.lastNotification?.level).toBe('info');
    expect(state.lastNotification?.message).toContain('1.0');
  });

  it('emite notificação ao violar conectividade ou limpar slot, e traduz SemanticApiError', () => {
    let state = createInitialMapSelectionState({ variableA: 'T2M', variableB: null });
    state = applyCellToggle(state, 'A', -18.91, -48.27);
    // Tenta clicar em célula distante
    state = applyCellToggle(state, 'A', 10.0, 20.0);
    expect(state.cellsA).toHaveLength(1);
    expect(state.lastNotification?.code).toBe('NOT_ADJACENT');

    state = applyClearSlot(state, 'A');
    expect(state.cellsA).toHaveLength(0);
    expect(buildAnalyzeRequestInput(state)).toBeNull();

    const apiErrNote = mapErrorToNotification(
      new SemanticApiError('OCEAN_MASK_NO_DATA', 'Ponto no oceano Atlântico.', 422),
    );
    expect(apiErrNote.code).toBe('OCEAN_MASK_NO_DATA');
    expect(apiErrNote.level).toBe('error');
  });
});
