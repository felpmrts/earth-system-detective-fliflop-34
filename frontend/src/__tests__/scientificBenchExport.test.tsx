// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RegionAnalysisResponse, VariableId, VariableStatistics } from '../contracts/types';
import { buildRegionSelection, snapCoordToCell } from '../geo/gridGeometry';

vi.mock('plotly.js-basic-dist-min', () => ({ default: {} }));
vi.mock('react-plotly.js/factory', () => ({
  default: () =>
    function MockPlot() {
      return <div data-testid="mock-plotly-chart" />;
    },
}));

import { ScientificBench } from '../bench/ScientificBench';

function buildIntervalStats(variableId: VariableId, unit: string, trendUnit: string): VariableStatistics {
  const dates = ['2005-01', '2005-02', '2005-03', '2005-04'];
  return {
    variable_id: variableId,
    variable_name: variableId === 'T2M' ? 'Temperatura Média do Ar a 2m' : 'Pressão de Superfície',
    scale_type: 'interval',
    unit,
    trend_unit: trendUnit,
    allow_percentage_change: false,
    period: {
      start: '2005-01',
      end: '2005-04',
      n_observations: 4,
      n_effective_ar1: 2.8,
    },
    regression: {
      intercept_at_start_A0: variableId === 'T2M' ? 23.1 : 101.2,
      slope_per_decade_ols: variableId === 'T2M' ? 0.42 : -0.18,
      slope_per_decade_sen: variableId === 'T2M' ? 0.39 : -0.15,
      slope_ci95_low: 0.1,
      slope_ci95_high: 0.7,
      cumulative_model_change: 0.2,
      quadratic_acceleration_B2: 0.0011,
      regime_shape: 'linear',
    },
    correlation_and_coupling: {
      pearson_r: 0.68,
      kendall_tau: 0.51,
      r_squared: 0.4624,
      ellipse_aspect_ratio: 0.45,
    },
    significance: {
      p_value_naive: 0.002,
      p_value_ar1_corrected: 0.014,
      fdr_q_value: 0.022,
      is_significant_fdr05: true,
      confidence_tier: 'CONFIRMED_HIGH',
    },
    outliers_mahalanobis:
      variableId === 'T2M'
        ? [
            {
              date: '2005-03',
              observed_anomaly: 1.85,
              expected_regression: 0.12,
              mahalanobis_d: 3.12,
              direction: 'above_ellipse',
              diagnostic_hint: 'Onda de calor, "pico atípico" em março',
            },
          ]
        : [],
    series: {
      dates,
      raw_values: [22.1, 22.8, 24.9, 23.2],
      anomaly_values: [-0.3, 0.1, 1.85, 0.2],
      linear_fit: [-0.1, 0.05, 0.2, 0.35],
      sen_fit: [-0.08, 0.04, 0.18, 0.32],
      gam_smooth_fit: [-0.15, 0.12, 0.9, 0.28],
    },
  };
}

