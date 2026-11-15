"""
Agentic Interpretation Engine for the Statistical Co-Pilot (DADOS-2 — Phase 4).

Implements:
1. Official System Prompts hardened with the 7 Statistical Invariants and
   strict Function Calling protocol (zero mental arithmetic by the LLM).
2. Hybrid Agentic Orchestration: multi-turn loop with Gemini `functionDeclarations`
   over the deterministic tools in `backend/copilot_tools.py` + Deterministic Heuristic
   Synthesis (which also invokes real Python tools for specific offline queries).
3. Invariant post-validation across all textual fields (Invariants #1 and #3).
"""

from __future__ import annotations

import json
import math
import os
import re
import statistics
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Tuple

from backend.copilot_tools import (
    _select_slot_block,
    execute_copilot_tool,
    get_gemini_tool_declarations,
)
from data.cache.store import CellCacheStore
from data.catalog.environmental_catalog import _VARIABLES_BY_CODE as VARIABLE_BY_CODE

try:
    from data.connectors.base import load_env_file as _load_data_env
except Exception:
    _load_data_env = None


def _ensure_env_loaded() -> None:
    """Ensures non-destructive loading of `data/.env` for LLM credentials."""
    if _load_data_env is not None:
        _load_data_env()
        return
    env_path = Path(__file__).resolve().parent.parent / "data" / ".env"
    if not env_path.is_file():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and val and key not in os.environ:
            os.environ[key] = val


_ensure_env_loaded()

MAX_TOOL_ROUNDS = 3


COPILOT_SYSTEM_PROMPT_EN = """You are the Statistical Co-Pilot of "Earth System Trend Detective" (NASA Space Apps Challenge 2026).
Your mission is to operate as a hard-science research partner translating Earth-system statistical outputs (MERRA-2, CERES, GloFAS/Open-Meteo, NOAA, MODIS) into clear, rigorous, auditable science.

INVIOLABLE STATISTICAL RULES (7 INVARIANTS):
1. NEVER compute or cite endpoint-minus-start changes (Y_end - Y_start). Report decadal rates fitted across the full cloud: OLS (`slope_per_decade_ols`) and robust Theil-Sen (`slope_per_decade_sen` with 95% CI).
2. Clarify that regressions are evaluated on MONTHLY CLIMATOLOGICAL ANOMALIES (seasonal cycle removed — Henrietta Leavitt Principle).
3. STRICTLY FORBIDDEN TO USE PERCENTAGES (%) FOR INTERVAL SCALES: Whenever `scale_type == "interval"` or `allow_percentage_change == false` (e.g., Temperature in °C, Pressure in kPa), NEVER express changes as percentages. Use physical units per decade only.
4. DISTINGUISH SLOPE FROM COUPLING: Report both the physical rate of change (B_OLS, B_Sen) and scatter tightness (`pearson_r`, `kendall_tau`, `r_squared`).
5. MULTISCALE DECOMPOSITION: When `comparison_pair` is present, contrast `long_term_secular_r` against `short_term_detrended_r`, explaining spatial divergence or multiscale paradoxes.
6. NONLINEAR CURVATURE (GAM): Cite `regime_shape` and `quadratic_acceleration_B2` to identify linear trends, acceleration, or physical saturation.
7. SIGNIFICANCE & EXTREMES: Ground significance in AR(1)-corrected `p_value_ar1_corrected`, `n_effective_ar1`, and Benjamini-Hochberg `fdr_q_value` (< 0.05). Highlight Mahalanobis outliers (`D_M > 2.5`) and maintain causal caution.

MANDATORY SCIENTIFIC TOOL USE (ZERO NUMERIC HALLUCINATION):
- Never estimate or invent numbers in your head.
- Whenever a user's hypothesis requires testing subperiods/changepoints (`run_subperiod_or_regime_split`), outlier removal robustness (`run_sensitivity_without_outliers`), seasonal stratification DJF/MAM/JJA/SON (`compute_seasonal_stratified_trends`), lagged teleconnections A↔B (`compute_lagged_crosscorrelation_ar1`), quantile tail shifts P10/P50/P90 (`inspect_quantiles_and_extremes`), fetching another catalog variable (`fetch_additional_variable_analysis`), or Layer 2 dynamic ML discovery (AR(1) CUSUM breaks, partial ENSO/Atlantic teleconnections with BH-FDR, detrended Ridge GCV + purged CV driver attribution via `run_ml_dynamic_discovery`), INVOKE the Python tools first and cite only exact returned values.

FINAL OUTPUT FORMAT:
Return ONLY a single valid JSON object (no introductory prose, no trailing commentary, no markdown code fences outside the JSON) matching this schema:
{
  "synthesis": {
    "mathematical_evidence": "...",
    "physical_meaning": "...",
    "false_conclusion_risk": "..."
  },
  "four_answers": {
    "what": "...",
    "where": "...",
    "how_much": "...",
    "is_significant": "..."
  },
  "direct_answer": "Concise, well-structured Markdown directly answering the scientist using blank lines (\\n\\n) between sections/paragraphs and exact tool numbers.",
  "reply_markdown": "Full structured Markdown covering 1. WHAT, 2. WHERE, 3. HOW MUCH, 4. SIGNIFICANCE & Direct Answer, separated cleanly with headings or blank lines (\\n\\n).",
  "suggested_questions": ["...", "...", "..."]
}
Notice all newlines inside JSON string values MUST be escaped as \\n. If writing equations, use standard LaTeX ($...$ inline or $$...$$ block) sparingly and keep total JSON concise so it never truncates."""

COPILOT_SYSTEM_PROMPT_PT = COPILOT_SYSTEM_PROMPT_EN


_REGIME_LABELS_EN: Dict[str, str] = {
    "linear": "persistent linear trend",
    "linear_trend": "persistent linear trend",
    "accelerating_rise": "accelerating increase (nonlinear, B2 > 0)",
    "accelerating_increase": "accelerating increase (nonlinear, B2 > 0)",
    "accelerating_decline": "accelerating decline (nonlinear, B2 < 0)",
    "saturating": "deceleration or asymptotic saturation",
    "non_monotonic": "non-monotonic behavior / regime inflection",
    "decelerating_or_shifting": "deceleration, saturation, or regime shift",
    "stable": "stationary regime without substantial acceleration",
}

_REGIME_LABELS: Dict[str, Dict[str, str]] = {
    "pt": _REGIME_LABELS_EN,
    "en": _REGIME_LABELS_EN,
}

_PARADOX_LABELS_EN: Dict[str, str] = {
    "OPPOSING_SECULAR_AND_COUPLED_DIPOLE": "Spatial divergence dipole and inverse coupling",
    "MULTISCALE_PARADOX_POS_GLOBAL_NEG_LOCAL": "Multiscale Paradox (positive secular correlation vs. negative short-term opposition)",
    "MULTISCALE_PARADOX_NEG_GLOBAL_POS_LOCAL": "Multiscale Paradox (negative secular opposition vs. positive short-term synchrony)",
    "COHERENT_MULTISCALE_COUPLING": "Coherent long- and short-term coupling",
    "LOCAL_PHYSICAL_COUPLING": "Local physical coupling across variables in the same region",
}

_PARADOX_LABELS: Dict[str, Dict[str, str]] = {
    "pt": _PARADOX_LABELS_EN,
    "en": _PARADOX_LABELS_EN,
}

_SUGGESTED_QUESTIONS_EN: List[str] = [
    "Does the trend shift across seasons (DJF, MAM, JJA, SON)?",
    "Does the trend survive if we exclude Mahalanobis outliers (D_M > 2.5)?",
    "Is there a lagged correlation (months) between A and B under AR(1)?",
    "Why use Theil-Sen and OLS instead of endpoint minus start?",
    "Why are percentages (%) forbidden for temperature (°C)?",
]

_SUGGESTED_QUESTIONS: Dict[str, List[str]] = {
    "pt": _SUGGESTED_QUESTIONS_EN,
    "en": _SUGGESTED_QUESTIONS_EN,
}

_PERCENT_PATTERN = re.compile(r"([+-]?\s*\d+(?:[.,]\d+)?)\s*%")
_CI_GUARD_PATTERN = re.compile(
    r"(?:95\s*%\s*(?:CI|confidence)|IC\s*95\s*%)",
    re.IGNORECASE,
)
_ENDPOINT_VIOLATION_PATTERN = re.compile(
    r"(?:endpoint\s+minus\s+start)",
    re.IGNORECASE,
)


