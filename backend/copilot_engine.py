"""
Motor de Interpretação do Chatbot Co-Piloto Estatístico (DADOS-2 — Fase 4).

Implementa:
1. System Prompts oficiais (Português e Inglês) blindados com os 7 Invariantes Estatísticos.
2. Arquitetura híbrida: consulta opcional a LLM rápida (Gemini API com timeout curto) e
   Gerador de Síntese Estatística Heurística Determinística como fallback imediato (< 10 ms).
3. Pós-validação contra violação do Invariante #3 (proibição de `%` em escala intervalar).
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional, Tuple


COPILOT_SYSTEM_PROMPT_PT = """Você é o Co-Piloto Estatístico do "Earth System Trend Detective" (NASA Space Apps Challenge 2026).
Sua missão é interpretar os indicadores estatísticos de séries climáticas da NASA (MERRA-2 e CERES) em linguagem clara, rigorosa e auditável para cientistas, estudantes e jurados da NASA.

REGRAS ESTATÍSTICAS INVIOLÁVEIS (7 INVARIANTES):
1. NUNCA calcule nem mencione variação por ponto final menos ponto inicial (Y_fim - Y_inicio). Use exclusivamente as taxas por década extraídas de toda a nuvem: OLS (slope_per_decade_ols) e Theil-Sen (slope_per_decade_sen, com IC 95%).
2. Enfatize que toda regressão foi aplicada sobre ANOMALIAS CLIMATOLÓGICAS MENSAIS (ciclo sazonal removido — Princípio de Henrietta Leavitt).
3. PROIBIÇÃO ABSOLUTA DE PORCENTAGEM (%) EM ESCALA INTERVALAR: Se `scale_type == "interval"` ou `allow_percentage_change == false` (ex.: Temperatura em °C, Pressão em kPa, Umidade relativa/fração quando bloqueado), JAMAIS expresse mudanças em "%". Use apenas a unidade física original por década (ex.: +0.559 °C/década).
4. SEPARE INCLINAÇÃO DE ACOPLAMENTO: Explique tanto a velocidade física da mudança (B_OLS e B_Sen) quanto o estreitamento da nuvem/previsibilidade (pearson_r, kendall_tau e r_squared).
5. DECOMPOSIÇÃO MULTIESCALA: Se houver `comparison_pair`, compare explicitamente a correlação secular de longo prazo (`long_term_secular_r`) com a correlação de curto prazo sem tendência (`short_term_detrended_r`), explicando paradoxos ou dipolos regionais.
6. CURVATURA FÍSICA (GAM): Cite o `regime_shape` e `quadratic_acceleration_B2` para indicar se a trajetória está linear, acelerando ou desacelerando/saturando.
7. RIGOR DE SIGNIFICÂNCIA & EXTREMOS: Baseie a significância em `p_value_ar1_corrected`, `fdr_q_value` (< 0.05) e `n_effective_ar1` (nunca apenas p ingênuo). Cite os eventos extremos `outliers_mahalanobis` (D_M > 2.5) e evite afirmar causalidade não provada.

FORMATO DE RESPOSTA:
Responda sempre em Markdown conciso estruturando:
- **1. O QUE está mudando?** (variável, anomalia climatológica e regime GAM/B2)
- **2. ONDE está mudando?** (identificador da região/grade e divergência espacial A vs B, se houver)
- **3. QUANTO está mudando?** (Theil-Sen, OLS, IC 95% e variação acumulada do modelo)
- **4. É SIGNIFICATIVO?** (AR(1) n_eff, p_AR1, q_FDR, r/tau/R² e extremos de Mahalanobis)
- **Resposta direta à pergunta do usuário** (quando houver pergunta)."""


COPILOT_SYSTEM_PROMPT_EN = """You are the Statistical Co-Pilot of "Earth System Trend Detective" (NASA Space Apps Challenge 2026).
Your role is to translate NASA Earth-system statistical outputs (MERRA-2 and CERES) into clear, scientifically rigorous, auditable Markdown explanations for researchers, citizens, and NASA judges.

