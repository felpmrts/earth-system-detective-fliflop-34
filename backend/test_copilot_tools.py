from __future__ import annotations

import json
import math
import os
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.copilot_engine import generate_copilot_response
from backend.copilot_tools import (
    compute_lagged_crosscorrelation_ar1,
    compute_seasonal_stratified_trends,
    execute_copilot_tool,
    fetch_additional_variable_analysis,
    get_gemini_tool_declarations,
    inspect_quantiles_and_extremes,
    run_sensitivity_without_outliers,
    run_subperiod_or_regime_split,
)
from backend.stats_engine import analyze_single_series, compare_regions
from data.api.server import BackendRouter


def _load_mock_analysis() -> dict:
    mock_path = Path(__file__).resolve().parent / "mock_analysis.json"
    return json.loads(mock_path.read_text(encoding="utf-8"))


def _make_monthly_dates(start_year: int, n_years: int) -> list[str]:
    dates: list[str] = []
    for yr in range(start_year, start_year + n_years):
        for mo in range(1, 13):
            dates.append(f"{yr:04d}-{mo:02d}")
    return dates


class TestCopilotTools(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.mock_analysis = _load_mock_analysis()

    def test_declarations_cover_all_six_tools(self) -> None:
        decls = get_gemini_tool_declarations()
        names = {d["name"] for d in decls}
        expected = {
            "run_subperiod_or_regime_split",
            "run_sensitivity_without_outliers",
            "compute_seasonal_stratified_trends",
            "compute_lagged_crosscorrelation_ar1",
            "inspect_quantiles_and_extremes",
            "fetch_additional_variable_analysis",
            "run_ml_dynamic_discovery",
        }
        self.assertEqual(names, expected)
        for decl in decls:
            self.assertIn("description", decl)
            self.assertIn("parameters", decl)

    def test_run_subperiod_and_regime_split(self) -> None:
        sub = run_subperiod_or_regime_split(
            self.mock_analysis,
            slot="A",
            start_date="2000-01",
            end_date="2020-12",
        )
        self.assertEqual(sub["mode"], "subperiod_window")
        self.assertIn("subperiod", sub)
        self.assertIn("slope_per_decade_ols", sub["subperiod"])
        self.assertIn("slope_per_decade_sen", sub["subperiod"])

        # Synthetic regime shift: positive trend before 2005-01, negative after
        dates = _make_monthly_dates(1995, 20)
        values: list[float] = []
        for idx, dt in enumerate(dates):
            yr = int(dt[:4])
            t_yr = idx / 12.0
            if yr < 2005:
                values.append(25.0 + 0.12 * t_yr)
            else:
                values.append(26.2 - 0.15 * (t_yr - 10.0))
        reg_a = analyze_single_series("T2M_MAX", dates, values)
        analysis = {"region_a_analysis": reg_a}

        regime = run_subperiod_or_regime_split(
            analysis,
            slot="A",
            split_date="2005-01",
        )
        self.assertEqual(regime["mode"], "regime_split")
        self.assertTrue(regime["sign_reversal"])
        self.assertGreater(regime["before"]["slope_per_decade_ols"], 0.0)
        self.assertLess(regime["after"]["slope_per_decade_ols"], 0.0)

    def test_run_sensitivity_without_outliers(self) -> None:
        res = run_sensitivity_without_outliers(
            self.mock_analysis,
            slot="A",
            mahalanobis_threshold=2.5,
            exclude_years=[2015],
        )
        self.assertGreaterEqual(res["excluded_count"], 1)
        self.assertIn("baseline", res)
        self.assertIn("filtered", res)
        self.assertIn("slope_per_decade_ols", res["filtered"])
        self.assertIn("slope_per_decade_sen", res["filtered"])

    def test_compute_seasonal_stratified_trends(self) -> None:
        dates = _make_monthly_dates(1990, 30)
        values: list[float] = []
        for idx, dt in enumerate(dates):
            mo = int(dt[5:7])
            yr_offset = int(dt[:4]) - 1990
            baseline = 1.0 + 0.1 * ((mo % 4) - 1.5)
            if mo in (6, 7, 8):  # JJA strong drop
                values.append(baseline - 0.08 * yr_offset)
            elif mo in (12, 1, 2):  # DJF rise
                values.append(baseline + 0.05 * yr_offset)
            else:
                values.append(baseline + 0.002 * ((idx % 3) - 1))
        reg_a = analyze_single_series("GWETTOP", dates, values)
        analysis = {"region_a_analysis": reg_a}

        res = compute_seasonal_stratified_trends(analysis, slot="A")
        self.assertEqual(res["dominant_season"], "JJA")
        self.assertTrue(res["has_seasonal_sign_reversal"])
        self.assertIn("DJF", res["seasons"])
        self.assertIn("JJA", res["seasons"])

    def test_compute_lagged_crosscorrelation_ar1(self) -> None:
        dates = _make_monthly_dates(2000, 20)
        n = len(dates)
        vals_a = [
            10.0 + 2.0 * math.sin(2.0 * math.pi * i / 17.0) + 0.8 * math.cos(2.0 * math.pi * i / 7.0)
            for i in range(n)
        ]
        vals_b = [0.0] * n
        for i in range(n):
            src = vals_a[i - 2] if i >= 2 else vals_a[0]
            vals_b[i] = 20.0 + 1.5 * src + 0.03 * ((i % 5) - 2)

        reg_a = analyze_single_series("GWETTOP", dates, vals_a)
        reg_b = analyze_single_series("T2M_MAX", dates, vals_b)
        cross = compare_regions("REG_A", "REG_B", reg_a, reg_b)
        analysis = {
            "region_a_analysis": reg_a,
            "region_b_analysis": reg_b,
            "cross_region_comparison": cross,
        }

        res = compute_lagged_crosscorrelation_ar1(analysis, max_lag=6)
        best = res["best_detrended_lag"]
        self.assertEqual(best["lag_months"], 2)
        self.assertGreater(best["r_detrended"], 0.7)
        self.assertIn("p_detrended_ar1", best)

    def test_inspect_quantiles_and_extremes(self) -> None:
        res = inspect_quantiles_and_extremes(self.mock_analysis, slot="A", top_k=5)
        self.assertIn("raw_first_half", res)
        self.assertIn("raw_second_half", res)
        self.assertIn("p10", res["raw_first_half"])
        self.assertIn("p50_median", res["raw_first_half"])
        self.assertIn("p90", res["raw_first_half"])
        top_dates = [row["date"] for row in res["top_mahalanobis_outliers"]]
        self.assertIn("2015-11", top_dates)

    def test_fetch_additional_variable_analysis_and_validation(self) -> None:
        bad = fetch_additional_variable_analysis(
            self.mock_analysis,
            variable_id="INVALID_VAR_999",
            target_slot="A",
        )
        self.assertEqual(bad["status"], "INVALID_VARIABLE")

        dates = self.mock_analysis["region_a_analysis"]["series"]["dates"]
        series_map = {
            dt: 90.0 + 0.05 * idx for idx, dt in enumerate(dates)
        }
        mock_fetch_payload = {
            "status": "OK",
            "variable": "PRECTOTCORR",
            "source": "nasa_power_live",
            "series": series_map,
        }
        with patch(
            "backend.copilot_tools.fetch_location_single_variable",
            return_value=mock_fetch_payload,
        ) as mocked_fetch:
            res = fetch_additional_variable_analysis(
                self.mock_analysis,
                variable_id="PRECTOTCORR",
                target_slot="A",
                lat=-18.91,
                lon=-48.27,
            )
            self.assertEqual(mocked_fetch.call_count, 1)
            self.assertEqual(res["status"], "OK")
            self.assertEqual(res["variable_id"], "PRECTOTCORR")
            self.assertEqual(res["scale_type"], "ratio")
            self.assertTrue(res["allow_percentage_change"])
            self.assertIn("regression", res)
            self.assertIsNotNone(res["multiscale_vs_selected_region"])

        gwet_fetch = {
            "status": "OK",
            "variable": "GWETTOP",
            "source": "nasa_power_live",
            "series": {dt: 0.45 for dt in dates},
        }
        with patch(
            "backend.copilot_tools.fetch_location_single_variable",
            return_value=gwet_fetch,
        ):
            res_gwet = fetch_additional_variable_analysis(
                self.mock_analysis,
                variable_id="GWETTOP",
                target_slot="A",
                lat=-18.91,
                lon=-48.27,
            )
            self.assertEqual(res_gwet["status"], "OK")
            self.assertFalse(res_gwet["allow_percentage_change"])

    def test_execute_copilot_tool_unknown(self) -> None:
        payload, meta = execute_copilot_tool(
            "nonexistent_tool",
            {},
            self.mock_analysis,
            language="pt",
        )
        self.assertIn("error", payload)
        self.assertEqual(meta["status"], "error")


class TestCopilotAgenticLoopAndCache(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.mock_analysis = _load_mock_analysis()

    def test_mocked_gemini_multi_turn_function_calling_and_invariant3(self) -> None:
        captured_bodies: list[dict] = []

        def fake_http_post(url: str, body: dict, timeout: float) -> dict:
            captured_bodies.append(body)
            if len(captured_bodies) == 1:
                return {
                    "candidates": [
                        {
                            "content": {
                                "role": "model",
                                "parts": [
                                    {
                                        "functionCall": {
                                            "name": "compute_seasonal_stratified_trends",
                                            "args": {"slot": "A"},
                                        }
                                    }
                                ],
                            }
                        }
                    ]
                }

            llm_json = {
                "synthesis": {
                    "mathematical_evidence": "Diagnóstico sazonal mostra aumento de 42% na T2M_MAX em JJA.",
                    "physical_meaning": "Dessecação sazonal concentrada em JJA.",
                    "false_conclusion_risk": "Confundir tendência secular com ciclo sazonal.",
                },
                "four_answers": {
                    "what": "Declínio de GWETTOP (-0.0366 fração/década).",
                    "where": "Região A vs Região B.",
                    "how_much": "Aumento de 42% em T2M_MAX no período.",
                    "is_significant": "p_AR1 = 0.0, Tier CONFIRMED_HIGH.",
                },
                "reply_markdown": "Na análise de temperatura T2M_MAX observou-se aumento de 42% no período.",
                "suggested_questions": ["Testar sem 2015?"],
            }
            return {
                "candidates": [
                    {
                        "content": {
                            "role": "model",
                            "parts": [{"text": json.dumps(llm_json, ensure_ascii=False)}],
                        }
                    }
                ]
            }

        with patch.dict(os.environ, {"GEMINI_API_KEY": "fake-key-for-mock-test"}):
            resp = generate_copilot_response(
                self.mock_analysis,
                question="Qual estação dirige a tendência e há variação na temperatura?",
                language="pt",
                use_llm=True,
                http_post_fn=fake_http_post,
            )

        self.assertEqual(len(captured_bodies), 2)
        self.assertIn("tools", captured_bodies[0])
        second_contents = captured_bodies[1]["contents"]
        has_fn_response = any(
            "functionResponse" in part
            for msg in second_contents
            for part in msg.get("parts", [])
        )
        self.assertTrue(has_fn_response)

        self.assertEqual(resp["mode"], "llm_gemini")
        self.assertGreaterEqual(len(resp["tools_used"]), 1)
        self.assertEqual(resp["tools_used"][0]["name"], "compute_seasonal_stratified_trends")

        # Invariant #3 sanitization must scrub "42%" on interval variable T2M_MAX
        self.assertGreater(len(resp.get("invariant_warnings") or []), 0)
        self.assertNotIn("42%", resp["synthesis"]["mathematical_evidence"])
        self.assertNotIn("42%", resp["reply_markdown"])

    def test_offline_deterministic_tool_routing(self) -> None:
        r_season = generate_copilot_response(
            self.mock_analysis,
            question="Analise a tendência por estação JJA e DJF",
            language="pt",
            use_llm=False,
        )
        self.assertEqual(r_season["mode"], "heuristic_fallback")
        self.assertIn(
            "compute_seasonal_stratified_trends",
            [t["name"] for t in r_season["tools_used"]],
        )

        r_lag = generate_copilot_response(
            self.mock_analysis,
            question="Qual a defasagem lag entre A e B?",
            language="pt",
            use_llm=False,
        )
        self.assertIn(
            "compute_lagged_crosscorrelation_ar1",
            [t["name"] for t in r_lag["tools_used"]],
        )

        r_out = generate_copilot_response(
            self.mock_analysis,
            question="Faça sensibilidade sem outliers 2015",
            language="pt",
            use_llm=False,
        )
        self.assertIn(
            "run_sensitivity_without_outliers",
            [t["name"] for t in r_out["tools_used"]],
        )

        r_ml = generate_copilot_response(
            self.mock_analysis,
            question="Explique as descobertas de ML, teleconexões ENSO e quebra CUSUM",
            language="pt",
            use_llm=False,
        )
        self.assertIn(
            "run_ml_dynamic_discovery",
            [t["name"] for t in r_ml["tools_used"]],
        )
        self.assertIn("Descoberta Dinâmica ML", r_ml["answer"])

    def test_backend_router_analyze_and_copilot_analysis_key_cache(self) -> None:
        router = BackendRouter()
        analysis_key = router._remember_analysis(self.mock_analysis)
        self.assertTrue(analysis_key)

        status, resp = router.handle_post(
            "/api/copilot",
            {
                "analysis_key": analysis_key,
                "question": "Qual estação dirige a tendência?",
                "language": "pt",
                "use_llm": False,
            },
        )
        self.assertEqual(status, 200)
        self.assertEqual(resp["analysis_key"], analysis_key)
        self.assertIn("compute_seasonal_stratified_trends", [t["name"] for t in resp["tools_used"]])

        status_miss, resp_miss = router.handle_post(
            "/api/copilot",
            {
                "analysis_key": "nonexistent_key_000",
                "question": "Olá",
                "language": "pt",
            },
        )
        self.assertEqual(status_miss, 404)
        self.assertEqual(resp_miss["code"], "ANALYSIS_CACHE_MISS")

    def test_mocked_openrouter_multi_turn_tool_calls(self) -> None:
        captured_bodies: list[dict] = []

        def fake_http_post(url: str, body: dict, timeout: float) -> dict:
            captured_bodies.append(body)
            if len(captured_bodies) == 1:
                return {
                    "choices": [
                        {
                            "message": {
                                "role": "assistant",
                                "content": "",
                                "tool_calls": [
                                    {
                                        "id": "call_1",
                                        "type": "function",
                                        "function": {
                                            "name": "inspect_quantiles_and_extremes",
                                            "arguments": json.dumps({"slot": "A", "top_k": 3}),
                                        },
                                    }
                                ],
                            }
                        }
                    ]
                }

            llm_json = {
                "synthesis": {
                    "mathematical_evidence": "P10 caiu entre as metades.",
                    "physical_meaning": "Deslocamento da cauda seca.",
                    "false_conclusion_risk": "Não confundir 2015-11 com tendência.",
                },
                "four_answers": {
                    "what": "GWETTOP em queda.",
                    "where": "Região A.",
                    "how_much": "-0.0363/década.",
                    "is_significant": "CONFIRMED_HIGH.",
                },
                "reply_markdown": "Outlier 2015-11 e deslocamento em P10 confirmados.",
                "suggested_questions": ["Comparar com PRECTOTCORR?"],
            }
            return {
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": json.dumps(llm_json, ensure_ascii=False),
                        }
                    }
                ]
            }

        with patch.dict(
            os.environ,
            {
                "GEMINI_API_KEY": "",
                "OPENROUTER_API_KEY": "sk-or-v1-mock-test",
                "OPENROUTER_COPILOT_MODEL": "deepseek/deepseek-chat",
            },
        ):
            resp = generate_copilot_response(
                self.mock_analysis,
                question="Inspecione quantis e extremos",
                language="pt",
                use_llm=True,
                http_post_fn=fake_http_post,
            )

        self.assertEqual(len(captured_bodies), 2)
        self.assertEqual(captured_bodies[0]["model"], "deepseek/deepseek-chat")
        self.assertEqual(resp["mode"], "llm_gemini")
        self.assertEqual(resp["model"], "deepseek/deepseek-chat")
        self.assertEqual(resp["tools_used"][0]["name"], "inspect_quantiles_and_extremes")
        self.assertIn("2015-11", resp["reply_markdown"])

    def test_post_audit_seasonal_m3_lag_fdr_m4_and_b2_sanitizer(self) -> None:
        """Regression tests for M3 (annual seasonal aggregation+FDR), M4 (lag FDR gate), B2 (trend_unit & GWETTOP %)."""
        import random
        from backend.copilot_engine import sanitize_interval_scale_percentages

        dates = _make_monthly_dates(1995, 25)
        rng = random.Random(77)
        vals_a = [rng.gauss(0.0, 1.0) for _ in dates]
        vals_b = [rng.gauss(0.0, 1.0) for _ in dates]
        reg_a = analyze_single_series("GWETTOP", dates, vals_a)
        reg_b = analyze_single_series("GWETROOT", dates, vals_b)
        analysis = {"region_a_analysis": reg_a, "region_b_analysis": reg_b}

        # M3: each season has <= 1 obs per meteorological year (e.g. <= 25 for 25 yrs, not 75)
        s_res = compute_seasonal_stratified_trends(analysis, slot="A")
        self.assertLessEqual(s_res["seasons"]["JJA"]["n_observations"], 25)
        self.assertIn("fdr_q_value", s_res["seasons"]["JJA"])

        # M4: lag FDR present and protects against spurious noise precedence
        l_res = compute_lagged_crosscorrelation_ar1(analysis, max_lag=6)
        self.assertIn("q_detrended_fdr", l_res["best_detrended_lag"])
        self.assertFalse(l_res["best_detrended_lag"]["is_detrended_sig_fdr05"])
        self.assertIn("Sem precedência estatisticamente significativa", l_res["precedence_interpretation"])

        # B2: GWETTOP (ratio, allow_percentage_change=False, unit != '%') must block relative '%' claims while keeping IC 95%
        sanitized, warns = sanitize_interval_scale_percentages(
            "Umidade GWETTOP caiu 12% (IC 95%: [-0.02, -0.01]).",
            {"region_a_analysis": reg_a},
            language="pt",
        )
        self.assertNotIn("12%", sanitized)
        self.assertIn("IC 95%", sanitized)
        self.assertGreater(len(warns), 0)

    def test_fractional_gwetprof_and_albedo_trend_unit(self) -> None:
        """GWETPROF and ALLSKY_SRF_ALB must expose trend_unit='fração/década' and allow_percentage_change=False."""
        analysis = _load_mock_analysis()
        dates = _make_monthly_dates(2000, 20)
        series = {ym: round(0.42 + 0.0005 * i, 4) for i, ym in enumerate(dates)}

        for var_code in ("GWETPROF", "ALLSKY_SRF_ALB"):
            with patch(
                "backend.copilot_tools.fetch_location_single_variable",
                return_value={"status": "OK", "unit": "Fração (0 a 1)", "series": series},
            ):
                res = fetch_additional_variable_analysis(
                    analysis,
                    variable_id=var_code,
                    lat=-15.0,
                    lon=-48.0,
                    start_date="2000-01",
                    end_date="2019-12",
                )
            self.assertEqual(res["status"], "OK")
            self.assertEqual(res["unit"], "fração (0–1)")
            self.assertEqual(res["trend_unit"], "fração/década")
            self.assertFalse(res["allow_percentage_change"])


if __name__ == "__main__":
    unittest.main()