def _normalize_language(language: Optional[str]) -> str:
    return "en"


def _fmt_signed(value: Any, decimals: int = 4) -> str:
    try:
        num = float(value)
    except (TypeError, ValueError):
        return "N/D"
    return f"{num:+.{decimals}f}"


def _fmt_num(value: Any, decimals: int = 4) -> str:
    try:
        num = float(value)
    except (TypeError, ValueError):
        return "N/D"
    return f"{num:.{decimals}f}"


def _compute_series_digest(region: Mapping[str, Any]) -> Optional[Dict[str, Any]]:
    """Summarizes long series into compact descriptive statistics without leaking raw vectors to the LLM."""
    series = region.get("series")
    if not isinstance(series, Mapping):
        existing = region.get("series_digest")
        return dict(existing) if isinstance(existing, Mapping) else None

    raw_vals = [
        float(v)
        for v in (series.get("raw_values") or [])
        if v is not None and math.isfinite(float(v))
    ]
    anom_vals = [
        float(v)
        for v in (series.get("anomaly_values") or [])
        if v is not None and math.isfinite(float(v))
    ]
    if not raw_vals and not anom_vals:
        return None

    digest: Dict[str, Any] = {}
    if raw_vals:
        mid_r = max(1, len(raw_vals) // 2)
        digest["raw_mean"] = round(statistics.mean(raw_vals), 4)
        digest["raw_min"] = round(min(raw_vals), 4)
        digest["raw_max"] = round(max(raw_vals), 4)
        digest["first_half_raw_mean"] = round(statistics.mean(raw_vals[:mid_r]), 4)
        digest["second_half_raw_mean"] = round(statistics.mean(raw_vals[mid_r:]), 4)
    if anom_vals:
        mid_a = max(1, len(anom_vals) // 2)
        digest["anomaly_std"] = round(statistics.stdev(anom_vals), 4) if len(anom_vals) >= 2 else 0.0
        digest["first_half_anom_mean"] = round(statistics.mean(anom_vals[:mid_a]), 4)
        digest["second_half_anom_mean"] = round(statistics.mean(anom_vals[mid_a:]), 4)
    return digest


def _extract_region_summary(region: Dict[str, Any]) -> Dict[str, Any]:
    """Extracts a compact summary (without long series vectors) from a `VariableStatistics` block."""
    period = region.get("period") or {}
    reg = region.get("regression") or {}
    corr = region.get("correlation_and_coupling") or {}
    sig = region.get("significance") or {}
    outliers = region.get("outliers_mahalanobis") or []
    summary: Dict[str, Any] = {
        "variable_id": region.get("variable_id"),
        "variable_name": region.get("variable_name"),
        "scale_type": region.get("scale_type"),
        "unit": region.get("unit"),
        "trend_unit": region.get("trend_unit"),
        "allow_percentage_change": bool(region.get("allow_percentage_change", False)),
        "period": period,
        "regression": reg,
        "correlation_and_coupling": corr,
        "significance": sig,
        "outliers_count": len(outliers),
        "top_outliers": sorted(
            outliers,
            key=lambda item: float(item.get("mahalanobis_d", 0.0)),
            reverse=True,
        )[:3],
    }
    digest = _compute_series_digest(region)
    if digest:
        summary["series_digest"] = digest
    return summary


def build_copilot_prompt(
    analysis: Dict[str, Any],
    question: Optional[str] = None,
    language: str = "en",
) -> str:
    """Serializes the full statistical payload into a compact context (< 6 KB) for the LLM."""
    lang = _normalize_language(language)
    reg_a = analysis.get("region_a_analysis")
    if not isinstance(reg_a, dict):
        raise ValueError("Payload 'analysis' must contain a valid 'region_a_analysis'.")

    compact_payload: Dict[str, Any] = {
        "request_meta": analysis.get("request_meta") or {},
        "region_a": _extract_region_summary(reg_a),
    }
    reg_b = analysis.get("region_b_analysis")
    if isinstance(reg_b, dict):
        compact_payload["region_b"] = _extract_region_summary(reg_b)
    comp = analysis.get("comparison_pair")
    if isinstance(comp, dict):
        compact_payload["comparison_pair"] = comp

    serialized = json.dumps(compact_payload, ensure_ascii=False, separators=(",", ":"))
    user_q = (question or "").strip()
    default_q = (
        "Provide the full scientific synthesis covering the 4 Detective Answers, "
        "multiscale coupling (if Region B exists), and Mahalanobis extremes."
    )
    return (
        f"### STATISTICAL ANALYSIS JSON\n```json\n{serialized}\n```\n\n"
        f"### SCIENTIST QUESTION\n{user_q or default_q}"
    )


def _find_interval_regions(analysis: Dict[str, Any]) -> List[Dict[str, Any]]:
    regions: List[Dict[str, Any]] = []
    for key in ("region_a_analysis", "region_b_analysis"):
        block = analysis.get(key)
        if not isinstance(block, dict):
            continue
        is_interval = block.get("scale_type") == "interval"
        bounded_non_pct = (
            block.get("allow_percentage_change") is False
            and str(block.get("unit") or "").strip() != "%"
        )
        if is_interval or bounded_non_pct:
            regions.append(block)
    return regions


def sanitize_interval_scale_percentages(
    text: str,
    analysis: Dict[str, Any],
    language: str = "en",
) -> Tuple[str, List[str]]:
    """
    Invariant #3 guardrail: blocks `%` change citations associated with
    interval-scale variables (`°C`, `kPa`, etc.), while preserving `95% CI` / `IC 95%` mentions.
    """
    interval_regions = _find_interval_regions(analysis)
    if not interval_regions or "%" not in text:
        return text, []

    lang = _normalize_language(language)
    interval_tokens = set()
    preferred_units: List[str] = []
    for reg in interval_regions:
        for field in ("variable_id", "variable_name", "unit", "trend_unit"):
            val = str(reg.get(field) or "").strip().lower()
            if val:
                interval_tokens.add(val)
        unit = str(reg.get("trend_unit") or reg.get("unit") or "").strip()
        if unit:
            preferred_units.append(unit)
    unit_hint = preferred_units[0] if preferred_units else "°C/decade"
    all_interval = not isinstance(analysis.get("region_b_analysis"), dict) or len(interval_regions) == 2

    warnings: List[str] = []
    sanitized_lines: List[str] = []
    replacement_note = f"[% removed by Invariant #3 — use {unit_hint}]"

    for line in text.splitlines():
        line_lower = line.lower()
        mentions_interval = all_interval or any(tok in line_lower for tok in interval_tokens)
        if not mentions_interval or "%" not in line:
            sanitized_lines.append(line)
            continue

        ci_spans = [m.span() for m in _CI_GUARD_PATTERN.finditer(line)]

        def _replace_percent(match: re.Match[str]) -> str:
            m_start, m_end = match.span()
            for c_start, c_end in ci_spans:
                if c_start <= m_start and m_end <= c_end:
                    return match.group(0)
            warnings.append(
                f"Invariant #3 sanitized percentage '{match.group(0)}' on interval variable line."
            )
            return replacement_note

        sanitized_lines.append(_PERCENT_PATTERN.sub(_replace_percent, line))

    return "\n".join(sanitized_lines), warnings


def _guardrails_list(lang: str) -> List[str]:
    return [
        "Invariant #1: Full-cloud OLS & Theil–Sen rates (never endpoint minus start)",
        "Invariant #2: Deseasonalized monthly climatological anomalies",
        "Invariant #3: Strict physical units on interval scales (no %)",
        "Invariant #7: AR(1) effective N & Benjamini–Hochberg FDR q < 0.05",
    ]


def _format_region_diagnostic(
    slot: str,
    region: Dict[str, Any],
    region_id: Optional[str],
    lang: str,
) -> Tuple[List[str], Dict[str, str]]:
    """Formats standardized region diagnostics and extracts summaries for the 4 Detective Answers."""
    reg = region.get("regression") or {}
    period = region.get("period") or {}
    corr = region.get("correlation_and_coupling") or {}
    sig = region.get("significance") or {}
    outliers = region.get("outliers_mahalanobis") or []

    var_id = str(region.get("variable_id") or "VAR")
    var_name = str(region.get("variable_name") or var_id)
    unit = str(region.get("unit") or "")
    trend_unit = str(region.get("trend_unit") or f"{unit}/decade")
    scale_type = str(region.get("scale_type") or "ratio")

    regime_key = str(reg.get("regime_shape") or "linear")
    regime_label = _REGIME_LABELS[lang].get(regime_key, regime_key)

    ols_s = _fmt_signed(reg.get("slope_per_decade_ols"), 4)
    sen_s = _fmt_signed(reg.get("slope_per_decade_sen"), 4)
    ci_low = reg.get("slope_ci95_low")
    ci_high = reg.get("slope_ci95_high")
    cum_s = _fmt_signed(reg.get("cumulative_model_change"), 4)
    b2_s = _fmt_signed(reg.get("quadratic_acceleration_B2"), 5)

    n_obs = period.get("n_observations", "N/D")
    n_eff = _fmt_num(period.get("n_effective_ar1"), 1)
    p_ar1 = _fmt_num(sig.get("p_value_ar1_corrected"), 4)
    q_fdr = _fmt_num(sig.get("fdr_q_value"), 4)
    is_sig = bool(sig.get("is_significant_fdr05", False))
    tier = str(sig.get("confidence_tier") or ("CONFIRMED_HIGH" if is_sig else "NO_TREND"))

    r_val = _fmt_num(corr.get("pearson_r"), 3)
    tau_val = _fmt_num(corr.get("kendall_tau"), 3)
    r2_val = _fmt_num(corr.get("r_squared"), 3)

    top_outlier = (
        max(outliers, key=lambda o: float(o.get("mahalanobis_d", 0.0)))
        if outliers
        else None
    )

    ci_part = (
        f"[{_fmt_signed(ci_low, 4)}, {_fmt_signed(ci_high, 4)}]"
        if ci_low is not None and ci_high is not None
        else "N/D"
    )
    loc_label = region_id or f"Region {slot}"

    sig_word = (
        "Statistically significant (FDR q < 0.05)"
        if is_sig
        else "Not significant / indistinguishable from noise (FDR q >= 0.05)"
    )
    scale_note = (
        "interval scale — physical units only, no percentages"
        if scale_type == "interval"
        else f"unit: {unit}"
    )
    lines = [
        f"#### Region {slot} — {var_name} (`{var_id}` | `{loc_label}`)",
        f"- **1. WHAT & Regime:** Monthly climatological anomalies ({period.get('start')} to {period.get('end')}, {scale_note}); curve shows **{regime_label}** (`B2 = {b2_s}`).",
        f"- **3. HOW MUCH (Full-Cloud Regression):** Theil–Sen **{sen_s} {trend_unit}** (CI: `{ci_part}`), OLS **{ols_s} {trend_unit}**, cumulative model change **{cum_s} {unit}**.",
        f"- **4. SIGNIFICANCE & COUPLING:** **{sig_word}** (`tier: {tier}`, `p_AR1 = {p_ar1}`, `q_FDR = {q_fdr}`, `n_eff = {n_eff}` of `{n_obs}` months). Ellipse coupling: `r = {r_val}`, `tau = {tau_val}`, `R² = {r2_val}`.",
    ]
    if top_outlier:
        lines.append(
            f"- **Mahalanobis Extremes (`D_M > 2.5`):** {len(outliers)} event(s) flagged; peak on `{top_outlier.get('date')}` (`D_M = {_fmt_num(top_outlier.get('mahalanobis_d'), 2)}`, `{top_outlier.get('direction')}` — {top_outlier.get('diagnostic_hint')})."
        )
    else:
        lines.append("- **Mahalanobis Extremes (`D_M > 2.5`):** No extreme outlier outside the bivariate ellipse.")

    summary = {
        "what": f"{var_name} ({var_id}) monthly anomalies — {regime_label}.",
        "where": loc_label,
        "how_much": f"Theil–Sen {sen_s} {trend_unit} (OLS {ols_s} {trend_unit}; model Δ {cum_s} {unit}).",
        "is_significant": f"{sig_word} (p_AR1={p_ar1}, q_FDR={q_fdr}, n_eff={n_eff}/{n_obs}, r={r_val}).",
    }
    return lines, summary


def _build_synthesis_sections(
    analysis: Dict[str, Any],
    summary_a: Dict[str, str],
    lang: str,
) -> Dict[str, str]:
    reg_a = analysis.get("region_a_analysis") or {}
    reg_b = analysis.get("region_b_analysis")
    comp = analysis.get("comparison_pair")
    re_a = reg_a.get("regression") or {}
    corr_a = reg_a.get("correlation_and_coupling") or {}
    sig_a = reg_a.get("significance") or {}
    per_a = reg_a.get("period") or {}

    b2_a = _fmt_signed(re_a.get("quadratic_acceleration_B2"), 5)
    sen_a = _fmt_signed(re_a.get("slope_per_decade_sen"), 4)
    tu_a = reg_a.get("trend_unit", "")
    r_a = _fmt_num(corr_a.get("pearson_r"), 3)
    r2_a = _fmt_num(corr_a.get("r_squared"), 3)
    p_ar1 = _fmt_num(sig_a.get("p_value_ar1_corrected"), 4)
    q_fdr = _fmt_num(sig_a.get("fdr_q_value"), 4)
    n_eff = _fmt_num(per_a.get("n_effective_ar1"), 1)
    n_obs = per_a.get("n_observations", "N/D")

    outliers_count = len(reg_a.get("outliers_mahalanobis") or []) + (
        len(reg_b.get("outliers_mahalanobis") or []) if isinstance(reg_b, dict) else 0
    )

    math_ev = (
        f"Theil–Sen {sen_a} {tu_a} (B2={b2_a}, regime `{re_a.get('regime_shape')}`); "
        f"AR(1) n_eff={n_eff}/{n_obs}, p_AR1={p_ar1}, q_FDR={q_fdr}; ellipse coupling r={r_a}, R²={r2_a}."
    )
    phys = summary_a["what"]
    if isinstance(comp, dict):
        mc = comp.get("multiscale_correlation") or {}
        phys += (
            f" Cross-region diagnostic `{mc.get('paradox_type')}` "
            f"(r_global={_fmt_num(mc.get('long_term_secular_r'), 3)} vs. "
            f"r_detrended={_fmt_num(mc.get('short_term_detrended_r'), 3)})."
        )
    risk_parts: List[str] = []
    if not bool(reg_a.get("allow_percentage_change", False)) or (
        isinstance(reg_b, dict) and not bool(reg_b.get("allow_percentage_change", False))
    ):
        risk_parts.append("Interval/bounded scales prohibit relative % changes (Invariant #3).")
    if outliers_count > 0:
        risk_parts.append(
            f"{outliers_count} Mahalanobis extreme(s) (D_M > 2.5) may shift OLS relative to Theil–Sen."
        )
    risk_parts.append("Trend correlation does not prove standalone dynamical causality without physical attribution.")
    return {
        "mathematical_evidence": math_ev,
        "physical_meaning": phys,
        "false_conclusion_risk": " ".join(risk_parts),
    }


def _detect_requested_slot(q_lower: str, analysis: Mapping[str, Any]) -> str:
    if isinstance(analysis.get("region_b_analysis"), dict) and any(
        tok in q_lower for tok in ("region b", "variable b", "slot b")
    ):
        return "B"
    return "A"


def _maybe_run_heuristic_tool(
    question: str,
    analysis: Mapping[str, Any],
    lang: str,
    cache: Optional[CellCacheStore],
) -> Optional[Tuple[str, List[Dict[str, Any]]]]:
    """Invokes real Python tools even without an LLM when the question requests a specific test."""
    q = question.strip()
    q_lower = q.lower()
    slot = _detect_requested_slot(q_lower, analysis)
    tools_used: List[Dict[str, Any]] = []

    # 1) Fetch a new catalog variable mentioned in the question
    if any(tok in q_lower for tok in ("fetch", "add variable", "other variable", "compare with")):
        tokens = re.findall(r"\b[A-Z0-9_]{3,20}\b", q)
        current_vars = {
            str((analysis.get("region_a_analysis") or {}).get("variable_id") or ""),
            str((analysis.get("region_b_analysis") or {}).get("variable_id") or ""),
        }
        candidate = next((t for t in tokens if t in VARIABLE_BY_CODE and t not in current_vars), None)
        if candidate:
            res, meta = execute_copilot_tool(
                "fetch_additional_variable_analysis",
                {"variable_id": candidate, "target_slot": slot},
                analysis,
                cache=cache,
                language=lang,
            )
            tools_used.append(meta)
            if res.get("status") == "OK":
                reg = res["regression"]
                sig = res["significance"]
                msg = (
                    f"Fetched `{candidate}` ({res['variable_name']}) via `{res['connector_id']}`: "
                    f"Theil–Sen `{_fmt_signed(reg['slope_per_decade_sen'], 4)} {res['trend_unit']}`, "
                    f"`p_AR1 = {_fmt_num(sig['p_value_ar1_corrected'], 4)}` (`{sig['confidence_tier']}`)."
                )
                return msg, tools_used

    # 1b) Layer 2 Dynamic ML Engine (AR(1) CUSUM, partial ocean teleconnections, and Ridge attribution)
    if any(
        tok in q_lower
        for tok in (
            "discover",
            "ml",
            "cusum",
            "atlantic",
            "forcing",
            "driver",
            "attribut",
            "ridge",
            "gcv",
            "teleconnect",
            "ocean phase",
        )
    ):
        res, meta = execute_copilot_tool(
            "run_ml_dynamic_discovery", {"slot": slot}, analysis, cache=cache, language=lang
        )
        if meta["status"] == "ok":
            tools_used.append(meta)
            geom = res.get("regime_and_gam_geometry") or {}
            tel = res.get("partial_teleconnections") or {}
            attr = res.get("fast_gcv_physical_attribution") or {}
            top_tel = (tel.get("top_teleconnections") or [])[:2]
            top_drv = (attr.get("drivers_ranked") or [])[:2]
            brk_txt = (
                f"`{geom.get('break_date')}` (`CUSUM={geom.get('cusum_max_stat')}`, `p_bridge={geom.get('p_value_ar1_bridge')}`)"
                if geom.get("cusum_break_detected")
                else f"none (`CUSUM={geom.get('cusum_max_stat')}`, `p_bridge={geom.get('p_value_ar1_bridge')}`)"
            )
            tel_txt = (
                ", ".join(
                    f"`{t['ocean_box_id']}.{t['ocean_var']}` (lag `{t['lag_months']}m`, `r_part={t['partial_r']:+.3f}`, `q_FDR={t['partial_fdr_q']:.4f}`)"
                    for t in top_tel
                )
                or "none overlapping in cache"
            )
            drv_txt = (
                ", ".join(
                    f"`{d.get('predictor')}` (`β={d.get('standardized_beta', 0):+.3f}`, `ΔQ4-Q1={d.get('quartile_jump_q4_minus_q1', 0):+.3f}`)"
                    for d in top_drv
                )
                or "no local predictor available"
            )
            purged_r2 = attr.get("detrended_purged_cv_r2")
            p_f_ar1 = attr.get("p_value_f_ar1")
            attr_summary = (
                f"`purged_CV_R²={purged_r2}`, `p_F_AR1={p_f_ar1}` ({drv_txt})"
                if purged_r2 is not None
                else drv_txt
            )
            text = (
                f"Dynamic ML Discovery on Region {slot} (`{res['discovery_meta']['variable_id']}`): "
                f"Forensic regime `{geom.get('forensic_regime_diagnosis')}` | AR(1) CUSUM break: {brk_txt}. "
                f"Partial ocean teleconnections (`{tel.get('significant_strict_both_fdr05_count', 0)}` strictly coupled at FDR 5%): {tel_txt}. "
                f"Detrended Ridge attribution: {attr_summary}."
            )
            return text, tools_used

    # 2) Seasonal decomposition DJF/MAM/JJA/SON
    if any(tok in q_lower for tok in ("season", "quarterly", "djf", "mam", "jja", "son", "dry season")):
        res, meta = execute_copilot_tool(
            "compute_seasonal_stratified_trends", {"slot": slot}, analysis, language=lang
        )
        if meta["status"] == "ok":
            tools_used.append(meta)
            tu = res.get("trend_unit") or ""
            parts = []
            for s_name in ("DJF", "MAM", "JJA", "SON"):
                s_data = (res.get("seasons") or {}).get(s_name) or {}
                if s_data.get("status") == "OK":
                    parts.append(
                        f"**{s_name}**: `{_fmt_signed(s_data['slope_per_decade_sen'], 3)} {tu}` "
                        f"(p_AR1={_fmt_num(s_data['p_value_ar1_corrected'], 4)})"
                    )
            dom = res.get("dominant_season")
            rev = res.get("has_seasonal_sign_reversal")
            text = (
                f"Seasonal stratification for Region {slot} (`{res['variable_id']}`): "
                + "; ".join(parts)
                + f". Dominant season: **{dom}**"
                + (" (seasonal sign reversal detected)." if rev else ".")
            )
            return text, tools_used

    # 3) Lagged cross-correlation with AR(1)
    if isinstance(analysis.get("region_b_analysis"), dict) and any(
        tok in q_lower for tok in ("lag", "preced", "lead", "delay", "teleconnect", "months before", "months after")
    ):
        res, meta = execute_copilot_tool(
            "compute_lagged_crosscorrelation_ar1", {"max_lag": 6}, analysis, language=lang
        )
        if meta["status"] == "ok":
            tools_used.append(meta)
            b_raw = res["best_raw_lag"]
            b_det = res["best_detrended_lag"]
            text = (
                f"Lagged AR(1) cross-correlation (`±6` months): peak on raw anomalies at lag `{b_raw['lag_months']:+d}m` "
                f"(`r = {b_raw['r_raw_anomalies']:+.3f}`, `p_AR1 = {b_raw['p_raw_ar1']:.4f}`); "
                f"after linear detrending, peak at lag `{b_det['lag_months']:+d}m` (`r_det = {b_det['r_detrended']:+.3f}`, "
                f"`p_AR1 = {b_det['p_detrended_ar1']:.4f}`). {res['precedence_interpretation']}."
            )
            return text, tools_used

    # 4) Sensitivity test removing outliers (D_M > 2.5)
    if any(
        phrase in q_lower
        for phrase in ("without outlier", "exclude outlier", "remove outlier", "without extreme", "without el nino", "without el niño", "survive", "robust")
    ):
        res, meta = execute_copilot_tool(
            "run_sensitivity_without_outliers", {"slot": slot}, analysis, language=lang
        )
        if meta["status"] == "ok":
            tools_used.append(meta)
            base = res["baseline"]
            filt = res["filtered"]
            tu = filt.get("trend_unit") or ""
            text = (
                f"Sensitivity test excluding `{res['excluded_count']}` Mahalanobis extreme(s) (`D_M > 2.5`) on Region {slot}: "
                f"Theil–Sen moves from `{base['slope_per_decade_sen']:+.4f}` to `{filt['slope_per_decade_sen']:+.4f} {tu}` "
                f"(`p_AR1 = {filt['p_value_ar1_corrected']:.4f}`), OLS from `{base['slope_per_decade_ols']:+.4f}` to `{filt['slope_per_decade_ols']:+.4f} {tu}`. "
                f"Direction preserved: **{res['same_direction_after_removal']}**."
            )
            return text, tools_used

    # 5) Subperiod or regime split around pivot year
    year_match = re.search(r"\b(19\d{2}|20\d{2})\b", q_lower)
    if any(tok in q_lower for tok in ("subperiod", "break", "regime", "before and after", "split", "pivot", "changepoint")) or (
        year_match and any(tok in q_lower for tok in ("after", "before", "since"))
    ):
        split_ym = f"{year_match.group(1)}-01" if year_match else None
        res, meta = execute_copilot_tool(
            "run_subperiod_or_regime_split",
            {"slot": slot, **({"split_date": split_ym} if split_ym else {})},
            analysis,
            language=lang,
        )
        if meta["status"] == "ok" and res.get("mode") == "regime_split":
            tools_used.append(meta)
            bef = res["before"]
            aft = res["after"]
            tu = bef.get("trend_unit") or ""
            text = (
                f"Regime split at `{res['split_date']}` for Region {slot}: "
                f"Before (`{bef['start']}..{bef['end']}`): Sen `{bef['slope_per_decade_sen']:+.4f} {tu}` (`p_AR1={bef['p_value_ar1_corrected']:.4f}`); "
                f"After (`{aft['start']}..{aft['end']}`): Sen `{aft['slope_per_decade_sen']:+.4f} {tu}` (`p_AR1={aft['p_value_ar1_corrected']:.4f}`). "
                f"Shift: `{res['slope_sen_shift_after_minus_before']:+.4f} {tu}`."
            )
            return text, tools_used

    # 6) Quantiles P10/P50/P90 and tails
    if any(tok in q_lower for tok in ("quantile", "p10", "p50", "p90", "tail", "median", "iqr", "distribut")):
        res, meta = execute_copilot_tool(
            "inspect_quantiles_and_extremes", {"slot": slot}, analysis, language=lang
        )
        if meta["status"] == "ok":
            tools_used.append(meta)
            d = res["physical_tail_shifts_second_minus_first"]
            u = res.get("unit") or ""
            text = (
                f"Tail & quantile anatomy for Region {slot} ({res['first_half_period']} vs. {res['second_half_period']}): "
                f"ΔP10 = `{d['delta_p10']:+.3f} {u}`, ΔP50 (median) = `{d['delta_p50_median']:+.3f} {u}`, ΔP90 = `{d['delta_p90']:+.3f} {u}`."
            )
            return text, tools_used

    return None


def _answer_specific_question(
    question: str,
    analysis: Dict[str, Any],
    lang: str,
    cache: Optional[CellCacheStore] = None,
) -> Tuple[Optional[str], List[Dict[str, Any]]]:
    """Generates a targeted answer to the user's question using real tools and the 7 Invariants."""
    q = question.strip().lower()
    if not q:
        return None, []

    tool_hit = _maybe_run_heuristic_tool(question, analysis, lang, cache)
    if tool_hit is not None:
        return tool_hit

    reg_a = analysis.get("region_a_analysis") or {}
    reg_b = analysis.get("region_b_analysis")
    comp = analysis.get("comparison_pair")

    if any(tok in q for tok in ("endpoint", "start", "theil", "ols", "sen", "line")):
        sen_a = _fmt_signed((reg_a.get("regression") or {}).get("slope_per_decade_sen"), 4)
        ols_a = _fmt_signed((reg_a.get("regression") or {}).get("slope_per_decade_ols"), 4)
        tu = reg_a.get("trend_unit", "")
        return (
            f"Subtracting only `Y_end - Y_start` ignores the intermediate trajectory and confuses "
            f"El Niño/seasonal spikes with secular change. Here we fit the entire cloud after removing "
            f"monthly climatology: **Theil–Sen (`{sen_a} {tu}`)** takes the median pairwise slope (immune to spikes), "
            f"while **OLS (`{ols_a} {tu}`)** fits the least-squares mean rate.",
            [],
        )

    if any(tok in q for tok in ("mahalanobis", "outlier", "extreme", "spike", "ellipse")):
        outliers_a = reg_a.get("outliers_mahalanobis") or []
        outliers_b = (reg_b.get("outliers_mahalanobis") or []) if isinstance(reg_b, dict) else []
        total = len(outliers_a) + len(outliers_b)
        return (
            f"Mahalanobis distance (`D_M > 2.5`) measures how many robust covariance deviations a month "
            f"lies outside the `(time, anomaly)` contour ellipse, without deleting extreme climate events. "
            f"This analysis flagged **{total} extreme event(s)** across the selected regions.",
            [],
        )

    if any(tok in q for tok in ("noise", "el nino", "el niño", "enso", "signific", "ar1", "ar(1)", "fdr")):
        sig_a = reg_a.get("significance") or {}
        per_a = reg_a.get("period") or {}
        return (
            f"Climate series have temporal memory (autocorrelation), which inflates naive p-values. "
            f"We adjust the sample size to `n_eff = {_fmt_num(per_a.get('n_effective_ar1'), 1)}` (out of "
            f"`{per_a.get('n_observations')}` months) via AR(1) and apply Benjamini–Hochberg FDR "
            f"(`q = {_fmt_num(sig_a.get('fdr_q_value'), 4)}`, `p_AR1 = {_fmt_num(sig_a.get('p_value_ar1_corrected'), 4)}`) "
            f"to separate real secular trends from natural ENSO oscillations.",
            [],
        )

    if any(tok in q for tok in ("%", "percent", "scale", "interval", "celsius", "°c")):
        return (
            "Interval scales such as Celsius (`°C`) or anomalies have no true physical zero, so dividing "
            "changes to compute `%` produces mathematically meaningless numbers (Invariant #3). "
            "Therefore, trends are strictly reported in physical units per decade (e.g., `°C/decade`).",
            [],
        )

    if any(tok in q for tok in ("gam", "spline", "accelerat", "regime", "curve", "nonlinear")):
        re_a = reg_a.get("regression") or {}
        return (
            f"The GAM/smoothing curve captures physical acceleration or saturation without wild endpoint "
            f"oscillations from high-degree polynomials. Region A exhibits `{re_a.get('regime_shape')}` "
            f"with quadratic acceleration `B2 = {_fmt_signed(re_a.get('quadratic_acceleration_B2'), 5)}`.",
            [],
        )

    if isinstance(comp, dict) and any(tok in q for tok in ("paradox", "multiscale", "compar", "region b", "diverg")):
        mc = comp.get("multiscale_correlation") or {}
        return (
            f"Multiscale decomposition separates decadal co-movement (`r_global = {_fmt_num(mc.get('long_term_secular_r'), 3)}`) "
            f"from detrended short-term fluctuations (`r_detrended = {_fmt_num(mc.get('short_term_detrended_r'), 3)}`). "
            f"Diagnostic: `{mc.get('paradox_type')}` — {mc.get('interpretation')}",
            [],
        )

    sig_a = reg_a.get("significance") or {}
    re_a = reg_a.get("regression") or {}
    return (
        f"Based on the current NASA dataset for `{reg_a.get('variable_id')}`, the robust Theil–Sen slope is "
        f"`{_fmt_signed(re_a.get('slope_per_decade_sen'), 4)} {reg_a.get('trend_unit')}` "
        f"(regime `{re_a.get('regime_shape')}`, `q_FDR = {_fmt_num(sig_a.get('fdr_q_value'), 4)}`). "
        f"All conclusions adhere to deseasonalized anomalies and AR(1)-corrected inference.",
        [],
    )


def generate_heuristic_synthesis(
    analysis: Dict[str, Any],
    question: Optional[str] = None,
    language: str = "en",
    cache: Optional[CellCacheStore] = None,
) -> Dict[str, Any]:
    """
    Generates a complete deterministic scientific diagnosis (< 15 ms, invoking real tools
    for subperiods, outliers, seasonality, lags, and quantiles when queried).
    """
    lang = _normalize_language(language)
    reg_a = analysis.get("region_a_analysis")
    if not isinstance(reg_a, dict):
        raise ValueError("Payload 'analysis' must contain 'region_a_analysis'.")

    meta = analysis.get("request_meta") or {}
    reg_b = analysis.get("region_b_analysis")
    comp = analysis.get("comparison_pair")

    lines_a, summary_a = _format_region_diagnostic("A", reg_a, meta.get("region_a_id"), lang)

    sections = ["### Scientific Diagnosis — Statistical Co-Pilot", *lines_a]

    where_summary = summary_a["where"]
    if isinstance(reg_b, dict):
        lines_b, summary_b = _format_region_diagnostic("B", reg_b, meta.get("region_b_id"), lang)
        sections.extend(["", *lines_b])
        where_summary = f"{summary_a['where']} vs. {summary_b['where']}"

    if isinstance(comp, dict):
        mc = comp.get("multiscale_correlation") or {}
        paradox_code = str(mc.get("paradox_type") or "")
        paradox_desc = _PARADOX_LABELS[lang].get(paradox_code, paradox_code)
        r_glob = _fmt_num(mc.get("long_term_secular_r"), 3)
        r_det = _fmt_num(mc.get("short_term_detrended_r"), 3)
        div_flag = bool(comp.get("spatial_divergence_detected", False))
        interp = str(mc.get("interpretation") or "")
        sections.extend([
            "",
            "#### 2. WHERE & Multiscale Comparison (`A × B`)",
            f"- **Spatial Divergence:** {'Detected' if div_flag else 'Not detected'} (`{where_summary}`).",
            f"- **Multiscale Correlation:** Long-term secular `r = {r_glob}` | Short-term detrended `r = {r_det}`.",
            f"- **Diagnostic (`{paradox_code}`):** {paradox_desc}. {interp}",
        ])
        where_summary = f"{where_summary} (spatial divergence: {div_flag})"
    else:
        sections.insert(2, f"- **2. WHERE:** `{summary_a['where']}` (single-region mode).")

    direct_answer: Optional[str] = None
    tools_used: List[Dict[str, Any]] = []
    if question and question.strip():
        direct_answer, tools_used = _answer_specific_question(question, analysis, lang, cache=cache)
        if direct_answer:
            sections.extend(["", "#### Direct Answer", direct_answer])

    reply_raw = "\n".join(sections)
    reply_clean, warnings = sanitize_interval_scale_percentages(reply_raw, analysis, lang)
    answer_clean = direct_answer
    if answer_clean:
        answer_clean, w_ans = sanitize_interval_scale_percentages(answer_clean, analysis, lang)
        warnings.extend(w_ans)

    synthesis = _build_synthesis_sections(analysis, summary_a, lang)
    return {
        "synthesis": synthesis,
        "answer": answer_clean,
        "reply_markdown": reply_clean,
        "language": lang,
        "mode": "heuristic_fallback",
        "model": "deterministic-statistical-synthesizer-v1",
        "four_answers": {
            "what": summary_a["what"],
            "where": where_summary,
            "how_much": summary_a["how_much"],
            "is_significant": summary_a["is_significant"],
        },
        "suggested_questions": list(_SUGGESTED_QUESTIONS[lang]),
        "guardrails_applied": _guardrails_list(lang),
        "tools_used": tools_used,
        "invariant_warnings": warnings,
    }


def _invoke_gemini_http(
    url: str,
    payload: Dict[str, Any],
    timeout_seconds: float,
) -> Dict[str, Any]:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
        return json.loads(resp.read().decode("utf-8"))


_SCHEMA_LEAK_KEYS = (
    '"synthesis"',
    '"four_answers"',
    '"direct_answer"',
    '"reply_markdown"',
    '"suggested_questions"',
    '"mathematical_evidence"',
    '"physical_meaning"',
    '"false_conclusion_risk"',
)


def _strip_model_reasoning_and_fences(raw_text: str) -> str:
    """Removes internal model <think>/<reasoning> tags and outer markdown code fences."""
    cleaned = raw_text.strip()
    cleaned = re.sub(r"<(?:think|thinking|reasoning)>[\s\S]*?</(?:think|thinking|reasoning)>", "", cleaned, flags=re.IGNORECASE).strip()
    # Strip any trailing unclosed <think>...</... if it precedes or follows nothing useful
    if "<think>" in cleaned.lower():
        before_think = re.split(r"<(?:think|thinking|reasoning)>", cleaned, maxsplit=1, flags=re.IGNORECASE)[0].strip()
        if before_think:
            cleaned = before_think
    # Unwrap ```json ... ``` even if surrounded by brief prose or missing closing ``` on truncation
    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned, flags=re.IGNORECASE)
    if fence_match and "{" in fence_match.group(1):
        return fence_match.group(1).strip()
    unclosed_json_fence = re.search(r"```(?:json)?\s*(\{[\s\S]*)$", cleaned, flags=re.IGNORECASE)
    if unclosed_json_fence:
        return unclosed_json_fence.group(1).strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json|markdown|md)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned.strip()


