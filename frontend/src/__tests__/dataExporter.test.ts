import { describe, expect, it } from 'vitest';
import mockAnalysisJson from '../../public/data/mock_analysis.json';
import type { RegionAnalysisResponse, RegionSelection, VariableId, VariableStatistics } from '../contracts/types';
import { buildRegionSelection, snapCoordToCell } from '../geo/gridGeometry';
import {
  buildExportFilename,
  buildStructuredExportPayload,
  createCsvExport,
  createJsonExport,
  escapeCsvCell,
} from '../services/dataExporter';

/** Parser RFC 4180 minimalista para validar que todas as linhas CSV escapam corretamente. */
function parseCsvRows(csvBody: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < csvBody.length; i += 1) {
    const ch = csvBody[i];
    if (inQuotes) {
      if (ch === '"') {
        if (csvBody[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch ?? '';
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(field);
      field = '';
    } else if (ch === '\n') {
      currentRow.push(field);
      rows.push(currentRow);
      currentRow = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch ?? '';
    }
  }

  if (field.length > 0 || currentRow.length > 0) {
    currentRow.push(field);
    rows.push(currentRow);
  }
  return rows;
}

function splitCsvHeaderAndBody(content: string): { commentLines: string[]; body: string } {
  const lines = content.split('\n');
  const commentLines: string[] = [];
  let firstDataIdx = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (line.startsWith('#')) {
      commentLines.push(line);
      firstDataIdx = i + 1;
    } else {
      break;
    }
  }
  const body = lines.slice(firstDataIdx).join('\n').trimEnd();
  return { commentLines, body };
}

function makeVariableStats(
  variableId: VariableId,
  dates: readonly string[],
  overrides: Partial<VariableStatistics> = {},
): VariableStatistics {
  const n = dates.length;
  return {
    variable_id: variableId,
    variable_name: variableId === 'T2M' ? 'Temperatura Média do Ar a 2m' : 'Pressão de Superfície',
    scale_type: 'interval',
    unit: variableId === 'T2M' ? '°C' : 'kPa',
    trend_unit: variableId === 'T2M' ? '°C/década' : 'kPa/década',
    allow_percentage_change: false,
    period: {
      start: dates[0] ?? '2000-01',
      end: dates[dates.length - 1] ?? '2000-03',
      n_observations: n,
      n_effective_ar1: Math.max(1, n * 0.6),
    },
    regression: {
      intercept_at_start_A0: 21.5,
      slope_per_decade_ols: 0.34,
      slope_per_decade_sen: 0.31,
      slope_ci95_low: 0.12,
      slope_ci95_high: 0.49,
      cumulative_model_change: 0.25,
      quadratic_acceleration_B2: 0.0021,
      regime_shape: 'accelerating_rise',
    },
    correlation_and_coupling: {
      pearson_r: 0.72,
      kendall_tau: 0.54,
      r_squared: 0.5184,
      ellipse_aspect_ratio: 0.42,
    },
    significance: {
      p_value_naive: 0.0004,
      p_value_ar1_corrected: 0.0089,
      fdr_q_value: 0.0145,
      is_significant_fdr05: true,
      confidence_tier: 'CONFIRMED_HIGH',
    },
    outliers_mahalanobis: [],
    series: {
      dates,
      raw_values: dates.map((_, idx) => 20 + idx * 0.5),
      anomaly_values: dates.map((_, idx) => -0.4 + idx * 0.4),
      linear_fit: dates.map((_, idx) => -0.3 + idx * 0.3),
      sen_fit: dates.map((_, idx) => -0.25 + idx * 0.28),
      gam_smooth_fit: dates.map((_, idx) => -0.2 + idx * 0.32),
    },
    ...overrides,
  };
}

function makeRegion(slot: 'A' | 'B', variableId: VariableId, lat: number, lon: number): RegionSelection {
  return buildRegionSelection(slot, variableId, [snapCoordToCell(lat, lon, variableId)]);
}

describe('dataExporter — exportação científica CSV e JSON', () => {
  it('gera nomes descritivos no padrão trend-detective_{varA}_vs_{varB}_{t0}-{tf}.{ext}', () => {
    const analysis = mockAnalysisJson as unknown as RegionAnalysisResponse;

    expect(buildExportFilename(analysis, 'csv')).toBe(
      'trend-detective_GWETTOP_vs_T2M_MAX_2000-01-2009-12.csv',
    );
    expect(buildExportFilename(analysis, 'json')).toBe(
      'trend-detective_GWETTOP_vs_T2M_MAX_2000-01-2009-12.json',
    );

    const singleRegion: RegionAnalysisResponse = {
      ...analysis,
      request_meta: {
        ...analysis.request_meta,
        variable_b: null,
        region_b_id: null,
        cells_count_b: 0,
      },
      region_b_analysis: null,
      comparison_pair: null,
    };
    expect(buildExportFilename(singleRegion, 'csv')).toBe(
      'trend-detective_GWETTOP_2000-01-2009-12.csv',
    );
  });

  it('gera JSON estruturado completo com metadados de reprodutibilidade, células e z_score calculado', () => {
    const regionA = makeRegion('A', 'T2M', -18.75, -48.5);
    const regionB = makeRegion('B', 'ALLSKY_SFC_SW_DWN', -18.5, -48.5);
    const statsA = makeVariableStats('T2M', ['2001-01', '2001-02', '2001-03']);
    const statsB = makeVariableStats('ALLSKY_SFC_SW_DWN', ['2001-01', '2001-02', '2001-03'], {
      variable_name: 'Irradiância Solar de Onda Curta Descendente',
      scale_type: 'ratio',
      unit: 'MJ/m²/dia',
      trend_unit: 'MJ/m²/dia/década',
      allow_percentage_change: true,
    });

    const analysis: RegionAnalysisResponse = {
      request_meta: {
        variable_a: 'T2M',
        variable_b: 'ALLSKY_SFC_SW_DWN',
        region_a_id: regionA.region_id,
        region_b_id: regionB.region_id,
        cells_count_a: regionA.cells.length,
        cells_count_b: regionB.cells.length,
        spatial_aggregation: 'nanmean',
        source: 'backend_api',
      },
      region_a_analysis: statsA,
      region_b_analysis: statsB,
      comparison_pair: {
        region_a_id: regionA.region_id,
        region_b_id: regionB.region_id,
        spatial_divergence_detected: false,
        slope_difference_per_decade: null,
        multiscale_correlation: {
          long_term_secular_r: 0.81,
          short_term_detrended_r: -0.34,
          paradox_type: 'SIMPSON_OPPOSING_PHASES',
          interpretation: 'Tendência positiva conjunta no longo prazo com oposição mensal.',
        },
      },
    };

    const artifact = createJsonExport(analysis, {
      regionA,
      regionB,
      analyzedAt: '14/11/2026 20:40:00',
      exportedAt: '2026-11-14T23:45:00.000Z',
    });
    const parsed = JSON.parse(artifact.content) as ReturnType<typeof buildStructuredExportPayload>;

    expect(artifact.filename).toBe('trend-detective_T2M_vs_ALLSKY_SFC_SW_DWN_2001-01-2001-03.json');
    expect(parsed.exported_at).toBe('2026-11-14T23:45:00.000Z');
    expect(parsed.analyzed_at).toBe('14/11/2026 20:40:00');
    expect(parsed.source_models).toEqual({ region_a: 'MERRA-2', region_b: 'CERES_SYN1deg' });
    expect(parsed.regions.region_a.cells).toHaveLength(1);
    expect(parsed.regions.region_a.centroid).not.toBeNull();
    expect(parsed.regions.region_b?.source_model).toBe('CERES_SYN1deg');
    expect(parsed.variables.region_a.scale_type).toBe('interval');
    expect(parsed.variables.region_a.allow_percentage_change).toBe(false);
    expect(parsed.variables.region_b?.relative_percentage_allowed).toBe(true);
    expect(parsed.statistics.region_a.significance.p_value_ar1_corrected).toBe(0.0089);
    expect(parsed.statistics.region_a.significance.fdr_q_value).toBe(0.0145);
    expect(parsed.statistics.comparison_pair?.multiscale_correlation.long_term_secular_r).toBe(0.81);
    // Z-Score calculado mesmo quando series.z_scores não veio preenchido no payload
    expect(parsed.series.region_a.z_scores).toEqual([-1, 0, 1]);
    expect(parsed.observations).toHaveLength(3);
    expect(parsed.observations[1]?.a_z_score).toBe(0);
  });

  it('alinha linhas por timestamp, sanitiza comentários e faz escaping RFC 4180 correto no CSV', () => {
    const regionA = makeRegion('A', 'T2M', -18.75, -48.5);
    const regionB = makeRegion('B', 'PS', -3.25, -60.0);

    const statsA = makeVariableStats('T2M', ['2000-01', '2000-02', '2000-03'], {
      outliers_mahalanobis: [
        {
          date: '2000-02',
          observed_anomaly: 1.9,
          expected_regression: 0.0,
          mahalanobis_d: 3.15,
          direction: 'above_ellipse',
          diagnostic_hint: 'Evento "El Niño", extremo\ncom quebra de linha',
        },
        {
          date: '2000-03',
          observed_anomaly: 0.5,
          expected_regression: 0.3,
          mahalanobis_d: 2.4,
          direction: 'above_ellipse',
          diagnostic_hint: 'Abaixo do limiar D_M > 2,5',
        },
      ],
    });
    const statsB = makeVariableStats('PS', ['2000-02', '2000-03', '2000-04'], {
      period: { start: '2000-02', end: '2000-04', n_observations: 3, n_effective_ar1: 2.0 },
    });

    const analysis: RegionAnalysisResponse = {
      request_meta: {
        variable_a: 'T2M',
        variable_b: 'PS',
        region_a_id: regionA.region_id,
        region_b_id: regionB.region_id,
        cells_count_a: 1,
        cells_count_b: 1,
        spatial_aggregation: 'nanmean',
        source: 'backend_api',
      },
      region_a_analysis: statsA,
      region_b_analysis: statsB,
      comparison_pair: {
        region_a_id: regionA.region_id,
        region_b_id: regionB.region_id,
        spatial_divergence_detected: false,
        slope_difference_per_decade: 0,
        multiscale_correlation: {
          long_term_secular_r: 0.5,
          short_term_detrended_r: 0.2,
          paradox_type: 'ALIGNED',
          interpretation: 'Linha 1\nLinha 2 com "aspas", vírgula',
        },
      },
    };

    const csvArtifact = createCsvExport(analysis, {
      regionA,
      regionB,
      exportedAt: '2026-11-14T23:50:00.000Z',
    });

    expect(csvArtifact.content.startsWith('#')).toBe(true);
    const { commentLines, body } = splitCsvHeaderAndBody(csvArtifact.content);
    const headerCommentsText = commentLines.join('\n');

    expect(headerCommentsText).toContain('slope_sen=+0.3100 °C/década');
    expect(headerCommentsText).toContain('slope_ols=+0.3400 kPa/década');
    expect(headerCommentsText).toContain('p_ar1=0.0089');
    expect(headerCommentsText).toContain('q_fdr=0.0145');
    expect(headerCommentsText).toContain('r=+0.7200');
    expect(headerCommentsText).not.toContain('\n# comparison_pair: Linha 1\n');
    expect(headerCommentsText).toContain('interpretation=Linha 1 Linha 2 com "aspas", vírgula');

    const rows = parseCsvRows(body);
    expect(rows).toHaveLength(5); // 1 header + 4 datas alinhadas (2000-01 .. 2000-04)
    const header = rows[0] ?? [];
    expect(header).toEqual([
      'date',
      'a_raw',
      'a_anomaly',
      'a_z_score',
      'a_linear_fit',
      'a_sen_fit',
      'a_gam_smooth',
      'a_is_outlier_dm25',
      'a_mahalanobis_d',
      'a_outlier_hint',
      'b_raw',
      'b_anomaly',
      'b_z_score',
      'b_linear_fit',
      'b_sen_fit',
      'b_gam_smooth',
      'b_is_outlier_dm25',
      'b_mahalanobis_d',
      'b_outlier_hint',
    ]);

    for (const row of rows) {
      expect(row).toHaveLength(header.length);
    }

    // 2000-01: apenas A tem dados, colunas de B ficam vazias
    expect(rows[1]?.[0]).toBe('2000-01');
    expect(rows[1]?.[1]).toBe('20');
    expect(rows[1]?.[10]).toBe('');

    // 2000-02: outlier D_M = 3.15 > 2.5 com aspas/vírgula/quebra preservadas em round-trip
    expect(rows[2]?.[0]).toBe('2000-02');
    expect(rows[2]?.[7]).toBe('true');
    expect(rows[2]?.[8]).toBe('3.15');
    expect(rows[2]?.[9]).toBe('Evento "El Niño", extremo\ncom quebra de linha');
    expect(rows[2]?.[10]).toBe('20');

    // 2000-03: D_M = 2.4 não ativa a flag D_M > 2.5
    expect(rows[3]?.[0]).toBe('2000-03');
    expect(rows[3]?.[7]).toBe('false');
    expect(rows[3]?.[8]).toBe('');

    // 2000-04: apenas B tem dados, colunas numéricas de A ficam vazias
    expect(rows[4]?.[0]).toBe('2000-04');
    expect(rows[4]?.[1]).toBe('');
    expect(rows[4]?.[10]).toBe('21');
  });

  it('respeita estritamente o Invariante #3 sem emitir "%" para variáveis intervalares (T2M e PS)', () => {
    const t2mBadInput = makeVariableStats('T2M', ['2000-01', '2000-02'], {
      unit: '%',
      trend_unit: '%/década',
      allow_percentage_change: true,
    });
    const psInput = makeVariableStats('PS', ['2000-01', '2000-02']);

    const analysis: RegionAnalysisResponse = {
      request_meta: {
        variable_a: 'T2M',
        variable_b: 'PS',
        region_a_id: 'MERRA-2__r100_c100',
        region_b_id: 'MERRA-2__r101_c101',
        cells_count_a: 1,
        cells_count_b: 1,
        spatial_aggregation: 'nanmean',
        source: 'backend_api',
      },
      region_a_analysis: t2mBadInput,
      region_b_analysis: psInput,
      comparison_pair: {
        region_a_id: 'MERRA-2__r100_c100',
        region_b_id: 'MERRA-2__r101_c101',
        spatial_divergence_detected: false,
        slope_difference_per_decade: 0,
        multiscale_correlation: {
          long_term_secular_r: 0.4,
          short_term_detrended_r: 0.1,
          paradox_type: 'ALIGNED',
          interpretation: 'Sem variação percentual em escalas intervalares.',
        },
      },
    };

    const csv = createCsvExport(analysis);
    const json = JSON.parse(createJsonExport(analysis).content) as ReturnType<
      typeof buildStructuredExportPayload
    >;

    expect(csv.content).not.toContain('%');
    expect(csv.content).toContain('unit=°C | trend_unit=°C/decade');
    expect(csv.content).toContain('unit=kPa | trend_unit=kPa/década');
    expect(json.variables.region_a.unit).toBe('°C');
    expect(json.variables.region_a.trend_unit).toBe('°C/decade');
    expect(json.variables.region_a.allow_percentage_change).toBe(false);
    expect(json.variables.region_a.relative_percentage_allowed).toBe(false);
    expect(json.variables.region_b?.allow_percentage_change).toBe(false);
  });

  it('exporta corretamente mock_analysis.json completo com recorte temporal opcional', () => {
    const analysis = mockAnalysisJson as unknown as RegionAnalysisResponse;

    const fullCsv = createCsvExport(analysis);
    const { body } = splitCsvHeaderAndBody(fullCsv.content);
    const allRows = parseCsvRows(body);
    expect(allRows).toHaveLength(121); // 1 cabeçalho + 120 meses

    const slicedCsv = createCsvExport(analysis, {
      startMonth: '2002-01',
      endMonth: '2003-12',
    });
    expect(slicedCsv.filename).toBe('trend-detective_GWETTOP_vs_T2M_MAX_2002-01-2003-12.csv');
    const slicedRows = parseCsvRows(splitCsvHeaderAndBody(slicedCsv.content).body);
    expect(slicedRows).toHaveLength(25); // 1 cabeçalho + 24 meses
    expect(slicedRows[1]?.[0]).toBe('2002-01');
    expect(slicedRows[24]?.[0]).toBe('2003-12');

    // Testa helper escapeCsvCell isoladamente
    expect(escapeCsvCell('sem_especial')).toBe('sem_especial');
    expect(escapeCsvCell('a, "b"')).toBe('"a, ""b"""');
    expect(escapeCsvCell(-0.028)).toBe('-0.028');
    expect(escapeCsvCell(null)).toBe('');
  });
});
