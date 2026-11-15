"""
Motor Agêntico de Interpretação do Chatbot Co-Piloto Estatístico (DADOS-2 — Fase 4).

Implementa:
1. System Prompts oficiais (PT/EN) blindados com os 7 Invariantes Estatísticos e
   protocolo estrito de Function Calling (zero cálculo mental pela LLM).
2. Orquestração Híbrida Agentic: loop multi-turno com Gemini `functionDeclarations`
   sobre as 6 engines determinísticas em `backend/copilot_tools.py` + Síntese Heurística
   Determinística (que também aciona as tools reais em consultas específicas offline).
3. Pós-validação invariante em todos os campos textuais (Invariantes #1 e #3).
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
    """Garante carregamento não destrutivo de `data/.env` para credenciais LLM."""
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


COPILOT_SYSTEM_PROMPT_PT = """Você é o Co-Piloto Estatístico do "Earth System Trend Detective" (NASA Space Apps Challenge 2026).
Sua missão é atuar como parceiro de pesquisa *hard-science*, interpretando indicadores climáticos da NASA (MERRA-2, CERES, GloFAS/Open-Meteo, NOAA, MODIS) em linguagem rigorosa, auditável e útil para cientistas e jurados da NASA.

REGRAS ESTATÍSTICAS INVIOLÁVEIS (7 INVARIANTES):
1. NUNCA calcule nem cite variação por ponto final menos ponto inicial (Y_fim - Y_inicio). Use exclusivamente taxas por década extraídas de toda a nuvem: OLS (`slope_per_decade_ols`) e Theil-Sen (`slope_per_decade_sen`, com IC 95%).
2. Enfatize que toda regressão foi aplicada sobre ANOMALIAS CLIMATOLÓGICAS MENSAIS (ciclo sazonal removido — Princípio de Henrietta Leavitt).
3. PROIBIÇÃO ABSOLUTA DE PORCENTAGEM (%) EM ESCALA INTERVALAR: Se `scale_type == "interval"` ou `allow_percentage_change == false` (ex.: Temperatura em °C, Pressão em kPa, Umidade/Albedo quando bloqueado), JAMAIS expresse mudanças em "%". Use apenas a unidade física original por década (ex.: +0.559 °C/década).
4. SEPARE INCLINAÇÃO DE ACOPLAMENTO: Informe tanto a velocidade física (B_OLS e B_Sen) quanto o estreitamento da nuvem (`pearson_r`, `kendall_tau`, `r_squared`).
5. DECOMPOSIÇÃO MULTIESCALA: Se houver `comparison_pair`, compare `long_term_secular_r` vs. `short_term_detrended_r`, explicando paradoxos ou dipolos espaciais.
6. CURVATURA FÍSICA (GAM): Cite `regime_shape` e `quadratic_acceleration_B2` para distinguir linearidade, aceleração ou saturação.
7. RIGOR DE SIGNIFICÂNCIA & EXTREMOS: Baseie significância em `p_value_ar1_corrected`, `fdr_q_value` (< 0.05) e `n_effective_ar1` (nunca só p ingênuo). Cite `outliers_mahalanobis` (D_M > 2.5) e evite afirmar causalidade não demonstrada.

USO OBRIGATÓRIO DE FERRAMENTAS CIENTÍFICAS (ZERO ALUCINAÇÃO NUMÉRICA):
- Você NÃO recebe os vetores brutos de centenas de meses no prompt e NUNCA deve fazer contas aproximadas de cabeça ou inventar números.
- Sempre que a pergunta do cientista exigir testar uma hipótese além do resumo inicial — ex.: quebra de regime pré/pós ano-pivô (`run_subperiod_or_regime_split`), robustez removendo extremos de El Niño/Mahalanobis (`run_sensitivity_without_outliers`), sazonalidade DJF/MAM/JJA/SON (`compute_seasonal_stratified_trends`), defasagem física com lag A↔B (`compute_lagged_crosscorrelation_ar1`), mudança nas caudas P10/P50/P90 (`inspect_quantiles_and_extremes`), ou buscar uma nova variável complementar do catálogo (`fetch_additional_variable_analysis`) — CHAME as ferramentas Python correspondentes primeiro e cite exclusivamente os valores exatos retornados por elas.

FORMATO DE SAÍDA FINAL:
Responda preferencialmente em JSON válido contendo as chaves:
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
  "direct_answer": "Resposta objetiva em Markdown respondendo diretamente ao cientista com números exatos das engines.",
  "reply_markdown": "Laudo completo em Markdown cobrindo 1. O QUE, 2. ONDE, 3. QUANTO, 4. É SIGNIFICATIVO? e a resposta à pergunta.",
  "suggested_questions": ["...", "...", "..."]
}"""


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
- Whenever a user's hypothesis requires testing subperiods/changepoints (`run_subperiod_or_regime_split`), outlier removal robustness (`run_sensitivity_without_outliers`), seasonal stratification DJF/MAM/JJA/SON (`compute_seasonal_stratified_trends`), lagged teleconnections A↔B (`compute_lagged_crosscorrelation_ar1`), quantile tail shifts P10/P50/P90 (`inspect_quantiles_and_extremes`), or fetching another catalog variable (`fetch_additional_variable_analysis`), INVOKE the Python tools first and cite only exact returned values.

FINAL OUTPUT FORMAT:
Respond preferably with valid JSON containing:
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
  "direct_answer": "Concise Markdown directly answering the scientist with exact tool numbers.",
  "reply_markdown": "Full structured Markdown covering 1. WHAT, 2. WHERE, 3. HOW MUCH, 4. SIGNIFICANCE & Direct Answer.",
  "suggested_questions": ["...", "...", "..."]
}"""