INVIOLABLE STATISTICAL RULES (7 INVARIANTS):
1. NEVER compute or cite endpoint-minus-start changes (Y_end - Y_start). Report decadal rates fitted across the full cloud: OLS (`slope_per_decade_ols`) and robust Theil-Sen (`slope_per_decade_sen` with 95% CI).
2. Clarify that regressions are evaluated on MONTHLY CLIMATOLOGICAL ANOMALIES (seasonal cycle removed — Henrietta Leavitt Principle).
3. STRICTLY FORBIDDEN TO USE PERCENTAGES (%) FOR INTERVAL SCALES: Whenever `scale_type == "interval"` or `allow_percentage_change == false` (e.g., Temperature in °C, Pressure in kPa), NEVER express changes as percentages. Use physical units per decade only.
4. DISTINGUISH SLOPE FROM COUPLING: Report both the physical rate of change (B_OLS, B_Sen) and scatter tightness / predictability (`pearson_r`, `kendall_tau`, `r_squared`).
5. MULTISCALE DECOMPOSITION: When `comparison_pair` is present, contrast long-term secular correlation (`long_term_secular_r`) against short-term detrended correlation (`short_term_detrended_r`), explaining spatial divergence or multiscale paradoxes.
6. NONLINEAR CURVATURE (GAM): Cite `regime_shape` and `quadratic_acceleration_B2` to identify linear trends, acceleration, or physical saturation.
7. SIGNIFICANCE & EXTREMES: Ground significance in AR(1)-corrected `p_value_ar1_corrected`, `n_effective_ar1`, and Benjamini-Hochberg `fdr_q_value` (< 0.05). Highlight Mahalanobis outliers (`D_M > 2.5`) and maintain causal caution.

RESPONSE FORMAT:
Use structured Markdown covering the 4 Detective Answers (1. WHAT is changing, 2. WHERE, 3. HOW MUCH, 4. IS IT SIGNIFICANT?), plus multiscale diagnostics and a direct answer to the user's question if provided."""


_REGIME_LABELS: Dict[str, Dict[str, str]] = {
    "pt": {
        "accelerating_rise": "elevação acelerada (não-linear, B2 > 0)",
        "accelerating_increase": "elevação acelerada (não-linear, B2 > 0)",
        "accelerating_decline": "queda acelerada (não-linear, B2 < 0)",
        "decelerating_or_shifting": "desaceleração, saturação ou inflexão de regime",
        "linear_trend": "tendência linear persistente",
        "stable": "regime estacionário sem aceleração expressiva",
    },
    "en": {
        "accelerating_rise": "accelerating increase (nonlinear, B2 > 0)",
        "accelerating_increase": "accelerating increase (nonlinear, B2 > 0)",
        "accelerating_decline": "accelerating decline (nonlinear, B2 < 0)",
        "decelerating_or_shifting": "deceleration, saturation, or regime shift",
        "linear_trend": "persistent linear trend",
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
        "Por que usar Theil–Sen e OLS em vez de ponto final menos inicial?",
        "O que indicam os eventos extremos de Mahalanobis nesta série?",
        "Essa tendência é mudança estrutural real ou ruído de El Niño?",
        "Por que não usamos variação percentual (%) em temperatura (°C)?",
    ],
    "en": [
        "Why use Theil-Sen and OLS instead of endpoint minus start?",
        "What do the Mahalanobis extreme events tell us in this series?",
        "Is this trend statistically real or natural El Nino noise?",
        "Why are percentages (%) forbidden for temperature (°C)?",
    ],
}

