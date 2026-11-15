"""Ferramentas Científicas Determinísticas para o Chatbot Co-Piloto Estatístico.

Regra fundamental: a LLM formula hipóteses e escolhe testes; todo cálculo
matemático é executado aqui em Python determinístico usando `backend/stats_engine.py`
e `data/services/ingestion_service.py` com estrito respeito aos 7 Invariantes.
"""

from __future__ import annotations

import math
import re
import statistics
import time
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence, Tuple

from backend.discovery_engine import DEFAULT_CACHE_DIR, discover_from_analysis
from backend.stats_engine import (
    VARIABLE_CATALOG,
    _date_to_fractional_year,
    _pearson_corr_pairs,
    analyze_single_series,
    apply_spatial_fdr_bh,
    classify_confidence_tier,
    compare_regions,
    compute_correlation_and_coupling,
    compute_gam_and_regime,
    compute_ols_regression,
    compute_significance_ar1,
    compute_theil_sen_regression,
)
from data.cache.store import CellCacheStore
from data.catalog.environmental_catalog import _VARIABLES_BY_CODE as VARIABLE_BY_CODE
from data.catalog.environmental_catalog import get_variable_spec
from data.connectors.base import snap_ceres, snap_merra2
from data.models.contracts import CellCoord, LocationQuery
from data.services.ingestion_service import fetch_location_single_variable

_CELL_ID_RE = re.compile(r"^r(-?\d+)_c(-?\d+)$")

_SEASON_MONTHS: Dict[str, Tuple[int, ...]] = {
    "DJF": (12, 1, 2),
    "MAM": (3, 4, 5),
    "JJA": (6, 7, 8),
    "SON": (9, 10, 11),
}


def _select_slot_block(analysis: Mapping[str, Any], slot: str = "A") -> Tuple[str, Dict[str, Any]]:
    normalized = str(slot or "A").strip().upper()
    if normalized == "B":
        block = analysis.get("region_b_analysis")
        if isinstance(block, dict):
            return "B", block
    block_a = analysis.get("region_a_analysis")
    if isinstance(block_a, dict):
        return "A", block_a
    raise ValueError("Payload 'analysis' não contém 'region_a_analysis' válido.")


def _extract_valid_points(
    block: Mapping[str, Any],
) -> List[Tuple[int, str, float, float, float]]:
    """Retorna lista de (idx, date_yyyy_mm, anomaly, raw_val, linear_fit) válidos."""
    series = block.get("series") or {}
    dates = series.get("dates") or []
    anomalies = series.get("anomaly_values") or []
    raw_vals = series.get("raw_values") or []
    linear_fit = series.get("linear_fit") or []

    points: List[Tuple[int, str, float, float, float]] = []
    for idx, dt in enumerate(dates):
        if idx >= len(anomalies):
            break
        anom = anomalies[idx]
        if anom is None:
            continue
        try:
            anom_f = float(anom)
        except (TypeError, ValueError):
            continue
        if not math.isfinite(anom_f):
            continue
        raw_v = raw_vals[idx] if idx < len(raw_vals) and raw_vals[idx] is not None else anom_f
        lin_v = linear_fit[idx] if idx < len(linear_fit) and linear_fit[idx] is not None else 0.0
        points.append((idx, str(dt), anom_f, float(raw_v), float(lin_v)))
    return points


def _evaluate_regression_slice(
    points: Sequence[Tuple[int, str, float, float, float]],
    base_block: Mapping[str, Any],
    *,
    step_months: int = 1,
) -> Dict[str, Any]:
    """Roda OLS, Theil-Sen, GAM e significância AR(1) em uma fatia de anomalias válidas."""
    if len(points) < 6:
        raise ValueError(
            f"Amostra insuficiente para re-estimação robusta ({len(points)} observações válidas; mínimo 6)."
        )

    dates = [p[1] for p in points]
    y_anom = [p[2] for p in points]
    y_raw = [p[3] for p in points]
    t0 = _date_to_fractional_year(dates[0])
    t_years = [_date_to_fractional_year(d) - t0 for d in dates]
    x_decades = [t / 10.0 for t in t_years]

    ols = compute_ols_regression(t_years, y_anom, y_raw=y_raw)
    sen = compute_theil_sen_regression(t_years, y_anom)
    coupling = compute_correlation_and_coupling(
        ols["sxx"], ols["syy"], ols["sxy"], sen["kendall_tau"]
    )
    sig = compute_significance_ar1(
        n_obs=len(points),
        slope_per_decade_ols=ols["slope_per_decade_ols"],
        slope_per_decade_sen=sen["slope_per_decade_sen"],
        se_slope_decade=ols["se_slope_decade"],
        residuals=ols["residuals"],
        fdr_q_value=None,
        y_anomalies=y_anom,
        valid_dates=dates,
        step_months=step_months,
    )
    gam = compute_gam_and_regime(x_decades, y_anom, sen["slope_per_decade_sen"])

    return {
        "start": dates[0],
        "end": dates[-1],
        "n_observations": len(points),
        "n_effective_ar1": round(float(sig["n_effective_ar1"]), 2),
        "unit": base_block.get("unit"),
        "trend_unit": base_block.get("trend_unit"),
        "scale_type": base_block.get("scale_type"),
        "allow_percentage_change": bool(base_block.get("allow_percentage_change", False)),
        "slope_per_decade_sen": round(float(sen["slope_per_decade_sen"]), 5),
        "slope_ci95_low": round(float(sen["slope_ci95_low"]), 5),
        "slope_ci95_high": round(float(sen["slope_ci95_high"]), 5),
        "slope_per_decade_ols": round(float(ols["slope_per_decade_ols"]), 5),
        "pearson_r": round(float(coupling["pearson_r"]), 4),
        "kendall_tau": round(float(coupling["kendall_tau"]), 4),
        "r_squared": round(float(coupling["r_squared"]), 4),
        "p_value_naive": float(sig["p_value_naive"]),
        "p_value_ar1_corrected": float(sig["p_value_ar1_corrected"]),
        "confidence_tier": sig["confidence_tier"],
        "regime_shape": gam["regime_shape"],
        "quadratic_acceleration_B2": round(float(gam["quadratic_acceleration_B2"]), 6),
        "mean_anomaly": round(statistics.mean(y_anom), 4),
    }


