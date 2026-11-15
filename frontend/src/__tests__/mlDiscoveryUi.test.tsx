// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import mockAnalysisJson from '../../public/data/mock_analysis.json';
import type { DiscoveryResponse, RegionAnalysisResponse } from '../contracts/types';
import { buildRegionSelection, snapCoordToCell } from '../geo/gridGeometry';
import { createRegionDataAdapter } from '../services/regionDataAdapter';

const capturedLayouts: Array<Record<string, unknown>> = [];

vi.mock('plotly.js-basic-dist-min', () => ({ default: {} }));
vi.mock('react-plotly.js/factory', () => ({
  default: () =>
    function MockPlot(props: { data?: unknown[]; layout?: Record<string, unknown> }) {
      if (props.layout) {
        capturedLayouts.push(props.layout);
      }
      return <div data-testid="mock-plotly-chart" />;
    },
}));

import { ScientificBench } from '../bench/ScientificBench';

const mockAnalysis = mockAnalysisJson as unknown as RegionAnalysisResponse;

const sampleDiscovery: DiscoveryResponse = {
  discovery_meta: {
    engine: 'earth_system_dynamic_discovery_v2',
    variable_id: 'GWETTOP',
    period: mockAnalysis.region_a_analysis.period,
    execution_time_ms: 14.2,
  },
  regime_and_gam_geometry: {
    cusum_break_detected: true,
    break_date: '2020-01',
    forensic_regime_diagnosis: 'PHASE_REVERSAL_OR_HUMP_REGIME',
    cusum_max_stat: 1.3027,
    p_value_ar1_bridge: 0.000617,
    quadratic_b2_p_ar1: 0.0124,
    hinge_p_ar1: 0.0041,
    pre_break_gam_slope_decade: 0.021,
    post_break_gam_slope_decade: -0.054,
  },
  partial_teleconnections: {
    status: 'OK',
    total_tests: 40,
    significant_partial_fdr05_count: 2,
    significant_strict_both_fdr05_count: 1,
    top_teleconnections: [
      {
        ocean_box_id: 'pac_nino34',
        ocean_var: 'TS',
        lag_months: 2,
        n_pairs: 240,
        conditioning_set: ['atl_meridional_grad'],
        anomaly_r: -0.44,
        detrended_r: -0.41,
        partial_r: -0.39,
        detrended_fdr_q: 0.004,
        partial_fdr_q: 0.008,
        is_detrended_sig_fdr05: true,
        is_partial_sig_fdr05: true,
        is_strictly_coupled_fdr05: true,
      },
    ],
  },
  fast_gcv_physical_attribution: {
    status: 'OK',
    n_samples: 240,
    best_ridge_alpha: 10.0,
    detrended_gcv_r2: 0.312,
    detrended_purged_cv_r2: 0.278,
    p_value_f_ar1: 0.0012,
    overall_model_significant: true,
    drivers_ranked: [
      {
        predictor: 'T2M_MAX',
        standardized_beta: -0.521,
        abs_importance_rank_weight: 0.521,
        quartile_jump_q4_minus_q1: -0.044,
      },
    ],
  },
  attributed_mahalanobis_outliers: [
    {
      date: '2015-11',
      mahalanobis_d: 3.45,
      ocean_phase_tag: 'EL_NINO_FORTE (+2.4σ)',
      nino34_ts_z: 2.41,
      atl_grad_ts_z: 0.65,
    },
  ],
};

