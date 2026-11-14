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
import statistics
from collections import defaultdict
from typing import Any

from data.cache.store import CellCacheStore
from data.models.contracts import LocationQuery

from .ingestion_service import (
    fetch_location_multiple_variables,
    fetch_location_single_variable,
)


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
    if abs(slope_decade) < 1e-4 and abs(b2_accel) < 1e-3:
        return "stable"
    if slope_decade > 0 and b2_accel > 0.005:
        return "accelerating_increase"
    if slope_decade < 0 and b2_accel < -0.005:
        return "accelerating_decline"
    if abs(b2_accel) > 0.005:
        return "decelerating_or_shifting"
    return "linear_trend"


def _pearson_r(xs: list[float], ys: list[float]) -> float:
    mx = statistics.fmean(xs)
    my = statistics.fmean(ys)
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    den_x = math.sqrt(sum((x - mx) ** 2 for x in xs))
    den_y = math.sqrt(sum((y - my) ** 2 for y in ys))
    if den_x == 0 or den_y == 0:
        return 0.0
    return num / (den_x * den_y)


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
    """Calcula p-valor ingênuo e p-valor corrigido para autocorrelação AR(1) (N_efetivo)."""
    n = len(xs)
    if n < 6:
        return {
            "lag1_autocorrelation": 0.0,
            "n_effective_ar1": float(n),
            "p_value_naive": 1.0,
            "p_value_ar1_corrected": 1.0,
            "is_significant_ar1_05": False,
            "confidence_tier": "INSUFFICIENT_DATA",
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
    if p_ar1 < 0.01:
        tier = "CONFIRMED_HIGH"
    elif p_ar1 < 0.05:
        tier = "CONFIRMED_MODERATE"
    else:
        tier = "NOT_SIGNIFICANT"

    return {
        "lag1_autocorrelation": round(rho1, 4),
        "n_effective_ar1": round(n_eff, 2),
        "p_value_naive": round(p_naive, 6),
        "p_value_ar1_corrected": round(p_ar1, 6),
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
    for idx, (ym, x, y, y_hat) in enumerate(zip(months, xs, anomalies, linear_fit)):
        dx, dy = x - mx, y - my
        d_sq = dx * dx * inv_xx + 2.0 * dx * dy * inv_xy + dy * dy * inv_yy
        d_m = math.sqrt(max(0.0, d_sq))
        if d_m > threshold:
            outliers.append({
                "date": ym,
                "observed_anomaly": round(y, 4),
                "expected_regression": round(y_hat, 4),
                "mahalanobis_d": round(d_m, 3),
                "direction": "above_ellipse" if y > y_hat else "below_ellipse",
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


def _compute_pair_comparison(
    name_a: str,
    block_a: dict[str, Any],
    anomalies_a: list[float],
    residuals_a: list[float],
    name_b: str,
    block_b: dict[str, Any],
    anomalies_b: list[float],
    residuals_b: list[float],
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

    return {
        "location_a_name": name_a,
        "location_a_variable": block_a["variable_id"],
        "location_b_name": name_b,
        "location_b_variable": block_b["variable_id"],
        "spatial_divergence_detected": divergent,
        "multiscale_correlation": {
            "long_term_secular_r": round(r_global, 4),
            "short_term_detrended_r": round(r_detrended, 4),
            "kendall_tau_pair": round(tau_pair, 4),
            "paradox_type": paradox_type,
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