def run_subperiod_or_regime_split(
    analysis: Mapping[str, Any],
    *,
    slot: str = "A",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    split_date: Optional[str] = None,
) -> Dict[str, Any]:
    """Reavalia tendências em um subperíodo [start_date, end_date] ou compara pré vs. pós `split_date`."""
    resolved_slot, block = _select_slot_block(analysis, slot)
    points = _extract_valid_points(block)
    if len(points) < 12:
        raise ValueError("Série insuficiente para subamostragem ou quebra de regime (< 12 meses).")

    if start_date or end_date:
        s_bound = (start_date or points[0][1])[:7]
        e_bound = (end_date or points[-1][1])[:7]
        sliced = [p for p in points if s_bound <= p[1] <= e_bound]
        eval_res = _evaluate_regression_slice(sliced, block)
        baseline_sen = float((block.get("regression") or {}).get("slope_per_decade_sen", 0.0))
        return {
            "tool": "run_subperiod_or_regime_split",
            "mode": "subperiod_window",
            "slot": resolved_slot,
            "variable_id": block.get("variable_id"),
            "baseline_slope_sen": round(baseline_sen, 5),
            "subperiod": eval_res,
            "slope_difference_vs_baseline": round(
                eval_res["slope_per_decade_sen"] - baseline_sen, 5
            ),
        }

    pivot = (split_date or points[len(points) // 2][1])[:7]
    before_pts = [p for p in points if p[1] < pivot]
    after_pts = [p for p in points if p[1] >= pivot]
    before_res = _evaluate_regression_slice(before_pts, block)
    after_res = _evaluate_regression_slice(after_pts, block)
    delta_sen = round(
        after_res["slope_per_decade_sen"] - before_res["slope_per_decade_sen"], 5
    )

    return {
        "tool": "run_subperiod_or_regime_split",
        "mode": "regime_split",
        "slot": resolved_slot,
        "variable_id": block.get("variable_id"),
        "split_date": pivot,
        "before": before_res,
        "after": after_res,
        "slope_sen_shift_after_minus_before": delta_sen,
        "sign_reversal": (
            before_res["slope_per_decade_sen"] * after_res["slope_per_decade_sen"] < 0
        ),
    }


def run_sensitivity_without_outliers(
    analysis: Mapping[str, Any],
    *,
    slot: str = "A",
    mahalanobis_threshold: float = 2.5,
    exclude_dates: Optional[Sequence[str]] = None,
    exclude_years: Optional[Sequence[int]] = None,
) -> Dict[str, Any]:
    """Testa robustez da tendência removendo extremos de Mahalanobis e/ou datas/anos explícitos."""
    resolved_slot, block = _select_slot_block(analysis, slot)
    points = _extract_valid_points(block)
    outliers = block.get("outliers_mahalanobis") or []

    removed_dates = {
        str(item.get("date"))
        for item in outliers
        if item.get("date") and float(item.get("mahalanobis_d", 0.0)) >= float(mahalanobis_threshold)
    }
    if exclude_dates:
        removed_dates.update(str(d)[:7] for d in exclude_dates if d)
    year_set = {str(int(y)) for y in (exclude_years or [])}

    filtered: List[Tuple[int, str, float, float, float]] = []
    excluded_observed: List[str] = []
    for p in points:
        dt = p[1]
        if dt in removed_dates or dt[:4] in year_set:
            excluded_observed.append(dt)
        else:
            filtered.append(p)

    clean_res = _evaluate_regression_slice(filtered, block)
    base_reg = block.get("regression") or {}
    base_sig = block.get("significance") or {}
    base_sen = float(base_reg.get("slope_per_decade_sen", 0.0))
    base_ols = float(base_reg.get("slope_per_decade_ols", 0.0))
    base_p_ar1 = float(base_sig.get("p_value_ar1_corrected", 1.0))

    return {
        "tool": "run_sensitivity_without_outliers",
        "slot": resolved_slot,
        "variable_id": block.get("variable_id"),
        "mahalanobis_threshold": float(mahalanobis_threshold),
        "excluded_count": len(excluded_observed),
        "excluded_dates_sample": excluded_observed[:12],
        "baseline": {
            "slope_per_decade_sen": round(base_sen, 5),
            "slope_per_decade_ols": round(base_ols, 5),
            "p_value_ar1_corrected": base_p_ar1,
            "quadratic_acceleration_B2": base_reg.get("quadratic_acceleration_B2"),
        },
        "filtered": clean_res,
        "same_direction_after_removal": (base_sen * clean_res["slope_per_decade_sen"]) > 0,
        "ols_shift_after_removal": round(clean_res["slope_per_decade_ols"] - base_ols, 5),
        "sen_shift_after_removal": round(clean_res["slope_per_decade_sen"] - base_sen, 5),
    }


_SEASON_REP_MONTH: Dict[str, int] = {
    "DJF": 1,
    "MAM": 4,
    "JJA": 7,
    "SON": 10,
}


def compute_seasonal_stratified_trends(
    analysis: Mapping[str, Any],
    *,
    slot: str = "A",
) -> Dict[str, Any]:
    """Calcula tendências estratificadas por trimestre com agregação anual sazonal e BH-FDR (M3)."""
    resolved_slot, block = _select_slot_block(analysis, slot)
    points = _extract_valid_points(block)
    if len(points) < 12:
        raise ValueError("Série insuficiente para estratificação sazonal (< 12 meses).")

    seasons_out: Dict[str, Dict[str, Any]] = {}
    ok_keys: List[str] = []
    ok_pvals: List[float] = []
    ok_same_sign: List[bool] = []

    for season_name, month_tuple in _SEASON_MONTHS.items():
        # Group into meteorological season-years (Dec Y-1 -> Jan/Feb Y) to avoid pseudo-replication
        by_year: Dict[int, List[Tuple[int, str, float, float, float]]] = {}
        for pt in points:
            parts = pt[1].split("-")
            yr = int(parts[0])
            mo = int(parts[1])
            if mo not in month_tuple:
                continue
            s_year = yr + (1 if (season_name == "DJF" and mo == 12) else 0)
            by_year.setdefault(s_year, []).append(pt)

        rep_mo = _SEASON_REP_MONTH[season_name]
        # Prefer complete seasons (>= 2 months); fall back to >= 1 only if needed on boundary years
        s_pts_ann = [
            (
                idx,
                f"{s_yr:04d}-{rep_mo:02d}",
                sum(x[2] for x in grp) / len(grp),
                sum(x[3] for x in grp) / len(grp),
                sum(x[4] for x in grp) / len(grp),
            )
            for idx, (s_yr, grp) in enumerate(sorted(by_year.items()))
            if len(grp) >= 2
        ]
        if len(s_pts_ann) < 6:
            s_pts_ann = [
                (
                    idx,
                    f"{s_yr:04d}-{rep_mo:02d}",
                    sum(x[2] for x in grp) / len(grp),
                    sum(x[3] for x in grp) / len(grp),
                    sum(x[4] for x in grp) / len(grp),
                )
                for idx, (s_yr, grp) in enumerate(sorted(by_year.items()))
            ]

        if len(s_pts_ann) < 6:
            seasons_out[season_name] = {"status": "INSUFFICIENT_DATA", "n_observations": len(s_pts_ann)}
            continue

        eval_res = _evaluate_regression_slice(s_pts_ann, block, step_months=12)
        p_ar1 = float(eval_res["p_value_ar1_corrected"])
        same_sign = (float(eval_res["slope_per_decade_ols"]) * float(eval_res["slope_per_decade_sen"])) > 0
        seasons_out[season_name] = {
            "status": "OK",
            "n_observations": eval_res["n_observations"],
            "n_effective_ar1": eval_res["n_effective_ar1"],
            "slope_per_decade_sen": eval_res["slope_per_decade_sen"],
            "slope_ci95_low": eval_res["slope_ci95_low"],
            "slope_ci95_high": eval_res["slope_ci95_high"],
            "slope_per_decade_ols": eval_res["slope_per_decade_ols"],
            "p_value_ar1_corrected": p_ar1,
            "confidence_tier": eval_res["confidence_tier"],
        }
        ok_keys.append(season_name)
        ok_pvals.append(p_ar1)
        ok_same_sign.append(same_sign)

    if ok_pvals:
        q_vals, sig_flags = apply_spatial_fdr_bh(ok_pvals, alpha=0.05)
        for s_key, p_ar1, q_val, is_sig, same_sign in zip(
            ok_keys, ok_pvals, q_vals, sig_flags, ok_same_sign
        ):
            seasons_out[s_key]["fdr_q_value"] = round(float(q_val), 6)
            seasons_out[s_key]["is_significant_fdr05"] = bool(is_sig)
            seasons_out[s_key]["confidence_tier"] = classify_confidence_tier(
                p_ar1, bool(is_sig), same_sign
            )

    ok_seasons = [(k, v) for k, v in seasons_out.items() if v.get("status") == "OK"]
    dominant = (
        max(ok_seasons, key=lambda kv: abs(float(kv[1]["slope_per_decade_sen"])))[0]
        if ok_seasons
        else None
    )
    signs = {1 if float(v["slope_per_decade_sen"]) > 0 else -1 for _, v in ok_seasons if float(v["slope_per_decade_sen"]) != 0}

    return {
        "tool": "compute_seasonal_stratified_trends",
        "slot": resolved_slot,
        "variable_id": block.get("variable_id"),
        "unit": block.get("unit"),
        "trend_unit": block.get("trend_unit"),
        "allow_percentage_change": bool(block.get("allow_percentage_change", False)),
        "seasons": seasons_out,
        "dominant_season": dominant,
        "has_seasonal_sign_reversal": len(signs) > 1,
    }


def compute_lagged_crosscorrelation_ar1(
    analysis: Mapping[str, Any],
    *,
    max_lag: int = 6,
) -> Dict[str, Any]:
    """Correlação cruzada com defasagem A(t) vs. B(t+lag) e correção Bretherton AR(1)."""
    reg_a = analysis.get("region_a_analysis")
    reg_b = analysis.get("region_b_analysis")
    if not isinstance(reg_a, dict) or not isinstance(reg_b, dict):
        raise ValueError("São necessárias Região A e Região B para análise de defasagem cruzada.")

    clamped_lag = max(1, min(12, int(max_lag)))
    pts_a = {p[1]: (p[2], p[2] - p[4]) for p in _extract_valid_points(reg_a)}
    pts_b = {p[1]: (p[2], p[2] - p[4]) for p in _extract_valid_points(reg_b)}

    common_dates = sorted(set(pts_a.keys()) & set(pts_b.keys()))
    if len(common_dates) < 12:
        raise ValueError("Sobreposição temporal insuficiente (< 12 meses) entre Região A e Região B.")

    lag_rows: List[Dict[str, Any]] = []
    # Mapeia YYYY-MM para índice inteiro de meses contíguos para suportar lacunas reais
    def _ym_to_idx(ym: str) -> int:
        y, m = ym.split("-")
        return int(y) * 12 + (int(m) - 1)

    idx_a = {_ym_to_idx(d): v for d, v in pts_a.items()}
    idx_b = {_ym_to_idx(d): v for d, v in pts_b.items()}
    common_idx = sorted(set(idx_a.keys()) & set(idx_b.keys()))

    for lag in range(-clamped_lag, clamped_lag + 1):
        raw_pairs: List[Tuple[float, float]] = []
        det_pairs: List[Tuple[float, float]] = []
        for t in common_idx:
            if (t + lag) in idx_b:
                a_raw, a_det = idx_a[t]
                b_raw, b_det = idx_b[t + lag]
                raw_pairs.append((a_raw, b_raw))
                det_pairs.append((a_det, b_det))

        if len(raw_pairs) < 8:
            continue
        r_raw, p_raw = _pearson_corr_pairs(raw_pairs, ar1_adjust=True)
        r_det, p_det = _pearson_corr_pairs(det_pairs, ar1_adjust=True)
        lag_rows.append(
            {
                "lag_months": lag,
                "n_pairs": len(raw_pairs),
                "r_raw_anomalies": r_raw,
                "p_raw_ar1": p_raw,
                "r_detrended": r_det,
                "p_detrended_ar1": p_det,
            }
        )

    if not lag_rows:
        raise ValueError("Não há pares suficientes em nenhum lag para calcular correlação cruzada.")

    # Benjamini-Hochberg FDR across all 2*max_lag+1 tested lags (M4)
    q_raw_list, sig_raw_list = apply_spatial_fdr_bh(
        [float(r["p_raw_ar1"]) for r in lag_rows], alpha=0.05
    )
    q_det_list, sig_det_list = apply_spatial_fdr_bh(
        [float(r["p_detrended_ar1"]) for r in lag_rows], alpha=0.05
    )
    for row, qr, sr, qd, sd in zip(lag_rows, q_raw_list, sig_raw_list, q_det_list, sig_det_list):
        row["q_raw_fdr"] = round(float(qr), 6)
        row["is_raw_sig_fdr05"] = bool(sr)
        row["q_detrended_fdr"] = round(float(qd), 6)
        row["is_detrended_sig_fdr05"] = bool(sd)

    best_raw = max(lag_rows, key=lambda row: abs(float(row["r_raw_anomalies"])))
    best_det = max(lag_rows, key=lambda row: abs(float(row["r_detrended"])))
    det_lag = int(best_det["lag_months"])
    if not bool(best_det["is_detrended_sig_fdr05"]):
        precedence = (
            f"Sem precedência estatisticamente significativa após FDR "
            f"({len(lag_rows)} lags, q_FDR={best_det['q_detrended_fdr']:.4f} >= 0.05)"
        )
    elif det_lag > 0:
        precedence = f"A ({reg_a.get('variable_id')}) precede B ({reg_b.get('variable_id')}) em +{det_lag} mês(es)"
    elif det_lag < 0:
        precedence = f"B ({reg_b.get('variable_id')}) precede A ({reg_a.get('variable_id')}) em +{abs(det_lag)} mês(es)"
    else:
        precedence = "Acoplamento contemporâneo síncrono (pico detrended em lag 0)"

    return {
        "tool": "compute_lagged_crosscorrelation_ar1",
        "variable_a": reg_a.get("variable_id"),
        "variable_b": reg_b.get("variable_id"),
        "lag_convention": "lag > 0 significa A(t) correlacionado com B(t + lag meses)",
        "best_raw_lag": best_raw,
        "best_detrended_lag": best_det,
        "precedence_interpretation": precedence,
        "lags": lag_rows,
    }


def _quantile_linear(sorted_vals: Sequence[float], q: float) -> float:
    n = len(sorted_vals)
    if n == 1:
        return sorted_vals[0]
    pos = q * (n - 1)
    lo = int(math.floor(pos))
    hi = min(n - 1, lo + 1)
    frac = pos - lo
    return sorted_vals[lo] * (1.0 - frac) + sorted_vals[hi] * frac


def _slice_distribution(vals: Sequence[float]) -> Dict[str, float]:
    ordered = sorted(vals)
    p10 = _quantile_linear(ordered, 0.10)
    p25 = _quantile_linear(ordered, 0.25)
    p50 = _quantile_linear(ordered, 0.50)
    p75 = _quantile_linear(ordered, 0.75)
    p90 = _quantile_linear(ordered, 0.90)
    return {
        "mean": round(statistics.mean(ordered), 4),
        "std": round(statistics.stdev(ordered), 4) if len(ordered) >= 2 else 0.0,
        "p10": round(p10, 4),
        "p50_median": round(p50, 4),
        "p90": round(p90, 4),
        "iqr": round(p75 - p25, 4),
    }


def inspect_quantiles_and_extremes(
    analysis: Mapping[str, Any],
    *,
    slot: str = "A",
    top_k: int = 5,
) -> Dict[str, Any]:
    """Compara quantis (P10/P50/P90/IQR) entre 1ª e 2ª metades e detalha os top extremos."""
    resolved_slot, block = _select_slot_block(analysis, slot)
    points = _extract_valid_points(block)
    if len(points) < 8:
        raise ValueError("Série insuficiente para decomposição em quantis (< 8 meses).")

    mid = len(points) // 2
    first_half = points[:mid]
    second_half = points[mid:]

    dist_first_raw = _slice_distribution([p[3] for p in first_half])
    dist_second_raw = _slice_distribution([p[3] for p in second_half])
    dist_first_anom = _slice_distribution([p[2] for p in first_half])
    dist_second_anom = _slice_distribution([p[2] for p in second_half])

    outliers = sorted(
        block.get("outliers_mahalanobis") or [],
        key=lambda item: float(item.get("mahalanobis_d", 0.0)),
        reverse=True,
    )[: max(1, min(10, int(top_k)))]

    extremes_by_abs_anom = sorted(
        points, key=lambda p: abs(p[2]), reverse=True
    )[: max(1, min(10, int(top_k)))]

    return {
        "tool": "inspect_quantiles_and_extremes",
        "slot": resolved_slot,
        "variable_id": block.get("variable_id"),
        "unit": block.get("unit"),
        "scale_type": block.get("scale_type"),
        "allow_percentage_change": bool(block.get("allow_percentage_change", False)),
        "first_half_period": f"{first_half[0][1]}..{first_half[-1][1]}",
        "second_half_period": f"{second_half[0][1]}..{second_half[-1][1]}",
        "raw_first_half": dist_first_raw,
        "raw_second_half": dist_second_raw,
        "anomaly_first_half": dist_first_anom,
        "anomaly_second_half": dist_second_anom,
        "physical_tail_shifts_second_minus_first": {
            "delta_p10": round(dist_second_raw["p10"] - dist_first_raw["p10"], 4),
            "delta_p50_median": round(dist_second_raw["p50_median"] - dist_first_raw["p50_median"], 4),
            "delta_p90": round(dist_second_raw["p90"] - dist_first_raw["p90"], 4),
        },
        "top_mahalanobis_outliers": outliers,
        "top_monthly_anomalies": [
            {
                "date": p[1],
                "anomaly_value": round(p[2], 4),
                "raw_value": round(p[3], 4),
            }
            for p in extremes_by_abs_anom
        ],
    }


def _decode_cells_from_region_id(region_id: Optional[str]) -> List[CellCoord]:
    """Reconstrói coordenadas nativas a partir de `{MODEL}__r{row}_c{col}+...`."""
    if not region_id or "__" not in region_id:
        return []
    model_part, cells_part = region_id.split("__", 1)
    is_ceres = "CERES" in model_part.upper()
    coords: List[CellCoord] = []
    for token in cells_part.split("+"):
        match = _CELL_ID_RE.match(token.strip())
        if not match:
            continue
        row, col = int(match.group(1)), int(match.group(2))
        if is_ceres:
            lat, lon = round(row + 0.5, 4), round(col + 0.5, 4)
        else:
            lat, lon = round(row * 0.5, 4), round(col * 0.625, 4)
        if -90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0:
            coords.append(CellCoord(lat=lat, lon=lon))
    return coords


def fetch_additional_variable_analysis(
    analysis: Mapping[str, Any],
    *,
    variable_id: str,
    target_slot: str = "A",
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    cache: Optional[CellCacheStore] = None,
) -> Dict[str, Any]:
    """Busca nova variável do catálogo via `ingestion_service` e roda `stats_engine` ao vivo."""
    var_code = str(variable_id or "").strip().upper()
    if var_code not in VARIABLE_BY_CODE:
        return {
            "tool": "fetch_additional_variable_analysis",
            "status": "INVALID_VARIABLE",
            "variable_id": var_code,
            "error": f"Variável '{var_code}' não existe no catálogo oficial ({len(VARIABLE_BY_CODE)} variáveis).",
            "sample_valid_codes": sorted(VARIABLE_BY_CODE.keys())[:15],
        }

    spec = get_variable_spec(var_code)
    resolved_slot, base_block = _select_slot_block(analysis, target_slot)

    cells: List[CellCoord] = []
    if lat is not None and lon is not None:
        lat_f, lon_f = float(lat), float(lon)
        if spec.grid_type == "ceres":
            s_lat, s_lon = snap_ceres(lat_f, lon_f)
        else:
            s_lat, s_lon = snap_merra2(lat_f, lon_f)
        cells = [CellCoord(lat=s_lat, lon=s_lon)]
    else:
        comp = analysis.get("comparison_pair") or {}
        region_id_key = "region_b_id" if resolved_slot == "B" else "region_a_id"
        region_id = comp.get(region_id_key) or comp.get("region_a_id")
        cells = _decode_cells_from_region_id(region_id)

    if not cells:
        return {
            "tool": "fetch_additional_variable_analysis",
            "status": "MISSING_COORDINATES",
            "variable_id": var_code,
            "error": "Informe `lat` e `lon` (ou analise regiões com cell_ids MERRA-2/CERES) para buscar nova variável.",
        }

    base_period = base_block.get("period") or {}
    s_date = (start_date or str(base_period.get("start") or "2001-01"))[:7]
    e_date = (end_date or str(base_period.get("end") or "2024-12"))[:7]
    s_year = max(1981, int(s_date[:4]))
    e_year = max(s_year, int(e_date[:4]))

    query = LocationQuery(
        name=f"Copilot-{resolved_slot}",
        cells=cells,
        variable=var_code,
    )
    cache_store = cache or CellCacheStore()
    try:
        fetched = fetch_location_single_variable(
            query, s_year, e_year, cache=cache_store, label=f"Copilot Tool ({var_code})"
        )
    except Exception as exc:
        return {
            "tool": "fetch_additional_variable_analysis",
            "status": "UNAVAILABLE",
            "variable_id": var_code,
            "connector_id": spec.connector_id,
            "error": str(exc),
        }

    if fetched.get("status") != "OK":
        return {
            "tool": "fetch_additional_variable_analysis",
            "status": "UNAVAILABLE",
            "variable_id": var_code,
            "connector_id": spec.connector_id,
            "error": str(fetched.get("error") or fetched.get("status")),
        }

    filtered = {
        ym: val for ym, val in (fetched.get("series") or {}).items() if s_date <= ym <= e_date
    }
    if len(filtered) < 6:
        return {
            "tool": "fetch_additional_variable_analysis",
            "status": "INSUFFICIENT_DATA",
            "variable_id": var_code,
            "n_points": len(filtered),
        }

    dates_sorted = sorted(filtered.keys())
    raw_values = [filtered[d] for d in dates_sorted]
    cat_meta = VARIABLE_CATALOG.get(var_code) or {}
    raw_unit = str(fetched.get("unit") or spec.unit)
    unit = str(
        cat_meta.get("unit")
        or ("fração (0–1)" if raw_unit.lower().startswith("fração") else raw_unit)
    )
    trend_unit = str(
        fetched.get("trend_unit")
        or cat_meta.get("trend_unit")
        or (
            "p.p./década"
            if unit == "%"
            else "fração/década"
            if unit.lower().startswith("fração")
            else f"{unit}/década"
        )
    )
    allow_pct = bool(
        cat_meta["allow_percentage_change"]
        if "allow_percentage_change" in cat_meta
        else spec.allow_percentage_change
    )
    meta = {
        "variable_id": var_code,
        "variable_name": spec.ui_name,
        "scale_type": spec.scale_type,
        "unit": unit,
        "trend_unit": trend_unit,
        "allow_percentage_change": allow_pct,
    }
    new_stats = analyze_single_series(
        var_code, dates_sorted, raw_values, fdr_q_value=None, variable_meta=meta
    )

    pair_vs_base: Optional[Dict[str, Any]] = None
    try:
        comp_pair = compare_regions(
            f"BASE_{resolved_slot}_{base_block.get('variable_id')}",
            f"NEW_{var_code}",
            base_block,
            new_stats,
        )
        pair_vs_base = comp_pair.get("multiscale_correlation")
    except Exception:
        pair_vs_base = None

    return {
        "tool": "fetch_additional_variable_analysis",
        "status": "OK",
        "variable_id": var_code,
        "variable_name": spec.ui_name,
        "connector_id": spec.connector_id,
        "scale_type": spec.scale_type,
        "unit": unit,
        "trend_unit": trend_unit,
        "allow_percentage_change": allow_pct,
        "cache_hits": fetched.get("cache_hits", 0),
        "period": new_stats["period"],
        "regression": new_stats["regression"],
        "correlation_and_coupling": new_stats["correlation_and_coupling"],
        "significance": new_stats["significance"],
        "top_outliers": new_stats["outliers_mahalanobis"][:3],
        "multiscale_vs_selected_region": pair_vs_base,
    }


def run_ml_dynamic_discovery(
    analysis: Mapping[str, Any],
    *,
    slot: str = "A",
    cache: Optional[CellCacheStore] = None,
) -> Dict[str, Any]:
    """Executa o Motor ML Camada 2 (`discover_from_analysis`) para quebra CUSUM, teleconexões parciais ENSO/Atlântico e atribuição Ridge GCV."""
    resolved_slot, primary_block = _select_slot_block(analysis, slot)
    other_key = "region_b_analysis" if resolved_slot == "A" else "region_a_analysis"
    other_block = analysis.get(other_key)
    secondary: Dict[str, Mapping[str, Any]] = {}
    if isinstance(other_block, Mapping) and "variable_id" in other_block:
        o_var = str(other_block["variable_id"])
        if o_var == str(primary_block.get("variable_id")):
            o_var = f"{o_var}_region_{'b' if resolved_slot == 'A' else 'a'}"
        secondary[o_var] = other_block

    cache_dir = cache.cache_dir if cache is not None else DEFAULT_CACHE_DIR
    raw_disc = discover_from_analysis(
        primary_block,
        secondary_analyses=secondary or None,
        cache_dir=cache_dir,
    )
    tel = raw_disc.get("partial_teleconnections") or {}
    attr = raw_disc.get("fast_gcv_physical_attribution") or {}
    outliers = raw_disc.get("attributed_mahalanobis_outliers") or []

    return {
        "tool": "run_ml_dynamic_discovery",
        "status": "OK",
        "slot": resolved_slot,
        "discovery_meta": raw_disc.get("discovery_meta"),
        "regime_and_gam_geometry": raw_disc.get("regime_and_gam_geometry"),
        "partial_teleconnections": {
            "status": tel.get("status"),
            "total_tests": tel.get("total_tests", 0),
            "significant_partial_fdr05_count": tel.get("significant_partial_fdr05_count", 0),
            "significant_strict_both_fdr05_count": tel.get("significant_strict_both_fdr05_count", 0),
            "top_teleconnections": (tel.get("top_teleconnections") or [])[:5],
        },
        "fast_gcv_physical_attribution": {
            **attr,
            "drivers_ranked": (attr.get("drivers_ranked") or [])[:6],
        },
        "attributed_mahalanobis_outliers": outliers[:6],
    }


_TOOL_REGISTRY: Dict[str, Dict[str, Any]] = {
    "run_subperiod_or_regime_split": {
        "fn": run_subperiod_or_regime_split,
        "label_pt": "Subperíodo / Quebra de Regime",
        "label_en": "Subperiod / Regime Split",
    },
    "run_sensitivity_without_outliers": {
        "fn": run_sensitivity_without_outliers,
        "label_pt": "Robustez sem Outliers (D_M > 2,5)",
        "label_en": "Sensitivity Excluding Outliers",
    },
    "compute_seasonal_stratified_trends": {
        "fn": compute_seasonal_stratified_trends,
        "label_pt": "Decomposição Sazonal (DJF–SON)",
        "label_en": "Seasonal Stratified Trends",
    },
    "compute_lagged_crosscorrelation_ar1": {
        "fn": compute_lagged_crosscorrelation_ar1,
        "label_pt": "Correlação Cruzada com Lag (AR1)",
        "label_en": "Lagged Cross-Correlation (AR1)",
    },
    "inspect_quantiles_and_extremes": {
        "fn": inspect_quantiles_and_extremes,
        "label_pt": "Quantis P10/P50/P90 e Caudas",
        "label_en": "Quantiles & Tail Extremes",
    },
    "fetch_additional_variable_analysis": {
        "fn": fetch_additional_variable_analysis,
        "label_pt": "Busca ao Vivo de Nova Variável",
        "label_en": "Live Additional Variable Fetch",
    },
    "run_ml_dynamic_discovery": {
        "fn": run_ml_dynamic_discovery,
        "label_pt": "Descoberta ML (CUSUM, Teleconexões & Ridge GCV)",
        "label_en": "ML Discovery (CUSUM, Teleconnections & Ridge GCV)",
    },
}


def get_gemini_tool_declarations() -> List[Dict[str, Any]]:
    """Declarações JSON Schema no formato oficial `functionDeclarations` da Gemini API."""
    return [
        {
            "name": "run_subperiod_or_regime_split",
            "description": (
                "Re-run OLS, Theil-Sen, GAM B2 acceleration, and AR(1) significance on a specific "
                "date slice [start_date, end_date] OR split before/after a pivot YYYY-MM date to test regime shifts."
            ),
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "slot": {"type": "STRING", "description": "Target region slot: 'A' or 'B'."},
                    "start_date": {"type": "STRING", "description": "Optional start YYYY-MM filter."},
                    "end_date": {"type": "STRING", "description": "Optional end YYYY-MM filter."},
                    "split_date": {
                        "type": "STRING",
                        "description": "Pivot YYYY-MM to compare before vs. after (e.g., '2015-01').",
                    },
                },
            },
        },
        {
            "name": "run_sensitivity_without_outliers",
            "description": (
                "Remove Mahalanobis D_M extreme points and/or specific anomalous years/months "
                "(e.g., El Nino 2015-2016) and recompute OLS, Theil-Sen, AR(1) p-value, and B2."
            ),
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "slot": {"type": "STRING", "description": "Target region slot: 'A' or 'B'."},
                    "mahalanobis_threshold": {
                        "type": "NUMBER",
                        "description": "Minimum D_M distance to exclude (default 2.5).",
                    },
                    "exclude_dates": {
                        "type": "ARRAY",
                        "items": {"type": "STRING"},
                        "description": "Optional explicit YYYY-MM dates to exclude.",
                    },
                    "exclude_years": {
                        "type": "ARRAY",
                        "items": {"type": "INTEGER"},
                        "description": "Optional full years to exclude (e.g., [2015, 2016]).",
                    },
                },
            },
        },
        {
            "name": "compute_seasonal_stratified_trends",
            "description": (
                "Stratify the climatological anomaly series into DJF, MAM, JJA, and SON seasons "
                "and compute Theil-Sen, OLS, and AR(1) significance per season."
            ),
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "slot": {"type": "STRING", "description": "Target region slot: 'A' or 'B'."},
                },
            },
        },
        {
            "name": "compute_lagged_crosscorrelation_ar1",
            "description": (
                "Compute lagged Pearson cross-correlation between Region A and Region B for lags "
                "[-max_lag, +max_lag] months on both raw and linear-detrended anomalies with AR(1) N_eff correction."
            ),
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "max_lag": {
                        "type": "INTEGER",
                        "description": "Maximum month lag to scan symmetrically (1 to 12, default 6).",
                    },
                },
            },
        },
        {
            "name": "inspect_quantiles_and_extremes",
            "description": (
                "Compare P10, P50 (median), P90, IQR distribution shifts between first and second halves "
                "plus top Mahalanobis outliers and extreme monthly anomalies."
            ),
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "slot": {"type": "STRING", "description": "Target region slot: 'A' or 'B'."},
                    "top_k": {"type": "INTEGER", "description": "Number of top extremes (1 to 10)."},
                },
            },
        },
        {
            "name": "fetch_additional_variable_analysis",
            "description": (
                "Fetch a complementary variable from the 42-variable catalog (NASA POWER, Open-Meteo Flood, "
                "NOAA, AppEEARS, Giovanni) for the selected region or lat/lon and run stats_engine + multiscale comparison."
            ),
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "variable_id": {
                        "type": "STRING",
                        "description": "Catalog variable code, e.g. T2M, PRECTOTCORR, CLDTOT, GWETROOT, ALLSKY_SFC_SW_DWN.",
                    },
                    "target_slot": {
                        "type": "STRING",
                        "description": "Region geometry to reuse ('A' or 'B') if lat/lon omitted.",
                    },
                    "lat": {"type": "NUMBER", "description": "Optional custom latitude."},
                    "lon": {"type": "NUMBER", "description": "Optional custom longitude."},
                    "start_date": {"type": "STRING", "description": "Optional YYYY-MM start date."},
                    "end_date": {"type": "STRING", "description": "Optional YYYY-MM end date."},
                },
                "required": ["variable_id"],
            },
        },
        {
            "name": "run_ml_dynamic_discovery",
            "description": (
                "Run Layer 2 dynamic ML discovery (<50ms): 2-stage AR(1)-adjusted CUSUM regime break detection "
                "and hinge/curvature forensics, partial ocean teleconnection scan (ENSO/Atlantic with BH-FDR), "
                "detrended Ridge GCV + purged CV driver attribution, and ocean-phase tagging of Mahalanobis extremes."
            ),
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "slot": {"type": "STRING", "description": "Target region slot: 'A' or 'B'."},
                },
            },
        },
    ]


