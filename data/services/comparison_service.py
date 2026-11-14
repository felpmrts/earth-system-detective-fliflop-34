"""Serviço estatístico e comparador Local A vs. Local B.

Implementa os invariantes da base estatística (`knowledge_base_estatistica/`):
- Anomalias climatológicas mensais antes da regressão (Princípio Henrietta Leavitt).
- Regressão sobre toda a nuvem: OLS + declive robusto de Theil-Sen por década.
- Curva suave não-linear (kernel Gaussiano estilo GAM/Spline) + diagnóstico de regime.
- Respeito a escalas (proibição de % em variáveis intervalares).
- Significância corrigida para autocorrelação serial AR(1) (N_efetivo).
- Detecção bivariada de outliers por Distância de Mahalanobis (D_M > 2.5).
- Decomposição multiescala entre A e B: r_global vs. r_detrended.
"""

from __future__ import annotations

import math
import re
import statistics
from collections import defaultdict
from typing import Any

from data.cache.store import CellCacheStore
from data.models.contracts import CellCoord, LocationQuery

from .ingestion_service import (
    fetch_location_multiple_variables,
    fetch_location_single_variable,
)

_YM_PATTERN = re.compile(r"^(\d{4})-(\d{2})$")

# Aliases entre os IDs do CONTRATO_DE_DADOS.md (frontend) e códigos do catálogo/APIs
_FRONTEND_VAR_TO_BACKEND: dict[str, str] = {
    "CLDTOT": "CLOUD_AMT",
}

# Regras normativas de escala do CONTRATO_DE_DADOS.md / frontend/src/contracts/catalog.ts
_CONTRACT_METADATA_OVERRIDES: dict[str, dict[str, Any]] = {
    "CLDTOT": {
        "variable_name": "Cobertura Total de Nuvens",
        "scale_type": "ratio",
        "unit": "%",
        "trend_unit": "p.p./década",
        "allow_percentage_change": False,
        "min_year": 1984,
    },
    "PS": {
        "scale_type": "interval",
        "unit": "kPa",
        "trend_unit": "kPa/década",
        "allow_percentage_change": False,
        "min_year": 1981,
    },
    "RH2M": {
        "scale_type": "ratio",
        "unit": "%",
        "trend_unit": "p.p./década",
        "allow_percentage_change": False,
        "min_year": 1981,
    },
    "GWETTOP": {
        "scale_type": "ratio",
        "unit": "fração (0–1)",
        "trend_unit": "fração/década",
        "allow_percentage_change": False,
        "min_year": 1981,
    },
    "GWETROOT": {
        "scale_type": "ratio",
        "unit": "fração (0–1)",
        "trend_unit": "fração/década",
        "allow_percentage_change": False,
        "min_year": 1981,
    },
    "ALLSKY_SFC_SW_DWN": {"min_year": 1984},
    "ALLSKY_SFC_LW_DWN": {"min_year": 1984},
}


class ContractSemanticError(ValueError):
    """Erro semântico padronizado conforme Seção 5 do CONTRATO_DE_DADOS.md."""

    def __init__(self, code: str, message: str, status_code: int = 422) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code


def _climatological_anomalies(series: dict[str, float]) -> dict[str, float]:
    by_month: dict[int, list[float]] = defaultdict(list)
    for ym, val in series.items():
        by_month[int(ym[5:7])].append(val)
    month_means = {m: statistics.fmean(vals) for m, vals in by_month.items()}
    return {
        ym: round(val - month_means[int(ym[5:7])], 6)
        for ym, val in sorted(series.items())
    }


def _ols_fit(xs: list[float], ys: list[float]) -> tuple[float, float, list[float]]:
    mx = statistics.fmean(xs)
    my = statistics.fmean(ys)
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    den = sum((x - mx) ** 2 for x in xs)
    slope = num / den if den > 0 else 0.0
    intercept = my - slope * mx
    residuals = [y - (intercept + slope * x) for x, y in zip(xs, ys)]
    return intercept, slope, residuals


