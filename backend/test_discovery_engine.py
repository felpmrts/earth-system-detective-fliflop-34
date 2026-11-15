from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import numpy as np

from backend.discovery_engine import (
    discover_from_analysis,
    handle_discover_request,
)
from backend.stats_engine import SemanticContractError, analyze_single_series
from data.api.server import BackendRouter
from data.cache.store import CellCacheStore


class TestDiscoveryEngine(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        rng = np.random.default_rng(42)
        cls.dates = [f"{yr:04d}-{m:02d}" for yr in range(2001, 2026) for m in range(1, 13)]
        n = len(cls.dates)
        t = np.arange(n, dtype=np.float64)
        season = np.sin(2.0 * np.pi * (t % 12.0) / 12.0)

        # Synthetic ENSO signal with realistic AR(1) memory
        nino = np.zeros(n)
        atl_s = np.zeros(n)
        for k in range(1, n):
            nino[k] = 0.55 * nino[k - 1] + rng.normal(0.0, 0.75)
            atl_s[k] = 0.50 * atl_s[k - 1] + rng.normal(0.0, 0.55)

        cls.ocean_override = {
            "pac_nino34": {
                "TS": {cls.dates[i]: float(nino[i]) for i in range(n)},
            },
            "atl_s": {
                "TS": {cls.dates[i]: float(atl_s[i]) for i in range(n)},
            },
            "atl_meridional_grad": {
                "TS": {cls.dates[i]: float(-atl_s[i] * 0.8) for i in range(n)},
            },
        }

        # Target series coupled to pac_nino34 at lag=2 and with a regime shift in the tail (index 186, 38%)
        regime_shift = np.where(t >= 186, 3.2, 0.0)
        y_raw = (
            25.0
            + 2.0 * season
            + 0.03 * (t / 12.0)
            + 0.95 * np.roll(nino, 2)
            + regime_shift
            + rng.normal(0.0, 0.35, n)
        )
        # Inject extreme outlier in 2015-11 (index 178)
        y_raw[178] += 4.5
        cls.y_raw = [round(float(v), 4) for v in y_raw]
        prec_arr = 150.0 - 40.0 * season - 18.0 * np.roll(nino, 2) + rng.normal(0.0, 8.0, n)
        cls.prec_raw = [round(float(v), 4) for v in prec_arr]
        cls.primary_analysis = analyze_single_series("T2M", cls.dates, cls.y_raw)
        cls.secondary_analysis = analyze_single_series("PRECTOTCORR", cls.dates, cls.prec_raw)

    def test_sub_50ms_execution_and_partial_teleconnection_recovery(self) -> None:
        res = discover_from_analysis(
            self.primary_analysis,
            secondary_analyses={"PRECTOTCORR": self.secondary_analysis},
            ocean_anom_override=self.ocean_override,
        )
        self.assertLess(res["discovery_meta"]["execution_time_ms"], 50.0)

        tele = res["partial_teleconnections"]
        self.assertEqual(tele["status"], "OK")
        self.assertGreaterEqual(tele["significant_partial_fdr05_count"], 1)
        top = tele["top_teleconnections"][0]
        self.assertEqual(top["ocean_box_id"], "pac_nino34")
        self.assertEqual(top["lag_months"], 2)
        self.assertGreater(top["partial_r"], 0.45)

    def test_structural_regime_break_and_gcv_attribution(self) -> None:
        res = discover_from_analysis(
            self.primary_analysis,
            secondary_analyses={"PRECTOTCORR": self.secondary_analysis},
            ocean_anom_override=self.ocean_override,
        )
        geom = res["regime_and_gam_geometry"]
        self.assertTrue(geom["cusum_break_detected"])
        self.assertIsNotNone(geom["break_date"])

        attr = res["fast_gcv_physical_attribution"]
        self.assertEqual(attr["status"], "OK")
        self.assertGreater(attr["detrended_gcv_r2"], 0.10)
        self.assertEqual(attr["drivers_ranked"][0]["predictor"], "PRECTOTCORR")

    def test_handle_discover_request_contracts(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            empty_cache = Path(tmpdir)
            resp = handle_discover_request(
                {
                    "region_a_analysis": self.primary_analysis,
                    "region_b_analysis": self.secondary_analysis,
                },
                cache_dir=empty_cache,
            )
            self.assertIn("regime_and_gam_geometry", resp)
            self.assertIn("attributed_mahalanobis_outliers", resp)

            with self.assertRaises(SemanticContractError):
                handle_discover_request({"invalid": True}, cache_dir=empty_cache)

    def test_backend_router_post_api_discover(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            router = BackendRouter(cache=CellCacheStore(Path(tmpdir)))
            status_ok, payload_ok = router.handle_post(
                "/api/discover",
                {
                    "region_a_analysis": self.primary_analysis,
                    "region_b_analysis": self.secondary_analysis,
                },
            )
            self.assertEqual(status_ok, 200)
            self.assertIn("discovery_meta", payload_ok)
            self.assertIn("analysis_key", payload_ok)

            # Cached analysis_key lookup should work with zero heavy payload
            status_cached, payload_cached = router.handle_post(
                "/api/discover",
                {"analysis_key": payload_ok["analysis_key"]},
            )
            self.assertEqual(status_cached, 200)
            self.assertEqual(payload_cached["discovery_meta"]["variable_id"], "T2M")

            # Invalid payload returns HTTP 400 with standardized contract error
            status_err, payload_err = router.handle_post("/api/discover", {"invalid": True})
            self.assertEqual(status_err, 400)
            self.assertEqual(payload_err["code"], "CONTRACT_VIOLATION")

    def test_post_audit_cusum_c2_date_alignment_c3_and_f_test_m6(self) -> None:
        """Regression tests for C2 (0.880/2-stage p-value coherence), C3 (date alignment), M6 (purged CV & F-test)."""
        import math
        import numpy as np
        from backend.discovery_engine import (
            compute_fast_gcv_physical_attribution,
            detect_regime_and_gam_geometry,
        )

        # C2 coherence: detected == (p_value_ar1_bridge <= 0.05) on clean noisy regime step in detrended series
        dates = [f"{2001 + i // 12:04d}-{(i % 12) + 1:02d}" for i in range(240)]
        rng = np.random.default_rng(7)
        y_anom = np.array([-1.0 if i < 120 else 1.0 for i in range(240)], dtype=np.float64) + rng.normal(0.0, 0.35, 240)
        # Subtract linear fit over the step so Perron AR(1) inflation is tested cleanly
        t = np.arange(240, dtype=np.float64)
        sl, ic = np.polyfit(t, y_anom, 1)
        sen_fit = sl * t + ic
        geom = detect_regime_and_gam_geometry(dates, y_anom.tolist(), sen_fit.tolist(), y_anom.tolist())
        self.assertTrue(geom["cusum_break_detected"])
        self.assertLessEqual(geom["p_value_ar1_bridge"], 0.05)
        self.assertIn("PERSISTENT", geom["forensic_regime_diagnosis"])

        # C3 date-keyed alignment + M6 purged CV & Bretherton F-test
        pred_signal = [math.sin(2.0 * math.pi * i / 17.0) for i in range(240)]
        # Offset dates by dropping first 12 months from target while passing mapping predictor
        sub_dates = dates[12:]
        sub_y = [2.0 * pred_signal[i] for i in range(12, 240)]
        date_map_pred = {d: v for d, v in zip(dates, pred_signal)}
        attr = compute_fast_gcv_physical_attribution(sub_dates, sub_y, {"X_LAG": date_map_pred})
        self.assertEqual(attr["status"], "OK")
        self.assertGreater(attr["detrended_purged_cv_r2"], 0.85)
        self.assertTrue(attr["overall_model_significant"])
        self.assertLess(attr["p_value_f_ar1"], 0.01)


if __name__ == "__main__":
    unittest.main()