_PERCENT_PATTERN = re.compile(r"([+-]?\s*\d+(?:[.,]\d+)?)\s*%")
_CI_GUARD_PATTERN = re.compile(
    r"(?:IC\s*95\s*%|95\s*%\s*(?:CI|confidence|de\s+confiança))",
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


def _extract_region_summary(region: Dict[str, Any]) -> Dict[str, Any]:
    """Extrai resumo enxuto (sem vetores longos de séries) de um bloco `VariableStatistics`."""
    period = region.get("period") or {}
    reg = region.get("regression") or {}
    corr = region.get("correlation_and_coupling") or {}
    sig = region.get("significance") or {}
    outliers = region.get("outliers_mahalanobis") or []
    return {
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


def build_copilot_prompt(
    analysis: Dict[str, Any],
    question: Optional[str] = None,
    language: str = "pt",
) -> str:
    """Serializa o payload estatístico completo em contexto enxuto para o LLM."""
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

    user_q = (question or "").strip()
    if lang == "en":
        default_q = (
            "Provide the full scientific synthesis covering the 4 Detective Answers, "
            "multiscale coupling (if Region B exists), and Mahalanobis extremes."
        )
        return (
            f"### STATISTICAL ANALYSIS JSON\n```json\n"
            f"{json.dumps(compact_payload, ensure_ascii=False, indent=2)}\n```\n\n"
            f"### USER QUESTION\n{user_q or default_q}"
        )

    default_q = (
        "Gere a síntese científica completa cobrindo as 4 Respostas do Detetive, "
        "o acoplamento multiescala (se houver Região B) e os extremos de Mahalanobis."
    )
    return (
        f"### JSON DA ANÁLISE ESTATÍSTICA\n```json\n"
        f"{json.dumps(compact_payload, ensure_ascii=False, indent=2)}\n```\n\n"
        f"### PERGUNTA DO USUÁRIO\n{user_q or default_q}"
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

    regime_key = str(reg.get("regime_shape") or "linear_trend")
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
    tier = str(sig.get("confidence_tier") or ("CONFIRMED_HIGH" if is_sig else "NOISE"))

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
        sig_word = "Statistically significant (FDR q < 0.05)" if is_sig else "Not significant / indistinguishable from noise (FDR q >= 0.05)"
        scale_note = "interval scale — physical units only, no percentages" if scale_type == "interval" else f"unit: {unit}"
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

    sig_word_pt = "Estatisticamente significativa (FDR q < 0,05)" if is_sig else "Não significativa / compatível com ruído natural (FDR q >= 0,05)"
    scale_note_pt = "escala intervalar — apenas unidade física, sem %" if scale_type == "interval" else f"unidade: {unit}"
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


def _answer_specific_question(
    question: str,
    analysis: Dict[str, Any],
    lang: str,
) -> Optional[str]:
    """Gera resposta direcionada à pergunta do usuário com base nos 7 Invariantes e métricas do JSON."""
    q = question.strip().lower()
    if not q:
        return None

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
                f"while **OLS (`{ols_a} {tu}`)** fits the least-squares mean rate."
            )
        return (
            f"Subtrair apenas `Y_fim - Y_início` joga fora toda a trajetória intermediária e confunde "
            f"picos de El Niño com tendência secular. Aqui ajustamos toda a nuvem após remover a sazonalidade: "
            f"o **Theil–Sen (`{sen_a} {tu}`)** usa a inclinação mediana entre todos os pares (imune a extremos), "
            f"enquanto o **OLS (`{ols_a} {tu}`)** estima a taxa média por mínimos quadrados."
        )

    if any(tok in q for tok in ("mahalanobis", "outlier", "extremo", "pico", "elipse", "extreme", "spike")):
        outliers_a = reg_a.get("outliers_mahalanobis") or []
        outliers_b = (reg_b.get("outliers_mahalanobis") or []) if isinstance(reg_b, dict) else []
        total = len(outliers_a) + len(outliers_b)
        if lang == "en":
            return (
                f"Mahalanobis distance (`D_M > 2.5`) measures how many robust covariance deviations a month "
                f"lies outside the `(time, anomaly)` contour ellipse, without deleting extreme climate events. "
                f"This analysis flagged **{total} extreme event(s)** across the selected regions."
            )
        return (
            f"A Distância de Mahalanobis (`D_M > 2,5`) mede quantos desvios multivariados um mês foge da "
            f"elipse de contorno `(tempo, anomalia)`, preservando eventos extremos sem apagá-los. "
            f"Nesta análise foram sinalizados **{total} evento(s) extremo(s)** fora da elipse."
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
                f"to separate real secular trends from natural ENSO oscillations."
            )
        return (
            f"Séries climáticas têm memória temporal (autocorrelação), o que gera falsos positivos no teste ingênuo. "
            f"Corrigimos o tamanho efetivo da amostra para `n_eff = {_fmt_num(per_a.get('n_effective_ar1'), 1)}` (de "
            f"`{per_a.get('n_observations')}` meses) via **AR(1)** e aplicamos **FDR de Benjamini–Hochberg** "
            f"(`q = {_fmt_num(sig_a.get('fdr_q_value'), 4)}`, `p_AR1 = {_fmt_num(sig_a.get('p_value_ar1_corrected'), 4)}`) "
            f"para distinguir tendência secular real de oscilações naturais como El Niño."
        )

    if any(tok in q for tok in ("porcent", "%", "percent", "escala", "scale", "interval", "celsius", "°c")):
        if lang == "en":
            return (
                "Interval scales such as Celsius (`°C`) or anomalies have no true physical zero, so dividing "
                "changes to compute `%` produces mathematically meaningless numbers (Invariant #3). "
                "Therefore, trends are strictly reported in physical units per decade (e.g., `°C/decade`)."
            )
        return (
            "Escalas intervalares como Celsius (`°C`), Pressão (`kPa`) ou anomalias não possuem zero absoluto "
            "físico; calcular variação em `%` sobre elas é matematicamente inválido (Invariante #3). "
            "Por isso, exibimos apenas variação absoluta na unidade física por década (ex.: `°C/década`)."
        )

    if any(tok in q for tok in ("gam", "spline", "acelera", "regime", "curva", "nonlinear", "não-linear")):
        re_a = reg_a.get("regression") or {}
        if lang == "en":
            return (
                f"The GAM/smoothing curve captures physical acceleration or saturation without wild endpoint "
                f"oscillations from high-degree polynomials. Region A exhibits `{re_a.get('regime_shape')}` "
                f"with quadratic acceleration `B2 = {_fmt_signed(re_a.get('quadratic_acceleration_B2'), 5)}`."
            )
        return (
            f"A curva suave **GAM / Spline** captura aceleração física ou saturação sem as inversões artificiais "
            f"de polinômios de grau alto nas pontas. A Região A apresenta regime `{re_a.get('regime_shape')}` "
            f"com termo de aceleração `B2 = {_fmt_signed(re_a.get('quadratic_acceleration_B2'), 5)}`."
        )

    if isinstance(comp, dict) and any(tok in q for tok in ("paradox", "multiescala", "multiscale", "compar", "região b", "region b", "diverg")):
        mc = comp.get("multiscale_correlation") or {}
        if lang == "en":
            return (
                f"Multiscale decomposition separates decadal co-movement (`r_global = {_fmt_num(mc.get('long_term_secular_r'), 3)}`) "
                f"from detrended short-term fluctuations (`r_detrended = {_fmt_num(mc.get('short_term_detrended_r'), 3)}`). "
                f"Diagnostic: `{mc.get('paradox_type')}` — {mc.get('interpretation')}"
            )
        return (
            f"A decomposição multiescala separa a correlação secular de longo prazo (`r_global = {_fmt_num(mc.get('long_term_secular_r'), 3)}`) "
            f"da oscilação de curto prazo sem tendência (`r_detrended = {_fmt_num(mc.get('short_term_detrended_r'), 3)}`). "
            f"Diagnóstico: `{mc.get('paradox_type')}` — {mc.get('interpretation')}"
        )

    # Resposta contextual genérica baseada nos dados atuais
    sig_a = reg_a.get("significance") or {}
    re_a = reg_a.get("regression") or {}
    if lang == "en":
        return (
            f"Based on the current NASA dataset for `{reg_a.get('variable_id')}`, the robust Theil–Sen slope is "
            f"`{_fmt_signed(re_a.get('slope_per_decade_sen'), 4)} {reg_a.get('trend_unit')}` "
            f"(regime `{re_a.get('regime_shape')}`, `q_FDR = {_fmt_num(sig_a.get('fdr_q_value'), 4)}`). "
            f"All conclusions adhere to deseasonalized anomalies and AR(1)-corrected inference."
        )
    return (
        f"Com base nos dados atuais para `{reg_a.get('variable_id')}`, a inclinação robusta de Theil–Sen é "
        f"`{_fmt_signed(re_a.get('slope_per_decade_sen'), 4)} {reg_a.get('trend_unit')}` "
        f"(regime `{re_a.get('regime_shape')}`, `q_FDR = {_fmt_num(sig_a.get('fdr_q_value'), 4)}`), "
        f"calculada integralmente sobre anomalias mensais dessazonalizadas e significância corrigida por AR(1)."
    )


def generate_heuristic_synthesis(
    analysis: Dict[str, Any],
    question: Optional[str] = None,
    language: str = "pt",
) -> Dict[str, Any]:
    """
    Gera diagnóstico científico completo e determinístico (< 10 ms, zero rede/dependências)
    cobrindo as 4 Respostas do Detetive, Multiescala e resposta direta à pergunta.
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

    if question and question.strip():
        direct_answer = _answer_specific_question(question, analysis, lang)
        if direct_answer:
            header = "#### Direct Answer" if lang == "en" else "#### Resposta à Pergunta"
            sections.extend(["", header, direct_answer])

    reply_raw = "\n".join(sections)
    reply_clean, warnings = sanitize_interval_scale_percentages(reply_raw, analysis, lang)

    return {
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
        "invariant_warnings": warnings,
    }


def _call_gemini_copilot(
    system_prompt: str,
    user_prompt: str,
    api_key: str,
    history: Optional[List[Dict[str, str]]] = None,
    timeout_seconds: float = 4.0,
) -> str:
    """Consulta rápida à API REST do Gemini via stdlib (`urllib.request`)."""
    model_name = os.environ.get("GEMINI_COPILOT_MODEL", "gemini-2.5-flash")
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model_name}:generateContent?key={api_key}"
    )

    contents: List[Dict[str, Any]] = []
    if history:
        for msg in history[-6:]:
            role = "model" if msg.get("role") == "assistant" else "user"
            text = str(msg.get("content") or "").strip()
            if text:
                contents.append({"role": role, "parts": [{"text": text}]})
    contents.append({"role": "user", "parts": [{"text": user_prompt}]})

    payload = {
        "system_instruction": {"parts": [{"text": system_prompt}]},
        "contents": contents,
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 900,
        },
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    candidates = data.get("candidates") or []
    parts = ((candidates[0].get("content") or {}).get("parts") or []) if candidates else []
    text = "".join(str(p.get("text") or "") for p in parts).strip()
    if not text:
        raise ValueError("Resposta vazia da API Gemini.")
    return text


def generate_copilot_response(
    analysis: Dict[str, Any],
    question: Optional[str] = None,
    language: str = "pt",
    history: Optional[List[Dict[str, str]]] = None,
    use_llm: bool = True,
) -> Dict[str, Any]:
    """
    Ponto de entrada único do Co-Piloto Estatístico:
    1) Usa Gemini LLM se `use_llm=True` e `GEMINI_API_KEY` configurada (com guarda do Invariante #3).
    2) Caso contrário (ou em erro/timeout), retorna fallback heurístico determinístico instantâneo.
    """
    lang = _normalize_language(language)
    heuristic = generate_heuristic_synthesis(analysis, question=question, language=lang)
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()

    if not use_llm or not api_key:
        return heuristic

    system_prompt = COPILOT_SYSTEM_PROMPT_EN if lang == "en" else COPILOT_SYSTEM_PROMPT_PT
    user_prompt = build_copilot_prompt(analysis, question=question, language=lang)

    try:
        llm_text = _call_gemini_copilot(system_prompt, user_prompt, api_key, history=history)
        sanitized_text, warnings = sanitize_interval_scale_percentages(llm_text, analysis, lang)
        return {
            **heuristic,
            "reply_markdown": sanitized_text,
            "mode": "llm_gemini",
            "model": os.environ.get("GEMINI_COPILOT_MODEL", "gemini-2.5-flash"),
            "invariant_warnings": warnings,
        }
    except (urllib.error.URLError, TimeoutError, ValueError, KeyError, json.JSONDecodeError, OSError):
        return heuristic