describe('Hybrid ML Discovery Adapter & UI Integration', () => {
  beforeEach(() => {
    capturedLayouts.length = 0;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('discoverDynamicPatterns reuses analysis_key from /api/analyze and falls back on 404', async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    let discoverCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/analyze')) {
        return new Response(JSON.stringify({ ...mockAnalysis, analysis_key: 'ak_ml_1' }), { status: 200 });
      }
      if (url.includes('/api/discover')) {
        discoverCalls += 1;
        requestBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
        if (discoverCalls === 1) {
          return new Response(JSON.stringify(sampleDiscovery), { status: 200 });
        }
        if (discoverCalls === 2) {
          return new Response(JSON.stringify({ code: 'ANALYSIS_CACHE_MISS' }), { status: 404 });
        }
        return new Response(JSON.stringify(sampleDiscovery), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    });

    const adapter = createRegionDataAdapter({
      mode: 'api',
      apiBaseUrl: 'http://localhost:8000',
      fetchFn: fetchMock,
    });
    const regionA = buildRegionSelection('A', 'GWETTOP', [snapCoordToCell(-15, -48, 'GWETTOP')]);
    const analysis = await adapter.getRegionData({
      variable: 'GWETTOP',
      region: regionA,
      startDate: '2001-01',
      endDate: '2024-12',
    });

    const res1 = await adapter.discoverDynamicPatterns({ analysis });
    expect(res1?.regime_and_gam_geometry.break_date).toBe('2020-01');
    expect(requestBodies[0]?.analysis_key).toBe('ak_ml_1');
    expect(requestBodies[0]?.analysis).toBeUndefined();

    const res2 = await adapter.discoverDynamicPatterns({ analysis });
    expect(res2?.partial_teleconnections.significant_strict_both_fdr05_count).toBe(1);
    expect(requestBodies[1]?.analysis_key).toBe('ak_ml_1');
    expect(requestBodies[2]?.analysis).toBeTruthy();
  });

  it('ScientificBench renders ML Layer 2 panel, CUSUM break marker on chart, and Copilot CTA action', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/discover')) {
        return new Response(JSON.stringify(sampleDiscovery), { status: 200 });
      }
      if (url.includes('/api/copilot')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as { question?: string };
        return new Response(
          JSON.stringify({
            mode: 'heuristic_fallback',
            model: 'deterministic-test',
            language: 'pt',
            answer: `Ferramenta run_ml_dynamic_discovery respondeu à pergunta: ${body.question ?? ''}`,
            reply_markdown: 'Resumo ML CUSUM 2020-01',
            synthesis: {
              mathematical_evidence: 'CUSUM = 1.3027 em 2020-01 (p=0.0006)',
              physical_meaning: 'Teleconexão pac_nino34.TS (lag 2m)',
              false_conclusion_risk: 'Purged CV R² = 0.278',
            },
            suggested_questions: [],
            guardrails_applied: ['invariant_3_scale_type'],
            tools_used: [
              {
                name: 'run_ml_dynamic_discovery',
                label: 'Descoberta ML (CUSUM, Teleconexões & Ridge GCV)',
                summary: 'PHASE_REVERSAL_OR_HUMP_REGIME (CUSUM=2020-01) · FDR tel=1',
                status: 'ok',
                duration_ms: 14.2,
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const liveAnalysis: RegionAnalysisResponse = {
      ...mockAnalysis,
      request_meta: {
        ...mockAnalysis.request_meta,
        source: 'backend_api',
      },
    };
    const regionA = buildRegionSelection('A', 'GWETTOP', [snapCoordToCell(-15, -48, 'GWETTOP')]);
    const regionB = buildRegionSelection('B', 'T2M_MAX', [snapCoordToCell(-15, -48, 'T2M_MAX')]);

    render(
      <ScientificBench
        analysis={liveAnalysis}
        variableA={liveAnalysis.region_a_analysis.variable_id}
        variableB={liveAnalysis.region_b_analysis?.variable_id ?? 'T2M_MAX'}
        regionA={regionA}
        regionB={regionB}
        start={liveAnalysis.region_a_analysis.period.start}
        end={liveAnalysis.region_a_analysis.period.end}
        periodReady
        analyzedAt="15/11/2026 12:30:00"
        anomaly
        separate={false}
        dual={false}
        trendMode="both"
        onAnomalyChange={() => {}}
        onSeparateChange={() => {}}
        onDualChange={() => {}}
        onTrendModeChange={() => {}}
        onBackToMap={() => {}}
      />
    );

    const panel = screen.getByTestId('ml-discovery-bench-panel');
    expect(panel).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText('PHASE_REVERSAL_OR_HUMP_REGIME')).toBeTruthy();
    });
    expect(panel.textContent).toContain('pac_nino34.TS');
    expect(panel.textContent).toContain('0.278');
    expect(panel.textContent).toContain('EL_NINO_FORTE');

    // CUSUM break marker shape rendered in Plotly layout
    const cusumBtn = screen.getByTestId('toggle-cusum-break-btn');
    expect(cusumBtn.textContent).toContain('2020-01');
    const latestWithShape = capturedLayouts[capturedLayouts.length - 1];
    expect(Array.isArray(latestWithShape?.shapes)).toBe(true);
    expect((latestWithShape?.shapes as Array<{ x0?: string }>)[0]?.x0).toBe('2020-01');

    // Clicking toggle removes vertical marker cleanly
    fireEvent.click(cusumBtn);
    const latestAfterToggle = capturedLayouts[capturedLayouts.length - 1];
    expect(latestAfterToggle?.shapes).toBeUndefined();

    // Clicking Copilot CTA invokes Co-Pilot with ML discovery prompt
    fireEvent.click(screen.getByTestId('ml-ask-copilot-btn'));
    await waitFor(() => {
      expect(screen.getByText(/Ferramenta run_ml_dynamic_discovery respondeu/)).toBeTruthy();
    });
  });
});
