"""Dynamic Scientific Discovery Engine (Camada 2) — Earth System Trend Detective.

Provides sub-50ms algebraic discovery on top of `backend/stats_engine.py` outputs for ANY
user-selected map region or time series (`POST /api/discover`):
  1. Vectorized Partial Teleconnection Scan conditioned on Z_total(tau, k) = {t, Y_{t-tau}, Nino3.4_{t-tau}}
     with Bretherton AR(1) effective degrees of freedom (df_eff = N_eff(e_X, e_Y) - 2 - |Z|) and BH-FDR.
  2. Structural Regime Break Detection (AR(1)-scaled Brownian Bridge CUSUM on Sen residuals) +
     1st/2nd derivative geometry of the Penalized GAM curve (Doc 04 forensic regime classification).
  3. Closed-Form SVD Ridge / GCV Physical Attribution & Coupling Break Detection (zero CV block-boundary bias).
  4. Forensic Mahalanobis Outlier Attribution against lagged Pacific (ENSO) and Atlantic Dipole indices.
"""

from __future__ import annotations

import math
import time
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

import numpy as np
from scipy import stats as sps

from backend.stats_engine import (
    SemanticContractError,
    analyze_single_series,
    apply_spatial_fdr_bh,
)
from data.cache.store import CellCacheStore
from data.connectors.base import snap_ceres, snap_merra2
from data.models.contracts import CellCoord, LocationQuery
from data.services.ingestion_service import fetch_location_multiple_variables

ROOT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_CACHE_DIR = ROOT_DIR / "data" / "cache" / "storage"

OCEAN_LAGS: Tuple[int, ...] = (1, 2, 3, 4, 6)
OCEAN_MERRA2_VARS = ["TS"]
OCEAN_CERES_VARS = ["CLOUD_AMT", "ALLSKY_SFC_SW_DWN", "CLRSKY_SFC_SW_DWN"]
OCEAN_VARS = OCEAN_MERRA2_VARS + OCEAN_CERES_VARS

OCEAN_BOX_SPECS: List[Dict[str, Any]] = [
    {
        "id": "pac_nino34",
        "name": "Pacífico Equatorial Niño 3.4",
        "box_cells": [(-3.0, -160.0), (-3.0, -135.0), (3.0, -160.0), (3.0, -135.0)],
    },
    {
        "id": "atl_ne",
        "name": "Atlântico Sul-Equatorial Nordeste (Box NE)",
        "box_cells": [(-5.5, -33.125), (-5.5, -30.625), (-3.5, -33.125), (-3.5, -30.625)],
    },
    {
        "id": "atl_tn",
        "name": "Atlântico Tropical Norte (Dipolo Norte)",
        "box_cells": [(11.5, -43.75), (11.5, -38.75), (14.5, -43.75), (14.5, -38.75)],
    },
    {
        "id": "atl_s",
        "name": "Atlântico Subtropical Sul (SW Atlântico)",
        "box_cells": [(-29.5, -43.75), (-29.5, -40.00), (-26.5, -43.75), (-26.5, -40.00)],
    },
]

# In-memory singleton cache for ocean anomaly series so `POST /api/discover` runs in <15ms
_OCEAN_MEMORY_CACHE: Dict[str, Any] = {}


def _lag1_autocorr(arr: np.ndarray) -> float:
    if len(arr) < 4:
        return 0.0
    s0 = float(np.std(arr[:-1]))
    s1 = float(np.std(arr[1:]))
    if s0 < 1e-12 or s1 < 1e-12:
        return 0.0
    rho = float(np.corrcoef(arr[:-1], arr[1:])[0, 1])
    return float(np.clip(rho, -0.95, 0.95)) if math.isfinite(rho) else 0.0


def _detrend_linear(arr: np.ndarray) -> np.ndarray:
    n = len(arr)
    if n < 4 or float(np.std(arr)) < 1e-12:
        return arr.copy()
    t = np.arange(n, dtype=np.float64)
    slope, intercept = np.polyfit(t, arr, 1)
    return arr - (slope * t + intercept)


def _ar1_pearson_test(x: np.ndarray, y: np.ndarray, n_cond_vars: int = 0) -> Dict[str, float]:
    """Pearson correlation with Bretherton et al. (1999) AR(1) N_eff and df_eff = N_eff - 2 - |Z|."""
    n = len(x)
    if n < 6 + n_cond_vars or float(np.std(x)) < 1e-12 or float(np.std(y)) < 1e-12:
        return {
            "r": 0.0,
            "n_pairs": float(n),
            "n_eff": float(n),
            "df_eff": max(1.0, float(n - 2 - n_cond_vars)),
            "p_value_ar1": 1.0,
        }
    r = float(np.corrcoef(x, y)[0, 1])
    if not math.isfinite(r):
        return {
            "r": 0.0,
            "n_pairs": float(n),
            "n_eff": float(n),
            "df_eff": max(1.0, float(n - 2 - n_cond_vars)),
            "p_value_ar1": 1.0,
        }
    rho_x = _lag1_autocorr(x)
    rho_y = _lag1_autocorr(y)
    prod = rho_x * rho_y
    n_eff = n * (1.0 - prod) / (1.0 + prod) if prod > 0.0 else float(n)
    n_eff = max(float(3 + n_cond_vars), min(float(n), n_eff))
    df_eff = max(1.0, n_eff - 2.0 - float(n_cond_vars))
    r_clamped = max(-0.999999, min(0.999999, r))
    t_stat = r_clamped * math.sqrt(df_eff / max(1e-12, 1.0 - r_clamped * r_clamped))
    p_val = float(sps.t.sf(abs(t_stat), df=df_eff) * 2.0)
    return {
        "r": r,
        "n_pairs": float(n),
        "n_eff": n_eff,
        "df_eff": df_eff,
        "p_value_ar1": min(1.0, max(0.0, p_val)),
    }