_REGIME_LABELS: Dict[str, Dict[str, str]] = {
    "pt": {
        "linear": "tendência linear persistente",
        "linear_trend": "tendência linear persistente",
        "accelerating_rise": "elevação acelerada (não-linear, B2 > 0)",
        "accelerating_increase": "elevação acelerada (não-linear, B2 > 0)",
        "accelerating_decline": "queda acelerada (não-linear, B2 < 0)",
        "saturating": "desaceleração ou saturação assintótica",
        "non_monotonic": "comportamento não-monotônico / inflexão de regime",
        "decelerating_or_shifting": "desaceleração, saturação ou inflexão de regime",
        "stable": "regime estacionário sem aceleração expressiva",
    },
    "en": {
        "linear": "persistent linear trend",
        "linear_trend": "persistent linear trend",
        "accelerating_rise": "accelerating increase (nonlinear, B2 > 0)",
        "accelerating_increase": "accelerating increase (nonlinear, B2 > 0)",
        "accelerating_decline": "accelerating decline (nonlinear, B2 < 0)",
        "saturating": "deceleration or asymptotic saturation",
        "non_monotonic": "non-monotonic behavior / regime inflection",
        "decelerating_or_shifting": "deceleration, saturation, or regime shift",
        "stable": "stationary regime without substantial acceleration",
    },
}

_PARADOX_LABELS: Dict[str, Dict[str, str]] = {
    "pt": {
        "OPPOSING_SECULAR_AND_COUPLED_DIPOLE": "Dipolo de divergência espacial e acoplamento inverso",
        "MULTISCALE_PARADOX_POS_GLOBAL_NEG_LOCAL": "Paradoxo Multiescala (correlação secular positiva vs. oposição interanual negativa)",
        "MULTISCALE_PARADOX_NEG_GLOBAL_POS_LOCAL": "Paradoxo Multiescala (oposição secular negativa vs. sincronia interanual positiva)",
        "COHERENT_MULTISCALE_COUPLING": "Acoplamento coerente em longo e curto prazo",
        "LOCAL_PHYSICAL_COUPLING": "Acoplamento físico local entre variáveis na mesma região",
    },
    "en": {
        "OPPOSING_SECULAR_AND_COUPLED_DIPOLE": "Spatial divergence dipole and inverse coupling",
        "MULTISCALE_PARADOX_POS_GLOBAL_NEG_LOCAL": "Multiscale Paradox (positive secular correlation vs. negative short-term opposition)",
        "MULTISCALE_PARADOX_NEG_GLOBAL_POS_LOCAL": "Multiscale Paradox (negative secular opposition vs. positive short-term synchrony)",
        "COHERENT_MULTISCALE_COUPLING": "Coherent long- and short-term coupling",
        "LOCAL_PHYSICAL_COUPLING": "Local physical coupling across variables in the same region",
    },
}

_SUGGESTED_QUESTIONS: Dict[str, List[str]] = {
    "pt": [
        "A tendência muda se separarmos por estação (DJF, MAM, JJA, SON)?",
        "Essa tendência sobrevive se removermos os outliers (D_M > 2,5)?",
        "Há defasagem física (lag em meses) entre A e B corrigida por AR(1)?",
        "Por que usar Theil–Sen e OLS em vez de ponto final menos inicial?",
        "Por que não usamos variação percentual (%) em temperatura (°C)?",
    ],
    "en": [
        "Does the trend shift across seasons (DJF, MAM, JJA, SON)?",
        "Does the trend survive if we exclude Mahalanobis outliers (D_M > 2.5)?",
        "Is there a lagged correlation (months) between A and B under AR(1)?",
        "Why use Theil-Sen and OLS instead of endpoint minus start?",
        "Why are percentages (%) forbidden for temperature (°C)?",
    ],
}

_PERCENT_PATTERN = re.compile(r"([+-]?\s*\d+(?:[.,]\d+)?)\s*%")
_CI_GUARD_PATTERN = re.compile(
    r"(?:IC\s*95\s*%|95\s*%\s*(?:CI|confidence|de\s+confiança))",
    re.IGNORECASE,
)
_ENDPOINT_VIOLATION_PATTERN = re.compile(
    r"(?:valor\s+final\s+menos\s+inicial|endpoint\s+minus\s+start)",
    re.IGNORECASE,
)


