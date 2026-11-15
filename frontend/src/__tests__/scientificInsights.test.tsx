// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import mockAnalysisJson from '../../public/data/mock_analysis.json';
import type { RegionAnalysisResponse } from '../contracts/types';
import { buildRegionSelection, snapCoordToCell } from '../geo/gridGeometry';
import {
  applyBenjaminiHochbergFdr,
  auditAnalysisInvariants,
  buildMethodologicalSummaryText,
  computeClientLaggedCrossCorrelation,
  computeClientSeasonalStratifiedTrends,
} from '../services/scientificInsights';

const capturedPlots: Array<{ data?: unknown[]; layout?: Record<string, unknown> }> = [];

vi.mock('plotly.js-basic-dist-min', () => ({ default: {} }));
vi.mock('react-plotly.js/factory', () => ({
  default: () =>
    function MockPlot(props: { data?: unknown[]; layout?: Record<string, unknown> }) {
      capturedPlots.push({ data: props.data, layout: props.layout });
      return <div data-testid="mock-plotly-chart" />;
    },
}));

import { ScientificBench } from '../bench/ScientificBench';

const mockAnalysis = mockAnalysisJson as unknown as RegionAnalysisResponse;

function generateDates(startYear: number, totalMonths: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < totalMonths; i += 1) {
    const year = startYear + Math.floor(i / 12);
    const month = (i % 12) + 1;
    out.push(`${year}-${String(month).padStart(2, '0')}`);
  }
  return out;
}

function cloneWithSeries(
  base: RegionAnalysisResponse,
  anomaliesA: number[],
  anomaliesB: number[],
  rawOverrideA?: number[],
  rawOverrideB?: number[],
  datesOverride?: string[]
): RegionAnalysisResponse {
  const regA = base.region_a_analysis;
  const regB = base.region_b_analysis ?? base.region_a_analysis;
  const dates = datesOverride ?? regA.series.dates;
  const zeroFitA = new Array<number>(dates.length).fill(0);
  const zeroFitB = new Array<number>(dates.length).fill(0);

  return {
    ...base,
    region_a_analysis: {
      ...regA,
      period: {
        ...regA.period,
        start: dates[0] ?? regA.period.start,
        end: dates[dates.length - 1] ?? regA.period.end,
        n_observations: dates.length,
      },
      series: {
        ...regA.series,
        dates,
        raw_values: rawOverrideA ?? anomaliesA,
        anomaly_values: anomaliesA,
        linear_fit: zeroFitA,
        sen_fit: zeroFitA,
        gam_smooth_fit: zeroFitA,
      },
    },
    region_b_analysis: {
      ...regB,
      period: {
        ...regB.period,
        start: dates[0] ?? regB.period.start,
        end: dates[dates.length - 1] ?? regB.period.end,
        n_observations: dates.length,
      },
      series: {
        ...regB.series,
        dates,
        raw_values: rawOverrideB ?? anomaliesB,
        anomaly_values: anomaliesB,
        linear_fit: zeroFitB,
        sen_fit: zeroFitB,
        gam_smooth_fit: zeroFitB,
      },
    },
  };
}