def _summarize_tool_execution(
    name: str, result: Mapping[str, Any], lang: str
) -> str:
    if result.get("status") in {"UNAVAILABLE", "INVALID_VARIABLE", "MISSING_COORDINATES", "INSUFFICIENT_DATA"}:
        err = str(result.get("error") or result.get("status"))
        return err[:110]

    if name == "run_subperiod_or_regime_split":
        if result.get("mode") == "subperiod_window":
            sub = result["subperiod"]
            return (
                f"{sub['start']}..{sub['end']}: Sen={sub['slope_per_decade_sen']:+.3f} "
                f"(p_AR1={sub['p_value_ar1_corrected']:.4f})"
            )
        shift = float(result.get("slope_sen_shift_after_minus_before", 0.0))
        return (
            f"Pivot {result.get('split_date')}: ΔSen={shift:+.3f}"
            if lang == "pt"
            else f"Split {result.get('split_date')}: ΔSen={shift:+.3f}"
        )

    if name == "run_sensitivity_without_outliers":
        filt = result["filtered"]
        return (
            f"-{result['excluded_count']} pts: Sen={filt['slope_per_decade_sen']:+.3f}, "
            f"p_AR1={filt['p_value_ar1_corrected']:.4f}"
        )

    if name == "compute_seasonal_stratified_trends":
        dom = result.get("dominant_season")
        if dom and dom in (result.get("seasons") or {}):
            s_val = result["seasons"][dom]
            return f"Dominante {dom}: Sen={s_val['slope_per_decade_sen']:+.3f}"
        return "4 trimestres"

    if name == "compute_lagged_crosscorrelation_ar1":
        best = result.get("best_detrended_lag") or {}
        return f"Lag*={best.get('lag_months')}m (r_det={best.get('r_detrended', 0):+.3f})"

    if name == "inspect_quantiles_and_extremes":
        deltas = result.get("physical_tail_shifts_second_minus_first") or {}
        return f"ΔP50={deltas.get('delta_p50_median', 0):+.3f} · ΔP90={deltas.get('delta_p90', 0):+.3f}"

    if name == "fetch_additional_variable_analysis":
        reg = result.get("regression") or {}
        return f"{result.get('variable_id')}: Sen={float(reg.get('slope_per_decade_sen', 0)):+.3f}"

    if name == "run_ml_dynamic_discovery":
        geom = result.get("regime_and_gam_geometry") or {}
        tel = result.get("partial_teleconnections") or {}
        brk = geom.get("break_date") if geom.get("cusum_break_detected") else "sem quebra"
        return (
            f"{geom.get('forensic_regime_diagnosis', 'OK')} (CUSUM={brk}) · "
            f"FDR tel={tel.get('significant_strict_both_fdr05_count', 0)}"
        )

    return "OK"