def _normalize_language(language: Optional[str]) -> str:
    if language and str(language).strip().lower().startswith("en"):
        return "en"
    return "pt"


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
    """Resume séries longas em estatísticas descritivas enxutas sem vazar vetores para a LLM."""
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
    """Extrai resumo enxuto (sem vetores longos de séries) de um bloco `VariableStatistics`."""
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
    language: str = "pt",
) -> str:
    """Serializa o payload estatístico completo em contexto enxuto (< 6 KB) para o LLM."""
    lang = _normalize_language(language)
    reg_a = analysis.get("region_a_analysis")
    if not isinstance(reg_a, dict):
        raise ValueError("Payload 'analysis' precisa conter 'region_a_analysis' válido.")

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
    if lang == "en":
        default_q = (
            "Provide the full scientific synthesis covering the 4 Detective Answers, "
            "multiscale coupling (if Region B exists), and Mahalanobis extremes."
        )
        return (
            f"### STATISTICAL ANALYSIS JSON\n```json\n{serialized}\n```\n\n"
            f"### SCIENTIST QUESTION\n{user_q or default_q}"
        )

    default_q = (
        "Gere a síntese científica completa cobrindo as 4 Respostas do Detetive, "
        "o acoplamento multiescala (se houver Região B) e os extremos de Mahalanobis."
    )
    return (
        f"### JSON DA ANÁLISE ESTATÍSTICA\n```json\n{serialized}\n```\n\n"
        f"### PERGUNTA DO CIENTISTA\n{user_q or default_q}"
    )


def _find_interval_regions(analysis: Dict[str, Any]) -> List[Dict[str, Any]]:
    regions: List[Dict[str, Any]] = []
    for key in ("region_a_analysis", "region_b_analysis"):
        block = analysis.get(key)
        if isinstance(block, dict) and block.get("scale_type") == "interval":
            regions.append(block)
    return regions