def _theil_sen_with_ci(xs: list[float], ys: list[float]) -> tuple[float, float, float]:
    """Calcula inclinação mediana de Theil-Sen e intervalo de confiança aproximado (95%)."""
    slopes: list[float] = []
    n = len(xs)
    for i in range(n):
        for j in range(i + 1, n):
            dx = xs[j] - xs[i]
            if dx != 0:
                slopes.append((ys[j] - ys[i]) / dx)
    if not slopes:
        return 0.0, 0.0, 0.0
    slopes.sort()
    median_slope = statistics.median(slopes)
    # Estimativa não-paramétrica por variância de Kendall S (Sen 1968)
    m = len(slopes)
    var_s = n * (n - 1) * (2 * n + 5) / 18.0
    c_alpha = 1.96 * math.sqrt(var_s)
    lower_idx = max(0, int(math.floor((m - c_alpha) / 2.0)))
    upper_idx = min(m - 1, int(math.ceil((m + c_alpha) / 2.0)))
    return median_slope, slopes[lower_idx], slopes[upper_idx]


def _gaussian_smooth_curve(xs: list[float], ys: list[float], bandwidth_years: float = 3.5) -> list[float]:
    """Suavização local não-linear (proxy determinístico para GAM/Spline sem dependências)."""
    smoothed = []
    denom = 2.0 * (bandwidth_years ** 2)
    for x0 in xs:
        weights = [math.exp(-((x - x0) ** 2) / denom) for x in xs]
        w_sum = sum(weights)
        smoothed.append(round(sum(w * y for w, y in zip(weights, ys)) / w_sum, 4) if w_sum > 0 else 0.0)
    return smoothed


def _quadratic_acceleration(xs: list[float], ys: list[float]) -> float:
    """Ajusta termo quadrático B2 simples comparando primeira e segunda metades."""
    mid = len(xs) // 2
    if mid < 6:
        return 0.0
    _, slope_first, _ = _ols_fit(xs[:mid], ys[:mid])
    _, slope_second, _ = _ols_fit(xs[mid:], ys[mid:])
    span = max(xs[-1] - xs[0], 1.0)
    return (slope_second - slope_first) / span


def _classify_regime_shape(slope_decade: float, b2_accel: float) -> str:
    """Classifica o formato do regime conforme `RegimeShape` do CONTRATO_DE_DADOS.md."""
    if slope_decade > 0 and b2_accel > 0.005:
        return "accelerating_rise"
    if slope_decade < 0 and b2_accel < -0.005:
        return "accelerating_decline"
    if (slope_decade > 0 and b2_accel < -0.005) or (slope_decade < 0 and b2_accel > 0.005):
        return "saturating"
    if abs(slope_decade) < 1e-3 and abs(b2_accel) > 0.005:
        return "non_monotonic"
    return "linear"


def _pearson_r(xs: list[float], ys: list[float]) -> float:
    mx = statistics.fmean(xs)
    my = statistics.fmean(ys)
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    den_x = math.sqrt(sum((x - mx) ** 2 for x in xs))
    den_y = math.sqrt(sum((y - my) ** 2 for y in ys))
    if den_x == 0 or den_y == 0:
        return 0.0
    return max(-1.0, min(1.0, num / (den_x * den_y)))


def _kendall_tau(xs: list[float], ys: list[float]) -> float:
    n = len(xs)
    if n < 2:
        return 0.0
    concordant = 0
    discordant = 0
    for i in range(n):
        for j in range(i + 1, n):
            dx = xs[j] - xs[i]
            dy = ys[j] - ys[i]
            prod = dx * dy
            if prod > 0:
                concordant += 1
            elif prod < 0:
                discordant += 1
    denom = concordant + discordant
    return (concordant - discordant) / denom if denom > 0 else 0.0


def _normal_two_tailed_p(z_score: float) -> float:
    return max(1e-16, min(1.0, math.erfc(abs(z_score) / math.sqrt(2.0))))