def _escape_raw_newlines_in_json_strings(text: str) -> str:
    """Escapes literal control newlines/tabs inside JSON string literals emitted by smaller models."""
    out: List[str] = []
    in_string = False
    escaped = False
    for ch in text:
        if escaped:
            out.append(ch)
            escaped = False
            continue
        if ch == "\\":
            out.append(ch)
            if in_string:
                escaped = True
            continue
        if ch == '"':
            in_string = not in_string
            out.append(ch)
            continue
        if in_string:
            if ch == "\n":
                out.append("\\n")
                continue
            if ch == "\r":
                continue
            if ch == "\t":
                out.append("\\t")
                continue
        out.append(ch)
    return "".join(out)


def _decode_json_string_prefix(text: str, key_name: str) -> Optional[str]:
    """Extracts and unescapes a JSON string value for `key_name`, even if truncated mid-string."""
    pattern = re.compile(rf'"{re.escape(key_name)}"\s*:\s*"')
    match = pattern.search(text)
    if not match:
        return None
    pos = match.end()
    # Try exact JSONDecoder from opening quote first
    try:
        decoded, _ = json.JSONDecoder(strict=False).raw_decode(text, match.end() - 1)
        if isinstance(decoded, str) and decoded.strip():
            return decoded.strip()
    except json.JSONDecodeError:
        pass

    # Fallback: scan truncated string until unescaped quote or EOF
    chars: List[str] = []
    n = len(text)
    while pos < n:
        ch = text[pos]
        if ch == '"':
            break
        if ch == "\\":
            if pos + 1 >= n:
                break
            nxt = text[pos + 1]
            if nxt == "n":
                chars.append("\n")
            elif nxt == "t":
                chars.append("\t")
            elif nxt == "r":
                pass
            elif nxt in ('"', "\\", "/"):
                chars.append(nxt)
            elif nxt == "u" and pos + 5 < n:
                hex_part = text[pos + 2 : pos + 6]
                try:
                    chars.append(chr(int(hex_part, 16)))
                    pos += 6
                    continue
                except ValueError:
                    chars.append("\\u")
            else:
                # Preserve unrecognized escape sequences (e.g. accidental LaTeX \frac -> \f is kept readable)
                chars.append("\\" + nxt)
            pos += 2
            continue
        chars.append(ch)
        pos += 1
    result = "".join(chars).strip()
    return result or None


