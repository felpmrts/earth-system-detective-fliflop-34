import { describe, expect, it } from 'vitest';
import {
  computeMahalanobisContourAndFit,
  countMissingValues,
  formatPValue,
  formatSignedNumber,
  summarizeRegionCoords,
} from '../bench/benchMeta';
import { VARIABLE_CATALOG } from '../contracts/catalog';
import type { RegionSelection } from '../contracts/types';

describe('benchMeta helpers', () => {
  it('formats signed numbers with explicit + for positive slopes and avoids -0.000', () => {
    expect(formatSignedNumber(0.3456)).toBe('+0.346');
    expect(formatSignedNumber(-0.028)).toBe('-0.028');
    expect(formatSignedNumber(0)).toBe('0.000');
    expect(formatSignedNumber(-0.0002, 3)).toBe('0.000');
    expect(formatSignedNumber(0.0002, 3)).toBe('0.000');
    expect(formatSignedNumber(-0.000002, 5)).toBe('0.00000');
    expect(formatSignedNumber(Number.NaN)).toBe('—');
    expect(formatSignedNumber(Number.POSITIVE_INFINITY)).toBe('—');
  });

  it('formats p-values in scientific notation below 0.0001 and guards invalid values', () => {
    expect(formatPValue(0.000012)).toBe('1.2e-5');
    expect(formatPValue(0.0041)).toBe('0.0041');
    expect(formatPValue(0)).toBe('0.0000');
    expect(formatPValue(-0.1)).toBe('—');
    expect(formatPValue(Number.NaN)).toBe('—');
  });

  it('counts null and non-finite missing values', () => {
    expect(countMissingValues([1.2, null, 3.4, Number.NaN, null])).toBe(3);
    expect(countMissingValues([0, 1, 2])).toBe(0);
  });

  it('summarizes region cell count and centroid coordinates', () => {
    const region: RegionSelection = {
      slot: 'A',
      region_id: 'MERRA-2__r142_c210+r142_c211',
      variable_id: 'GWETTOP',
      source_model: 'MERRA-2',
      grid_resolution: { dLat: 0.5, dLon: 0.625 },
      cells: [
        {
          cell_id: 'r142_c210',
          row: 142,
          col: 210,
          lat: -18.75,
          lon: -48.5,
          bounds_leaflet: [
            [-19, -48.8125],
            [-18.5, -48.1875],
          ],
          geojson_ring: [],
        },
        {
          cell_id: 'r142_c211',
          row: 142,
          col: 211,
          lat: -18.75,
          lon: -47.5,
          bounds_leaflet: [
            [-19, -47.8125],
            [-18.5, -47.1875],
          ],
          geojson_ring: [],
        },
      ],
    };

    expect(summarizeRegionCoords(region)).toBe('2 cells · center (-18.75°, -48.00°)');
    expect(summarizeRegionCoords(null)).toBe('Region not specified');
  });

  it('computes consistent robust Mahalanobis bivariate distances and clearsky radiation unit (M1 & C6)', () => {
    const core = Array.from({ length: 30 }, (_, i) => ({
      x: (i - 15) * 0.1,
      y: (i - 15) * 0.1 + ((i % 3) - 1) * 0.05,
    }));
    const withOutlier = [...core, { x: 0.0, y: 12.0 }];
    const geom = computeMahalanobisContourAndFit(withOutlier, 2.5);
    expect(geom).not.toBeNull();
    expect(geom!.outlierIndices).toEqual([30]);
    expect(geom!.distances[30]).toBeGreaterThan(2.5);
    expect(geom!.distances[0]).toBeLessThan(2.5);
    expect(VARIABLE_CATALOG.CLRSKY_SFC_SW_DWN.unit).toBe('MJ/m²/day');
  });
});