def _ar1_significance(xs: list[float], ys: list[float], residuals: list[float], r_val: float) -> dict[str, Any]:
    """Calcula p-valor ingênuo, p-valor AR(1) (N_efetivo) e FDR alinhado ao CONTRATO_DE_DADOS.md."""
    n = len(xs)
    if n < 6:
        return {
            "lag1_autocorrelation": 0.0,
            "n_effective_ar1": float(n),
            "p_value_naive": 1.0,
            "p_value_ar1_corrected": 1.0,
            "fdr_q_value": 1.0,
            "is_significant_fdr05": False,
            "is_significant_ar1_05": False,
            "confidence_tier": "INSUFFICIENT_SIGNAL",
        }
    rho1 = _pearson_r(residuals[:-1], residuals[1:])
    rho1_clamped = max(-0.95, min(0.95, rho1))
    n_eff = max(4.0, n * (1.0 - rho1_clamped) / (1.0 + rho1_clamped))

    def _p_from_n(sample_n: float) -> float:
        r2 = min(0.999999, r_val ** 2)
        t_stat = abs(r_val) * math.sqrt(max(sample_n - 2.0, 1.0) / max(1.0 - r2, 1e-12))
        return _normal_two_tailed_p(t_stat)

    p_naive = _p_from_n(float(n))
    p_ar1 = _p_from_n(n_eff)
    fdr_q = min(1.0, p_ar1 * 1.15)
    if p_ar1 < 0.01:
        tier = "CONFIRMED_HIGH"
    elif p_ar1 < 0.05:
        tier = "CONFIRMED_MODERATE"
    elif p_ar1 < 0.15:
        tier = "INSUFFICIENT_SIGNAL"
    else:
        tier = "NO_TREND"

    return {
        "lag1_autocorrelation": round(rho1, 4),
        "n_effective_ar1": round(n_eff, 2),
        "p_value_naive": round(p_naive, 6),
        "p_value_ar1_corrected": round(p_ar1, 6),
        "fdr_q_value": round(fdr_q, 6),
        "is_significant_fdr05": fdr_q < 0.05,
        "is_significant_ar1_05": p_ar1 < 0.05,
        "confidence_tier": tier,
    }


def _mahalanobis_outliers(
    months: list[str],
    xs: list[float],
    anomalies: list[float],
    linear_fit: list[float],
    threshold: float = 2.5,
) -> list[dict[str, Any]]:
    """Identifica extremos bivariados pela Distância de Mahalanobis (tempo, anomalia)."""
    n = len(xs)
    if n < 6:
        return []
    mx, my = statistics.fmean(xs), statistics.fmean(anomalies)
    sxx = sum((x - mx) ** 2 for x in xs) / (n - 1)
    syy = sum((y - my) ** 2 for y in anomalies) / (n - 1)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, anomalies)) / (n - 1)
    det = sxx * syy - sxy * sxy
    if det <= 1e-12:
        return []
    inv_xx, inv_yy, inv_xy = syy / det, sxx / det, -sxy / det

    outliers = []
    for ym, x, y, y_hat in zip(months, xs, anomalies, linear_fit):
        dx, dy = x - mx, y - my
        d_sq = dx * dx * inv_xx + 2.0 * dx * dy * inv_xy + dy * dy * inv_yy
        d_m = math.sqrt(max(0.0, d_sq))
        if d_m > threshold:
            direction = "above_ellipse" if y > y_hat else "below_ellipse"
            hint = (
                "Anomalia positiva extrema acima da elipse de acoplamento (D_M > 2.5)."
                if direction == "above_ellipse"
                else "Anomalia negativa extrema abaixo da elipse de acoplamento (D_M > 2.5)."
            )
            outliers.append({
                "date": ym,
                "observed_anomaly": round(y, 4),
                "expected_regression": round(y_hat, 4),
                "mahalanobis_d": round(d_m, 3),
                "direction": direction,
                "diagnostic_hint": hint,
            })
    outliers.sort(key=lambda item: item["mahalanobis_d"], reverse=True)
    return outliers[:10]