def _extract_partial_structured_fields(cleaned: str) -> Optional[Dict[str, Any]]:
    """Recovers complete or truncated fields from malformed/cut-off JSON Co-Pilot outputs."""
    if not any(k in cleaned for k in _SCHEMA_LEAK_KEYS):
        return None

    recovered: Dict[str, Any] = {}
    decoder = json.JSONDecoder(strict=False)

    # 1. Try nested dict fields cleanly if closed
    for dict_key in ("synthesis", "four_answers"):
        m = re.search(rf'"{dict_key}"\s*:\s*\{{', cleaned)
        if m:
            try:
                val, _ = decoder.raw_decode(cleaned, m.end() - 1)
                if isinstance(val, dict):
                    recovered[dict_key] = val
                    continue
            except json.JSONDecodeError:
                pass
        sub_keys = (
            ("mathematical_evidence", "physical_meaning", "false_conclusion_risk")
            if dict_key == "synthesis"
            else ("what", "where", "how_much", "is_significant")
        )
        partial_sub = {sk: sv for sk in sub_keys if (sv := _decode_json_string_prefix(cleaned, sk))}
        if partial_sub:
            recovered[dict_key] = partial_sub

    # 2. Extract top-level prose fields (even if truncated near max_tokens)
    for str_key in ("direct_answer", "reply_markdown"):
        val = _decode_json_string_prefix(cleaned, str_key)
        if val:
            recovered[str_key] = val

    # 3. Extract suggested_questions if complete
    sq_match = re.search(r'"suggested_questions"\s*:\s*\[', cleaned)
    if sq_match:
        try:
            sq_val, _ = decoder.raw_decode(cleaned, sq_match.end() - 1)
            if isinstance(sq_val, list):
                recovered["suggested_questions"] = sq_val
        except json.JSONDecodeError:
            pass

    return recovered if recovered else None