def execute_copilot_tool(
    name: str,
    args: Optional[Mapping[str, Any]],
    analysis: Mapping[str, Any],
    *,
    cache: Optional[CellCacheStore] = None,
    language: str = "pt",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Executa uma ferramenta científica registrada retornando (payload_json, metadado_auditoria)."""
    lang = "en" if str(language).lower().startswith("en") else "pt"
    entry = _TOOL_REGISTRY.get(name)
    if entry is None:
        err_payload = {"error": f"Ferramenta desconhecida: {name}"}
        meta = {
            "name": name,
            "label": name,
            "summary": err_payload["error"],
            "status": "error",
            "duration_ms": 0.0,
        }
        return err_payload, meta

    clean_args = dict(args or {})
    t_start = time.perf_counter()
    fn: Callable[..., Dict[str, Any]] = entry["fn"]
    try:
        if name in {"fetch_additional_variable_analysis", "run_ml_dynamic_discovery"}:
            clean_args["cache"] = cache
        result = fn(analysis, **clean_args)
        duration_ms = round((time.perf_counter() - t_start) * 1000.0, 2)
        status = "unavailable" if result.get("status") in {"UNAVAILABLE", "INVALID_VARIABLE", "MISSING_COORDINATES"} else "ok"
        meta = {
            "name": name,
            "label": entry["label_en"] if lang == "en" else entry["label_pt"],
            "summary": _summarize_tool_execution(name, result, lang),
            "status": status,
            "duration_ms": duration_ms,
        }
        return result, meta
    except Exception as exc:
        duration_ms = round((time.perf_counter() - t_start) * 1000.0, 2)
        err_payload = {"tool": name, "status": "ERROR", "error": str(exc)}
        meta = {
            "name": name,
            "label": entry["label_en"] if lang == "en" else entry["label_pt"],
            "summary": str(exc)[:110],
            "status": "error",
            "duration_ms": duration_ms,
        }
        return err_payload, meta