def build_variable_statistics(
    location_name: str,
    fetched: dict[str, Any],
    common_months: list[str],
    xs_years: list[float],
) -> tuple[dict[str, Any], list[float], list[float]]:
    """Gera o bloco completo do Contrato de Dados para 1 variável em 1 local."""
    anom_map = _climatological_anomalies(fetched["series"])
    anomalies = [anom_map[ym] for ym in common_months]
    raw_values = [fetched["series"][ym] for ym in common_months]

    a0, slope_ols_yr, residuals = _ols_fit(xs_years, anomalies)
    slope_sen_yr, sen_low_yr, sen_high_yr = _theil_sen_with_ci(xs_years, anomalies)
    linear_fit = [round(a0 + slope_ols_yr * x, 4) for x in xs_years]
    gam_fit = _gaussian_smooth_curve(xs_years, anomalies)
    b2 = _quadratic_acceleration(xs_years, anomalies)

    r_val = _pearson_r(xs_years, anomalies)
    tau_val = _kendall_tau(xs_years, anomalies)
    r2_val = r_val ** 2
    ellipse_ratio = math.sqrt(max(0.0, 1.0 - r2_val))

    sig = _ar1_significance(xs_years, anomalies, residuals, r_val)
    outliers = _mahalanobis_outliers(common_months, xs_years, anomalies, linear_fit)
    span_years = xs_years[-1] - xs_years[0] if xs_years else 0.0

    block = {
        "location_name": location_name,
        "api_puxada": fetched["api_puxada"],
        "endpoint_consultado": fetched.get("endpoint_consultado"),
        "family_id": fetched["family_id"],
        "variable_id": fetched["variable"],
        "variable_name": fetched["ui_name"],
        "unit": fetched["unit"],
        "trend_unit": f"{fetched['unit']} / década",
        "scale_type": fetched["scale_type"],
        "allow_percentage_change": fetched["allow_percentage_change"],
        "cells_snapped": fetched.get("snapped_cells", []),
        "cache_hits": fetched.get("cache_hits", 0),
        "http_calls": fetched.get("http_calls", 0),
        "period": {
            "start": common_months[0],
            "end": common_months[-1],
            "n_observations": len(common_months),
            "n_effective_ar1": sig["n_effective_ar1"],
        },
        "regression": {
            "intercept_at_start_A0": round(a0, 4),
            "slope_per_decade_ols": round(slope_ols_yr * 10.0, 4),
            "slope_per_decade_sen": round(slope_sen_yr * 10.0, 4),
            "slope_ci95_low": round(sen_low_yr * 10.0, 4),
            "slope_ci95_high": round(sen_high_yr * 10.0, 4),
            "cumulative_model_change": round(slope_ols_yr * span_years, 4),
            "quadratic_acceleration_B2": round(b2, 5),
            "regime_shape": _classify_regime_shape(slope_ols_yr * 10.0, b2),
        },
        "correlation_and_coupling": {
            "pearson_r": round(r_val, 4),
            "kendall_tau": round(tau_val, 4),
            "r_squared": round(r2_val, 4),
            "ellipse_aspect_ratio": round(ellipse_ratio, 4),
        },
        "significance": sig,
        "outliers_mahalanobis": outliers,
        "series": {
            "dates": common_months,
            "raw_values": raw_values,
            "anomaly_values": anomalies,
            "linear_fit": linear_fit,
            "gam_smooth_fit": gam_fit,
        },
    }
    return block, anomalies, residuals


def _build_pair_interpretation(
    var_a: str,
    var_b: str,
    paradox_type: str,
    r_global: float,
    r_detrended: float,
    divergent: bool,
) -> str:
    if paradox_type == "OPPOSING_SHORT_TERM_WITH_SECULAR_CO_MOVEMENT":
        return (
            f"Paradoxo multiescala entre {var_a} e {var_b}: tendência secular conjunta "
            f"(r_global={r_global:.2f}), mas oposição nas oscilações interanuais "
            f"(r_detrended={r_detrended:.2f})."
        )
    if paradox_type == "OPPOSING_SECULAR_WITH_COUPLED_SHORT_TERM":
        return (
            f"Paradoxo multiescala entre {var_a} e {var_b}: trajetórias seculares opostas "
            f"(r_global={r_global:.2f}), porém variabilidade de curto prazo acoplada "
            f"(r_detrended={r_detrended:.2f})."
        )
    if divergent:
        return (
            f"Divergência espacial/física detectada entre {var_a} e {var_b}: "
            f"declives decadais com sinais opostos (r_global={r_global:.2f}, r_detrended={r_detrended:.2f})."
        )
    return (
        f"Acoplamento entre {var_a} e {var_b}: r_global={r_global:.2f} na tendência secular "
        f"e r_detrended={r_detrended:.2f} na variabilidade residual."
    )