_VALID_JSON_ESCAPES = frozenset(('"', "\\", "/", "b", "f", "n", "r", "t"))
_TEX_FROM_CONTROL_CHAR_PATTERN = re.compile(
    r"[\x08\x0c\r]|"
    r"\t(?=(?:ext|heta|au|ilde|imes|frac|op|o\b|riangle))"
)


def _repair_invalid_json_backslashes(text: str) -> str:
    """Escapes single backslashes inside JSON strings that aren't valid JSON escapes (e.g. \\Delta, \\sigma)."""
    out: List[str] = []
    in_string = False
    n = len(text)
    i = 0
    while i < n:
        ch = text[i]
        if not in_string:
            if ch == '"':
                in_string = True
            out.append(ch)
            i += 1
            continue

        if ch == '"':
            in_string = False
            out.append(ch)
            i += 1
            continue

        if ch == "\\":
            if i + 1 >= n:
                out.append("\\\\")
                i += 1
                continue
            nxt = text[i + 1]
            if nxt == "u":
                hex_part = text[i + 2 : i + 6]
                if len(hex_part) == 4 and all(c in "0123456789abcdefABCDEF" for c in hex_part):
                    out.append(text[i : i + 6])
                    i += 6
                    continue
                out.append("\\\\u")
                i += 2
                continue
            if nxt in _VALID_JSON_ESCAPES:
                out.append("\\" + nxt)
                i += 2
                continue
            # Invalid escape such as \Delta, \sigma, \approx -> escape the backslash
            out.append("\\\\" + nxt)
            i += 2
            continue

        out.append(ch)
        i += 1
    return "".join(out)