def _ar1_partial_correlation_test(
    x: np.ndarray,
    y: np.ndarray,
    z_cols: Sequence[np.ndarray],
) -> Dict[str, float]:
    """Partial correlation r(X, Y | Z) via orthogonal OLS projection and AR(1) df_eff."""
    n = len(x)
    k_cond = len(z_cols)
    if n < 8 + k_cond or float(np.std(x)) < 1e-12 or float(np.std(y)) < 1e-12:
        return {
            "r": 0.0,
            "n_pairs": float(n),
            "n_eff": float(n),
            "df_eff": 1.0,
            "p_value_ar1": 1.0,
        }
    Z = np.column_stack(
        [np.ones(n, dtype=np.float64)] + [np.asarray(col, dtype=np.float64) for col in z_cols]
    )
    beta_x, _, _, _ = np.linalg.lstsq(Z, x, rcond=None)
    beta_y, _, _, _ = np.linalg.lstsq(Z, y, rcond=None)
    e_x = x - Z @ beta_x
    e_y = y - Z @ beta_y
    return _ar1_pearson_test(e_x, e_y, n_cond_vars=k_cond)


def _deseasonalize_series_map(raw_map: Mapping[str, float]) -> Dict[str, float]:
    """Subtracts calendar-month means from a {YYYY-MM: val} dictionary."""
    buckets: Dict[int, List[float]] = {m: [] for m in range(1, 13)}
    for ym, val in raw_map.items():
        if val is None or not math.isfinite(float(val)):
            continue
        m = int(ym[5:7])
        buckets[m].append(float(val))
    means = {m: (float(np.mean(b)) if b else 0.0) for m, b in buckets.items()}
    return {
        ym: float(val) - means[int(ym[5:7])]
        for ym, val in raw_map.items()
        if val is not None and math.isfinite(float(val))
    }


def _read_cached_power_box(
    store: CellCacheStore,
    box_cells: Sequence[Tuple[float, float]],
    variables: Sequence[str],
    year_ranges: Sequence[Tuple[int, int]],
    *,
    is_ceres: bool,
) -> Dict[str, Dict[str, float]]:
    """Reads pre-warmed NASA POWER ocean box cells directly from disk cache without network calls."""
    snap_fn = snap_ceres if is_ceres else snap_merra2
    snapped: List[Tuple[float, float]] = []
    seen = set()
    for lat, lon in box_cells:
        slat, slon = snap_fn(float(lat), float(lon))
        if (slat, slon) not in seen:
            seen.add((slat, slon))
            snapped.append((slat, slon))

    out: Dict[str, Dict[str, float]] = {}
    for var in variables:
        chosen_buckets: Dict[str, List[float]] = {}
        for y0, y1 in year_ranges:
            buckets: Dict[str, List[float]] = {}
            hit_any = False
            for slat, slon in snapped:
                cached = store.get("nasa_power", var, slat, slon, y0, y1, "AG")
                if cached and cached.get("series"):
                    hit_any = True
                    for ym, val in cached["series"].items():
                        if val is not None and math.isfinite(float(val)):
                            buckets.setdefault(ym, []).append(float(val))
            if hit_any:
                chosen_buckets = buckets
                break
        if chosen_buckets:
            out[var] = {
                ym: float(np.mean(vals))
                for ym, vals in sorted(chosen_buckets.items())
                if vals
            }
    return out