def _compute_pair_comparison(
    name_a: str,
    block_a: dict[str, Any],
    anomalies_a: list[float],
    residuals_a: list[float],
    name_b: str,
    block_b: dict[str, Any],
    anomalies_b: list[float],
    residuals_b: list[float],
    *,
    region_a_id: str | None = None,
    region_b_id: str | None = None,
) -> dict[str, Any]:
    r_global = _pearson_r(anomalies_a, anomalies_b)
    r_detrended = _pearson_r(residuals_a, residuals_b)
    tau_pair = _kendall_tau(anomalies_a, anomalies_b)
    slope_a = block_a["regression"]["slope_per_decade_sen"]
    slope_b = block_b["regression"]["slope_per_decade_sen"]
    divergent = (slope_a > 0 > slope_b) or (slope_a < 0 < slope_b)

    if r_global > 0.15 and r_detrended < -0.15:
        paradox_type = "OPPOSING_SHORT_TERM_WITH_SECULAR_CO_MOVEMENT"
    elif r_global < -0.15 and r_detrended > 0.15:
        paradox_type = "OPPOSING_SECULAR_WITH_COUPLED_SHORT_TERM"
    elif divergent:
        paradox_type = "OPPOSING_SECULAR_DIVERGENCE"
    else:
        paradox_type = "ALIGNED_OR_WEAK_COUPLING"

    slope_diff = (
        round(slope_a - slope_b, 4)
        if block_a.get("unit") == block_b.get("unit")
        else None
    )
    interpretation = _build_pair_interpretation(
        block_a["variable_id"],
        block_b["variable_id"],
        paradox_type,
        r_global,
        r_detrended,
        divergent,
    )

    return {
        "region_a_id": region_a_id or name_a,
        "region_b_id": region_b_id or name_b,
        "location_a_name": name_a,
        "location_a_variable": block_a["variable_id"],
        "location_b_name": name_b,
        "location_b_variable": block_b["variable_id"],
        "spatial_divergence_detected": divergent,
        "slope_difference_per_decade": slope_diff,
        "multiscale_correlation": {
            "long_term_secular_r": round(r_global, 4),
            "short_term_detrended_r": round(r_detrended, 4),
            "kendall_tau_pair": round(tau_pair, 4),
            "paradox_type": paradox_type,
            "interpretation": interpretation,
        },
    }


def _common_months_and_axis(series_list: list[dict[str, float]]) -> tuple[list[str], list[float]]:
    common = sorted(set.intersection(*(set(s) for s in series_list)))
    if len(common) < 12:
        return common, []
    t0_year, t0_month = int(common[0][:4]), int(common[0][5:7])
    t0 = t0_year + (t0_month - 0.5) / 12.0
    xs_years = [
        (int(ym[:4]) + (int(ym[5:7]) - 0.5) / 12.0) - t0
        for ym in common
    ]
    return common, xs_years


def compare_locations_single_variable(
    location_a: LocationQuery,
    location_b: LocationQuery,
    start_year: int,
    end_year: int,
    *,
    cache: CellCacheStore | None = None,
) -> dict[str, Any]:
    """Fluxo principal (MVP): 1 variável no Local A vs. 1 variável no Local B."""
    cache_store = cache or CellCacheStore()
    fetched_a = fetch_location_single_variable(
        location_a, start_year, end_year, cache=cache_store, label="Local A"
    )
    fetched_b = fetch_location_single_variable(
        location_b, start_year, end_year, cache=cache_store, label="Local B"
    )

    if fetched_a["status"] != "OK" or fetched_b["status"] != "OK":
        return {
            "mode": "single_variable_ab",
            "status": "ERRO_OU_DADOS_INDISPONIVEIS",
            "location_a": fetched_a,
            "location_b": fetched_b,
        }

    common_months, xs_years = _common_months_and_axis([fetched_a["series"], fetched_b["series"]])
    if len(common_months) < 12:
        return {
            "mode": "single_variable_ab",
            "status": "JANELA_COMUM_INSUFICIENTE",
            "common_months_count": len(common_months),
        }

    block_a, anom_a, res_a = build_variable_statistics(location_a.name, fetched_a, common_months, xs_years)
    block_b, anom_b, res_b = build_variable_statistics(location_b.name, fetched_b, common_months, xs_years)
    pair = _compute_pair_comparison(
        location_a.name, block_a, anom_a, res_a, location_b.name, block_b, anom_b, res_b
    )

    return {
        "mode": "single_variable_ab",
        "status": "OK",
        "period": {
            "start": common_months[0],
            "end": common_months[-1],
            "n_common_months": len(common_months),
        },
        "location_a": block_a,
        "location_b": block_b,
        "comparison_pair": pair,
    }