_LITERAL_NL_PATTERN = re.compile(
    r"\\n(?!(?:a(?:bla|tural)|e(?:q|g|wline)?|i\b|mid|o(?:rm|tin)|leq|geq|rightarrow|subseteq|supseteq|u\b))"
)


def _restore_control_chars_in_str(text: str) -> str:
    """Restores accidental single-backslash \\b/\\f/\\r/\\t parsed out of LaTeX commands and literal \\\\n newlines."""
    fixed = text
    if any(c in fixed for c in ("\x08", "\x0c", "\r", "\t")):
        def _repl(match: re.Match[str]) -> str:
            ch = match.group(0)
            if ch == "\x08":
                return "\\b"
            if ch == "\x0c":
                return "\\f"
            if ch == "\r":
                return "\\r"
            if ch == "\t":
                return "\\t"
            return ch

        fixed = _TEX_FROM_CONTROL_CHAR_PATTERN.sub(_repl, fixed)
    if "\n" not in fixed and "\\n" in fixed:
        fixed = _LITERAL_NL_PATTERN.sub("\n", fixed)
    return fixed


def _restore_control_chars_recursive(value: Any) -> Any:
    if isinstance(value, str):
        return _restore_control_chars_in_str(value)
    if isinstance(value, list):
        return [_restore_control_chars_recursive(item) for item in value]
    if isinstance(value, dict):
        return {k: _restore_control_chars_recursive(v) for k, v in value.items()}
    return value


