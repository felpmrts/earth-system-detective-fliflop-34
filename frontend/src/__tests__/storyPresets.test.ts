import { describe, expect, it } from 'vitest';
import { buildRegionSelection, snapCoordToCell } from '../geo/gridGeometry';
import { GLOBE_TELEMETRY_FOCUSES, projectCoordFacingCamera } from '../story/Globe3D';
import {
  classifyExperimentArchetype,
  MATRIX_MODES,
  materializeStoryPreset,
  STORY_PRESETS,
} from '../story/storyPresets';

describe('storyPresets', () => {
  it('materializes every StoryPreset into valid connected regions and valid date bounds', () => {
    for (const preset of STORY_PRESETS) {
      const mat = materializeStoryPreset(preset, '2026-11');
      expect(mat.variableA).toBe(preset.variableA);
      expect(mat.variableB).toBe(preset.variableB);
      expect(mat.regionA.cells.length).toBeGreaterThanOrEqual(1);
      expect(mat.regionB.cells.length).toBeGreaterThanOrEqual(1);
      expect(mat.startMonth).toMatch(/^\d{4}-\d{2}$/);
      expect(mat.endMonth).toMatch(/^\d{4}-\d{2}$/);
      expect(mat.startMonth <= mat.endMonth).toBe(true);
    }
  });

  it('enforces CERES intersecting startMonth (1984-01) for mixed CERES + MERRA-2 preset', () => {
    const teleconnection = STORY_PRESETS.find(p => p.id === 'ceres-amazon-parana');
    expect(teleconnection).toBeDefined();
    const mat = materializeStoryPreset(teleconnection!, '2026-11');
    expect(mat.startMonth).toBe('1984-01');
  });

  it('links every MATRIX_MODES card to an existing StoryPreset', () => {
    const presetIds = new Set(STORY_PRESETS.map(p => p.id));
    for (const mode of MATRIX_MODES) {
      expect(presetIds.has(mode.recommendedPresetId)).toBe(true);
    }
  });

  it('classifies all 4 combinatorial archetypes plus incomplete state accurately', () => {
    expect(
      classifyExperimentArchetype({
        variableA: 'GWETTOP',
        variableB: 'T2M_MAX',
        regionA: null,
        regionB: null,
        sameLocation: false,
      }).id,
    ).toBe('configuring');

    const cellMg = snapCoordToCell(-19.0, -48.125, 'GWETTOP');
    const cellAm = snapCoordToCell(-3.0, -60.0, 'GWETTOP');
    const regAMg = buildRegionSelection('A', 'GWETTOP', [cellMg]);
    const regBAm = buildRegionSelection('B', 'GWETTOP', [cellAm]);
    const regBMg = buildRegionSelection('B', 'T2M_MAX', [snapCoordToCell(-19.0, -48.125, 'T2M_MAX')]);
    const regBPrecip = buildRegionSelection('B', 'PRECTOTCORR', [snapCoordToCell(-3.0, -60.0, 'PRECTOTCORR')]);
    const regBSameVar = buildRegionSelection('B', 'GWETTOP', [cellMg]);

    expect(
      classifyExperimentArchetype({
        variableA: 'GWETTOP',
        variableB: 'GWETTOP',
        regionA: regAMg,
        regionB: regBAm,
        sameLocation: false,
      }).id,
    ).toBe('spatial_dipole');

    expect(
      classifyExperimentArchetype({
        variableA: 'GWETTOP',
        variableB: 'T2M_MAX',
        regionA: regAMg,
        regionB: regBMg,
        sameLocation: true,
      }).id,
    ).toBe('local_coupling');

    expect(
      classifyExperimentArchetype({
        variableA: 'GWETTOP',
        variableB: 'PRECTOTCORR',
        regionA: regAMg,
        regionB: regBPrecip,
        sameLocation: false,
      }).id,
    ).toBe('cross_teleconnection');

    expect(
      classifyExperimentArchetype({
        variableA: 'GWETTOP',
        variableB: 'GWETTOP',
        regionA: regAMg,
        regionB: regBSameVar,
        sameLocation: false,
      }).id,
    ).toBe('univariate_xray');
  });

  it('centers every 3D globe focus target accurately in front of camera across distinct global regions', () => {
    for (let i = 0; i < GLOBE_TELEMETRY_FOCUSES.length; i += 1) {
      const focus = GLOBE_TELEMETRY_FOCUSES[i]!;
      const viewTarget = projectCoordFacingCamera(focus.cameraTarget, focus.cameraTarget);
      expect(Math.abs(viewTarget.x)).toBeLessThan(1e-6);
      expect(Math.abs(viewTarget.y)).toBeLessThan(1e-6);
      expect(viewTarget.z).toBeCloseTo(1, 5);

      const viewA = projectCoordFacingCamera(focus.coordA, focus.cameraTarget);
      const viewB = projectCoordFacingCamera(focus.coordB, focus.cameraTarget);
      expect(viewA.z).toBeGreaterThan(0.55);
      expect(viewB.z).toBeGreaterThan(0.55);

      for (let j = i + 1; j < GLOBE_TELEMETRY_FOCUSES.length; j += 1) {
        const other = GLOBE_TELEMETRY_FOCUSES[j]!;
        const sepDeg = Math.hypot(
          focus.cameraTarget[0] - other.cameraTarget[0],
          focus.cameraTarget[1] - other.cameraTarget[1],
        );
        expect(sepDeg).toBeGreaterThanOrEqual(28);
      }
    }
  });
});