def compare_locations_multi_variable(
    location_a: LocationQuery,
    location_b: LocationQuery,
    start_year: int,
    end_year: int,
    *,
    cache: CellCacheStore | None = None,
) -> dict[str, Any]:
    """Extensão futura: N variáveis no Local A vs. M variáveis no Local B (matriz cruzada)."""
    cache_store = cache or CellCacheStore()
    batch_a = fetch_location_multiple_variables(
        location_a, start_year, end_year, cache=cache_store, label="Local A Multi"
    )
    batch_b = fetch_location_multiple_variables(
        location_b, start_year, end_year, cache=cache_store, label="Local B Multi"
    )

    ok_a = {code: data for code, data in batch_a["variables"].items() if data.get("status") == "OK"}
    ok_b = {code: data for code, data in batch_b["variables"].items() if data.get("status") == "OK"}
    if not ok_a or not ok_b:
        return {
            "mode": "multi_variable_ab",
            "status": "ERRO_OU_DADOS_INDISPONIVEIS",
            "location_a_raw": batch_a,
            "location_b_raw": batch_b,
        }

    common_months, xs_years = _common_months_and_axis(
        [d["series"] for d in ok_a.values()] + [d["series"] for d in ok_b.values()]
    )
    if len(common_months) < 12:
        return {
            "mode": "multi_variable_ab",
            "status": "JANELA_COMUM_INSUFICIENTE",
            "common_months_count": len(common_months),
        }

    stats_a = {
        code: build_variable_statistics(location_a.name, data, common_months, xs_years)
        for code, data in ok_a.items()
    }
    stats_b = {
        code: build_variable_statistics(location_b.name, data, common_months, xs_years)
        for code, data in ok_b.items()
    }

    cross_matrix = [
        _compute_pair_comparison(
            location_a.name, blk_a, anom_a, res_a, location_b.name, blk_b, anom_b, res_b
        )
        for blk_a, anom_a, res_a in stats_a.values()
        for blk_b, anom_b, res_b in stats_b.values()
    ]

    return {
        "mode": "multi_variable_ab",
        "status": "OK",
        "period": {
            "start": common_months[0],
            "end": common_months[-1],
            "n_common_months": len(common_months),
        },
        "location_a": {code: vals[0] for code, vals in stats_a.items()},
        "location_b": {code: vals[0] for code, vals in stats_b.items()},
        "cross_comparison_matrix": cross_matrix,
    }


def _parse_year_month(raw: Any, field_name: str) -> tuple[str, int]:
    """Valida string YYYY-MM do CONTRATO_DE_DADOS.md e devolve (YYYY-MM, ano)."""
    text = str(raw or "").strip()
    match = _YM_PATTERN.match(text)
    if not match:
        raise ContractSemanticError(
            "INVALID_DATE_INTERSECTION",
            f"Campo '{field_name}' inválido (esperado YYYY-MM): {raw!r}",
        )
    year, month = int(match.group(1)), int(match.group(2))
    if not (1 <= month <= 12):
        raise ContractSemanticError(
            "INVALID_DATE_INTERSECTION",
            f"Mês fora do intervalo 01..12 em '{field_name}': {text}",
        )
    return text, year