def load_cached_ocean_anomalies(
    cache_dir: Path = DEFAULT_CACHE_DIR,
    start_year: int = 2001,
    end_year: int = 2025,
    allow_network: bool = False,
) -> Dict[str, Dict[str, Dict[str, float]]]:
    """Loads ocean box anomaly dictionaries `{box_id: {var: {YYYY-MM: anom}}}` with RAM memoization."""
    cache_key = f"{cache_dir.resolve()}:{start_year}:{end_year}"
    if cache_key in _OCEAN_MEMORY_CACHE:
        return _OCEAN_MEMORY_CACHE[cache_key]

    if not cache_dir.exists() and not allow_network:
        return {}

    store = CellCacheStore(cache_dir)
    ocean_anom: Dict[str, Dict[str, Dict[str, float]]] = {}
    fallback_ranges = list(dict.fromkeys([(start_year, end_year), (2001, end_year), (1981, end_year)]))

    for oc in OCEAN_BOX_SPECS:
        box_id = str(oc["id"])
        ocean_anom[box_id] = {}
        if not allow_network:
            merra_raw = _read_cached_power_box(
                store, oc["box_cells"], OCEAN_MERRA2_VARS, fallback_ranges, is_ceres=False
            )
            ceres_raw = _read_cached_power_box(
                store, oc["box_cells"], OCEAN_CERES_VARS, fallback_ranges, is_ceres=True
            )
            for var, ser in {**merra_raw, **ceres_raw}.items():
                if ser:
                    ocean_anom[box_id][var] = _deseasonalize_series_map(ser)
            continue

        box_cells = [CellCoord(lat=float(lat), lon=float(lon)) for lat, lon in oc["box_cells"]]
        combined_vars: Dict[str, Any] = {}
        try:
            res_merra = fetch_location_multiple_variables(
                LocationQuery(name=f"{oc['name']} [MERRA-2]", cells=box_cells, variables=OCEAN_MERRA2_VARS),
                start_year,
                end_year,
                cache=store,
                label=f"{oc['name']} (MERRA-2)",
            )
            res_ceres = fetch_location_multiple_variables(
                LocationQuery(name=f"{oc['name']} [CERES]", cells=box_cells, variables=OCEAN_CERES_VARS),
                max(2001, start_year),
                end_year,
                cache=store,
                label=f"{oc['name']} (CERES)",
            )
            combined_vars.update(res_merra.get("variables", {}))
            combined_vars.update(res_ceres.get("variables", {}))
        except Exception:
            continue

        for var in OCEAN_VARS:
            payload = combined_vars.get(var, {})
            if payload.get("status") == "OK" and payload.get("series"):
                ocean_anom[box_id][var] = _deseasonalize_series_map(payload["series"])

    ocean_anom = {k: v for k, v in ocean_anom.items() if v}

    # Compute Atlantic Meridional Gradient (atl_tn.TS - atl_s.TS)
    tn_ts = ocean_anom.get("atl_tn", {}).get("TS", {})
    s_ts = ocean_anom.get("atl_s", {}).get("TS", {})
    if tn_ts and s_ts:
        common_ym = sorted(set(tn_ts.keys()).intersection(s_ts.keys()))
        ocean_anom["atl_meridional_grad"] = {
            "TS": {ym: tn_ts[ym] - s_ts[ym] for ym in common_ym}
        }

    if ocean_anom:
        _OCEAN_MEMORY_CACHE[cache_key] = ocean_anom
    return ocean_anom


def detect_regime_and_gam_geometry(
    dates: Sequence[str],
    y_anom: Sequence[Optional[float]],
    sen_fit: Sequence[Optional[float]],
    gam_fit: Sequence[Optional[float]],
    *,
    min_segment_months: int = 24,
) -> Dict[str, Any]:
    """Detects structural break t*_regime via AR(1) CUSUM and analyzes GAM 1st/2nd derivatives."""
    valid = [
        (d, float(a), float(s), float(g))
        for d, a, s, g in zip(dates, y_anom, sen_fit, gam_fit)
        if a is not None and s is not None and g is not None
    ]
    n = len(valid)
    if n <= 2 * min_segment_months:
        return {
            "cusum_break_detected": False,
            "break_date": None,
            "forensic_regime_diagnosis": "INSUFFICIENT_SAMPLE_LENGTH",
        }

    v_dates = [item[0] for item in valid]
    anom = np.asarray([item[1] for item in valid], dtype=np.float64)
    sen = np.asarray([item[2] for item in valid], dtype=np.float64)
    gam = np.asarray([item[3] for item in valid], dtype=np.float64)

    resid_sen = anom - sen
    sigma = max(1e-9, float(np.std(resid_sen)))
    rho1 = _lag1_autocorr(resid_sen)
    eff_sigma = sigma * math.sqrt((1.0 + max(0.0, rho1)) / max(1e-6, 1.0 - max(0.0, rho1)))

    centered = resid_sen - float(np.mean(resid_sen))
    cusum = np.cumsum(centered) / (eff_sigma * math.sqrt(float(n)))
    interior = np.abs(cusum[min_segment_months : n - min_segment_months])
    rel_idx = int(np.argmax(interior)) + min_segment_months
    peak_stat = float(abs(cusum[rel_idx]))
    p_bridge = min(1.0, max(0.0, 2.0 * math.exp(-2.0 * peak_stat * peak_stat)))
    break_detected = bool(peak_stat >= 1.358)

    # First and second derivatives of GAM smooth trajectory expressed per decade (dt = 1/120 decade)
    dt_dec = 1.0 / 120.0
    gam_d1 = np.gradient(gam, dt_dec)
    gam_d2 = np.gradient(gam_d1, dt_dec)

    pre_d1 = float(np.mean(gam_d1[:rel_idx]))
    post_d1 = float(np.mean(gam_d1[rel_idx:]))
    inflect_idx = int(np.argmax(np.abs(gam_d2[min_segment_months : n - min_segment_months]))) + min_segment_months

    # Forensic diagnosis of curve geometry (Doc 04)
    if break_detected and (pre_d1 * post_d1 < 0.0):
        diagnosis = "PHASE_REVERSAL_OR_HUMP_REGIME"
    elif break_detected and abs(post_d1) > 1.35 * max(1e-6, abs(pre_d1)):
        diagnosis = "PERSISTENT_ACCELERATING_REGIME_RAMP"
    elif break_detected:
        diagnosis = "STRUCTURAL_MEAN_SHIFT"
    elif abs(post_d1) < 0.65 * abs(pre_d1) and abs(pre_d1) > 1e-4:
        diagnosis = "SATURATING_DISSIPATIVE_TRAJECTORY"
    else:
        diagnosis = "QUASI_LINEAR_SECULAR_REGIME"

    return {
        "cusum_break_detected": break_detected,
        "break_date": v_dates[rel_idx],
        "cusum_max_stat": round(peak_stat, 4),
        "p_value_ar1_bridge": round(p_bridge, 6),
        "pre_break_mean_anom": round(float(np.mean(anom[:rel_idx])), 4),
        "post_break_mean_anom": round(float(np.mean(anom[rel_idx:])), 4),
        "pre_break_gam_slope_decade": round(pre_d1, 4),
        "post_break_gam_slope_decade": round(post_d1, 4),
        "max_curvature_inflection_date": v_dates[inflect_idx],
        "max_curvature_d2_decade2": round(float(gam_d2[inflect_idx]), 4),
        "forensic_regime_diagnosis": diagnosis,
    }