describe('Scientific Insights Service & Bench Integration (Lag-Lead, Sazonal & 7 Invariantes)', () => {
  beforeEach(() => {
    capturedPlots.length = 0;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('computes AR(1)-corrected lagged cross-correlation (-12..+12) and BH-FDR q-values across 25 lags', () => {
    const lagResult = computeClientLaggedCrossCorrelation(mockAnalysis, 12);
    expect(lagResult.lag_profile).toHaveLength(25);
    expect(lagResult.fdr_family_size).toBe(25);
    expect(lagResult.uses_deseasonalized_anomalies).toBe(true);
    expect(lagResult.detrending_applied).toBe(true);
    expect(lagResult.lag_profile[0]?.lag_months).toBe(-12);
    expect(lagResult.lag_profile[24]?.lag_months).toBe(12);

    // Independent verification of Benjamini-Hochberg FDR across all 25 lag p-values
    const pVec = lagResult.lag_profile.map(r => r.p_detrended_ar1);
    const bhCheck = applyBenjaminiHochbergFdr(pVec, 0.05);

    lagResult.lag_profile.forEach((row, idx) => {
      expect(row.r_detrended).toBeGreaterThanOrEqual(-1);
      expect(row.r_detrended).toBeLessThanOrEqual(1);
      expect(row.ci95_threshold).toBeGreaterThan(0);
      expect(row.n_effective_ar1).toBeGreaterThan(0);
      expect(row.q_fdr).toBeCloseTo(bhCheck.qValues[idx] ?? 1, 6);
      expect(row.q_fdr).toBeGreaterThanOrEqual(row.p_detrended_ar1 - 1e-8);
      expect(row.significant_fdr05).toBe(row.q_fdr < 0.05);
    });

    expect(lagResult.precedence_interpretation).toContain('τ*');
    expect(lagResult.precedence_interpretation).toContain('q_FDR');
  });

  it('removes shared secular trend before lag correlation so r_detrended avoids spurious peaks', () => {
    const n = 120;
    const dates = generateDates(2015, n);
    // Both A and B have strong parallel secular trends (+1.5/decade) plus orthogonal high-frequency oscillations
    const anomA = dates.map((_, i) => 0.15 * (i / 12) + 0.08 * Math.sin((2 * Math.PI * 19 * i) / n));
    const anomB = dates.map((_, i) => 0.14 * (i / 12) + 0.08 * Math.cos((2 * Math.PI * 31 * i) / n));
    const synthetic = cloneWithSeries(mockAnalysis, anomA, anomB, undefined, undefined, dates);

    const lagRes = computeClientLaggedCrossCorrelation(synthetic, 12);

    // Without detrending, shared secular trend inflates raw anomaly correlation
    expect(lagRes.best_raw_lag.r_raw_anomalies).toBeGreaterThan(0.75);

    // After detrending deseasonalized series, all 25 lags remain small with no false secular peak
    for (const row of lagRes.lag_profile) {
      expect(Math.abs(row.r_detrended)).toBeLessThan(0.25);
    }
    expect(lagRes.best_detrended_lag.significant_fdr05).toBe(false);
    expect(lagRes.best_fdr_status).toBe('NOT_SIGNIFICANT');
    expect(lagRes.fdr_significant_lags_count).toBe(0);
  });

  it('detects true lagged precedence A_LEADS_B and distinguishes BH-FDR vs local AR(1) exceedance cleanly', () => {
    const n = 120;
    const dates = generateDates(2015, n);
    // Orthogonal-like pseudo-random wave in A; B lags A by +3 months after secular trend removal
    const waveA = dates.map(
      (_, i) => Math.sin(i * 0.65) + 0.5 * Math.cos(i * 1.13) - 0.3 * Math.sin(i * 1.71)
    );
    const anomA = waveA.map((w, i) => 0.25 * (i / 12) + w);
    const anomB = dates.map((_, i) => 0.2 * (i / 12) + (i >= 3 ? waveA[i - 3] ?? 0 : 0));
    const coupledSynthetic = cloneWithSeries(mockAnalysis, anomA, anomB, undefined, undefined, dates);

    const coupledRes = computeClientLaggedCrossCorrelation(coupledSynthetic, 12);
    expect(coupledRes.best_detrended_lag.lag_months).toBe(3);
    expect(coupledRes.precedence_direction).toBe('A_LEADS_B');
    expect(coupledRes.best_detrended_lag.r_detrended).toBeGreaterThan(0.8);
    expect(coupledRes.best_detrended_lag.q_fdr).toBeLessThan(0.05);
    expect(coupledRes.best_fdr_status).toBe('FDR_SIGNIFICANT');
    expect(coupledRes.precedence_interpretation).toContain('precede');
    expect(coupledRes.precedence_interpretation).not.toMatch(/cause|causat|provok|induc/i);

    // Now test the 25-test multiple-comparison penalty directly via BH-FDR
    const borderPValues = new Array<number>(25).fill(0.75);
    borderPValues[12] = 0.025; // passes single-lag p < 0.05, fails 25-lag BH-FDR (0.025 * 25 = 0.625)
    const borderBh = applyBenjaminiHochbergFdr(borderPValues, 0.05);
    expect(borderBh.qValues[12]).toBeCloseTo(0.625, 6);
    expect(borderBh.significantFlags[12]).toBe(false);
  });

  it('computes seasonal DJF-SON strictly from deseasonalized monthly anomalies with exact AR(1) p-values and zero % on °C', () => {
    // Parity check against Python compute_seasonal_stratified_trends (M3 annual season-year + BH-FDR) on mock_analysis.json
    const seasonalMock = computeClientSeasonalStratifiedTrends(mockAnalysis);
    expect(seasonalMock.uses_deseasonalized_anomalies).toBe(true);
    expect(seasonalMock.region_a.seasons.DJF.p_value_ar1_corrected).toBeCloseTo(0.05180925, 4);
    expect(seasonalMock.region_a.seasons.JJA.p_value_ar1_corrected).toBeCloseTo(0.05203428, 4);
    expect(seasonalMock.region_a.seasons.DJF.slope_per_decade_sen).toBeCloseTo(-0.07908, 4);
    expect(seasonalMock.region_a.seasons.DJF.significant_fdr05).toBe(false);
    expect(seasonalMock.region_a.seasons.DJF.season_label).toBe('DJF (Dec–Feb)');
    expect(seasonalMock.region_a.seasons.MAM.season_label).toBe('MAM (Mar–May)');
    expect(seasonalMock.region_a.seasons.JJA.season_label).toBe('JJA (Jun–Aug)');
    expect(seasonalMock.region_a.seasons.SON.season_label).toBe('SON (Sep–Nov)');

    // Construct an interval (°C) dataset with strong within-DJF raw baseline differences (Dec=12°C, Jan=26°C, Feb=19°C)
    // and verify seasonal regression is strictly invariant to raw_values (uses anomaly_values Y'_{a,m} only)
    const n = 120;
    const dates = generateDates(2015, n);
    const anomaliesT2M = dates.map((d, i) => {
      const m = Number(d.split('-')[1]);
      const decade = i / 120;
      if (m === 12 || m === 1 || m === 2) {
        return 0.6 * decade + 0.02 * Math.sin(i * 0.9);
      }
      return 0.02 * Math.cos(i * 1.1);
    });
    const rawMild = dates.map((d, i) => {
      const m = Number(d.split('-')[1]);
      const clim = m === 12 ? 12 : m === 1 ? 26 : m === 2 ? 19 : 21;
      return clim + (anomaliesT2M[i] ?? 0);
    });
    const rawCorrupted = rawMild.map((v, i) => v + 50 * ((i % 3) - 1) - 12 * (i / n));

    const tempPayloadBase = cloneWithSeries(mockAnalysis, anomaliesT2M, anomaliesT2M, rawMild, rawMild, dates);
    const intervalAnalysisA: RegionAnalysisResponse = {
      ...tempPayloadBase,
      region_a_analysis: {
        ...tempPayloadBase.region_a_analysis,
        variable_id: 'T2M',
        variable_name: 'Temperatura a 2m',
        scale_type: 'interval',
        unit: '°C',
        trend_unit: '°C/década',
        allow_percentage_change: false,
      },
    };
    const intervalAnalysisCorruptedRaw: RegionAnalysisResponse = {
      ...intervalAnalysisA,
      region_a_analysis: {
        ...intervalAnalysisA.region_a_analysis,
        series: {
          ...intervalAnalysisA.region_a_analysis.series,
          raw_values: rawCorrupted,
        },
      },
    };

    const resMild = computeClientSeasonalStratifiedTrends(intervalAnalysisA);
    const resCorrupted = computeClientSeasonalStratifiedTrends(intervalAnalysisCorruptedRaw);

    expect(resMild.region_a.dominant_season).toBe('DJF');
    expect(resMild.region_a.seasons.DJF.slope_per_decade_sen).toBeGreaterThan(0.5);
    expect(resMild.region_a.seasons.DJF.p_value_ar1_corrected).toBeLessThan(0.05);
    expect(resMild.region_a.seasons.DJF.significant_ar1).toBe(true);
    expect(resMild.region_a.trend_unit).toBe('°C/decade');
    expect(resMild.region_a.trend_unit).not.toContain('%');
    expect(resMild.summary_interpretation).toContain('°C/decade');
    expect(resMild.summary_interpretation.replace(/95% CI/g, '')).not.toContain('%');

    for (const code of ['DJF', 'MAM', 'JJA', 'SON'] as const) {
      expect(resCorrupted.region_a.seasons[code].slope_per_decade_sen).toBe(
        resMild.region_a.seasons[code].slope_per_decade_sen
      );
      expect(resCorrupted.region_a.seasons[code].p_value_ar1_corrected).toBe(
        resMild.region_a.seasons[code].p_value_ar1_corrected
      );
      expect(resCorrupted.region_a.seasons[code].significant_ar1).toBe(
        resMild.region_a.seasons[code].significant_ar1
      );
    }
  });

  it('audits all 7 statistical invariants and flags interval scale percentage violations', () => {
    const report = auditAnalysisInvariants(mockAnalysis);
    expect(report.totalCount).toBe(7);
    expect(report.passedCount).toBe(7);
    expect(report.allPassed).toBe(true);

    const summaryText = buildMethodologicalSummaryText(mockAnalysis, report);
    expect(summaryText).toContain('7/7 Audited Invariants');
    expect(summaryText).toContain(mockAnalysis.region_a_analysis.variable_id);
    expect(summaryText).not.toContain('**');

    const violatedAnalysis: RegionAnalysisResponse = {
      ...mockAnalysis,
      region_a_analysis: {
        ...mockAnalysis.region_a_analysis,
        scale_type: 'interval',
        allow_percentage_change: true,
        trend_unit: '%/década',
      },
    };
    const violatedReport = auditAnalysisInvariants(violatedAnalysis);
    expect(violatedReport.allPassed).toBe(false);
    expect(violatedReport.items.find(i => i.number === 3)?.passed).toBe(false);
  });

  it('renders 7/7 Invariants modal, Lag-Lead BH-FDR telemetry with strictly non-causal wording, and Seasonal AR(1) without % on °C', async () => {
    const regionA = buildRegionSelection('A', 'GWETTOP', [
      snapCoordToCell(-15, -48, 'GWETTOP'),
    ]);
    const regionB = buildRegionSelection('B', 'T2M_MAX', [
      snapCoordToCell(-15, -48, 'T2M_MAX'),
    ]);

    render(
      <ScientificBench
        analysis={mockAnalysis}
        variableA={mockAnalysis.region_a_analysis.variable_id}
        variableB={
          mockAnalysis.region_b_analysis?.variable_id ??
          mockAnalysis.region_a_analysis.variable_id
        }
        regionA={regionA}
        regionB={regionB}
        start={mockAnalysis.region_a_analysis.period.start}
        end={mockAnalysis.region_a_analysis.period.end}
        periodReady
        analyzedAt="15/11/2026 09:00:00"
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

    // 0. Ensure ML Discovery UI is completely absent
    expect(screen.queryByTestId('ml-discovery-toggle-btn')).toBeNull();
    expect(screen.queryByTestId('ml-discovery-drawer')).toBeNull();

    // 1. Live 7/7 Invariants Badge & Methodology Modal with rich Markdown
    const badgeBtn = screen.getByTestId('invariants-badge-btn');
    expect(badgeBtn.textContent).toContain('7/7 Audited Invariants');
    fireEvent.click(badgeBtn);

    const modal = screen.getByTestId('methodology-modal');
    expect(modal).toBeTruthy();
    expect(screen.getByTestId('invariant-audit-inv-1')).toBeTruthy();
    expect(screen.getByTestId('invariant-audit-inv-7')).toBeTruthy();

    // Rich Markdown rendered without raw asterisks or raw LaTeX backslashes
    const modalText = modal.textContent ?? '';
    expect(modalText).not.toContain('**');
    expect(modalText).not.toContain('\\frac');
    expect(modalText).not.toContain('\\bar');
    expect(modalText).not.toContain('\\quad');
    expect(modalText).not.toContain('\\implies');
    expect(modal.querySelectorAll('.cp-rich strong').length).toBeGreaterThan(5);
    expect(modal.querySelectorAll('.cp-rich .cp-code').length).toBeGreaterThan(5);

    fireEvent.click(screen.getByTestId('copy-methodology-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('copy-methodology-btn').textContent).toContain(
        'Summary Copied'
      );
    });

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('methodology-modal')).toBeNull();

    // 2. Lag-Lead mode: BH-FDR (25 lags) telemetry & zero causal wording
    fireEvent.click(screen.getByTestId('view-mode-lag'));
    const lagContainer = screen.getByTestId('lag-lead-chart-container');
    expect(lagContainer).toBeTruthy();
    expect(screen.getByTestId('lag-peak-fdr-value').textContent).toContain('q_FDR (25 lags)');
    expect(screen.getByTestId('lag-peak-fdr-status').textContent).toContain('BH-FDR (25 lags)');

    const lagUiText = lagContainer.textContent ?? '';
    expect(lagUiText).toContain('τ*');
    expect(lagUiText).not.toMatch(/causa|provoc|gera|induz/i);

    const lagPlot = capturedPlots[capturedPlots.length - 1];
    const lagPlotJson = JSON.stringify(lagPlot ?? {});
    expect(lagPlotJson).toContain('Temporal Precedence');
    expect(lagPlotJson).not.toMatch(/\bcauses?\b|\bcaused\b|\bprovokes?\b|\binduces?\b/i);

    // 3. Seasonal mode: DJF-SON cards show p_AR1 and T2M_MAX uses °C/decade with zero %
    fireEvent.click(screen.getByTestId('view-mode-seasonal'));
    const seasonalContainer = screen.getByTestId('seasonal-chart-container');
    const seasonalText = seasonalContainer.textContent ?? '';
    expect(seasonalText).toContain('DJF');
    expect(seasonalText).toContain('MAM');
    expect(seasonalText).toContain('JJA');
    expect(seasonalText).toContain('SON');
    expect(seasonalText).not.toMatch(/Austral/i);
    expect(seasonalText).toContain('°C/decade');

    for (const code of ['DJF', 'MAM', 'JJA', 'SON'] as const) {
      const cardText = screen.getByTestId(`seasonal-card-${code}`).textContent ?? '';
      expect(cardText).toContain('p_AR1 =');
      expect(cardText).not.toMatch(/T2M_MAX[^°\n]*%/);
    }
  });

  it('toggles collapsible card aria-expanded states via bench-toggle-all-cards and renders copilot welcome bubble', () => {
    const regionA = buildRegionSelection('A', 'GWETTOP', [snapCoordToCell(-15, -48, 'GWETTOP')]);
    const regionB = buildRegionSelection('B', 'T2M_MAX', [snapCoordToCell(-15, -48, 'T2M_MAX')]);

    const { container } = render(
      <ScientificBench
        analysis={mockAnalysis}
        variableA={mockAnalysis.region_a_analysis.variable_id}
        variableB={mockAnalysis.region_b_analysis?.variable_id ?? mockAnalysis.region_a_analysis.variable_id}
        regionA={regionA}
        regionB={regionB}
        start={mockAnalysis.region_a_analysis.period.start}
        end={mockAnalysis.region_a_analysis.period.end}
        periodReady
        analyzedAt="15/11/2026 09:00:00"
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

    const welcomeBubble = screen.getByTestId('copilot-welcome-bubble');
    expect(welcomeBubble.textContent).toContain('Statistical Co-Pilot');

    const toggleAllBtn = screen.getByTestId('bench-toggle-all-cards');
    const getToggleStates = () =>
      Array.from(container.querySelectorAll<HTMLButtonElement>('.bench-card-toggle')).map(btn =>
        btn.getAttribute('aria-expanded')
      );

    // All collapsible cards start collapsed so Expand All is shown first
    expect(toggleAllBtn.textContent).toContain('Expand All');
    expect(getToggleStates().every(v => v === 'false')).toBe(true);

    // Click Expand All -> all collapsible cards open
    fireEvent.click(toggleAllBtn);
    expect(toggleAllBtn.textContent).toContain('Collapse Panels');
    expect(getToggleStates().every(v => v === 'true')).toBe(true);

    // Click Collapse Panels -> all collapsible cards collapse while remaining in DOM
    fireEvent.click(toggleAllBtn);
    expect(toggleAllBtn.textContent).toContain('Expand All');
    expect(getToggleStates().every(v => v === 'false')).toBe(true);
    expect(container.querySelector('.diagnostic-drawer')).toBeTruthy();
    expect(container.querySelector('.data-provenance')).toBeTruthy();

    // Selecting Lag-Lead view renders chart container cleanly with insight card initially collapsed, then openable via pill
    fireEvent.click(screen.getByTestId('view-mode-lag'));
    const lagToggle = container.querySelector<HTMLButtonElement>('[data-card-id="insight-lag"] .bench-card-toggle');
    expect(lagToggle?.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(screen.getByTestId('bench-section-pill-insight-lag'));
    expect(lagToggle?.getAttribute('aria-expanded')).toBe('true');
  });

  it('updates bench-sections-toolbar counter, visible pills by viewMode, and toggles cards via pills', async () => {
    const regionA = buildRegionSelection('A', 'GWETTOP', [snapCoordToCell(-15, -48, 'GWETTOP')]);
    const regionB = buildRegionSelection('B', 'T2M_MAX', [snapCoordToCell(-15, -48, 'T2M_MAX')]);

    const { container } = render(
      <ScientificBench
        analysis={mockAnalysis}
        variableA={mockAnalysis.region_a_analysis.variable_id}
        variableB={mockAnalysis.region_b_analysis?.variable_id ?? mockAnalysis.region_a_analysis.variable_id}
        regionA={regionA}
        regionB={regionB}
        start={mockAnalysis.region_a_analysis.period.start}
        end={mockAnalysis.region_a_analysis.period.end}
        periodReady
        analyzedAt="15/11/2026 09:00:00"
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

    const toolbar = screen.getByTestId('bench-sections-toolbar');
    const countBadge = screen.getByTestId('bench-sections-count');
    expect(toolbar.textContent).toContain('ANALYTICAL PANELS');
    expect(countBadge.textContent).toBe('0/2 open');

    const diagPill = screen.getByTestId('bench-section-pill-diagnostic');
    const provPill = screen.getByTestId('bench-section-pill-provenance');
    expect(diagPill.className).toContain('is-closed');
    expect(provPill.className).toContain('is-closed');

    fireEvent.click(diagPill);
    expect(diagPill.className).toContain('is-open');
    expect(countBadge.textContent).toBe('1/2 open');

    fireEvent.click(provPill);
    expect(provPill.className).toContain('is-open');
    expect(countBadge.textContent).toBe('2/2 open');

    fireEvent.click(screen.getByTestId('view-mode-lag'));
    const lagPill = screen.getByTestId('bench-section-pill-insight-lag');
    expect(lagPill.className).toContain('is-closed');
    expect(countBadge.textContent).toBe('2/3 open');
    fireEvent.click(lagPill);
    expect(countBadge.textContent).toBe('3/3 open');

    fireEvent.click(screen.getByTestId('view-mode-seasonal'));
    const seasonalInsightPill = screen.getByTestId('bench-section-pill-insight-seasonal');
    const seasonalCardsPill = screen.getByTestId('bench-section-pill-seasonal-cards');
    expect(seasonalInsightPill.className).toContain('is-closed');
    expect(seasonalCardsPill.className).toContain('is-closed');
    expect(countBadge.textContent).toBe('2/4 open');
    fireEvent.click(seasonalInsightPill);
    fireEvent.click(seasonalCardsPill);
    expect(countBadge.textContent).toBe('4/4 open');
    expect(container.querySelector('[data-card-id="provenance"] .bench-card-toggle')?.getAttribute('aria-expanded')).toBe('true');

    // Toggle Copilot off and back on without scrollIntoView errors in jsdom
    fireEvent.click(screen.getByRole('button', { name: /Hide AI Co-Pilot/i }));
    expect(container.querySelector('.copilot-drawer')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Statistical Co-Pilot/i }));
    expect(container.querySelector('.copilot-drawer')).toBeTruthy();

    // Quick AI Summary button at the top of the bench opens/scrolls to Copilot and posts a simplified summary
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;
    fireEvent.click(screen.getByRole('button', { name: /Hide AI Co-Pilot/i }));
    expect(container.querySelector('.copilot-drawer')).toBeNull();

    const quickBtn = screen.getByTestId('quick-ai-summary-btn');
    fireEvent.click(quickBtn);

    await waitFor(() => {
      const copilotEl = container.querySelector('.copilot-drawer');
      expect(copilotEl).toBeTruthy();
      expect(scrollSpy).toHaveBeenCalled();
      expect(copilotEl?.textContent).toContain('Simple Summary');
    });
  });
});