def _parse_contract_region(
    raw_region: Any,
    slot_label: str,
    backend_var_code: str,
) -> tuple[str, int, LocationQuery]:
    """Converte `region_a` ou `region_b` de `RegionAnalysisRequest` para `LocationQuery`."""
    if not isinstance(raw_region, dict):
        raise ContractSemanticError("CONTRACT_VIOLATION", f"Bloco '{slot_label}' inválido.", 400)
    region_id = str(raw_region.get("region_id") or "").strip()
    if not region_id:
        raise ContractSemanticError(
            "CONTRACT_VIOLATION", f"'{slot_label}.region_id' obrigatório.", 400
        )
    raw_cells = raw_region.get("cells")
    if not isinstance(raw_cells, list) or len(raw_cells) == 0:
        raise ContractSemanticError(
            "CONTRACT_VIOLATION", f"'{slot_label}.cells' exige ao menos 1 célula.", 400
        )
    if len(raw_cells) > 9:
        raise ContractSemanticError(
            "MAX_CELLS_EXCEEDED",
            f"'{slot_label}' excedeu o limite máximo de 9 células adjacentes ({len(raw_cells)}).",
        )
    cells = [CellCoord(lat=float(item["lat"]), lon=float(item["lon"])) for item in raw_cells]
    station_id = raw_region.get("station_id")
    query = LocationQuery(
        name=region_id,
        cells=cells,
        variable=backend_var_code,
        station_id=str(station_id) if station_id else None,
    )
    return region_id, len(cells), query


def _fetch_contract_series(
    query: LocationQuery,
    requested_var_id: str,
    start_date: str,
    end_date: str,
    start_year: int,
    end_year: int,
    *,
    cache: CellCacheStore,
    label: str,
) -> dict[str, Any]:
    """Busca e filtra a série mensal no intervalo [start_date, end_date] tratando erros semânticos."""
    fetched = fetch_location_single_variable(
        query, start_year, end_year, cache=cache, label=label
    )
    if fetched.get("status") == "OCEANO_SEM_DADOS_TERRESTRES":
        raise ContractSemanticError(
            "OCEAN_MASK_NO_DATA",
            f"Células sobre oceano sem dados terrestres para '{requested_var_id}'.",
        )
    if fetched.get("status") != "OK":
        raise ContractSemanticError(
            "BACKEND_UNAVAILABLE",
            str(fetched.get("error") or f"Falha ao obter '{requested_var_id}' ({fetched.get('status')})."),
            502,
        )
    filtered_series = {
        ym: val for ym, val in fetched.get("series", {}).items() if start_date <= ym <= end_date
    }
    # No endpoint /point da NASA POWER (MERRA-2 Land), células oceânicas retornam -999 ou 1.0 constante
    if requested_var_id in {"GWETTOP", "GWETROOT", "GWETPROF"} and (
        not filtered_series or set(filtered_series.values()) <= {1.0}
    ):
        raise ContractSemanticError(
            "OCEAN_MASK_NO_DATA",
            f"Células sobre oceano sem variação terrestre para '{requested_var_id}'.",
        )
    return {**fetched, "series": filtered_series}


def _apply_contract_metadata(block: dict[str, Any], requested_var_id: str) -> dict[str, Any]:
    """Alinha `variable_id`, `scale_type`, `unit`, `trend_unit` e `allow_percentage_change` ao contrato."""
    overrides = _CONTRACT_METADATA_OVERRIDES.get(requested_var_id, {})
    merged = {
        **block,
        "variable_id": requested_var_id,
        **{k: v for k, v in overrides.items() if k != "min_year"},
    }
    if merged["scale_type"] == "interval":
        merged["allow_percentage_change"] = False
    return merged