def sanitize_interval_scale_percentages(
    text: str,
    analysis: Dict[str, Any],
    language: str = "pt",
) -> Tuple[str, List[str]]:
    """
    Guarda-corpo do Invariante #3: impede citações de variação em `%` associadas a
    variáveis em escala intervalar (`°C`, `kPa`, etc.), preservando menções a `IC 95%` / `95% CI`.
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
    unit_hint = preferred_units[0] if preferred_units else ("°C/decade" if lang == "en" else "°C/década")
    all_interval = not isinstance(analysis.get("region_b_analysis"), dict) or len(interval_regions) == 2

    warnings: List[str] = []
    sanitized_lines: List[str] = []
    replacement_note = (
        f"[% removed by Invariant #3 — use {unit_hint}]"
        if lang == "en"
        else f"[% removida pelo Invariante #3 — use {unit_hint}]"
    )

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
    if lang == "en":
        return [
            "Invariant #1: Full-cloud OLS & Theil–Sen rates (never endpoint minus start)",
            "Invariant #2: Deseasonalized monthly climatological anomalies",
            "Invariant #3: Strict physical units on interval scales (no %)",
            "Invariant #7: AR(1) effective N & Benjamini–Hochberg FDR q < 0.05",
        ]
    return [
        "Invariante #1: Taxas OLS e Theil–Sen na nuvem completa (jamais fim menos início)",
        "Invariante #2: Anomalias climatológicas mensais dessazonalizadas",
        "Invariante #3: Unidade física estrita em escalas intervalares (proibido %)",
        "Invariante #7: N efetivo AR(1) e controle FDR Benjamini–Hochberg (q < 0,05)",
    ]


def _format_region_diagnostic(
    slot: str,
    region: Dict[str, Any],
    region_id: Optional[str],
    lang: str,
) -> Tuple[List[str], Dict[str, str]]:
    """Formata diagnóstico padronizado de uma região e extrai seus resumos para as 4 respostas."""
    reg = region.get("regression") or {}
    period = region.get("period") or {}
    corr = region.get("correlation_and_coupling") or {}
    sig = region.get("significance") or {}
    outliers = region.get("outliers_mahalanobis") or []

    var_id = str(region.get("variable_id") or "VAR")
    var_name = str(region.get("variable_name") or var_id)
    unit = str(region.get("unit") or "")
    trend_unit = str(region.get("trend_unit") or f"{unit}/década")
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
    loc_label = region_id or (f"Region {slot}" if lang == "en" else f"Região {slot}")

    if lang == "en":
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

    sig_word_pt = (
        "Estatisticamente significativa (FDR q < 0,05)"
        if is_sig
        else "Não significativa / compatível com ruído natural (FDR q >= 0,05)"
    )
    scale_note_pt = (
        "escala intervalar — apenas unidade física, sem %"
        if scale_type == "interval"
        else f"unidade: {unit}"
    )
    lines = [
        f"#### Região {slot} — {var_name} (`{var_id}` | `{loc_label}`)",
        f"- **1. O QUE muda & Regime (GAM/B2):** Anomalias climatológicas mensais ({period.get('start')} a {period.get('end')}, {scale_note_pt}); trajetória em **{regime_label}** (`B2 = {b2_s}`).",
        f"- **3. QUANTO muda (Nuvem Completa):** Theil–Sen **{sen_s} {trend_unit}** (intervalo `{ci_part}`), OLS **{ols_s} {trend_unit}**, variação acumulada no modelo **{cum_s} {unit}**.",
        f"- **4. É SIGNIFICATIVO? & Acoplamento:** **{sig_word_pt}** (`tier: {tier}`, `p_AR1 = {p_ar1}`, `q_FDR = {q_fdr}`, `n_eff = {n_eff}` de `{n_obs}` meses). Acoplamento da elipse: `r = {r_val}`, `tau = {tau_val}`, `R² = {r2_val}`.",
    ]
    if top_outlier:
        lines.append(
            f"- **Extremos de Mahalanobis (`D_M > 2,5`):** {len(outliers)} evento(s) detectado(s); pico em `{top_outlier.get('date')}` (`D_M = {_fmt_num(top_outlier.get('mahalanobis_d'), 2)}`, `{top_outlier.get('direction')}` — {top_outlier.get('diagnostic_hint')})."
        )
    else:
        lines.append("- **Extremos de Mahalanobis (`D_M > 2,5`):** Nenhum outlier extremo fora da elipse bivariada.")

    summary = {
        "what": f"{var_name} ({var_id}) em anomalias mensais — {regime_label}.",
        "where": loc_label,
        "how_much": f"Theil–Sen {sen_s} {trend_unit} (OLS {ols_s} {trend_unit}; Δ modelo {cum_s} {unit}).",
        "is_significant": f"{sig_word_pt} (p_AR1={p_ar1}, q_FDR={q_fdr}, n_eff={n_eff}/{n_obs}, r={r_val}).",
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

    if lang == "en":
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

    math_ev_pt = (
        f"Theil–Sen {sen_a} {tu_a} (B2={b2_a}, regime `{re_a.get('regime_shape')}`); "
        f"AR(1) n_eff={n_eff}/{n_obs}, p_AR1={p_ar1}, q_FDR={q_fdr}; acoplamento r={r_a}, R²={r2_a}."
    )
    phys_pt = summary_a["what"]
    if isinstance(comp, dict):
        mc = comp.get("multiscale_correlation") or {}
        phys_pt += (
            f" Diagnóstico A×B `{mc.get('paradox_type')}` "
            f"(r_global={_fmt_num(mc.get('long_term_secular_r'), 3)} vs. "
            f"r_detrended={_fmt_num(mc.get('short_term_detrended_r'), 3)})."
        )
    risk_parts_pt: List[str] = []
    if not bool(reg_a.get("allow_percentage_change", False)) or (
        isinstance(reg_b, dict) and not bool(reg_b.get("allow_percentage_change", False))
    ):
        risk_parts_pt.append("Escalas intervalares/limitadas proíbem variação percentual relativa (Invariante #3).")
    if outliers_count > 0:
        risk_parts_pt.append(
            f"{outliers_count} extremo(s) de Mahalanobis (D_M > 2,5) podem deslocar o OLS em relação ao Theil–Sen."
        )
    risk_parts_pt.append("Associação estatística não implica causalidade dinâmica isolada sem atribuição física.")
    return {
        "mathematical_evidence": math_ev_pt,
        "physical_meaning": phys_pt,
        "false_conclusion_risk": " ".join(risk_parts_pt),
    }


def _detect_requested_slot(q_lower: str, analysis: Mapping[str, Any]) -> str:
    if isinstance(analysis.get("region_b_analysis"), dict) and any(
        tok in q_lower for tok in ("região b", "regiao b", "region b", "variável b", "variavel b", "slot b")
    ):
        return "B"
    return "A"


def _maybe_run_heuristic_tool(
    question: str,
    analysis: Mapping[str, Any],
    lang: str,
    cache: Optional[CellCacheStore],
) -> Optional[Tuple[str, List[Dict[str, Any]]]]:
    """Aciona ferramentas reais Python mesmo sem LLM quando a pergunta pede teste específico."""
    q = question.strip()
    q_lower = q.lower()
    slot = _detect_requested_slot(q_lower, analysis)
    tools_used: List[Dict[str, Any]] = []

    # 1) Busca de nova variável do catálogo mencionada na pergunta
    if any(tok in q_lower for tok in ("buscar", "puxar", "fetch", "adicionar variável", "outra variável", "compare com", "comparar com")):
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
                    if lang == "en"
                    else f"Busquei `{candidate}` ({res['variable_name']}) via `{res['connector_id']}`: "
                    f"Theil–Sen `{_fmt_signed(reg['slope_per_decade_sen'], 4)} {res['trend_unit']}`, "
                    f"`p_AR1 = {_fmt_num(sig['p_value_ar1_corrected'], 4)}` (`{sig['confidence_tier']}`)."
                )
                return msg, tools_used

    # 2) Decomposição sazonal DJF/MAM/JJA/SON
    if any(tok in q_lower for tok in ("estação", "estacao", "sazonal", "season", "trimestr", "djf", "mam", "jja", "son", "estação seca")):
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
            if lang == "en":
                text = (
                    f"Seasonal stratification for Region {slot} (`{res['variable_id']}`): "
                    + "; ".join(parts)
                    + f". Dominant season: **{dom}**"
                    + (" (seasonal sign reversal detected)." if rev else ".")
                )
            else:
                text = (
                    f"Estratificação sazonal da Região {slot} (`{res['variable_id']}`): "
                    + "; ".join(parts)
                    + f". Estação dominante: **{dom}**"
                    + (" (há inversão de sinal entre estações)." if rev else ".")
                )
            return text, tools_used

    # 3) Correlação cruzada com defasagem (lags) e AR(1)
    if isinstance(analysis.get("region_b_analysis"), dict) and any(
        tok in q_lower for tok in ("lag", "defasag", "preced", "lead", "atraso", "teleconex", "meses antes", "meses depois")
    ):
        res, meta = execute_copilot_tool(
            "compute_lagged_crosscorrelation_ar1", {"max_lag": 6}, analysis, language=lang
        )
        if meta["status"] == "ok":
            tools_used.append(meta)
            b_raw = res["best_raw_lag"]
            b_det = res["best_detrended_lag"]
            if lang == "en":
                text = (
                    f"Lagged AR(1) cross-correlation (`±6` months): peak on raw anomalies at lag `{b_raw['lag_months']:+d}m` "
                    f"(`r = {b_raw['r_raw_anomalies']:+.3f}`, `p_AR1 = {b_raw['p_raw_ar1']:.4f}`); "
                    f"after linear detrending, peak at lag `{b_det['lag_months']:+d}m` (`r_det = {b_det['r_detrended']:+.3f}`, "
                    f"`p_AR1 = {b_det['p_detrended_ar1']:.4f}`). {res['precedence_interpretation']}."
                )
            else:
                text = (
                    f"Correlação cruzada com defasagem e correção AR(1) (`±6` meses): pico nas anomalias em lag `{b_raw['lag_months']:+d}m` "
                    f"(`r = {b_raw['r_raw_anomalies']:+.3f}`, `p_AR1 = {b_raw['p_raw_ar1']:.4f}`); "
                    f"após remover tendência linear, pico em lag `{b_det['lag_months']:+d}m` (`r_det = {b_det['r_detrended']:+.3f}`, "
                    f"`p_AR1 = {b_det['p_detrended_ar1']:.4f}`). {res['precedence_interpretation']}."
                )
            return text, tools_used

    # 4) Teste de robustez removendo outliers (D_M > 2.5)
    if any(
        phrase in q_lower
        for phrase in ("sem outlier", "sem extremo", "remover outlier", "excluir outlier", "sem el nino", "sem el niño", "sobrevive", "robustez", "without outlier", "exclude outlier")
    ):
        res, meta = execute_copilot_tool(
            "run_sensitivity_without_outliers", {"slot": slot}, analysis, language=lang
        )
        if meta["status"] == "ok":
            tools_used.append(meta)
            base = res["baseline"]
            filt = res["filtered"]
            tu = filt.get("trend_unit") or ""
            if lang == "en":
                text = (
                    f"Sensitivity test excluding `{res['excluded_count']}` Mahalanobis extreme(s) (`D_M > 2.5`) on Region {slot}: "
                    f"Theil–Sen moves from `{base['slope_per_decade_sen']:+.4f}` to `{filt['slope_per_decade_sen']:+.4f} {tu}` "
                    f"(`p_AR1 = {filt['p_value_ar1_corrected']:.4f}`), OLS from `{base['slope_per_decade_ols']:+.4f}` to `{filt['slope_per_decade_ols']:+.4f} {tu}`. "
                    f"Direction preserved: **{res['same_direction_after_removal']}**."
                )
            else:
                text = (
                    f"Teste de sensibilidade removendo `{res['excluded_count']}` extremo(s) (`D_M > 2,5`) na Região {slot}: "
                    f"Theil–Sen varia de `{base['slope_per_decade_sen']:+.4f}` para `{filt['slope_per_decade_sen']:+.4f} {tu}` "
                    f"(`p_AR1 = {filt['p_value_ar1_corrected']:.4f}`), e OLS de `{base['slope_per_decade_ols']:+.4f}` para `{filt['slope_per_decade_ols']:+.4f} {tu}`. "
                    f"Mesma direção mantida: **{'Sim' if res['same_direction_after_removal'] else 'Não'}**."
                )
            return text, tools_used

    # 5) Subperíodo ou quebra de regime pré/pós ano-pivô
    year_match = re.search(r"\b(19\d{2}|20\d{2})\b", q_lower)
    if any(tok in q_lower for tok in ("subperíodo", "subperiodo", "quebra", "regime", "antes e depois", "split", "pivô", "pivo", "changepoint")) or (
        year_match and any(tok in q_lower for tok in ("após", "apos", "antes", "depois", "after", "before", "desde"))
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
            if lang == "en":
                text = (
                    f"Regime split at `{res['split_date']}` for Region {slot}: "
                    f"Before (`{bef['start']}..{bef['end']}`): Sen `{bef['slope_per_decade_sen']:+.4f} {tu}` (`p_AR1={bef['p_value_ar1_corrected']:.4f}`); "
                    f"After (`{aft['start']}..{aft['end']}`): Sen `{aft['slope_per_decade_sen']:+.4f} {tu}` (`p_AR1={aft['p_value_ar1_corrected']:.4f}`). "
                    f"Shift: `{res['slope_sen_shift_after_minus_before']:+.4f} {tu}`."
                )
            else:
                text = (
                    f"Quebra de regime em `{res['split_date']}` para Região {slot}: "
                    f"Antes (`{bef['start']}..{bef['end']}`): Sen `{bef['slope_per_decade_sen']:+.4f} {tu}` (`p_AR1={bef['p_value_ar1_corrected']:.4f}`); "
                    f"Depois (`{aft['start']}..{aft['end']}`): Sen `{aft['slope_per_decade_sen']:+.4f} {tu}` (`p_AR1={aft['p_value_ar1_corrected']:.4f}`). "
                    f"Deslocamento: `{res['slope_sen_shift_after_minus_before']:+.4f} {tu}`."
                )
            return text, tools_used

    # 6) Quantis P10/P50/P90 e caudas
    if any(tok in q_lower for tok in ("quantil", "quantile", "p10", "p50", "p90", "cauda", "tail", "mediana", "iqr", "distribui")):
        res, meta = execute_copilot_tool(
            "inspect_quantiles_and_extremes", {"slot": slot}, analysis, language=lang
        )
        if meta["status"] == "ok":
            tools_used.append(meta)
            d = res["physical_tail_shifts_second_minus_first"]
            u = res.get("unit") or ""
            if lang == "en":
                text = (
                    f"Tail & quantile anatomy for Region {slot} ({res['first_half_period']} vs. {res['second_half_period']}): "
                    f"ΔP10 = `{d['delta_p10']:+.3f} {u}`, ΔP50 (median) = `{d['delta_p50_median']:+.3f} {u}`, ΔP90 = `{d['delta_p90']:+.3f} {u}`."
                )
            else:
                text = (
                    f"Anatomia de quantis e caudas da Região {slot} ({res['first_half_period']} vs. {res['second_half_period']}): "
                    f"ΔP10 = `{d['delta_p10']:+.3f} {u}`, ΔP50 (mediana) = `{d['delta_p50_median']:+.3f} {u}`, ΔP90 = `{d['delta_p90']:+.3f} {u}`."
                )
            return text, tools_used

    return None


def _answer_specific_question(
    question: str,
    analysis: Dict[str, Any],
    lang: str,
    cache: Optional[CellCacheStore] = None,
) -> Tuple[Optional[str], List[Dict[str, Any]]]:
    """Gera resposta direcionada à pergunta do usuário com tools reais e os 7 Invariantes."""
    q = question.strip().lower()
    if not q:
        return None, []

    tool_hit = _maybe_run_heuristic_tool(question, analysis, lang, cache)
    if tool_hit is not None:
        return tool_hit

    reg_a = analysis.get("region_a_analysis") or {}
    reg_b = analysis.get("region_b_analysis")
    comp = analysis.get("comparison_pair")

    if any(tok in q for tok in ("ponto final", "inicial", "endpoint", "theil", "ols", "sen", "reta")):
        sen_a = _fmt_signed((reg_a.get("regression") or {}).get("slope_per_decade_sen"), 4)
        ols_a = _fmt_signed((reg_a.get("regression") or {}).get("slope_per_decade_ols"), 4)
        tu = reg_a.get("trend_unit", "")
        if lang == "en":
            return (
                f"Subtracting only `Y_end - Y_start` ignores the intermediate trajectory and confuses "
                f"El Nino/seasonal spikes with secular change. Here we fit the entire cloud after removing "
                f"monthly climatology: **Theil–Sen (`{sen_a} {tu}`)** takes the median pairwise slope (immune to spikes), "
                f"while **OLS (`{ols_a} {tu}`)** fits the least-squares mean rate.",
                [],
            )
        return (
            f"Subtrair apenas `Y_fim - Y_início` joga fora toda a trajetória intermediária e confunde "
            f"picos de El Niño com tendência secular. Aqui ajustamos toda a nuvem após remover a sazonalidade: "
            f"o **Theil–Sen (`{sen_a} {tu}`)** usa a inclinação mediana entre todos os pares (imune a extremos), "
            f"enquanto o **OLS (`{ols_a} {tu}`)** estima a taxa média por mínimos quadrados.",
            [],
        )

    if any(tok in q for tok in ("mahalanobis", "outlier", "extremo", "pico", "elipse", "extreme", "spike")):
        outliers_a = reg_a.get("outliers_mahalanobis") or []
        outliers_b = (reg_b.get("outliers_mahalanobis") or []) if isinstance(reg_b, dict) else []
        total = len(outliers_a) + len(outliers_b)
        if lang == "en":
            return (
                f"Mahalanobis distance (`D_M > 2.5`) measures how many robust covariance deviations a month "
                f"lies outside the `(time, anomaly)` contour ellipse, without deleting extreme climate events. "
                f"This analysis flagged **{total} extreme event(s)** across the selected regions.",
                [],
            )
        return (
            f"A Distância de Mahalanobis (`D_M > 2,5`) mede quantos desvios multivariados um mês foge da "
            f"elipse de contorno `(tempo, anomalia)`, preservando eventos extremos sem apagá-los. "
            f"Nesta análise foram sinalizados **{total} evento(s) extremo(s)** fora da elipse.",
            [],
        )

    if any(tok in q for tok in ("ruído", "ruido", "noise", "el niño", "el nino", "enso", "signific", "ar1", "ar(1)", "fdr")):
        sig_a = reg_a.get("significance") or {}
        per_a = reg_a.get("period") or {}
        if lang == "en":
            return (
                f"Climate series have temporal memory (autocorrelation), which inflates naive p-values. "
                f"We adjust the sample size to `n_eff = {_fmt_num(per_a.get('n_effective_ar1'), 1)}` (out of "
                f"`{per_a.get('n_observations')}` months) via AR(1) and apply Benjamini–Hochberg FDR "
                f"(`q = {_fmt_num(sig_a.get('fdr_q_value'), 4)}`, `p_AR1 = {_fmt_num(sig_a.get('p_value_ar1_corrected'), 4)}`) "
                f"to separate real secular trends from natural ENSO oscillations.",
                [],
            )
        return (
            f"Séries climáticas têm memória temporal (autocorrelação), o que gera falsos positivos no teste ingênuo. "
            f"Corrigimos o tamanho efetivo da amostra para `n_eff = {_fmt_num(per_a.get('n_effective_ar1'), 1)}` (de "
            f"`{per_a.get('n_observations')}` meses) via **AR(1)** e aplicamos **FDR de Benjamini–Hochberg** "
            f"(`q = {_fmt_num(sig_a.get('fdr_q_value'), 4)}`, `p_AR1 = {_fmt_num(sig_a.get('p_value_ar1_corrected'), 4)}`) "
            f"para distinguir tendência secular real de oscilações naturais como El Niño.",
            [],
        )

    if any(tok in q for tok in ("porcent", "%", "percent", "escala", "scale", "interval", "celsius", "°c")):
        if lang == "en":
            return (
                "Interval scales such as Celsius (`°C`) or anomalies have no true physical zero, so dividing "
                "changes to compute `%` produces mathematically meaningless numbers (Invariant #3). "
                "Therefore, trends are strictly reported in physical units per decade (e.g., `°C/decade`).",
                [],
            )
        return (
            "Escalas intervalares como Celsius (`°C`), Pressão (`kPa`) ou anomalias não possuem zero absoluto "
            "físico; calcular variação em `%` sobre elas é matematicamente inválido (Invariante #3). "
            "Por isso, exibimos apenas variação absoluta na unidade física por década (ex.: `°C/década`).",
            [],
        )

    if any(tok in q for tok in ("gam", "spline", "acelera", "regime", "curva", "nonlinear", "não-linear")):
        re_a = reg_a.get("regression") or {}
        if lang == "en":
            return (
                f"The GAM/smoothing curve captures physical acceleration or saturation without wild endpoint "
                f"oscillations from high-degree polynomials. Region A exhibits `{re_a.get('regime_shape')}` "
                f"with quadratic acceleration `B2 = {_fmt_signed(re_a.get('quadratic_acceleration_B2'), 5)}`.",
                [],
            )
        return (
            f"A curva suave **GAM / Spline** captura aceleração física ou saturação sem as inversões artificiais "
            f"de polinômios de grau alto nas pontas. A Região A apresenta regime `{re_a.get('regime_shape')}` "
            f"com termo de aceleração `B2 = {_fmt_signed(re_a.get('quadratic_acceleration_B2'), 5)}`.",
            [],
        )

    if isinstance(comp, dict) and any(tok in q for tok in ("paradox", "multiescala", "multiscale", "compar", "região b", "region b", "diverg")):
        mc = comp.get("multiscale_correlation") or {}
        if lang == "en":
            return (
                f"Multiscale decomposition separates decadal co-movement (`r_global = {_fmt_num(mc.get('long_term_secular_r'), 3)}`) "
                f"from detrended short-term fluctuations (`r_detrended = {_fmt_num(mc.get('short_term_detrended_r'), 3)}`). "
                f"Diagnostic: `{mc.get('paradox_type')}` — {mc.get('interpretation')}",
                [],
            )
        return (
            f"A decomposição multiescala separa a correlação secular de longo prazo (`r_global = {_fmt_num(mc.get('long_term_secular_r'), 3)}`) "
            f"da oscilação de curto prazo sem tendência (`r_detrended = {_fmt_num(mc.get('short_term_detrended_r'), 3)}`). "
            f"Diagnóstico: `{mc.get('paradox_type')}` — {mc.get('interpretation')}",
            [],
        )

    sig_a = reg_a.get("significance") or {}
    re_a = reg_a.get("regression") or {}
    if lang == "en":
        return (
            f"Based on the current NASA dataset for `{reg_a.get('variable_id')}`, the robust Theil–Sen slope is "
            f"`{_fmt_signed(re_a.get('slope_per_decade_sen'), 4)} {reg_a.get('trend_unit')}` "
            f"(regime `{re_a.get('regime_shape')}`, `q_FDR = {_fmt_num(sig_a.get('fdr_q_value'), 4)}`). "
            f"All conclusions adhere to deseasonalized anomalies and AR(1)-corrected inference.",
            [],
        )
    return (
        f"Com base nos dados atuais para `{reg_a.get('variable_id')}`, a inclinação robusta de Theil–Sen é "
        f"`{_fmt_signed(re_a.get('slope_per_decade_sen'), 4)} {reg_a.get('trend_unit')}` "
        f"(regime `{re_a.get('regime_shape')}`, `q_FDR = {_fmt_num(sig_a.get('fdr_q_value'), 4)}`), "
        f"calculada integralmente sobre anomalias mensais dessazonalizadas e significância corrigida por AR(1).",
        [],
    )


def generate_heuristic_synthesis(
    analysis: Dict[str, Any],
    question: Optional[str] = None,
    language: str = "pt",
    cache: Optional[CellCacheStore] = None,
) -> Dict[str, Any]:
    """
    Gera diagnóstico científico completo e determinístico (< 15 ms, com acionamento de tools
    para subperíodos, outliers, sazonalidade, lags e quantis quando perguntado).
    """
    lang = _normalize_language(language)
    reg_a = analysis.get("region_a_analysis")
    if not isinstance(reg_a, dict):
        raise ValueError("Payload 'analysis' precisa conter 'region_a_analysis'.")

    meta = analysis.get("request_meta") or {}
    reg_b = analysis.get("region_b_analysis")
    comp = analysis.get("comparison_pair")

    lines_a, summary_a = _format_region_diagnostic("A", reg_a, meta.get("region_a_id"), lang)

    if lang == "en":
        sections = ["### Scientific Diagnosis — Statistical Co-Pilot", *lines_a]
    else:
        sections = ["### Diagnóstico Científico — Co-Piloto Estatístico", *lines_a]

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
        if lang == "en":
            sections.extend([
                "",
                "#### 2. WHERE & Multiscale Comparison (`A × B`)",
                f"- **Spatial Divergence:** {'Detected' if div_flag else 'Not detected'} (`{where_summary}`).",
                f"- **Multiscale Correlation:** Long-term secular `r = {r_glob}` | Short-term detrended `r = {r_det}`.",
                f"- **Diagnostic (`{paradox_code}`):** {paradox_desc}. {interp}",
            ])
        else:
            sections.extend([
                "",
                "#### 2. ONDE & Comparação Multiescala (`A × B`)",
                f"- **Divergência Espacial:** {'Detectada' if div_flag else 'Não detectada'} (`{where_summary}`).",
                f"- **Correlação Multiescala:** Longo prazo secular `r = {r_glob}` | Curto prazo sem tendência `r = {r_det}`.",
                f"- **Diagnóstico (`{paradox_code}`):** {paradox_desc}. {interp}",
            ])
        where_summary = f"{where_summary} ({'divergência espacial' if lang == 'pt' else 'spatial divergence'}: {div_flag})"
    else:
        if lang == "en":
            sections.insert(2, f"- **2. WHERE:** `{summary_a['where']}` (single-region mode).")
        else:
            sections.insert(2, f"- **2. ONDE:** `{summary_a['where']}` (análise de região única).")

    direct_answer: Optional[str] = None
    tools_used: List[Dict[str, Any]] = []
    if question and question.strip():
        direct_answer, tools_used = _answer_specific_question(question, analysis, lang, cache=cache)
        if direct_answer:
            header = "#### Direct Answer" if lang == "en" else "#### Resposta à Pergunta"
            sections.extend(["", header, direct_answer])

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


def _parse_structured_llm_output(raw_text: str) -> Optional[Dict[str, Any]]:
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        parsed = json.loads(cleaned)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if match:
            try:
                parsed = json.loads(match.group(0))
                return parsed if isinstance(parsed, dict) else None
            except json.JSONDecodeError:
                return None
    return None


def _call_gemini_copilot(
    system_prompt: str,
    user_prompt: str,
    api_key: str,
    analysis: Mapping[str, Any],
    *,
    history: Optional[List[Dict[str, str]]] = None,
    timeout_seconds: Optional[float] = None,
    cache: Optional[CellCacheStore] = None,
    language: str = "pt",
    http_post_fn: Optional[Callable[[str, Dict[str, Any], float], Dict[str, Any]]] = None,
) -> Tuple[str, List[Dict[str, Any]]]:
    """Consulta agentic à API REST do Gemini com loop de Function Calling (até 3 rodadas)."""
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
                "maxOutputTokens": 1200,
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

        text = "".join(str(p.get("text") or "") for p in parts if isinstance(p, dict)).strip()
        if not text:
            raise ValueError("Resposta vazia da API Gemini.")
        return text, tools_used

    raise ValueError("Limite de rodadas de Function Calling excedido na API Gemini.")


def _apply_invariant_guardrails(
    response: Dict[str, Any],
    analysis: Dict[str, Any],
    lang: str,
) -> Dict[str, Any]:
    """Sanitiza todos os campos textuais contra violações do Invariante #3 e registra auditoria."""
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

    # Deduplica preservando ordem
    out["invariant_warnings"] = list(dict.fromkeys(warnings))
    return out


