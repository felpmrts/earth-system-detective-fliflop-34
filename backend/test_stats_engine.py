"""
Unit test suite for `backend/stats_engine.py` (DADOS-2 — Fase 2).
Tests all 7 Statistical Invariants and full contract compliance with `CONTRATO_DE_DADOS.md`.
"""

from __future__ import annotations

import json
import math
import os
import unittest
from typing import List, Optional

from backend.stats_engine import (
    SemanticContractError,
    VARIABLE_CATALOG,
    aggregate_cells_nanmean,
    analyze_region_series,
    analyze_request,
    apply_spatial_fdr_bh,
    build_global_grid_payload,
    clean_nasa_power_monthly,
    compare_regions,
    compute_climatological_anomalies,
    get_intersecting_date_bounds,
)


def _generate_monthly_dates(start_year: int = 1981, end_year: int = 2025) -> List[str]:
    return [f"{y:04d}-{m:02d}" for y in range(start_year, end_year + 1) for m in range(1, 13)]


class TestStatsEngineInvariants(unittest.TestCase):
    """Validates the 7 Statistical Invariants and CONTRATO_DE_DADOS.md rules."""

    def test_catalog_and_invariant_3_scale_type(self) -> None:
        """Invariant #3: 12 official variables; interval scales strictly forbid percentage change."""
        self.assertEqual(len(VARIABLE_CATALOG), 12)
        for var_id, meta in VARIABLE_CATALOG.items():
            if meta["scale_type"] == "interval":
                self.assertFalse(
                    meta["allow_percentage_change"],
                    f"Invariante #3 violado em {var_id}: variável intervalar não pode permitir %.",
                )

    def test_nasa_power_cleaning_yyyy13_sentinel_and_prectotcorr(self) -> None:
        """DADOS-1/2 Rule: discard YYYY13, replace -999 with None, convert PRECTOTCORR mm/day -> mm/month."""
        raw_power = {
            "202001": 2.0,     # Jan 2020 (31 days) -> 62.0 mm/mês
            "202002": 3.0,     # Feb 2020 (leap year, 29 days) -> 87.0 mm/mês
            "202003": -999.0,  # Sentinel -> None
            "202013": 2.5,     # Annual key -> must be discarded!
        }
        dates, values = clean_nasa_power_monthly(raw_power, variable_id="PRECTOTCORR")
        self.assertEqual(dates, ["2020-01", "2020-02", "2020-03"])
        self.assertAlmostEqual(values[0] or 0.0, 62.0, places=4)
        self.assertAlmostEqual(values[1] or 0.0, 87.0, places=4)
        self.assertIsNone(values[2])

    def test_spatial_aggregation_k_limits_and_ocean_mask(self) -> None:
        """Validates 1 <= K <= 9 nanmean aggregation, MAX_CELLS_EXCEEDED, and OCEAN_MASK_NO_DATA."""
        cell1: List[Optional[float]] = [0.60, -999.0, 0.50]
        cell2: List[Optional[float]] = [0.40, 0.55, -999.0]
        agg = aggregate_cells_nanmean([cell1, cell2], variable_id="GWETTOP")
        self.assertAlmostEqual(agg[0] or 0.0, 0.50, places=5)
        self.assertAlmostEqual(agg[1] or 0.0, 0.55, places=5)
        self.assertAlmostEqual(agg[2] or 0.0, 0.50, places=5)

        # K > 9 must raise MAX_CELLS_EXCEEDED
        with self.assertRaises(SemanticContractError) as ctx_max:
            aggregate_cells_nanmean([[1.0, 2.0]] * 10, variable_id="T2M")
        self.assertEqual(ctx_max.exception.code, "MAX_CELLS_EXCEEDED")

        # All -999 ocean cells must raise OCEAN_MASK_NO_DATA
        with self.assertRaises(SemanticContractError) as ctx_ocean:
            aggregate_cells_nanmean([[-999.0, -999.0], [None, -999.0]], variable_id="GWETTOP")
        self.assertEqual(ctx_ocean.exception.code, "OCEAN_MASK_NO_DATA")

    def test_invariant_1_and_2_leavitt_anomalies_and_ols_sen_slopes(self) -> None:
        """
        Invariants #1 & #2: Deseasonalization removes strong annual cycle;
        OLS & Theil-Sen accurately recover true decadal trend (+0.30 °C/decade) even when
        endpoints (Y_end - Y_start) are corrupted by opposite seasonal/ENSO spikes.
        """
        dates = _generate_monthly_dates(2000, 2024)  # 25 years = 300 months
        true_slope_decade = 0.30  # +0.30 °C/decade
        raw_values: List[Optional[float]] = []

        for idx, d in enumerate(dates):
            year = int(d[:4])
            month = int(d[5:7])
            t_dec = (year + (month - 0.5) / 12.0 - 2000.0) / 10.0
            # Huge seasonal wave (amplitude 8.0 °C) + true secular trend
            seasonal = 8.0 * math.sin(2.0 * math.pi * (month - 1) / 12.0)
            val = 24.0 + seasonal + true_slope_decade * t_dec
            # Corrupt first and last points in opposite directions to trap naive (Y_end - Y_start)
            if idx == 0:
                val += 3.5
            elif idx == len(dates) - 1:
                val -= 3.5
            raw_values.append(val)

        stats = analyze_region_series("T2M", dates, raw_values)

        # 1) Without endpoint outliers, both OLS and Theil-Sen recover +0.3000 °C/decade
        clean_series = list(raw_values)
        clean_series[0] = (clean_series[0] or 0.0) - 3.5
        clean_series[-1] = (clean_series[-1] or 0.0) + 3.5
        stats_clean = analyze_region_series("T2M", dates, clean_series)
        self.assertAlmostEqual(stats_clean["regression"]["slope_per_decade_ols"], true_slope_decade, places=3)
        self.assertAlmostEqual(stats_clean["regression"]["slope_per_decade_sen"], true_slope_decade, places=3)

        # 2) With extreme opposite outliers at t_0 and t_end:
        # Naive endpoint difference (Y_end - Y_start) gives a catastrophic negative rate (~ -8.6 °C/decade),
        # whereas Theil-Sen recovers +0.30 °C/decade within 0.01 and OLS remains strongly positive (~ +0.25):
        naive_slope_decade = ((raw_values[-1] or 0.0) - (raw_values[0] or 0.0)) / 2.5
        self.assertLess(naive_slope_decade, -4.0)
        self.assertAlmostEqual(stats["regression"]["slope_per_decade_sen"], true_slope_decade, delta=0.01)
        self.assertAlmostEqual(stats["regression"]["slope_per_decade_ols"], true_slope_decade, delta=0.06)
        self.assertFalse(stats["allow_percentage_change"])
        self.assertGreater(stats_clean["correlation_and_coupling"]["pearson_r"], 0.99)
        self.assertGreater(stats["correlation_and_coupling"]["kendall_tau"], 0.90)
        self.assertGreater(stats["correlation_and_coupling"]["pearson_r"], 0.50)
        self.assertEqual(stats["significance"]["confidence_tier"], "CONFIRMED_HIGH")

    def test_invariant_5_multiscale_correlation_paradox(self) -> None:
        """
        Invariant #5: Two regions share a positive 25-year secular trend (r_global > 0),
        but oscillate in anti-phase at short timescales (r_detrended < 0).
        """
        dates = _generate_monthly_dates(2000, 2024)
        vals_a: List[Optional[float]] = []
        vals_b: List[Optional[float]] = []

        for idx, d in enumerate(dates):
            t_dec = idx / 120.0
            # Common positive secular trend (+0.8 units/decade), opposite interannual dipole (period 18 months)
            dipole = 0.35 * math.sin(2.0 * math.pi * idx / 18.0)
            vals_a.append(10.0 + 0.8 * t_dec + dipole)
            vals_b.append(10.0 + 0.8 * t_dec - dipole)

        stats_a = analyze_region_series("T2M", dates, vals_a)
        stats_b = analyze_region_series("T2M", dates, vals_b)
        comp = compare_regions("region_north", "region_south", stats_a, stats_b)

        mc = comp["multiscale_correlation"]
        self.assertGreater(mc["long_term_secular_r"], 0.50)
        self.assertLess(mc["short_term_detrended_r"], -0.80)
        self.assertEqual(mc["paradox_type"], "MULTISCALE_PARADOX_POS_GLOBAL_NEG_LOCAL")

    def test_invariant_6_and_7_gam_mahalanobis_and_ar1_fdr(self) -> None:
        """
        Invariants #6 & #7: Detects accelerating decline, flags 2015-11 Super El Niño
        Mahalanobis outlier (D_M > 2.5) without deleting it, reduces N_eff under AR(1) memory,
        and controls false discoveries via Benjamini-Hochberg FDR.
        """
        dates = _generate_monthly_dates(1981, 2025)
        raw_values: List[Optional[float]] = []
        ar_noise = 0.0

        for idx, d in enumerate(dates):
            year = int(d[:4])
            month = int(d[5:7])
            t_dec = idx / 120.0
            seasonal = 0.08 * math.cos(2.0 * math.pi * (month - 1) / 12.0)
            # Deterministic AR(1)-like correlated fluctuation
            ar_noise = 0.75 * ar_noise + 0.004 * math.sin(0.37 * idx)
            # Accelerating decline in soil moisture
            val = 0.65 + seasonal - 0.015 * t_dec - 0.005 * (t_dec ** 2) + ar_noise
            if d == "2015-11":
                val -= 0.16  # Severe drought spike during 2015-2016 Super El Niño
            raw_values.append(val)

        stats = analyze_region_series("GWETTOP", dates, raw_values)
        self.assertEqual(stats["regression"]["regime_shape"], "accelerating_decline")
        self.assertLess(stats["regression"]["quadratic_acceleration_B2"], 0.0)

        # AR(1) effective sample size must be strictly smaller than N=540
        self.assertEqual(stats["period"]["n_observations"], 540)
        self.assertLess(stats["period"]["n_effective_ar1"], 540.0)

        # Mahalanobis outlier must flag 2015-11 with D_M > 2.5 and keep all 540 series points intact
        outlier_dates = [o["date"] for o in stats["outliers_mahalanobis"]]
        self.assertIn("2015-11", outlier_dates)
        top_outlier = next(o for o in stats["outliers_mahalanobis"] if o["date"] == "2015-11")
        self.assertGreater(top_outlier["mahalanobis_d"], 2.5)
        self.assertEqual(top_outlier["direction"], "below_ellipse")
        self.assertIn("El Niño 2015-2016", top_outlier["diagnostic_hint"])
        self.assertEqual(len(stats["series"]["raw_values"]), 540)
        self.assertEqual(len(stats["series"]["sen_fit"]), 540)
        self.assertEqual(len(stats["series"]["gam_smooth_fit"]), 540)

        # Verify GAM / GCV cubic smoothing spline smoothness (second differences remain small even across 2015-11 spike)
        gam_arr = stats["series"]["gam_smooth_fit"]
        max_second_diff = max(
            abs(gam_arr[i] - 2.0 * gam_arr[i - 1] + gam_arr[i - 2])
            for i in range(2, len(gam_arr))
        )
        self.assertLess(max_second_diff, 0.002)

        # Spatial FDR check (scipy.stats.false_discovery_control BH step-up)
        q_vals, flags = apply_spatial_fdr_bh([0.0001, 0.012, 0.048, 0.25, 0.80], alpha=0.05)
        self.assertAlmostEqual(q_vals[0], 0.0005, places=6)
        self.assertAlmostEqual(q_vals[1], 0.0300, places=6)
        self.assertAlmostEqual(q_vals[2], 0.0800, places=6)
        self.assertTrue(flags[0])
        self.assertTrue(flags[1])
        self.assertFalse(flags[2])
        self.assertFalse(flags[3])
        self.assertFalse(flags[4])

    def test_analyze_request_and_global_grid_contract_compliance(self) -> None:
        """Validates full `RegionAnalysisResponse` (Fluxo B, including `sen_fit`) and `GlobalGridFile` (Fluxo A)."""
        dates = _generate_monthly_dates(1984, 2025)
        cell_a1 = [
            0.64 - 0.022 * (i / 120.0) - (0.14 if d == "2015-10" else 0.0) + 0.005 * math.sin(i)
            for i, d in enumerate(dates)
        ]
        cell_a2 = [v + 0.01 for v in cell_a1]
        cell_b1 = [
            30.5 + 0.42 * (i / 120.0) + (1.8 if d == "2015-10" else 0.0) - 0.04 * math.sin(i)
            for i, d in enumerate(dates)
        ]
        cell_b2 = [v - 0.2 for v in cell_b1]

        req = {
            "variable_a": "GWETTOP",
            "variable_b": "T2M_MAX",
            "region_a": {
                "slot": "A",
                "region_id": "MERRA-2__r142_c210+r142_c211",
                "source_model": "MERRA-2",
                "grid_resolution": {"dLat": 0.5, "dLon": 0.625},
                "cells": [
                    {"cell_id": "r142_c210", "row": 142, "col": 210, "lat": -18.75, "lon": -48.4375},
                    {"cell_id": "r142_c211", "row": 142, "col": 211, "lat": -18.75, "lon": -47.8125},
                ],
            },
            "region_b": {
                "slot": "B",
                "region_id": "MERRA-2__r173_c191+r173_c192",
                "source_model": "MERRA-2",
                "grid_resolution": {"dLat": 0.5, "dLon": 0.625},
                "cells": [
                    {"cell_id": "r173_c191", "row": 173, "col": 191, "lat": -3.25, "lon": -60.3125},
                    {"cell_id": "r173_c192", "row": 173, "col": 192, "lat": -3.25, "lon": -59.6875},
                ],
            },
            "start_date": "1984-01",
            "end_date": "2025-12",
        }

        resp = analyze_request(
            request_payload=req,
            dates_a=dates,
            cells_series_a=[cell_a1, cell_a2],
            dates_b=dates,
            cells_series_b=[cell_b1, cell_b2],
            source="backend_api",
        )

        self.assertEqual(resp["request_meta"]["cells_count_a"], 2)
        self.assertEqual(resp["request_meta"]["cells_count_b"], 2)
        self.assertIsNotNone(resp["region_b_analysis"])
        self.assertIsNotNone(resp["comparison_pair"])
        self.assertTrue(resp["comparison_pair"]["spatial_divergence_detected"])
        self.assertIn("sen_fit", resp["region_a_analysis"]["series"])
        self.assertIn("sen_fit", resp["region_b_analysis"]["series"])
        self.assertEqual(
            len(resp["region_a_analysis"]["series"]["sen_fit"]),
            len(resp["region_a_analysis"]["series"]["dates"]),
        )

        grid = build_global_grid_payload(
            variable_id="T2M",
            period_start="1981-01",
            period_end="2025-12",
            raw_grid_cells=[
                {"lat": -18.75, "lon": -48.125, "slope_sen_decade": 0.34, "p_value_ar1": 0.001},
                {"lat": -3.25, "lon": -60.0, "slope_sen_decade": 0.28, "p_value_ar1": 0.008},
                {"lat": 0.0, "lon": -30.0, "slope_sen_decade": 0.02, "p_value_ar1": 0.62},
            ],
        )
        self.assertEqual(len(grid["points"]), 3)
        self.assertTrue(grid["points"][0]["is_sig"])
        self.assertFalse(grid["points"][2]["is_sig"])


if __name__ == "__main__":
    unittest.main()