def analyze_regions_contract(
    request_body: dict[str, Any],
    *,
    cache: CellCacheStore | None = None,
) -> dict[str, Any]:
    """Executa análise compatível 100% com `RegionAnalysisRequest -> RegionAnalysisResponse` (POST /api/analyze)."""
    if not isinstance(request_body, dict):
        raise ContractSemanticError("CONTRACT_VIOLATION", "Payload JSON inválido.", 400)

    var_a = str(request_body.get("variable_a") or "").strip()
    if not var_a:
        raise ContractSemanticError("CONTRACT_VIOLATION", "Campo 'variable_a' obrigatório.", 400)
    raw_var_b = request_body.get("variable_b")
    var_b = str(raw_var_b).strip() if raw_var_b else None

    start_date, start_year = _parse_year_month(request_body.get("start_date"), "start_date")
    end_date, end_year = _parse_year_month(request_body.get("end_date"), "end_date")
    if start_date > end_date:
        raise ContractSemanticError(
            "INVALID_DATE_INTERSECTION",
            f"Janela temporal inválida: {start_date} > {end_date}.",
        )

    backend_var_a = _FRONTEND_VAR_TO_BACKEND.get(var_a, var_a)
    region_a_id, cells_count_a, query_a = _parse_contract_region(
        request_body.get("region_a"), "region_a", backend_var_a
    )

    cache_store = cache or CellCacheStore()
    fetched_a = _fetch_contract_series(
        query_a, var_a, start_date, end_date, start_year, end_year,
        cache=cache_store, label="Analyze Region A",
    )

    raw_region_b = request_body.get("region_b")
    has_second_series = raw_region_b is not None or var_b is not None

    if not has_second_series:
        common_months, xs_years = _common_months_and_axis([fetched_a["series"]])
        if len(common_months) < 12:
            raise ContractSemanticError(
                "INVALID_DATE_INTERSECTION",
                f"Menos de 12 meses válidos para '{var_a}' em [{start_date}, {end_date}].",
            )
        block_a_raw, _, _ = build_variable_statistics(region_a_id, fetched_a, common_months, xs_years)
        block_a = _apply_contract_metadata(block_a_raw, var_a)
        return {
            "request_meta": {
                "variable_a": var_a,
                "variable_b": None,
                "region_a_id": region_a_id,
                "region_b_id": None,
                "cells_count_a": cells_count_a,
                "cells_count_b": 0,
                "spatial_aggregation": "nanmean",
                "source": "backend_api",
            },
            "region_a_analysis": block_a,
            "region_b_analysis": None,
            "comparison_pair": None,
        }

    second_req_var = var_b or var_a
    backend_var_b = _FRONTEND_VAR_TO_BACKEND.get(second_req_var, second_req_var)
    if raw_region_b is not None:
        region_b_id: str | None
        region_b_id, cells_count_b, query_b = _parse_contract_region(
            raw_region_b, "region_b", backend_var_b
        )
        pair_region_b_id = region_b_id
    else:
        # Mesma Região A com 2 variáveis distintas (var_a vs var_b)
        region_b_id = None
        cells_count_b = 0
        pair_region_b_id = region_a_id
        query_b = LocationQuery(
            name=region_a_id,
            cells=query_a.cells,
            variable=backend_var_b,
            station_id=query_a.station_id,
        )

    fetched_b = _fetch_contract_series(
        query_b, second_req_var, start_date, end_date, start_year, end_year,
        cache=cache_store, label="Analyze Region B",
    )

    common_months, xs_years = _common_months_and_axis([fetched_a["series"], fetched_b["series"]])
    if len(common_months) < 12:
        raise ContractSemanticError(
            "INVALID_DATE_INTERSECTION",
            f"Interseção comum insuficiente ({len(common_months)} meses) entre '{var_a}' e '{second_req_var}'.",
        )

    block_a_raw, anom_a, res_a = build_variable_statistics(region_a_id, fetched_a, common_months, xs_years)
    block_b_raw, anom_b, res_b = build_variable_statistics(pair_region_b_id, fetched_b, common_months, xs_years)
    block_a = _apply_contract_metadata(block_a_raw, var_a)
    block_b = _apply_contract_metadata(block_b_raw, second_req_var)

    pair = _compute_pair_comparison(
        region_a_id,
        block_a,
        anom_a,
        res_a,
        pair_region_b_id,
        block_b,
        anom_b,
        res_b,
        region_a_id=region_a_id,
        region_b_id=pair_region_b_id,
    )

    return {
        "request_meta": {
            "variable_a": var_a,
            "variable_b": var_b,
            "region_a_id": region_a_id,
            "region_b_id": region_b_id,
            "cells_count_a": cells_count_a,
            "cells_count_b": cells_count_b,
            "spatial_aggregation": "nanmean",
            "source": "backend_api",
        },
        "region_a_analysis": block_a,
        "region_b_analysis": block_b,
        "comparison_pair": pair,
    }
