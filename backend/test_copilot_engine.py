"""
Unit test suite for `backend/copilot_engine.py` and `POST /api/copilot` (DADOS-2 — Phase 4).
Validates System Prompts, 7 Statistical Invariants compliance (including Invariant #3),
bilingual heuristic synthesis (PT/EN), Q&A routing, and BackendRouter endpoint `/api/copilot`.
"""

from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from typing import Any, Dict

from backend import (
    COPILOT_SYSTEM_PROMPT_EN,
    COPILOT_SYSTEM_PROMPT_PT,
    build_copilot_prompt,
    generate_copilot_response,
    generate_heuristic_synthesis,
    sanitize_interval_scale_percentages,
)
from data.api.server import BackendRouter
from data.cache.store import CellCacheStore


_MOCK_PATH = Path(__file__).resolve().parent / "mock_analysis.json"


def _load_mock_analysis() -> Dict[str, Any]:
    return json.loads(_MOCK_PATH.read_text(encoding="utf-8"))


class TestCopilotEngine(unittest.TestCase):
    """Validates Statistical Co-Pilot architecture, prompts, invariants, and API endpoint."""

    def setUp(self) -> None:
        self.mock_analysis = _load_mock_analysis()

    def test_system_prompts_enforce_invariants(self) -> None:
        """System Prompts (PT alias and EN) enforce no endpoint-minus-start and no % on interval scales."""
        self.assertIn("Y_end - Y_start", COPILOT_SYSTEM_PROMPT_PT)
        self.assertIn("scale_type == \"interval\"", COPILOT_SYSTEM_PROMPT_PT)
        self.assertIn("Theil-Sen", COPILOT_SYSTEM_PROMPT_PT)
        self.assertIn("Mahalanobis", COPILOT_SYSTEM_PROMPT_PT)

        self.assertIn("Y_end - Y_start", COPILOT_SYSTEM_PROMPT_EN)
        self.assertIn("scale_type == \"interval\"", COPILOT_SYSTEM_PROMPT_EN)
        self.assertIn("Theil-Sen", COPILOT_SYSTEM_PROMPT_EN)
        self.assertIn("Mahalanobis", COPILOT_SYSTEM_PROMPT_EN)

    def test_build_copilot_prompt_compacts_series(self) -> None:
        """Prompt builder serializes metadata/metrics without bloating context with raw 540-point arrays."""
        prompt = build_copilot_prompt(self.mock_analysis, question="Summary", language="en")
        self.assertIn("GWETTOP", prompt)
        self.assertIn("T2M_MAX", prompt)
        self.assertIn("comparison_pair", prompt)
        self.assertNotIn("raw_values", prompt)
        self.assertLess(len(prompt), 6000)

    def test_heuristic_synthesis_default_english(self) -> None:
        """Default synthesis covers all 4 Detective Answers, OLS/Sen, AR(1)/FDR, Mahalanobis, and Multiscale."""
        res = generate_heuristic_synthesis(self.mock_analysis, language="en")
        self.assertEqual(res["language"], "en")
        self.assertEqual(res["mode"], "heuristic_fallback")
        md = res["reply_markdown"]

        self.assertIn("1. WHAT & Regime", md)
        self.assertIn("2. WHERE & Multiscale Comparison", md)
        self.assertIn("3. HOW MUCH", md)
        self.assertIn("4. SIGNIFICANCE & COUPLING", md)
        self.assertIn("Theil–Sen", md)
        self.assertIn("OLS", md)
        self.assertIn("p_AR1", md)
        self.assertIn("q_FDR", md)
        self.assertIn("n_eff", md)
        self.assertIn("Mahalanobis", md)
        self.assertIn("2015-11", md)
        self.assertIn("OPPOSING_SECULAR_AND_COUPLED_DIPOLE", md)

        four = res["four_answers"]
        self.assertIn("GWETTOP", four["what"])
        self.assertIn("MERRA-2__r142_c210+r142_c211", four["where"])
        self.assertIn("Theil–Sen", four["how_much"])
        self.assertIn("p_AR1", four["is_significant"])
        self.assertGreaterEqual(len(res["suggested_questions"]), 3)

    def test_heuristic_synthesis_english(self) -> None:
        """English synthesis outputs English headers and metrics."""
        res = generate_heuristic_synthesis(self.mock_analysis, language="en")
        self.assertEqual(res["language"], "en")
        md = res["reply_markdown"]

        self.assertIn("1. WHAT & Regime", md)
        self.assertIn("2. WHERE & Multiscale Comparison", md)
        self.assertIn("3. HOW MUCH", md)
        self.assertIn("4. SIGNIFICANCE & COUPLING", md)
        self.assertIn("Theil–Sen", md)
        self.assertIn("Mahalanobis", md)

    def test_invariant_3_no_percentage_on_interval_t2m_max(self) -> None:
        """Invariant #3: no % associated with T2M_MAX (interval) and sanitizer blocks injected %."""
        res = generate_heuristic_synthesis(self.mock_analysis, language="en")
        md = res["reply_markdown"]
        t2m_lines = [line for line in md.splitlines() if "T2M_MAX" in line or "°C" in line]
        self.assertTrue(t2m_lines)
        for line in t2m_lines:
            self.assertNotIn("%", line, f"Percentage found in interval-scale line: {line}")

        fake_llm_output = (
            "#### Region B — 2m Daily Maximum Temperature (`T2M_MAX`)\n"
            "- Temperature rose +14.5% per decade (95% CI: [+0.55, +0.57] °C/decade)."
        )
        sanitized, warnings = sanitize_interval_scale_percentages(
            fake_llm_output, self.mock_analysis, language="en"
        )
        self.assertNotIn("+14.5%", sanitized)
        self.assertIn("95% CI", sanitized)
        self.assertEqual(len(warnings), 1)

    def test_specific_questions_and_llm_fallback_without_key(self) -> None:
        """Specific user questions receive targeted responses and fall back cleanly without GEMINI_API_KEY."""
        prev_key = os.environ.pop("GEMINI_API_KEY", None)
        try:
            q_sen = generate_copilot_response(
                self.mock_analysis,
                question="Why use Theil-Sen instead of endpoint minus start?",
                language="en",
            )
            self.assertEqual(q_sen["mode"], "heuristic_fallback")
            self.assertIn("Y_end - Y_start", q_sen["reply_markdown"])
            self.assertIn("Theil–Sen", q_sen["reply_markdown"])

            q_mahal = generate_copilot_response(
                self.mock_analysis,
                question="Explain the Mahalanobis outliers",
                language="en",
            )
            expected_total = len(
                self.mock_analysis["region_a_analysis"].get("outliers_mahalanobis", [])
            ) + len(
                (self.mock_analysis.get("region_b_analysis") or {}).get(
                    "outliers_mahalanobis", []
                )
            )
            self.assertIn("Mahalanobis distance", q_mahal["reply_markdown"])
            self.assertIn(f"{expected_total} extreme event(s)", q_mahal["reply_markdown"])
        finally:
            if prev_key is not None:
                os.environ["GEMINI_API_KEY"] = prev_key

    def test_backend_router_post_api_copilot(self) -> None:
        """BackendRouter handles POST /api/copilot returning HTTP 200 on valid payload and 400 on invalid."""
        with tempfile.TemporaryDirectory() as tmpdir:
            router = BackendRouter(cache=CellCacheStore(cache_dir=Path(tmpdir)))

            status_ok, payload_ok = router.handle_post(
                "/api/copilot",
                {
                    "analysis": self.mock_analysis,
                    "question": "Is this trend just El Niño noise?",
                    "language": "en",
                },
            )
            self.assertEqual(int(status_ok), 200)
            self.assertIn("reply_markdown", payload_ok)
            self.assertIn("AR(1)", payload_ok["reply_markdown"])

            status_bad, payload_bad = router.handle_post("/api/copilot", {"question": "Hi"})
            self.assertEqual(int(status_bad), 400)
            self.assertIn("error", payload_bad)


if __name__ == "__main__":
    unittest.main()