function parseCsvRows(csvBody: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < csvBody.length; i += 1) {
    const ch = csvBody[i];
    if (inQuotes) {
      if (ch === '"' && csvBody[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch ?? '';
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch ?? '';
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

describe('ScientificBench E2E — botões Exportar CSV e Exportar JSON', () => {
  const capturedDownloads: { filename: string; mimeType: string; content: string }[] = [];
  let pendingBlobs: Blob[] = [];
  const origCreateObjectUrl = URL.createObjectURL;
  const origRevokeObjectUrl = URL.revokeObjectURL;

  beforeEach(() => {
    capturedDownloads.length = 0;
    pendingBlobs = [];

    URL.createObjectURL = vi.fn((blob: Blob | MediaSource) => {
      pendingBlobs.push(blob as Blob);
      return `blob:test-${pendingBlobs.length}`;
    });
    URL.revokeObjectURL = vi.fn();

    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      const idx = Number(this.href.replace('blob:test-', '')) - 1;
      const blob = pendingBlobs[idx];
      if (!blob) return;
      // FileReader / Blob em jsdom: usa arrayBuffer/text sincronicamente guardado pelo mock
      void blob.text().then(content => {
        capturedDownloads.push({
          filename: this.download,
          mimeType: blob.type,
          content,
        });
      });
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    URL.createObjectURL = origCreateObjectUrl;
    URL.revokeObjectURL = origRevokeObjectUrl;
  });

  it('mantém botões desabilitados sem análise e dispara downloads válidos de CSV e JSON ao clicar', async () => {
    const regionA = buildRegionSelection('A', 'T2M', [snapCoordToCell(-18.75, -48.5, 'T2M')]);
    const regionB = buildRegionSelection('B', 'PS', [snapCoordToCell(-3.25, -60.0, 'PS')]);

    const { rerender } = render(
      <ScientificBench
        analysis={undefined}
        variableA="T2M"
        variableB="PS"
        regionA={regionA}
        regionB={regionB}
        start="2005-01"
        end="2005-04"
        periodReady
        analyzedAt={null}
        anomaly
        separate={false}
        dual
        trendMode="both"
        onAnomalyChange={vi.fn()}
        onSeparateChange={vi.fn()}
        onDualChange={vi.fn()}
        onTrendModeChange={vi.fn()}
        onBackToMap={vi.fn()}
      />,
    );

    const csvEmptyBtn = screen.getByRole('button', { name: 'Exportar CSV' }) as HTMLButtonElement;
    const jsonEmptyBtn = screen.getByRole('button', { name: 'Exportar JSON' }) as HTMLButtonElement;
    expect(csvEmptyBtn.disabled).toBe(true);
    expect(jsonEmptyBtn.disabled).toBe(true);

    const analysis: RegionAnalysisResponse = {
      request_meta: {
        variable_a: 'T2M',
        variable_b: 'PS',
        region_a_id: regionA.region_id,
        region_b_id: regionB.region_id,
        cells_count_a: regionA.cells.length,
        cells_count_b: regionB.cells.length,
        spatial_aggregation: 'nanmean',
        source: 'backend_api',
      },
      region_a_analysis: buildIntervalStats('T2M', '°C', '°C/década'),
      region_b_analysis: buildIntervalStats('PS', 'kPa', 'kPa/década'),
      comparison_pair: {
        region_a_id: regionA.region_id,
        region_b_id: regionB.region_id,
        spatial_divergence_detected: true,
        slope_difference_per_decade: 0.54,
        multiscale_correlation: {
          long_term_secular_r: -0.62,
          short_term_detrended_r: -0.35,
          paradox_type: 'DIVERGENT_REGIMES',
          interpretation: 'Aquecimento superficial e queda de pressão em escalas intervalares.',
        },
      },
    };

    rerender(
      <ScientificBench
        analysis={analysis}
        variableA="T2M"
        variableB="PS"
        regionA={regionA}
        regionB={regionB}
        start="2005-01"
        end="2005-04"
        periodReady
        analyzedAt="14/11/2026 21:15:00"
        anomaly
        separate={false}
        dual
        trendMode="both"
        onAnomalyChange={vi.fn()}
        onSeparateChange={vi.fn()}
        onDualChange={vi.fn()}
        onTrendModeChange={vi.fn()}
        onBackToMap={vi.fn()}
      />,
    );

    const csvBtn = screen.getByRole('button', { name: 'Exportar CSV' }) as HTMLButtonElement;
    const jsonBtn = screen.getByRole('button', { name: 'Exportar JSON' }) as HTMLButtonElement;
    expect(csvBtn.disabled).toBe(false);
    expect(jsonBtn.disabled).toBe(false);

    fireEvent.click(csvBtn);
    fireEvent.click(jsonBtn);
    await vi.waitFor(() => expect(capturedDownloads).toHaveLength(2));

    const csvFile = capturedDownloads.find(d => d.filename.endsWith('.csv'));
    const jsonFile = capturedDownloads.find(d => d.filename.endsWith('.json'));
    expect(csvFile?.filename).toBe('trend-detective_T2M_vs_PS_2005-01-2005-04.csv');
    expect(jsonFile?.filename).toBe('trend-detective_T2M_vs_PS_2005-01-2005-04.json');

    // Verifica CSV com cabeçalho #, zero '%' para variáveis intervalares (T2M e PS) e linhas alinhadas
    expect(csvFile?.content.startsWith('#')).toBe(true);
    expect(csvFile?.content).not.toContain('%');
    const lines = (csvFile?.content ?? '').split('\n');
    const dataStartIdx = lines.findIndex(line => !line.startsWith('#'));
    expect(dataStartIdx).toBeGreaterThan(3);
    const parsedRows = parseCsvRows(lines.slice(dataStartIdx).join('\n').trimEnd());
    expect(parsedRows).toHaveLength(5); // 1 cabeçalho + 4 meses
    const colCount = parsedRows[0]?.length ?? 0;
    for (const row of parsedRows) {
      expect(row).toHaveLength(colCount);
    }
    expect(parsedRows[3]?.[7]).toBe('true');
    expect(parsedRows[3]?.[9]).toBe('Onda de calor, "pico atípico" em março');

    // Verifica JSON parseável com metadados completos e séries
    const parsedJson = JSON.parse(jsonFile?.content ?? '{}');
    expect(parsedJson.schema_version).toBe('1.0.0');
    expect(parsedJson.analyzed_at).toBe('14/11/2026 21:15:00');
    expect(parsedJson.variables.region_a.unit).toBe('°C');
    expect(parsedJson.variables.region_b.unit).toBe('kPa');
    expect(parsedJson.variables.region_a.allow_percentage_change).toBe(false);
    expect(parsedJson.variables.region_b.allow_percentage_change).toBe(false);
    expect(parsedJson.regions.region_a.cells).toHaveLength(1);
    expect(parsedJson.regions.region_b.cells).toHaveLength(1);
    expect(parsedJson.series.dates).toEqual(['2005-01', '2005-02', '2005-03', '2005-04']);
    expect(parsedJson.observations).toHaveLength(4);
  });
});