def _parse_structured_llm_output(raw_text: str) -> Optional[Dict[str, Any]]:
    cleaned = _strip_model_reasoning_and_fences(raw_text)
    escaped_nl = _escape_raw_newlines_in_json_strings(cleaned)
    candidates = [
        cleaned,
        escaped_nl,
        _repair_invalid_json_backslashes(cleaned),
        _repair_invalid_json_backslashes(escaped_nl),
    ]

    for candidate in candidates:
        try:
            parsed = json.loads(candidate, strict=False)
            if isinstance(parsed, dict):
                return _restore_control_chars_recursive(parsed)
        except json.JSONDecodeError:
            pass

        # Scan for the first valid top-level Co-Pilot JSON dict embedded inside surrounding prose.
        # Skip orphaned nested sub-dicts (e.g. inner "synthesis") when outer JSON is truncated.
        top_keys = ("synthesis", "four_answers", "direct_answer", "reply_markdown", "suggested_questions")
        decoder = json.JSONDecoder(strict=False)
        fallback_dict: Optional[Dict[str, Any]] = None
        for idx, ch in enumerate(candidate):
            if ch != "{":
                continue
            try:
                parsed, _ = decoder.raw_decode(candidate, idx)
                if isinstance(parsed, dict):
                    if any(k in parsed for k in top_keys):
                        return _restore_control_chars_recursive(parsed)
                    if fallback_dict is None:
                        fallback_dict = parsed
            except json.JSONDecodeError:
                continue

        partial = _extract_partial_structured_fields(candidate)
        if partial:
            return _restore_control_chars_recursive(partial)
        if fallback_dict is not None:
            return _restore_control_chars_recursive(fallback_dict)

    partial = _extract_partial_structured_fields(cleaned)
    return _restore_control_chars_recursive(partial) if partial else None


def _looks_like_leaked_json_scaffolding(text: str) -> bool:
    stripped = text.lstrip()
    if any(k in stripped for k in _SCHEMA_LEAK_KEYS):
        return True
    if stripped.startswith(("{", "[")) and ('":' in stripped or "':" in stripped):
        return True
    return False


def _sanitize_unstructured_llm_text(raw_text: str) -> Optional[str]:
    """Cleans freeform Markdown fallback responses and blocks raw JSON/token leakage."""
    cleaned = _strip_model_reasoning_and_fences(raw_text)
    if not cleaned:
        return None
    if "\n" not in cleaned and "\\n" in cleaned:
        cleaned = re.sub(
            r"\\n(?!(?:a(?:bla|tural)|e(?:q|g|wline)?|i\b|mid|o(?:rm|tin)|leq|geq|rightarrow|subseteq|supseteq|u\b))",
            "\n",
            cleaned,
        )
    if _looks_like_leaked_json_scaffolding(cleaned):
        return None
    return cleaned.strip() or None


def _call_gemini_copilot(
    system_prompt: str,
    user_prompt: str,
    api_key: str,
    analysis: Mapping[str, Any],
    *,
    history: Optional[List[Dict[str, str]]] = None,
    timeout_seconds: Optional[float] = None,
    cache: Optional[CellCacheStore] = None,
    language: str = "en",
    http_post_fn: Optional[Callable[[str, Dict[str, Any], float], Dict[str, Any]]] = None,
) -> Tuple[str, List[Dict[str, Any]]]:
    """Agentic query to the Gemini REST API with a Function Calling loop (up to 3 rounds)."""
    model_name = os.environ.get("GEMINI_COPILOT_MODEL", "gemini-2.5-flash")
    if timeout_seconds is None:
        try:
            timeout_seconds = float(os.environ.get("GEMINI_COPILOT_TIMEOUT", "10.0"))
        except ValueError:
            timeout_seconds = 10.0

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model_name}:generateContent?key={api_key}"
    )
    poster = http_post_fn or _invoke_gemini_http

    contents: List[Dict[str, Any]] = []
    if history:
        for msg in history[-6:]:
            role = "model" if msg.get("role") == "assistant" else "user"
            text = str(msg.get("content") or "").strip()
            if text:
                contents.append({"role": role, "parts": [{"text": text}]})
    contents.append({"role": "user", "parts": [{"text": user_prompt}]})

    declarations = get_gemini_tool_declarations()
    tools_used: List[Dict[str, Any]] = []

    for _round in range(MAX_TOOL_ROUNDS + 1):
        payload: Dict[str, Any] = {
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": contents,
            "tools": [{"functionDeclarations": declarations}],
            "toolConfig": {"functionCallingConfig": {"mode": "AUTO"}},
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": 2500,
            },
        }
        data = poster(url, payload, timeout_seconds)
        candidates = data.get("candidates") or []
        content = (candidates[0].get("content") or {}) if candidates else {}
        parts = content.get("parts") or []

        fn_calls = [p.get("functionCall") for p in parts if isinstance(p, dict) and p.get("functionCall")]
        if fn_calls and _round < MAX_TOOL_ROUNDS:
            contents.append({"role": "model", "parts": parts})
            response_parts: List[Dict[str, Any]] = []
            for call in fn_calls:
                fn_name = str(call.get("name") or "")
                fn_args = call.get("args") if isinstance(call.get("args"), dict) else {}
                tool_result, tool_meta = execute_copilot_tool(
                    fn_name, fn_args, analysis, cache=cache, language=language
                )
                tools_used.append(tool_meta)
                response_parts.append(
                    {
                        "functionResponse": {
                            "name": fn_name,
                            "response": {"result": tool_result},
                        }
                    }
                )
            contents.append({"role": "user", "parts": response_parts})
            continue

        text = "".join(
            str(p.get("text") or "")
            for p in parts
            if isinstance(p, dict) and not p.get("thought")
        ).strip()
        if not text:
            raise ValueError("Empty response from Gemini API.")
        return text, tools_used

    raise ValueError("Function Calling round limit exceeded in Gemini API.")