def generate_copilot_response(
    analysis: Dict[str, Any],
    question: Optional[str] = None,
    language: str = "pt",
    history: Optional[List[Dict[str, str]]] = None,
    use_llm: bool = True,
    cache: Optional[CellCacheStore] = None,
    http_post_fn: Optional[Callable[[str, Dict[str, Any], float], Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Ponto de entrada único do Co-Piloto Estatístico:
    1) Usa Gemini LLM + Function Calling se `use_llm=True` e `GEMINI_API_KEY` configurada.
    2) Caso contrário (ou em erro/timeout), retorna síntese determinística instantânea
       (também capaz de acionar as ferramentas Python reais quando pertinente).
    """
    _ensure_env_loaded()
    lang = _normalize_language(language)
    heuristic = generate_heuristic_synthesis(analysis, question=question, language=lang, cache=cache)
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()

    if not use_llm or not api_key:
        return heuristic

    system_prompt = COPILOT_SYSTEM_PROMPT_EN if lang == "en" else COPILOT_SYSTEM_PROMPT_PT
    user_prompt = build_copilot_prompt(analysis, question=question, language=lang)

    try:
        llm_raw, tools_used = _call_gemini_copilot(
            system_prompt,
            user_prompt,
            api_key,
            analysis,
            history=history,
            cache=cache,
            language=lang,
            http_post_fn=http_post_fn,
        )
        structured = _parse_structured_llm_output(llm_raw)
        merged = dict(heuristic)
        merged["mode"] = "llm_gemini"
        merged["model"] = os.environ.get("GEMINI_COPILOT_MODEL", "gemini-2.5-flash")
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
            merged["answer"] = llm_raw
            merged["reply_markdown"] = llm_raw

        return _apply_invariant_guardrails(merged, analysis, lang)
    except (urllib.error.URLError, TimeoutError, ValueError, KeyError, json.JSONDecodeError, OSError):
        return heuristic