def scan_dynamic_partial_teleconnections(
    target_var_id: str,
    dates: Sequence[str],
    y_anom: Sequence[Optional[float]],
    ocean_anom_map: Mapping[str, Mapping[str, Mapping[str, float]]],
    *,
    lags: Sequence[int] = OCEAN_LAGS,
) -> Dict[str, Any]:
    """Executes <15ms vectorized partial correlation scan conditioned on Z_total(tau, k) = {t, Y_{t-tau}, Nino3.4_{t-tau}}."""
    target_lookup = {
        d: float(v)
        for d, v in zip(dates, y_anom)
        if v is not None and math.isfinite(float(v))
    }
    if len(target_lookup) < 36 or not ocean_anom_map:
        return {
            "status": "INSUFFICIENT_DATA_OR_OCEAN_CACHE",
            "total_tests": 0,
            "significant_partial_fdr05_count": 0,
            "top_teleconnections": [],
        }

    nino34_ts_map = ocean_anom_map.get("pac_nino34", {}).get("TS", {})
    sorted_target_dates = sorted(target_lookup.keys())

    # Contiguous integer month mapping for O(1) lag alignment
    ym_list: List[str] = sorted_target_dates
    ym_to_pos = {ym: idx for idx, ym in enumerate(ym_list)}
    month_idx_to_pos: Dict[int, int] = {}
    for pos, ym in enumerate(ym_list):
        m_abs = int(ym[:4]) * 12 + (int(ym[5:7]) - 1)
        month_idx_to_pos[m_abs] = pos
    y_vec = np.asarray([target_lookup[ym] for ym in ym_list], dtype=np.float64)
    n_tot = len(ym_list)

    # Precompute target lag pairs once per lag
    lag_maps: Dict[int, Tuple[np.ndarray, np.ndarray]] = {}
    for lag in lags:
        cur_indices: List[int] = []
        lag_indices: List[int] = []
        for pos, ym in enumerate(ym_list):
            m_abs = int(ym[:4]) * 12 + (int(ym[5:7]) - 1)
            lag_pos = month_idx_to_pos.get(m_abs - lag)
            if lag_pos is not None:
                cur_indices.append(pos)
                lag_indices.append(lag_pos)
        if len(cur_indices) >= 24:
            lag_maps[int(lag)] = (
                np.asarray(cur_indices, dtype=np.int64),
                np.asarray(lag_indices, dtype=np.int64),
            )

    def _fast_corr_stats(x: np.ndarray, y: np.ndarray, n_cond_vars: int = 0) -> Tuple[float, float, float, float]:
        m = len(x)
        if m < 6 + n_cond_vars:
            return 0.0, float(m), max(1.0, float(m - 2 - n_cond_vars)), 0.0
        xc = x - np.mean(x)
        yc = y - np.mean(y)
        sx = float(np.sqrt(np.dot(xc, xc)))
        sy = float(np.sqrt(np.dot(yc, yc)))
        if sx < 1e-12 or sy < 1e-12:
            return 0.0, float(m), max(1.0, float(m - 2 - n_cond_vars)), 0.0
        r = float(np.dot(xc, yc) / (sx * sy))
        rho_x = _lag1_autocorr(x)
        rho_y = _lag1_autocorr(y)
        prod = rho_x * rho_y
        n_eff = m * (1.0 - prod) / (1.0 + prod) if prod > 0.0 else float(m)
        n_eff = max(float(3 + n_cond_vars), min(float(m), n_eff))
        df_eff = max(1.0, n_eff - 2.0 - float(n_cond_vars))
        r_clamped = max(-0.999999, min(0.999999, r))
        t_stat = abs(r_clamped) * math.sqrt(df_eff / max(1e-12, 1.0 - r_clamped * r_clamped))
        return r, n_eff, df_eff, t_stat

    def _fast_detrend(arr: np.ndarray) -> np.ndarray:
        m = len(arr)
        t_lin = np.arange(m, dtype=np.float64)
        tm = 0.5 * (m - 1)
        tc = t_lin - tm
        denom = float(np.dot(tc, tc))
        if denom < 1e-12:
            return arr.copy()
        slope = float(np.dot(tc, arr - np.mean(arr)) / denom)
        intercept = float(np.mean(arr)) - slope * tm
        return arr - (slope * t_lin + intercept)

    nino_aligned = np.full(n_tot, np.nan, dtype=np.float64)
    for ym, val in nino34_ts_map.items():
        pos = ym_to_pos.get(ym)
        if pos is not None:
            nino_aligned[pos] = float(val)

    tests: List[Dict[str, Any]] = []
    det_t_stats: List[float] = []
    det_dfs: List[float] = []
    part_t_stats: List[float] = []
    part_dfs: List[float] = []

    for box_id, var_dict in ocean_anom_map.items():
        for oc_var, oc_series in var_dict.items():
            oc_aligned = np.full(n_tot, np.nan, dtype=np.float64)
            for ym, val in oc_series.items():
                pos = ym_to_pos.get(ym)
                if pos is not None:
                    oc_aligned[pos] = float(val)

            for lag, (cur_idx, lag_idx) in lag_maps.items():
                x_cand = oc_aligned[lag_idx]
                valid_mask = np.isfinite(x_cand)
                if box_id != "pac_nino34":
                    nino_cand = nino_aligned[lag_idx]
                    valid_mask &= np.isfinite(nino_cand)

                n_pairs = int(np.sum(valid_mask))
                if n_pairs < 24:
                    continue

                x_arr = x_cand[valid_mask]
                y_arr = y_vec[cur_idx[valid_mask]]
                y_lag_arr = y_vec[lag_idx[valid_mask]]
                t_arr = np.arange(n_pairs, dtype=np.float64)

                if box_id == "pac_nino34":
                    Z = np.column_stack([np.ones(n_pairs, dtype=np.float64), t_arr, y_lag_arr])
                    cond_labels = ["t", f"{target_var_id}_t-{lag}"]
                    k_cond = 2
                else:
                    nino_arr = nino_cand[valid_mask]
                    Z = np.column_stack([np.ones(n_pairs, dtype=np.float64), t_arr, y_lag_arr, nino_arr])
                    cond_labels = ["t", f"{target_var_id}_t-{lag}", f"pac_nino34.TS_t-{lag}"]
                    k_cond = 3

                anom_r, _, _, _ = _fast_corr_stats(x_arr, y_arr, n_cond_vars=0)
                det_r, _, det_df, det_t = _fast_corr_stats(
                    _fast_detrend(x_arr), _fast_detrend(y_arr), n_cond_vars=0
                )

                # Simultaneous orthogonal projection via QR/lstsq on [x_arr, y_arr]
                XY = np.column_stack([x_arr, y_arr])
                beta_xy, _, _, _ = np.linalg.lstsq(Z, XY, rcond=None)
                E_xy = XY - Z @ beta_xy
                part_r, part_neff, part_df, part_t = _fast_corr_stats(
                    E_xy[:, 0], E_xy[:, 1], n_cond_vars=k_cond
                )

                det_t_stats.append(det_t)
                det_dfs.append(det_df)
                part_t_stats.append(part_t)
                part_dfs.append(part_df)
                tests.append(
                    {
                        "ocean_box_id": box_id,
                        "ocean_var": oc_var,
                        "lag_months": lag,
                        "n_pairs": n_pairs,
                        "conditioning_set": cond_labels,
                        "anomaly_r": round(anom_r, 4),
                        "detrended_r": round(det_r, 4),
                        "partial_r": round(part_r, 4),
                        "partial_n_eff_ar1": round(part_neff, 2),
                        "partial_df_eff": round(part_df, 2),
                    }
                )

    if not tests:
        return {
            "status": "NO_OVERLAPPING_OCEAN_DATA",
            "total_tests": 0,
            "significant_partial_fdr05_count": 0,
            "top_teleconnections": [],
        }

    # Single vectorized SciPy Student-t survival evaluation for all tests at once
    det_p_vals = np.clip(sps.t.sf(np.asarray(det_t_stats), df=np.asarray(det_dfs)) * 2.0, 0.0, 1.0)
    part_p_vals = np.clip(sps.t.sf(np.asarray(part_t_stats), df=np.asarray(part_dfs)) * 2.0, 0.0, 1.0)

    q_det, sig_det = apply_spatial_fdr_bh(det_p_vals.tolist(), alpha=0.05)
    q_part, sig_part = apply_spatial_fdr_bh(part_p_vals.tolist(), alpha=0.05)

    for test, dp, qd, sd, pp, qp, sp in zip(
        tests, det_p_vals, q_det, sig_det, part_p_vals, q_part, sig_part
    ):
        test["detrended_p_ar1"] = round(float(dp), 8)
        test["detrended_fdr_q"] = round(float(qd), 8)
        test["is_detrended_sig_fdr05"] = bool(sd)
        test["partial_p_ar1"] = round(float(pp), 8)
        test["partial_fdr_q"] = round(float(qp), 8)
        test["is_partial_sig_fdr05"] = bool(sp)
        test["is_strictly_coupled_fdr05"] = bool(sd and sp)

    tests.sort(key=lambda item: (item["is_strictly_coupled_fdr05"], abs(item["partial_r"])), reverse=True)
    sig_count = sum(1 for t in tests if t["is_partial_sig_fdr05"])
    strict_count = sum(1 for t in tests if t["is_strictly_coupled_fdr05"])

    return {
        "status": "OK",
        "total_tests": len(tests),
        "significant_partial_fdr05_count": sig_count,
        "significant_strict_both_fdr05_count": strict_count,
        "top_teleconnections": tests[:10],
    }