def _default_openrouter_http_post(
    url: str,
    payload: Dict[str, Any],
    headers: Dict[str, str],
    timeout: float,
) -> Dict[str, Any]:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _call_openrouter_copilot(
    system_prompt: str,
    user_prompt: str,
    api_key: str,
    analysis: Dict[str, Any],
    *,
    history: Optional[List[Dict[str, str]]] = None,
    cache: Optional[CellCacheStore] = None,
    language: str = "pt",
    http_post_fn: Optional[Callable[[str, Dict[str, Any], float], Dict[str, Any]]] = None,
) -> Tuple[str, List[Dict[str, Any]]]:
    model = os.environ.get("OPENROUTER_COPILOT_MODEL", "deepseek/deepseek-chat").strip() or "deepseek/deepseek-chat"
    timeout_seconds = float(
        os.environ.get("OPENROUTER_COPILOT_TIMEOUT", os.environ.get("GEMINI_COPILOT_TIMEOUT", "15.0"))
    )
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "Earth System Trend Detective",
    }

    messages: List[Dict[str, Any]] = [{"role": "system", "content": system_prompt}]
    if history:
        for turn in history[-6:]:
            role = "assistant" if turn.get("role") == "assistant" else "user"
            text = str(turn.get("content") or "").strip()
            if text:
                messages.append({"role": role, "content": text})
    messages.append({"role": "user", "content": user_prompt})

    declarations = get_gemini_tool_declarations()
    openai_tools = [
        {
            "type": "function",
            "function": {
                "name": decl["name"],
                "description": decl["description"],
                "parameters": decl["parameters"],
            },
        }
        for decl in declarations
    ]
    tools_used: List[Dict[str, Any]] = []

    for _round in range(MAX_TOOL_ROUNDS + 1):
        payload: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "tools": openai_tools,
            "tool_choice": "auto",
            "temperature": 0.2,
            "max_tokens": 2500,
        }
        if http_post_fn is not None:
            data = http_post_fn(url, payload, timeout_seconds)
        else:
            data = _default_openrouter_http_post(url, payload, headers, timeout_seconds)

        choices = data.get("choices") or []
        message = (choices[0].get("message") or {}) if choices else {}
        tool_calls = message.get("tool_calls") or []

        if tool_calls and _round < MAX_TOOL_ROUNDS:
            messages.append(
                {
                    "role": "assistant",
                    "content": message.get("content") or "",
                    "tool_calls": tool_calls,
                }
            )
            for call in tool_calls:
                fn_obj = call.get("function") or {}
                fn_name = str(fn_obj.get("name") or "")
                raw_args = fn_obj.get("arguments")
                if isinstance(raw_args, str):
                    try:
                        fn_args = json.loads(raw_args) if raw_args.strip() else {}
                    except json.JSONDecodeError:
                        fn_args = {}
                elif isinstance(raw_args, dict):
                    fn_args = raw_args
                else:
                    fn_args = {}

                tool_result, tool_meta = execute_copilot_tool(
                    fn_name, fn_args, analysis, cache=cache, language=language
                )
                tools_used.append(tool_meta)
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": str(call.get("id") or fn_name),
                        "content": json.dumps(tool_result, ensure_ascii=False),
                    }
                )
            continue

        raw_content = message.get("content")
        if isinstance(raw_content, list):
            text = "".join(
                str(block.get("text") or "")
                for block in raw_content
                if isinstance(block, dict)
                and block.get("type") not in ("thinking", "reasoning")
                and block.get("text")
            ).strip()
        else:
            text = str(raw_content or "").strip()
        if not text:
            raise ValueError("Empty response from OpenRouter API.")
        return text, tools_used

    raise ValueError("Function Calling round limit exceeded in OpenRouter API.")


def _apply_invariant_guardrails(
    response: Dict[str, Any],
    analysis: Dict[str, Any],
    lang: str,
) -> Dict[str, Any]:
    """Sanitizes all textual fields against Invariant #3 violations and logs audit warnings."""
    warnings: List[str] = list(response.get("invariant_warnings") or [])

    def _clean(text: Optional[str]) -> Optional[str]:
        if text is None:
            return None
        cleaned, w = sanitize_interval_scale_percentages(str(text), analysis, lang)
        warnings.extend(w)
        if _ENDPOINT_VIOLATION_PATTERN.search(cleaned):
            warnings.append("Invariant #1 notice: avoid endpoint-minus-start rate framing.")
        return cleaned

    out = dict(response)
    out["reply_markdown"] = _clean(out.get("reply_markdown")) or ""
    if out.get("answer") is not None:
        out["answer"] = _clean(out.get("answer"))

    if isinstance(out.get("synthesis"), dict):
        synth = dict(out["synthesis"])
        for k in ("mathematical_evidence", "physical_meaning", "false_conclusion_risk"):
            if isinstance(synth.get(k), str):
                synth[k] = _clean(synth[k])
        out["synthesis"] = synth

    if isinstance(out.get("four_answers"), dict):
        four = dict(out["four_answers"])
        for k in ("what", "where", "how_much", "is_significant"):
            if isinstance(four.get(k), str):
                four[k] = _clean(four[k])
        out["four_answers"] = four

    # Deduplicate while preserving order
    out["invariant_warnings"] = list(dict.fromkeys(warnings))
    return out


def generate_copilot_response(
    analysis: Dict[str, Any],
    question: Optional[str] = None,
    language: str = "en",
    history: Optional[List[Dict[str, str]]] = None,
    use_llm: bool = True,
    cache: Optional[CellCacheStore] = None,
    http_post_fn: Optional[Callable[[str, Dict[str, Any], float], Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Single entry point for the Statistical Co-Pilot:
    1) Uses Gemini/OpenRouter LLM + Function Calling when `use_llm=True` and an API key is configured.
    2) Otherwise (or on error/timeout), returns an instant deterministic synthesis
       (also capable of invoking real Python tools when applicable).
    """
    _ensure_env_loaded()
    lang = _normalize_language(language)
    heuristic = generate_heuristic_synthesis(analysis, question=question, language=lang, cache=cache)
    gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
    openrouter_key = os.environ.get("OPENROUTER_API_KEY", "").strip()

    if not use_llm or (not gemini_key and not openrouter_key):
        return heuristic

    system_prompt = COPILOT_SYSTEM_PROMPT_EN if lang == "en" else COPILOT_SYSTEM_PROMPT_PT
    user_prompt = build_copilot_prompt(analysis, question=question, language=lang)

    try:
        if gemini_key:
            llm_raw, tools_used = _call_gemini_copilot(
                system_prompt,
                user_prompt,
                gemini_key,
                analysis,
                history=history,
                cache=cache,
                language=lang,
                http_post_fn=http_post_fn,
            )
            active_model = os.environ.get("GEMINI_COPILOT_MODEL", "gemini-2.5-flash")
        else:
            llm_raw, tools_used = _call_openrouter_copilot(
                system_prompt,
                user_prompt,
                openrouter_key,
                analysis,
                history=history,
                cache=cache,
                language=lang,
                http_post_fn=http_post_fn,
            )
            active_model = os.environ.get("OPENROUTER_COPILOT_MODEL", "deepseek/deepseek-chat")

        structured = _parse_structured_llm_output(llm_raw)
        merged = dict(heuristic)
        merged["mode"] = "llm_gemini"
        merged["model"] = active_model
        merged["tools_used"] = tools_used

        if structured:
            if isinstance(structured.get("synthesis"), dict):
                base_synth = dict(heuristic["synthesis"])
                for k in ("mathematical_evidence", "physical_meaning", "false_conclusion_risk"):
                    if isinstance(structured["synthesis"].get(k), str) and structured["synthesis"][k].strip():
                        base_synth[k] = structured["synthesis"][k].strip()
                merged["synthesis"] = base_synth
            if isinstance(structured.get("four_answers"), dict):
                base_four = dict(heuristic["four_answers"])
                for k in ("what", "where", "how_much", "is_significant"):
                    if isinstance(structured["four_answers"].get(k), str) and structured["four_answers"][k].strip():
                        base_four[k] = structured["four_answers"][k].strip()
                merged["four_answers"] = base_four
            if isinstance(structured.get("direct_answer"), str) and structured["direct_answer"].strip():
                merged["answer"] = structured["direct_answer"].strip()
            if isinstance(structured.get("reply_markdown"), str) and structured["reply_markdown"].strip():
                merged["reply_markdown"] = structured["reply_markdown"].strip()
            elif merged.get("answer"):
                merged["reply_markdown"] = str(merged["answer"])
            if isinstance(structured.get("suggested_questions"), list):
                s_q = [str(item).strip() for item in structured["suggested_questions"] if str(item).strip()]
                if s_q:
                    merged["suggested_questions"] = s_q[:5]
        else:
            sanitized_prose = _sanitize_unstructured_llm_text(llm_raw)
            if sanitized_prose:
                merged["answer"] = sanitized_prose
                merged["reply_markdown"] = sanitized_prose

        return _apply_invariant_guardrails(merged, analysis, lang)
    except (urllib.error.URLError, TimeoutError, ValueError, KeyError, json.JSONDecodeError, OSError):
        return heuristic