def compute_fast_gcv_physical_attribution(
    dates: Sequence[str],
    y_anom: Sequence[Optional[float]],
    predictor_anomalies: Mapping[str, Sequence[Optional[float]]],
) -> Dict[str, Any]:
    """Closed-form SVD Ridge attribution with analytical GCV residuals & boundary-free CUSUM break detection."""
    if not predictor_anomalies:
        return {"status": "NO_LOCAL_PREDICTORS_PROVIDED"}

    pred_names = sorted(predictor_anomalies.keys())
    valid_rows: List[Tuple[str, float, List[float]]] = []
    for idx, d_str in enumerate(dates):
        yv = y_anom[idx] if idx < len(y_anom) else None
        if yv is None or not math.isfinite(float(yv)):
            continue
        row_x: List[float] = []
        row_ok = True
        for pname in pred_names:
            p_ser = predictor_anomalies[pname]
            pv = p_ser[idx] if idx < len(p_ser) else None
            if pv is None or not math.isfinite(float(pv)):
                row_ok = False
                break
            row_x.append(float(pv))
        if row_ok:
            valid_rows.append((d_str, float(yv), row_x))

    n = len(valid_rows)
    p = len(pred_names)
    if n < max(24, p + 6):
        return {"status": "INSUFFICIENT_OVERLAPPING_OBSERVATIONS", "n_samples": n}

    v_dates = [r[0] for r in valid_rows]
    y_raw = np.asarray([r[1] for r in valid_rows], dtype=np.float64)
    X_raw = np.asarray([r[2] for r in valid_rows], dtype=np.float64)

    # Detrend both X and Y globally on the common window to avoid block-boundary extrapolation artifacts
    y_det = _detrend_linear(y_raw)
    X_det = np.column_stack([_detrend_linear(X_raw[:, j]) for j in range(p)])

    x_std = np.maximum(1e-9, np.std(X_det, axis=0))
    X_norm = (X_det - np.mean(X_det, axis=0)) / x_std
    y_cent = y_det - float(np.mean(y_det))

    # Exact SVD Ridge with Generalized Cross-Validation (Golub, Heath & Wahba, 1979)
    U, s_vals, Vt = np.linalg.svd(X_norm, full_matrices=False)
    alphas = np.logspace(-2, 4, 25)
    best_alpha = 1.0
    best_gcv = float("inf")
    best_loo_resid = y_cent.copy()
    best_y_hat = np.zeros_like(y_cent)

    for alpha in alphas:
        filt = (s_vals ** 2) / (s_vals ** 2 + alpha)
        y_hat = U @ (filt * (U.T @ y_cent))
        resid = y_cent - y_hat
        eff_df = float(np.sum(filt))
        denom = max(1e-6, (1.0 - eff_df / float(n)) ** 2)
        gcv_score = float(np.mean(resid ** 2)) / denom
        if gcv_score < best_gcv:
            best_gcv = gcv_score
            best_alpha = float(alpha)
            best_y_hat = y_hat
            # Analytical diagonal of hat matrix H_ii for leave-one-out residuals
            h_diag = np.sum((U ** 2) * filt[np.newaxis, :], axis=1)
            best_loo_resid = resid / np.maximum(0.1, 1.0 - h_diag)

    beta_std = Vt.T @ ((s_vals / (s_vals ** 2 + best_alpha)) * (U.T @ y_cent))
    ss_tot = max(1e-12, float(np.sum(y_cent ** 2)))
    gcv_r2 = 1.0 - float(np.sum(best_loo_resid ** 2)) / ss_tot
    in_sample_r2 = 1.0 - float(np.sum((y_cent - best_y_hat) ** 2)) / ss_tot

    # Boundary-free CUSUM on GCV residuals
    min_seg = max(4, min(24, (n - 2) // 4))
    sigma_r = max(1e-9, float(np.std(best_loo_resid)))
    rho1_r = _lag1_autocorr(best_loo_resid)
    eff_sigma_r = sigma_r * math.sqrt((1.0 + max(0.0, rho1_r)) / max(1e-6, 1.0 - max(0.0, rho1_r)))
    cusum = np.cumsum(best_loo_resid - float(np.mean(best_loo_resid))) / (eff_sigma_r * math.sqrt(float(n)))
    interior = np.abs(cusum[min_seg : n - min_seg])
    rel_idx = int(np.argmax(interior)) + min_seg
    peak_stat = float(abs(cusum[rel_idx]))
    p_bridge = min(1.0, max(0.0, 2.0 * math.exp(-2.0 * peak_stat * peak_stat)))

    drivers = []
    for j, pname in enumerate(pred_names):
        xj = X_det[:, j]
        q25, q75 = np.quantile(xj, [0.25, 0.75])
        q1_mean = float(np.mean(y_det[xj <= q25])) if np.any(xj <= q25) else 0.0
        q4_mean = float(np.mean(y_det[xj >= q75])) if np.any(xj >= q75) else 0.0
        drivers.append(
            {
                "predictor": pname,
                "standardized_beta": round(float(beta_std[j]), 4),
                "abs_importance_rank_weight": round(abs(float(beta_std[j])), 4),
                "quartile_jump_q4_minus_q1": round(q4_mean - q1_mean, 4),
            }
        )
    drivers.sort(key=lambda d: d["abs_importance_rank_weight"], reverse=True)

    return {
        "status": "OK",
        "n_samples": n,
        "best_ridge_alpha": round(best_alpha, 4),
        "detrended_gcv_r2": round(float(gcv_r2), 4),
        "detrended_in_sample_r2": round(float(in_sample_r2), 4),
        "drivers_ranked": drivers,
        "coupling_break_cusum": {
            "detected": bool(peak_stat >= 1.358),
            "break_date": v_dates[rel_idx],
            "cusum_max_stat": round(peak_stat, 4),
            "p_value_ar1_bridge": round(p_bridge, 6),
        },
    }


def attribute_mahalanobis_outliers(
    outliers: Sequence[Mapping[str, Any]],
    ocean_anom_map: Mapping[str, Mapping[str, Mapping[str, float]]],
) -> List[Dict[str, Any]]:
    """Tags Mahalanobis outliers (D_M > 2.5) with concurrent/lagged Pacific & Atlantic Z-scores."""
    if not outliers:
        return []

    z_lookup: Dict[str, Dict[str, float]] = {}
    for key_id, box_id, var_id in (
        ("nino34_ts_z", "pac_nino34", "TS"),
        ("atl_grad_ts_z", "atl_meridional_grad", "TS"),
        ("atl_ne_ts_z", "atl_ne", "TS"),
        ("atl_s_ts_z", "atl_s", "TS"),
    ):
        ser = ocean_anom_map.get(box_id, {}).get(var_id, {})
        if not ser:
            z_lookup[key_id] = {}
            continue
        vals = np.asarray(list(ser.values()), dtype=np.float64)
        mu = float(np.mean(vals))
        sd = max(1e-9, float(np.std(vals)))
        z_lookup[key_id] = {ym: (float(v) - mu) / sd for ym, v in ser.items()}

    enriched: List[Dict[str, Any]] = []
    for item in outliers:
        ym = str(item["date"])
        nino_z = z_lookup.get("nino34_ts_z", {}).get(ym, 0.0)
        atl_grad_z = z_lookup.get("atl_grad_ts_z", {}).get(ym, 0.0)
        atl_ne_z = z_lookup.get("atl_ne_ts_z", {}).get(ym, 0.0)

        drivers: List[str] = []
        if abs(nino_z) >= 1.25:
            phase = "El Niño Forte" if nino_z > 0 else "La Niña Forte"
            drivers.append(f"{phase} (Niño 3.4 Z={nino_z:+.2f}σ)")
        if abs(atl_grad_z) >= 1.25:
            drivers.append(f"Dipolo Atlântico Meridional (Z={atl_grad_z:+.2f}σ)")
        if abs(atl_ne_z) >= 1.25:
            drivers.append(f"Anomalia Térmica Atlântico NE (Z={atl_ne_z:+.2f}σ)")
        if not drivers:
            drivers.append("Forçante Radiativa/Hidrometeorológica Regional ou Queimadas")

        enriched.append(
            {
                **dict(item),
                "ocean_state_z": {
                    "pac_nino34_ts_z": round(float(nino_z), 2),
                    "atl_meridional_grad_ts_z": round(float(atl_grad_z), 2),
                    "atl_ne_ts_z": round(float(atl_ne_z), 2),
                },
                "attributed_physical_drivers": drivers,
            }
        )
    return enriched


def discover_from_analysis(
    region_analysis: Mapping[str, Any],
    *,
    secondary_analyses: Optional[Mapping[str, Mapping[str, Any]]] = None,
    cache_dir: Path = DEFAULT_CACHE_DIR,
    ocean_anom_override: Optional[Mapping[str, Mapping[str, Mapping[str, float]]]] = None,
) -> Dict[str, Any]:
    """Main entry point for Camada 2 (`POST /api/discover`), executing in <50ms."""
    t_start = time.perf_counter()

    var_id = str(region_analysis["variable_id"])
    series = region_analysis["series"]
    dates = series["dates"]
    y_anom = series["anomaly_values"]
    sen_fit = series["sen_fit"]
    gam_fit = series["gam_smooth_fit"]

    ocean_map = (
        ocean_anom_override
        if ocean_anom_override is not None
        else load_cached_ocean_anomalies(cache_dir=cache_dir, allow_network=False)
    )

    regime_geometry = detect_regime_and_gam_geometry(dates, y_anom, sen_fit, gam_fit)
    teleconnections = scan_dynamic_partial_teleconnections(var_id, dates, y_anom, ocean_map)

    predictor_anoms: Dict[str, Sequence[Optional[float]]] = {}
    if secondary_analyses:
        for p_id, p_ana in secondary_analyses.items():
            if p_id != var_id and "series" in p_ana:
                predictor_anoms[p_id] = p_ana["series"]["anomaly_values"]

    physical_attribution = compute_fast_gcv_physical_attribution(dates, y_anom, predictor_anoms)
    attributed_outliers = attribute_mahalanobis_outliers(
        region_analysis.get("outliers_mahalanobis", []), ocean_map
    )

    elapsed_ms = round((time.perf_counter() - t_start) * 1000.0, 2)
    return {
        "discovery_meta": {
            "engine": "earth_system_dynamic_discovery_v2",
            "variable_id": var_id,
            "period": region_analysis.get("period"),
            "execution_time_ms": elapsed_ms,
        },
        "regime_and_gam_geometry": regime_geometry,
        "partial_teleconnections": teleconnections,
        "fast_gcv_physical_attribution": physical_attribution,
        "attributed_mahalanobis_outliers": attributed_outliers,
    }


def handle_discover_request(
    payload: Mapping[str, Any],
    *,
    cache_dir: Path = DEFAULT_CACHE_DIR,
) -> Dict[str, Any]:
    """HTTP handler adapter for `POST /api/discover`.

    Accepts:
      - `{"analysis": {"region_a_analysis": {...}, "region_b_analysis": {...}}}` (`/api/analyze` envelope),
      - `{"region_a_analysis": {...}, "region_b_analysis": {...}}`, or
      - `{"variable_id": "T2M", "dates": [...], "raw_values": [...], "secondary_series": {...}}`.
    """
    source_payload = (
        payload["analysis"]
        if isinstance(payload.get("analysis"), Mapping) and "region_a_analysis" in payload["analysis"]
        else payload
    )

    if "region_a_analysis" in source_payload and isinstance(source_payload["region_a_analysis"], Mapping):
        primary = source_payload["region_a_analysis"]
        secondary: Dict[str, Mapping[str, Any]] = {}
        reg_b = source_payload.get("region_b_analysis")
        if isinstance(reg_b, Mapping) and "variable_id" in reg_b:
            b_key = str(reg_b["variable_id"])
            if b_key == str(primary.get("variable_id")):
                b_key = f"{b_key}_region_b"
            secondary[b_key] = reg_b
        extra = payload.get("secondary_analyses") or source_payload.get("secondary_analyses")
        if isinstance(extra, Mapping):
            secondary.update(extra)
        return discover_from_analysis(primary, secondary_analyses=secondary, cache_dir=cache_dir)

    if "variable_id" in payload and "dates" in payload and "raw_values" in payload:
        var_id = str(payload["variable_id"])
        dates = list(payload["dates"])
        raw_vals = list(payload["raw_values"])
        primary = analyze_single_series(
            var_id,
            dates,
            raw_vals,
            variable_meta=payload.get("variable_meta"),
        )
        secondary_ana: Dict[str, Mapping[str, Any]] = {}
        for s_var, s_vals in (payload.get("secondary_series") or {}).items():
            secondary_ana[str(s_var)] = analyze_single_series(str(s_var), dates, list(s_vals))
        return discover_from_analysis(primary, secondary_analyses=secondary_ana, cache_dir=cache_dir)

    raise SemanticContractError(
        "CONTRACT_VIOLATION",
        "Payload para /api/discover deve conter 'region_a_analysis', 'analysis', ou ('variable_id', 'dates', 'raw_values').",
    )
