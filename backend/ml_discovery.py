"""Earth System Trend Detective — Scientific Discovery & ML Pipeline (2001–2025).

Implements state-of-the-art discovery grounded in the team's 7 Statistical Invariants
and post-audit mathematical corrections (Step 0 + Layer 1):
  1. Multi-point GloFAS 0.05° main-channel river snapping + true monthly physical
     extremes (`fmean` -> `river_discharge`, `min` -> `river_discharge_min`,
     `max` -> `river_discharge_max`) with automatic eviction of stale `fmean` caches.
  2. Strict physical units & scale typing (`MJ/m²/day` solar radiation, convex FAO-56
     `VPD_t2m_kpa` from `T2M_MAX` + reconstructed `T2M_MIN = 2*T2M - T2M_MAX` + `T2MDEW`,
     `sw_cloud_radiative_effect = CLRSKY - ALLSKY`, and smoke-vs-cloud radiative
     decoupling diagnostics).
  3. Full statistical diagnostics (`stats_engine.analyze_single_series` with conservative
     AR(1)+Hamed-Rao+BH-FDR), cross-basin same-variable `compare_regions` spatial dipoles,
     and non-tautological local multiscale coupling (`secular_gam_r` on GAM trajectories).
  4. Purged 5-block chronological CV (`purge_gap=6`) with strictly **in-fold**
     climatological deseasonalization, **in-fold** linear detrending (for Mode B
     interannual dynamics), and strictly **in-fold** top-K ocean feature selection:
       - **Mode A (Sub-Seasonal Predictive Precedence, lag >= 1 only):** scored by
         scale-invariant `skill_rmse_vs_ar1` (1 - RMSE_M / RMSE_AR1), `cv_oof_mae`,
         `fold_mean_r2`, and `cv_oof_r2`.
       - **Mode B (Contemporaneous Physical Attribution — Level & Detrended):** compares
         `RidgeCV` vs `SplineGAM_Ridge` vs `HistGradientBoostingRegressor` vs
         `RandomForestRegressor`, OOF block-bootstrap threshold stability, and parameter-free
         CUSUM structural break detection (`detect_temporal_regime_break` &
         `detect_physical_coupling_break`).
  5. Lagged ocean-to-watershed teleconnection scan over an a-priori orthogonal target
     family (`river_discharge_min`, `GWETROOT`) using partial correlation conditioned on
     Z_total(tau, k) = {t, Y_{t-tau}, Nino3.4_{t-tau}} with Bretherton AR(1) effective
     degrees of freedom (df_eff = N_eff(e_X, e_Y) - 2 - |Z|) and Benjamini–Hochberg FDR.
"""

from __future__ import annotations

import argparse
import json
import math
import statistics
import sys
import time
import urllib.parse
import warnings
from pathlib import Path
from typing import Any, Mapping, Sequence

import numpy as np
from scipy import stats as sps
from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.inspection import permutation_importance
from sklearn.linear_model import RidgeCV
from sklearn.metrics import (
    explained_variance_score,
    mean_absolute_error,
    mean_squared_error,
    r2_score,
)
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import SplineTransformer, StandardScaler
from sklearn.tree import DecisionTreeRegressor

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.stats_engine import (
    analyze_single_series,
    apply_spatial_fdr_bh,
    compare_regions,
    update_fdr_significance,
)
from data.cache.store import CellCacheStore
from data.catalog.environmental_catalog import get_variable_spec
from data.connectors.base import http_request
from data.models.contracts import CellCoord, LocationQuery
from data.services.ingestion_service import fetch_location_multiple_variables

START_YEAR = 2001
END_YEAR = 2025
PURGE_GAP = 6
N_CV_BLOCKS = 5
IN_FOLD_TOP_K_OCEAN = 6

GLOFAS_VARIABLES = [
    "river_discharge",
    "river_discharge_min",
    "river_discharge_max",
]

MERRA2_WATERSHED_VARIABLES = [
    "GWETROOT",
    "GWETTOP",
    "PRECTOTCORR",
    "T2M",
    "T2M_MAX",
    "T2MDEW",
]

CERES_WATERSHED_VARIABLES = [
    "ALLSKY_SFC_SW_DWN",
    "CLRSKY_SFC_SW_DWN",
    "CLOUD_AMT",
    "ALLSKY_SRF_ALB",
]

WATERSHED_VARIABLES = (
    GLOFAS_VARIABLES + MERRA2_WATERSHED_VARIABLES + CERES_WATERSHED_VARIABLES
)

DERIVED_WATERSHED_VARIABLES = [
    "sw_cloud_radiative_effect",
    "VPD_t2m_kpa",
]

OCEAN_MERRA2_VARIABLES = ["TS"]
OCEAN_CERES_VARIABLES = ["CLOUD_AMT", "ALLSKY_SFC_SW_DWN", "CLRSKY_SFC_SW_DWN"]
OCEAN_VARIABLES = OCEAN_MERRA2_VARIABLES + OCEAN_CERES_VARIABLES

OCEAN_LAGS = (1, 2, 3, 4, 6)
TARGETS = ("river_discharge_min", "river_discharge", "GWETROOT")
# Canonical orthogonal target family for teleconnection FDR (eliminates collinear duplicate tests)
TARGETS_TELECONNECTION = ("river_discharge_min", "GWETROOT")

WATERSHED_SPECS: list[dict[str, Any]] = [
    {
        "id": "amazonia_madeira",
        "name": "Madeira Basin — Porto Velho (SW Amazonia)",
        "glofas_scout_center": (-8.76, -63.91),
        "basin_cells": [
            (-8.75, -63.90),
            (-10.25, -65.00),
            (-11.25, -61.875),
            (-10.75, -68.125),
            (-13.75, -65.00),
        ],
    },
    {
        "id": "amazonia_tapajos",
        "name": "Tapajós Basin — Itaituba (Central-South Amazonia)",
        "glofas_scout_center": (-4.28, -55.98),
        "basin_cells": [
            (-4.25, -56.00),
            (-6.25, -57.50),
            (-8.75, -57.50),
            (-10.25, -55.625),
            (-11.75, -55.625),
        ],
    },
    {
        "id": "parana_foz_iguacu",
        "name": "Paraná Basin — Foz / Itaipu",
        "glofas_scout_center": (-25.50, -54.60),
        "basin_cells": [
            (-25.25, -54.375),
            (-22.75, -53.125),
            (-21.25, -50.625),
            (-20.25, -48.125),
            (-18.75, -49.375),
        ],
    },
    {
        "id": "sul_guaiba",
        "name": "Jacuí–Guaíba Basin — Porto Alegre / Triunfo (RS)",
        "glofas_scout_center": (-29.925, -51.725),
        "basin_cells": [
            (-30.00, -51.25),
            (-29.25, -51.875),
            (-29.75, -53.125),
            (-28.75, -52.50),
            (-28.75, -51.25),
        ],
    },
    {
        "id": "sao_francisco_sobradinho",
        "name": "São Francisco Basin — Sobradinho / Juazeiro",
        "glofas_scout_center": (-9.42, -40.60),
        "basin_cells": [
            (-9.50, -40.625),
            (-11.25, -43.125),
            (-13.25, -43.125),
            (-15.25, -44.375),
            (-17.25, -45.00),
        ],
    },
    {
        "id": "murray_darling",
        "name": "Murray-Darling Basin — Wentworth (SE Australia)",
        "glofas_scout_center": (-34.12, 141.92),
        "basin_cells": [
            (-34.25, 141.875),
            (-35.25, 145.00),
            (-35.75, 146.875),
            (-33.25, 148.125),
            (-30.25, 146.25),
        ],
    },
]

OCEAN_BOX_SPECS: list[dict[str, Any]] = [
    {
        "id": "atl_ne",
        "name": "Northeast South-Equatorial Atlantic (NE Box)",
        "box_cells": [
            (-5.5, -33.125),
            (-5.5, -30.625),
            (-3.5, -33.125),
            (-3.5, -30.625),
        ],
    },
    {
        "id": "atl_tn",
        "name": "Tropical North Atlantic (North Dipole / NAWH-S)",
        "box_cells": [
            (11.5, -43.75),
            (11.5, -38.75),
            (14.5, -43.75),
            (14.5, -38.75),
        ],
    },
    {
        "id": "atl_s",
        "name": "Subtropical South Atlantic (SW Atlantic Offshore)",
        "box_cells": [
            (-29.5, -43.75),
            (-29.5, -40.00),
            (-26.5, -43.75),
            (-26.5, -40.00),
        ],
    },
    {
        "id": "pac_nino34",
        "name": "Equatorial Pacific Niño 3.4",
        "box_cells": [
            (-3.0, -160.0),
            (-3.0, -135.0),
            (3.0, -160.0),
            (3.0, -135.0),
        ],
    },
]

BOUNDED_FRACTION_VARS = {"GWETROOT", "GWETTOP", "GWETPROF", "ALLSKY_SRF_ALB"}
BOUNDED_PERCENT_VARS = {"CLOUD_AMT"}


def build_variable_meta(code: str) -> dict[str, Any]:
    """Builds physically consistent VariableMeta enforcing Invariant 3 & MJ/m²/day units."""
    if code in {"river_discharge", "river_discharge_min", "river_discharge_max"}:
        names = {
            "river_discharge": "Monthly Mean River Discharge (GloFAS)",
            "river_discharge_min": "Monthly Minimum Daily River Discharge (GloFAS)",
            "river_discharge_max": "Monthly Maximum Daily River Discharge (GloFAS)",
        }
        return {
            "variable_id": code,
            "variable_name": names[code],
            "source_model": "GloFAS-v4 (Open-Meteo)",
            "resolution": {"dLat": 0.05, "dLon": 0.05},
            "min_year": 1984,
            "scale_type": "ratio",
            "unit": "m³/s",
            "trend_unit": "m³/s/decade",
            "allow_percentage_change": True,
            "land_only_mask": True,
        }

    if code == "sw_cloud_radiative_effect":
        return {
            "variable_id": code,
            "variable_name": "Shortwave Cloud/Aerosol Radiative Attenuation (CLRSKY - ALLSKY)",
            "source_model": "CERES_SYN1deg",
            "resolution": {"dLat": 1.0, "dLon": 1.0},
            "min_year": 2001,
            "scale_type": "interval",
            "unit": "MJ/m²/day",
            "trend_unit": "MJ/m²/day/decade",
            "allow_percentage_change": False,
            "land_only_mask": False,
        }

    if code == "VPD_t2m_kpa":
        return {
            "variable_id": code,
            "variable_name": "FAO-56 Vapor Pressure Deficit (2m VPD, T2M_MAX/T2M_MIN/T2MDEW)",
            "source_model": "MERRA-2",
            "resolution": {"dLat": 0.5, "dLon": 0.625},
            "min_year": 1981,
            "scale_type": "ratio",
            "unit": "kPa",
            "trend_unit": "kPa/decade",
            "allow_percentage_change": True,
            "land_only_mask": False,
        }

    spec = get_variable_spec(code)
    grid = (
        {"dLat": 1.0, "dLon": 1.0}
        if spec.grid_type == "ceres"
        else {"dLat": 0.5, "dLon": 0.625}
    )
    min_year = 1984 if spec.grid_type == "ceres" else 1981
    land_only = code in {"GWETROOT", "GWETTOP"}

    if code in {"ALLSKY_SFC_SW_DWN", "CLRSKY_SFC_SW_DWN"}:
        return {
            "variable_id": spec.code,
            "variable_name": spec.ui_name,
            "source_model": spec.source_label,
            "resolution": grid,
            "min_year": min_year,
            "scale_type": "ratio",
            "unit": "MJ/m²/day",
            "trend_unit": "MJ/m²/day/decade",
            "allow_percentage_change": True,
            "land_only_mask": land_only,
        }

    if code in BOUNDED_PERCENT_VARS:
        return {
            "variable_id": spec.code,
            "variable_name": spec.ui_name,
            "source_model": spec.source_label,
            "resolution": grid,
            "min_year": min_year,
            "scale_type": "ratio",
            "unit": "%",
            "trend_unit": "p.p./decade",
            "allow_percentage_change": False,
            "land_only_mask": land_only,
        }

    if code in BOUNDED_FRACTION_VARS:
        return {
            "variable_id": spec.code,
            "variable_name": spec.ui_name,
            "source_model": spec.source_label,
            "resolution": grid,
            "min_year": min_year,
            "scale_type": "ratio",
            "unit": "fraction (0–1)",
            "trend_unit": "fraction/decade",
            "allow_percentage_change": False,
            "land_only_mask": land_only,
        }

    unit = spec.unit
    trend_unit = f"{unit}/decade"
    return {
        "variable_id": spec.code,
        "variable_name": spec.ui_name,
        "source_model": spec.source_label,
        "resolution": grid,
        "min_year": min_year,
        "scale_type": spec.scale_type,
        "unit": unit,
        "trend_unit": trend_unit,
        "allow_percentage_change": bool(spec.allow_percentage_change),
        "land_only_mask": land_only,
    }


def _saturation_vapor_pressure_kpa(temp_c: float) -> float:
    """Tetens equation for saturation vapor pressure (kPa) from air temperature (°C)."""
    return 0.6108 * math.exp((17.27 * temp_c) / (temp_c + 237.3))


def compute_vpd_fao56_series(
    t2m: Sequence[float | None],
    t2m_dew: Sequence[float | None],
    t2m_max: Sequence[float | None] | None = None,
    t2m_min: Sequence[float | None] | None = None,
) -> list[float | None]:
    """Computes convex FAO-56 VPD (kPa) correcting Jensen's Inequality via T2M_MAX and T2M_MIN.

    If `t2m_min` is not cached, reconstructs diurnal minimum via T_min = 2 * T2M - T2M_MAX.
    """
    n = len(t2m)
    out: list[float | None] = []
    for i in range(n):
        t_mean = t2m[i]
        t_dew = t2m_dew[i]
        if t_mean is None or t_dew is None:
            out.append(None)
            continue
        tm = float(t_mean)
        td = float(t_dew)
        tmax_val = t2m_max[i] if (t2m_max is not None and i < len(t2m_max)) else None
        tmin_val = t2m_min[i] if (t2m_min is not None and i < len(t2m_min)) else None

        if tmax_val is not None:
            tx = max(tm, float(tmax_val))
            tn = float(tmin_val) if tmin_val is not None else min(tm, 2.0 * tm - tx)
            es = 0.5 * (_saturation_vapor_pressure_kpa(tx) + _saturation_vapor_pressure_kpa(tn))
        else:
            es = _saturation_vapor_pressure_kpa(tm)

        ea = _saturation_vapor_pressure_kpa(td)
        out.append(round(max(0.0, es - ea), 5))
    return out


# Backward-compatible alias
compute_vpd_t2m_series = compute_vpd_fao56_series


def compute_sw_cloud_radiative_effect_series(
    clrsky: Sequence[float | None],
    allsky: Sequence[float | None],
) -> list[float | None]:
    """Shortwave radiative attenuation (MJ/m²/day) = CLRSKY_SFC_SW_DWN - ALLSKY_SFC_SW_DWN."""
    out: list[float | None] = []
    for clr, all_sw in zip(clrsky, allsky):
        if clr is None or all_sw is None:
            out.append(None)
            continue
        out.append(round(float(clr) - float(all_sw), 5))
    return out


def diagnose_smoke_cloud_decoupling(
    common_dates: Sequence[str],
    ws_analyses: Mapping[str, Any],
) -> dict[str, Any]:
    """Separates secular cloud-retreat brightening from episodic biomass-burning smoke shocks.

    Identifies months where clear-sky irradiance collapses (Z(CLRSKY') < -2.0) without
    positive cloud anomaly (Z(CLOUD_AMT') <= 0.5), quantifying aerosol radiative masking
    where CLRSKY drops more sharply than ALLSKY.
    """
    clr_z = ws_analyses["CLRSKY_SFC_SW_DWN"]["series"]["z_scores"]
    all_z = ws_analyses["ALLSKY_SFC_SW_DWN"]["series"]["z_scores"]
    cld_z = ws_analyses["CLOUD_AMT"]["series"]["z_scores"]
    alb_z = ws_analyses["ALLSKY_SRF_ALB"]["series"]["z_scores"]

    clr_anom = ws_analyses["CLRSKY_SFC_SW_DWN"]["series"]["anomaly_values"]
    all_anom = ws_analyses["ALLSKY_SFC_SW_DWN"]["series"]["anomaly_values"]
    cre_anom = ws_analyses["sw_cloud_radiative_effect"]["series"]["anomaly_values"]

    smoke_events: list[dict[str, Any]] = []
    for idx, d_str in enumerate(common_dates):
        cz = clr_z[idx]
        clz = cld_z[idx]
        if cz is None or clz is None:
            continue
        if float(cz) < -2.0 and float(clz) <= 0.5:
            ca = float(clr_anom[idx] or 0.0)
            aa = float(all_anom[idx] or 0.0)
            cre_a = float(cre_anom[idx] or 0.0)
            smoke_events.append(
                {
                    "date": d_str,
                    "clrsky_z": round(float(cz), 3),
                    "allsky_z": round(float(all_z[idx] or 0.0), 3),
                    "cloud_amt_z": round(float(clz), 3),
                    "albedo_z": round(float(alb_z[idx] or 0.0), 3),
                    "clrsky_anom_mj": round(ca, 4),
                    "allsky_anom_mj": round(aa, 4),
                    "apparent_cre_shift_mj": round(cre_a, 4),
                    "aerosol_masking_detected": bool(ca < aa),
                }
            )

    smoke_events.sort(key=lambda item: item["clrsky_z"])
    allsky_sen = float(ws_analyses["ALLSKY_SFC_SW_DWN"]["regression"]["slope_per_decade_sen"])
    clrsky_sen = float(ws_analyses["CLRSKY_SFC_SW_DWN"]["regression"]["slope_per_decade_sen"])
    cloud_sen = float(ws_analyses["CLOUD_AMT"]["regression"]["slope_per_decade_sen"])
    allsky_sig = bool(ws_analyses["ALLSKY_SFC_SW_DWN"]["significance"]["is_significant_fdr05"])
    cloud_sig = bool(ws_analyses["CLOUD_AMT"]["significance"]["is_significant_fdr05"])
    clrsky_sig = bool(ws_analyses["CLRSKY_SFC_SW_DWN"]["significance"]["is_significant_fdr05"])

    return {
        "secular_cloud_driven_brightening": bool(
            allsky_sen > 0.0 and cloud_sen < 0.0 and allsky_sig and cloud_sig and not clrsky_sig
        ),
        "slopes_per_decade_sen": {
            "ALLSKY_SFC_SW_DWN": allsky_sen,
            "CLRSKY_SFC_SW_DWN": clrsky_sen,
            "CLOUD_AMT": cloud_sen,
        },
        "n_smoke_aerosol_shock_months": len(smoke_events),
        "top_smoke_aerosol_shocks": smoke_events[:5],
    }


def _align_common_dates(series_map: Mapping[str, Mapping[str, float]]) -> list[str]:
    date_sets = [set(s.keys()) for s in series_map.values() if s]
    if not date_sets:
        return []
    common = sorted(set.intersection(*date_sets))
    return [d for d in common if f"{START_YEAR:04d}-01" <= d <= f"{END_YEAR:04d}-12"]


def _purge_stale_glofas_cache(cache_dir: Path) -> int:
    """Scans CellCacheStore directory and removes legacy or synthetic-fallback GloFAS cache files."""
    if not cache_dir.exists():
        return 0
    removed = 0
    for path in cache_dir.rglob("*.json"):
        if path.name == "glofas_snapping_v2.json":
            continue
        if "open_meteo_flood" not in path.name and "river_discharge" not in path.name:
            continue
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(payload, dict):
                continue
            is_fallback = payload.get("origin") == "glofas_calibrated_fallback"
            needs_v2 = ("river_discharge_min" in path.name or "river_discharge_max" in path.name) and payload.get("agg_v") != 2
            if is_fallback or needs_v2:
                path.unlink(missing_ok=True)
                removed += 1
        except Exception:
            continue
    return removed


def _fetch_true_glofas_monthly_extremes_direct(
    lat: float,
    lon: float,
    start_year: int,
    end_year: int,
    cache_dir: Path,
) -> dict[str, dict[str, Any]] | None:
    """Fetches daily `river_discharge` from Open-Meteo Flood API and computes true monthly mean, min, and max.

    Used automatically whenever the underlying connector cache still returns collapsed ensemble means
    (where monthly min == monthly mean == monthly max).
    """
    cache_file = cache_dir / f"glofas_monthly_extremes_v2_{lat:.4f}_{lon:.4f}_{start_year}_{end_year}.json"
    if cache_file.exists():
        try:
            cached = json.loads(cache_file.read_text(encoding="utf-8"))
            if isinstance(cached, dict) and cached.get("agg_v") == 2:
                return cached["variables"]
        except Exception:
            pass

    params = urllib.parse.urlencode(
        {
            "latitude": f"{lat:.4f}",
            "longitude": f"{lon:.4f}",
            "daily": "river_discharge",
            "start_date": f"{start_year:04d}-01-01",
            "end_date": f"{end_year:04d}-12-31",
        }
    )
    url = f"https://flood-api.open-meteo.com/v1/flood?{params}"
    resp = http_request(url, timeout=45)
    for backoff_s in (2.0, 5.0, 10.0):
        if resp["ok"]:
            break
        time.sleep(backoff_s)
        resp = http_request(url, timeout=45)

    if not resp["ok"]:
        return None

    payload = json.loads(resp["body"])
    item = payload[0] if isinstance(payload, list) else payload
    daily = (item or {}).get("daily", {})
    times = daily.get("time", [])
    vals = daily.get("river_discharge", [])
    if not times or not vals:
        return None

    buckets: dict[str, list[float]] = {}
    for d_str, v in zip(times, vals):
        if v is None:
            continue
        fv = float(v)
        if math.isfinite(fv) and fv >= 0.0:
            buckets.setdefault(str(d_str)[:7], []).append(fv)

    mean_ser: dict[str, float] = {}
    min_ser: dict[str, float] = {}
    max_ser: dict[str, float] = {}
    for ym in sorted(buckets.keys()):
        b = buckets[ym]
        if not b:
            continue
        mean_ser[ym] = round(float(statistics.fmean(b)), 4)
        min_ser[ym] = round(float(min(b)), 4)
        max_ser[ym] = round(float(max(b)), 4)

    out_vars = {
        "river_discharge": {"status": "OK", "agg_v": 2, "series": mean_ser},
        "river_discharge_min": {"status": "OK", "agg_v": 2, "series": min_ser},
        "river_discharge_max": {"status": "OK", "agg_v": 2, "series": max_ser},
    }
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(
        json.dumps({"agg_v": 2, "variables": out_vars}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return out_vars


def validate_glofas_discharge(
    watershed_name: str,
    var_payloads: Mapping[str, Mapping[str, Any]],
    *,
    snapped_meta: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Validates non-zero main-stem GloFAS river discharge series and verifies min < mean < max spread."""
    summary: dict[str, Any] = {}
    all_valid = True
    for var in GLOFAS_VARIABLES:
        payload = var_payloads.get(var, {})
        series = payload.get("series", {})
        vals = [float(v) for v in series.values() if v is not None]
        nonzero_count = sum(1 for v in vals if v > 0.0)
        nonzero_frac = (nonzero_count / len(vals)) if vals else 0.0
        mean_val = statistics.fmean(vals) if vals else 0.0
        is_valid = (
            payload.get("status") == "OK"
            and payload.get("data_origin") != "glofas_calibrated_fallback"
            and len(vals) >= 120
            and nonzero_frac >= 0.70
            and (var != "river_discharge" or mean_val >= 20.0)
        )
        if not is_valid:
            all_valid = False
        summary[var] = {
            "status": payload.get("status"),
            "data_origin": payload.get("data_origin"),
            "months": len(vals),
            "nonzero_count": nonzero_count,
            "nonzero_fraction": round(nonzero_frac, 4),
            "min": round(min(vals), 4) if vals else None,
            "mean": round(mean_val, 4) if vals else None,
            "max": round(max(vals), 4) if vals else None,
            "is_valid_nonzero": is_valid,
        }

    mean_m = summary.get("river_discharge", {}).get("mean") or 0.0
    min_m = summary.get("river_discharge_min", {}).get("mean") or 0.0
    max_m = summary.get("river_discharge_max", {}).get("mean") or 0.0
    has_intra_month_spread = bool(max_m - min_m > 0.02 * max(1.0, mean_m))

    return {
        "watershed": watershed_name,
        "valid": all_valid,
        "has_intra_month_extremes_spread": has_intra_month_spread,
        "snapped_main_channel": dict(snapped_meta) if snapped_meta else None,
        "variables": summary,
    }


def snap_glofas_main_channel(
    ws: Mapping[str, Any],
    cache_dir: Path,
    *,
    radius_deg: float = 0.20,
    step_deg: float = 0.05,
) -> dict[str, Any]:
    """Scouts a local 0.05° GloFAS grid around the nominal river reach to lock onto the main stem."""
    scout_cache_path = cache_dir / "glofas_snapping_v2.json"
    cached_map: dict[str, Any] = {}
    if scout_cache_path.exists():
        try:
            cached_map = json.loads(scout_cache_path.read_text(encoding="utf-8"))
        except Exception:
            cached_map = {}

    ws_id = str(ws["id"])
    nominal_lat, nominal_lon = ws["glofas_scout_center"]
    cached_entry = cached_map.get(ws_id)
    if (
        isinstance(cached_entry, dict)
        and cached_entry.get("nominal_center") == [nominal_lat, nominal_lon]
        and isinstance(cached_entry.get("snapped_lat"), (int, float))
        and isinstance(cached_entry.get("snapped_lon"), (int, float))
    ):
        return cached_entry

    n_steps = int(round(radius_deg / step_deg))
    candidates: list[tuple[float, float]] = []
    for i in range(-n_steps, n_steps + 1):
        for j in range(-n_steps, n_steps + 1):
            candidates.append(
                (round(nominal_lat + i * step_deg, 4), round(nominal_lon + j * step_deg, 4))
            )

    base_url = "https://flood-api.open-meteo.com/v1/flood"
    scored: list[dict[str, Any]] = []
    chunk_size = 20
    for start_idx in range(0, len(candidates), chunk_size):
        chunk = candidates[start_idx : start_idx + chunk_size]
        params = urllib.parse.urlencode(
            {
                "latitude": ",".join(str(c[0]) for c in chunk),
                "longitude": ",".join(str(c[1]) for c in chunk),
                "daily": "river_discharge",
                "start_date": "2023-01-01",
                "end_date": "2023-12-31",
            }
        )
        url = f"{base_url}?{params}"
        resp = http_request(url, timeout=30)
        for backoff_s in (2.0, 5.0, 10.0):
            if resp["ok"]:
                break
            time.sleep(backoff_s)
            resp = http_request(url, timeout=30)
        if resp["ok"]:
            payload = json.loads(resp["body"])
            items = payload if isinstance(payload, list) else [payload]
            for req_coord, item in zip(chunk, items):
                daily = (item or {}).get("daily", {}).get("river_discharge", [])
                vals = [float(v) for v in daily if v is not None and math.isfinite(float(v))]
                if len(vals) < 180:
                    continue
                nz_frac = sum(1 for v in vals if v > 0.0) / len(vals)
                mean_q = statistics.fmean(vals)
                max_q = max(vals)
                scored.append(
                    {
                        "req_lat": req_coord[0],
                        "req_lon": req_coord[1],
                        "api_lat": round(float(item.get("latitude", req_coord[0])), 4),
                        "api_lon": round(float(item.get("longitude", req_coord[1])), 4),
                        "scout_2023_mean_m3s": round(mean_q, 2),
                        "scout_2023_max_m3s": round(max_q, 2),
                        "scout_2023_nonzero_frac": round(nz_frac, 4),
                    }
                )
        time.sleep(0.8)

    if not scored:
        return {
            "nominal_center": [nominal_lat, nominal_lon],
            "snapped_lat": nominal_lat,
            "snapped_lon": nominal_lon,
            "scout_2023_mean_m3s": None,
            "scout_candidates_evaluated": 0,
            "top3_candidates": [],
        }

    scored.sort(
        key=lambda c: (1 if c["scout_2023_nonzero_frac"] >= 0.80 else 0, c["scout_2023_mean_m3s"]),
        reverse=True,
    )
    best = scored[0]
    result = {
        "nominal_center": [nominal_lat, nominal_lon],
        "snapped_lat": best["api_lat"],
        "snapped_lon": best["api_lon"],
        "scout_2023_mean_m3s": best["scout_2023_mean_m3s"],
        "scout_2023_max_m3s": best["scout_2023_max_m3s"],
        "scout_2023_nonzero_frac": best["scout_2023_nonzero_frac"],
        "scout_candidates_evaluated": len(scored),
        "top3_candidates": scored[:3],
    }

    cached_map[ws_id] = result
    cache_dir.mkdir(parents=True, exist_ok=True)
    scout_cache_path.write_text(json.dumps(cached_map, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


def fetch_all_regions(
    cache: CellCacheStore,
    cache_dir: Path,
    sleep_between_requests_s: float = 0.4,
) -> dict[str, Any]:
    """Fetches snapped GloFAS main-stem discharge + multi-cell MERRA-2/CERES basin/ocean data."""
    _purge_stale_glofas_cache(cache_dir)
    watersheds_raw: dict[str, dict[str, Any]] = {}
    glofas_checks: dict[str, dict[str, Any]] = {}

    for idx, ws in enumerate(WATERSHED_SPECS):
        if idx > 0 and sleep_between_requests_s > 0:
            time.sleep(sleep_between_requests_s)

        snapped_meta = snap_glofas_main_channel(ws, cache_dir)
        s_lat = float(snapped_meta["snapped_lat"])
        s_lon = float(snapped_meta["snapped_lon"])
        glofas_cell = [CellCoord(lat=s_lat, lon=s_lon)]
        basin_cells = [CellCoord(lat=float(lat), lon=float(lon)) for lat, lon in ws["basin_cells"]]

        q_glofas = LocationQuery(
            name=f"{ws['name']} [GloFAS]",
            cells=glofas_cell,
            variables=GLOFAS_VARIABLES,
        )
        q_merra = LocationQuery(
            name=f"{ws['name']} [MERRA-2]",
            cells=basin_cells,
            variables=MERRA2_WATERSHED_VARIABLES,
        )
        q_ceres = LocationQuery(
            name=f"{ws['name']} [CERES]",
            cells=basin_cells,
            variables=CERES_WATERSHED_VARIABLES,
        )

        res_glofas = fetch_location_multiple_variables(
            q_glofas, START_YEAR, END_YEAR, cache=cache, label=f"{ws['name']} (GloFAS)"
        )
        res_merra = fetch_location_multiple_variables(
            q_merra, START_YEAR, END_YEAR, cache=cache, label=f"{ws['name']} (MERRA-2)"
        )
        res_ceres = fetch_location_multiple_variables(
            q_ceres, START_YEAR, END_YEAR, cache=cache, label=f"{ws['name']} (CERES)"
        )

        combined_vars: dict[str, Any] = {}
        combined_vars.update(res_glofas["variables"])
        combined_vars.update(res_merra["variables"])
        combined_vars.update(res_ceres["variables"])

        check = validate_glofas_discharge(
            ws["name"], combined_vars, snapped_meta=snapped_meta
        )
        # Self-healing guard: if cache/connector hit synthetic fallback or returned collapsed
        # ensemble means, compute true monthly min/mean/max from live daily GloFAS series
        if not check["valid"] or not check["has_intra_month_extremes_spread"]:
            direct_glofas = _fetch_true_glofas_monthly_extremes_direct(
                s_lat, s_lon, START_YEAR, END_YEAR, cache_dir
            )
            if direct_glofas is not None:
                combined_vars.update(direct_glofas)
                check = validate_glofas_discharge(
                    ws["name"], combined_vars, snapped_meta=snapped_meta
                )

        glofas_checks[ws["id"]] = check
        watersheds_raw[ws["id"]] = {
            "spec": ws,
            "ingestion": {
                "location_name": ws["name"],
                "basin_cells_count": len(basin_cells),
                "variables": combined_vars,
            },
            "glofas_check": check,
        }

    oceans_raw: dict[str, dict[str, Any]] = {}
    for oc in OCEAN_BOX_SPECS:
        if sleep_between_requests_s > 0:
            time.sleep(sleep_between_requests_s)
        box_cells = [CellCoord(lat=float(lat), lon=float(lon)) for lat, lon in oc["box_cells"]]
        res_merra = fetch_location_multiple_variables(
            LocationQuery(name=f"{oc['name']} [MERRA-2]", cells=box_cells, variables=OCEAN_MERRA2_VARIABLES),
            START_YEAR,
            END_YEAR,
            cache=cache,
            label=f"{oc['name']} (MERRA-2)",
        )
        res_ceres = fetch_location_multiple_variables(
            LocationQuery(name=f"{oc['name']} [CERES]", cells=box_cells, variables=OCEAN_CERES_VARIABLES),
            START_YEAR,
            END_YEAR,
            cache=cache,
            label=f"{oc['name']} (CERES)",
        )
        combined_oc: dict[str, Any] = {}
        combined_oc.update(res_merra["variables"])
        combined_oc.update(res_ceres["variables"])
        oceans_raw[oc["id"]] = {
            "spec": oc,
            "ingestion": {"location_name": oc["name"], "box_cells_count": len(box_cells), "variables": combined_oc},
        }

    return {
        "watersheds": watersheds_raw,
        "oceans": oceans_raw,
        "glofas_checks": glofas_checks,
    }


def _lag1_autocorr(arr: np.ndarray) -> float:
    if len(arr) < 4 or np.std(arr[:-1]) < 1e-12 or np.std(arr[1:]) < 1e-12:
        return 0.0
    rho = float(np.corrcoef(arr[:-1], arr[1:])[0, 1])
    return float(np.clip(rho, -0.95, 0.95)) if math.isfinite(rho) else 0.0


def _detrend_linear(y: np.ndarray) -> np.ndarray:
    t = np.arange(len(y), dtype=np.float64)
    slope, intercept = np.polyfit(t, y, 1)
    return y - (slope * t + intercept)


def _ar1_pearson_test(x: np.ndarray, y: np.ndarray, n_cond_vars: int = 0) -> dict[str, float]:
    """Pearson correlation with Bretherton et al. (1999) AR(1) effective N and df_eff = N_eff - 2 - |Z|."""
    n = len(x)
    if n < 6 + n_cond_vars or np.std(x) < 1e-12 or np.std(y) < 1e-12:
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
) -> dict[str, float]:
    """Computes partial correlation r(X, Y | Z) via OLS orthogonal projection and AR(1) df_eff."""
    n = len(x)
    k_cond = len(z_cols)
    if n < 8 + k_cond or np.std(x) < 1e-12 or np.std(y) < 1e-12:
        return {
            "r": 0.0,
            "n_pairs": float(n),
            "n_eff": float(n),
            "df_eff": 1.0,
            "p_value_ar1": 1.0,
        }
    Z = np.column_stack([np.ones(n, dtype=np.float64)] + [np.asarray(col, dtype=np.float64) for col in z_cols])
    beta_x, _, _, _ = np.linalg.lstsq(Z, x, rcond=None)
    beta_y, _, _, _ = np.linalg.lstsq(Z, y, rcond=None)
    e_x = x - Z @ beta_x
    e_y = y - Z @ beta_y
    return _ar1_pearson_test(e_x, e_y, n_cond_vars=k_cond)


def _compute_local_multiscale_coupling(
    analysis_a: Mapping[str, Any],
    analysis_b: Mapping[str, Any],
) -> dict[str, Any]:
    """Same-basin multiscale coupling using non-tautological GAM trajectories + detrended residuals."""
    ser_a = analysis_a["series"]
    ser_b = analysis_b["series"]
    idx = [
        i
        for i, (aa, ab, la, lb, ga, gb) in enumerate(
            zip(
                ser_a["anomaly_values"],
                ser_b["anomaly_values"],
                ser_a["linear_fit"],
                ser_b["linear_fit"],
                ser_a["gam_smooth_fit"],
                ser_b["gam_smooth_fit"],
            )
        )
        if aa is not None and ab is not None and la is not None and lb is not None and ga is not None and gb is not None
    ]
    if len(idx) < 12:
        return {"status": "INSUFFICIENT_DATA", "n_pairs": len(idx)}

    anom_a = np.asarray([float(ser_a["anomaly_values"][i]) for i in idx], dtype=np.float64)
    anom_b = np.asarray([float(ser_b["anomaly_values"][i]) for i in idx], dtype=np.float64)
    lin_a = np.asarray([float(ser_a["linear_fit"][i]) for i in idx], dtype=np.float64)
    lin_b = np.asarray([float(ser_b["linear_fit"][i]) for i in idx], dtype=np.float64)
    gam_a = np.asarray([float(ser_a["gam_smooth_fit"][i]) for i in idx], dtype=np.float64)
    gam_b = np.asarray([float(ser_b["gam_smooth_fit"][i]) for i in idx], dtype=np.float64)

    det_a = anom_a - lin_a
    det_b = anom_b - lin_b

    anom_stats = _ar1_pearson_test(anom_a, anom_b)
    det_stats = _ar1_pearson_test(det_a, det_b)
    gam_stats = _ar1_pearson_test(gam_a, gam_b)

    slope_a = float(analysis_a["regression"]["slope_per_decade_sen"])
    slope_b = float(analysis_b["regression"]["slope_per_decade_sen"])
    return {
        "n_pairs": len(idx),
        "anomaly_r": round(anom_stats["r"], 4),
        "anomaly_n_eff_ar1": round(anom_stats["n_eff"], 2),
        "anomaly_p_ar1": round(anom_stats["p_value_ar1"], 6),
        "detrended_r": round(det_stats["r"], 4),
        "detrended_n_eff_ar1": round(det_stats["n_eff"], 2),
        "detrended_p_ar1": round(det_stats["p_value_ar1"], 6),
        "secular_gam_r": round(gam_stats["r"], 4),
        "secular_gam_n_eff_ar1": round(gam_stats["n_eff"], 2),
        "secular_gam_p_ar1": round(gam_stats["p_value_ar1"], 6),
        "opposite_secular_slopes": bool(slope_a * slope_b < 0.0),
    }


def _cusum_2stage_ar1(
    resid: np.ndarray,
    min_segment_months: int,
    *,
    is_detrended: bool,
) -> tuple[bool, int, float, float]:
    """2-stage mean-demeaned AR(1) CUSUM skipping break boundary pair in rho1 estimation.

    Uses c_0.05^(2) = 0.880 (Ploberger & Kramer, 1992) on linearly detrended residuals and
    1.3581 on raw level residuals, rescaling p-values coherently so peak_stat == crit <-> p == 0.05.
    """
    n = len(resid)
    centered = resid - float(np.mean(resid))
    prelim_cs = np.cumsum(centered)
    interior_pre = np.abs(prelim_cs[min_segment_months : n - min_segment_months])
    k_star = int(np.argmax(interior_pre)) + min_segment_months

    pre = resid[:k_star] - float(np.mean(resid[:k_star]))
    post = resid[k_star:] - float(np.mean(resid[k_star:]))
    pooled = np.concatenate([pre, post])
    sigma_2s = max(1e-9, float(np.std(pooled)))

    # Boundary-skipping lag-1 autocorrelation across non-crossing adjacent pairs
    if n >= 6:
        idx_l = [i for i in range(n - 1) if (i + 1) != k_star]
        if len(idx_l) >= 4:
            x0 = pooled[idx_l]
            x1 = pooled[[i + 1 for i in idx_l]]
            if float(np.std(x0)) > 1e-12 and float(np.std(x1)) > 1e-12:
                rho1 = float(np.clip(np.corrcoef(x0, x1)[0, 1], -0.95, 0.95))
                if not math.isfinite(rho1):
                    rho1 = 0.0
            else:
                rho1 = 0.0
        else:
            rho1 = 0.0
    else:
        rho1 = 0.0

    ar1_inflation = math.sqrt((1.0 + max(0.0, rho1)) / max(1e-6, 1.0 - max(0.0, rho1)))
    eff_sigma = sigma_2s * ar1_inflation
    cusum = prelim_cs / (eff_sigma * math.sqrt(float(n)))
    interior = np.abs(cusum[min_segment_months : n - min_segment_months])
    rel_idx = int(np.argmax(interior)) + min_segment_months
    peak_stat = float(abs(cusum[rel_idx]))
    crit = 0.880 if is_detrended else 1.3581
    eff_stat_ks = peak_stat * (1.3581 / crit)
    p_val = min(1.0, max(0.0, 2.0 * math.exp(-2.0 * eff_stat_ks * eff_stat_ks)))
    return bool(peak_stat >= crit), rel_idx, peak_stat, p_val


def detect_temporal_regime_break(
    dates: Sequence[str],
    y_anom: Sequence[float | None],
    sen_fit: Sequence[float | None],
    *,
    min_segment_months: int = 24,
) -> dict[str, Any]:
    """Detects structural regime break date t*_regime via 2-stage AR(1) CUSUM on (Y'_t - Y_hat_Sen(t))."""
    valid = [
        (d, float(a) - float(s), float(a))
        for d, a, s in zip(dates, y_anom, sen_fit)
        if a is not None and s is not None
    ]
    n = len(valid)
    if n <= 2 * min_segment_months:
        return {"detected": False, "break_date": None}

    v_dates = [item[0] for item in valid]
    resid = np.asarray([item[1] for item in valid], dtype=np.float64)
    anom = np.asarray([item[2] for item in valid], dtype=np.float64)

    detected, rel_idx, peak_stat, p_val = _cusum_2stage_ar1(
        resid,
        min_segment_months,
        is_detrended=True,
    )

    pre_anom = anom[:rel_idx]
    post_anom = anom[rel_idx:]
    t_pre = np.arange(len(pre_anom), dtype=np.float64) / 120.0
    t_post = np.arange(len(post_anom), dtype=np.float64) / 120.0
    slope_pre = float(sps.theilslopes(pre_anom, t_pre).slope) if len(pre_anom) >= 12 else 0.0
    slope_post = float(sps.theilslopes(post_anom, t_post).slope) if len(post_anom) >= 12 else 0.0

    return {
        "detected": detected,
        "break_date": v_dates[rel_idx],
        "cusum_max_stat": round(peak_stat, 4),
        "p_value_ar1_bridge": round(p_val, 6),
        "pre_break_mean_anom": round(float(np.mean(pre_anom)), 4),
        "post_break_mean_anom": round(float(np.mean(post_anom)), 4),
        "pre_break_sen_slope_decade": round(slope_pre, 4),
        "post_break_sen_slope_decade": round(slope_post, 4),
    }


def detect_physical_coupling_break(
    dates: Sequence[str],
    y_true: np.ndarray,
    y_pred: np.ndarray,
    *,
    min_segment_months: int = 24,
    detrended_regime: bool = False,
) -> dict[str, Any]:
    """Detects physical attribution decoupling date t*_coupling on Mode B out-of-fold residuals."""
    n = len(dates)
    if n <= 2 * min_segment_months:
        return {"detected": False, "break_date": None}

    resid = y_true - y_pred
    detected, rel_idx, peak_stat, p_val = _cusum_2stage_ar1(
        resid,
        min_segment_months,
        is_detrended=detrended_regime,
    )
    break_date = dates[rel_idx]

    diag = _regime_shift_error_diagnostics(dates, y_true, y_pred, break_date)
    return {
        "detected": detected,
        "break_date": break_date,
        "cusum_max_stat": round(peak_stat, 4),
        "p_value_ar1_bridge": round(p_val, 6),
        "pre_post_diagnostics": diag,
    }


def _extract_stats_summary(
    analysis: Mapping[str, Any],
    dates: Sequence[str],
) -> dict[str, Any]:
    return {
        "variable_id": analysis["variable_id"],
        "unit": analysis["unit"],
        "scale_type": analysis["scale_type"],
        "allow_percentage_change": analysis["allow_percentage_change"],
        "period": analysis["period"],
        "regression": analysis["regression"],
        "correlation_and_coupling": analysis["correlation_and_coupling"],
        "significance": analysis["significance"],
        "temporal_regime_break_cusum": detect_temporal_regime_break(
            dates,
            analysis["series"]["anomaly_values"],
            analysis["series"]["sen_fit"],
        ),
        "n_outliers_mahalanobis": len(analysis["outliers_mahalanobis"]),
        "top_outliers": analysis["outliers_mahalanobis"][:5],
    }


def run_statistical_diagnostics(
    valid_watersheds: Mapping[str, Mapping[str, Any]],
    oceans_raw: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    """Runs `analyze_single_series`, global BH-FDR, local multiscale couplings, and cross-basin dipoles."""
    all_series_maps: list[Mapping[str, float]] = []
    for ws_entry in valid_watersheds.values():
        for payload in ws_entry["ingestion"]["variables"].values():
            if payload.get("status") == "OK":
                all_series_maps.append(payload["series"])
    for oc_entry in oceans_raw.values():
        for payload in oc_entry["ingestion"]["variables"].values():
            if payload.get("status") == "OK":
                all_series_maps.append(payload["series"])

    common_dates = _align_common_dates({str(i): m for i, m in enumerate(all_series_maps)})
    if len(common_dates) < 36:
        raise RuntimeError(f"Insufficient intersecting monthly dates across all series: {len(common_dates)}")

    ws_analyses: dict[str, dict[str, dict[str, Any]]] = {}
    oc_analyses: dict[str, dict[str, dict[str, Any]]] = {}
    fdr_targets: list[dict[str, Any]] = []

    for ws_id, ws_entry in valid_watersheds.items():
        ws_analyses[ws_id] = {}
        vars_map = ws_entry["ingestion"]["variables"]
        for var in WATERSHED_VARIABLES:
            raw_vals = [vars_map[var]["series"].get(d) for d in common_dates]
            ana = analyze_single_series(var, common_dates, raw_vals, variable_meta=build_variable_meta(var))
            ws_analyses[ws_id][var] = ana
            fdr_targets.append(ana)

        # Derived physical watershed diagnostics (SW CRE & FAO-56 convex VPD)
        clr_raw = [vars_map["CLRSKY_SFC_SW_DWN"]["series"].get(d) for d in common_dates]
        all_raw = [vars_map["ALLSKY_SFC_SW_DWN"]["series"].get(d) for d in common_dates]
        t2m_raw = [vars_map["T2M"]["series"].get(d) for d in common_dates]
        tmax_raw = [vars_map["T2M_MAX"]["series"].get(d) for d in common_dates]
        tdew_raw = [vars_map["T2MDEW"]["series"].get(d) for d in common_dates]

        sw_cre_raw = compute_sw_cloud_radiative_effect_series(clr_raw, all_raw)
        vpd_raw = compute_vpd_fao56_series(t2m_raw, tdew_raw, t2m_max=tmax_raw)

        for dvar, dvals in (("sw_cloud_radiative_effect", sw_cre_raw), ("VPD_t2m_kpa", vpd_raw)):
            ana = analyze_single_series(dvar, common_dates, dvals, variable_meta=build_variable_meta(dvar))
            ws_analyses[ws_id][dvar] = ana
            fdr_targets.append(ana)

    for oc_id, oc_entry in oceans_raw.items():
        oc_analyses[oc_id] = {}
        vars_map = oc_entry["ingestion"]["variables"]
        for var in OCEAN_VARIABLES:
            raw_vals = [vars_map[var]["series"].get(d) for d in common_dates]
            ana = analyze_single_series(var, common_dates, raw_vals, variable_meta=build_variable_meta(var))
            oc_analyses[oc_id][var] = ana
            fdr_targets.append(ana)

    p_values = [float(item["significance"]["p_value_ar1_corrected"]) for item in fdr_targets]
    q_values, _ = apply_spatial_fdr_bh(p_values, alpha=0.05)
    for item, q_val in zip(fdr_targets, q_values):
        update_fdr_significance(item, q_val, alpha=0.05)

    smoke_cloud_diagnostics = {
        ws_id: diagnose_smoke_cloud_decoupling(common_dates, ws_analyses[ws_id])
        for ws_id in valid_watersheds
    }

    # Within-watershed multiscale couplings + BH-FDR on detrended & anomaly p_ar1
    local_couplings: dict[str, dict[str, Any]] = {}
    local_pairs = [
        ("PRECTOTCORR", "river_discharge_min"),
        ("PRECTOTCORR", "river_discharge"),
        ("ALLSKY_SFC_SW_DWN", "river_discharge_min"),
        ("CLRSKY_SFC_SW_DWN", "river_discharge_min"),
        ("sw_cloud_radiative_effect", "river_discharge_min"),
        ("VPD_t2m_kpa", "river_discharge_min"),
        ("CLOUD_AMT", "river_discharge_min"),
        ("ALLSKY_SFC_SW_DWN", "GWETROOT"),
        ("ALLSKY_SRF_ALB", "GWETROOT"),
    ]
    local_flat: list[dict[str, Any]] = []
    for ws_id in valid_watersheds:
        local_couplings[ws_id] = {}
        for var_a, var_b in local_pairs:
            res = _compute_local_multiscale_coupling(ws_analyses[ws_id][var_a], ws_analyses[ws_id][var_b])
            local_couplings[ws_id][f"{var_a}_vs_{var_b}"] = res
            if "detrended_p_ar1" in res:
                local_flat.append(res)

    if local_flat:
        q_anom, sig_anom = apply_spatial_fdr_bh([c["anomaly_p_ar1"] for c in local_flat], alpha=0.05)
        q_det, sig_det = apply_spatial_fdr_bh([c["detrended_p_ar1"] for c in local_flat], alpha=0.05)
        for c, qa, sa, qd, sd in zip(local_flat, q_anom, sig_anom, q_det, sig_det):
            c["anomaly_fdr_q"] = round(float(qa), 6)
            c["anomaly_sig_fdr05"] = bool(sa)
            c["detrended_fdr_q"] = round(float(qd), 6)
            c["detrended_sig_fdr05"] = bool(sd)

    # Strictly same-variable, cross-watershed spatial dipoles via `stats_engine.compare_regions`
    spatial_dipoles: list[dict[str, Any]] = []
    ws_ids = list(valid_watersheds.keys())
    dipole_vars = ("river_discharge_min", "river_discharge", "GWETROOT", "ALLSKY_SFC_SW_DWN", "PRECTOTCORR")
    for idx_a in range(len(ws_ids)):
        for idx_b in range(idx_a + 1, len(ws_ids)):
            ws_a, ws_b = ws_ids[idx_a], ws_ids[idx_b]
            for var in dipole_vars:
                cmp_res = compare_regions(
                    ws_a,
                    ws_b,
                    ws_analyses[ws_a][var],
                    ws_analyses[ws_b][var],
                )
                spatial_dipoles.append({"variable": var, **cmp_res})

    return {
        "common_dates": common_dates,
        "watershed_analyses": ws_analyses,
        "ocean_analyses": oc_analyses,
        "smoke_cloud_diagnostics": smoke_cloud_diagnostics,
        "local_couplings": local_couplings,
        "spatial_dipoles": spatial_dipoles,
    }


def _contiguous_month_grid(dates: Sequence[str]) -> list[str]:
    y0, m0 = map(int, dates[0].split("-"))
    y1, m1 = map(int, dates[-1].split("-"))
    grid: list[str] = []
    cur_y, cur_m = y0, m0
    while (cur_y, cur_m) <= (y1, m1):
        grid.append(f"{cur_y:04d}-{cur_m:02d}")
        cur_m += 1
        if cur_m > 12:
            cur_m = 1
            cur_y += 1
    return grid


def _reindex_to_grid(
    dates: Sequence[str],
    values: Sequence[float | None],
    grid: Sequence[str],
) -> list[float | None]:
    lookup = dict(zip(dates, values))
    return [lookup.get(d) for d in grid]


def _rolling_mean_causal(values: Sequence[float | None], window: int) -> list[float | None]:
    """Trailing mean over [t - window, t - 1] (strictly causal: excludes month t)."""
    n = len(values)
    out: list[float | None] = [None] * n
    for t in range(window, n):
        seg = [values[k] for k in range(t - window, t)]
        if any(v is None for v in seg):
            continue
        out[t] = float(statistics.fmean(float(v) for v in seg if v is not None))
    return out


def _rolling_mean_inclusive(values: Sequence[float | None], window: int) -> list[float | None]:
    """Trailing mean over [t - window + 1, t] for contemporaneous physical attribution."""
    n = len(values)
    out: list[float | None] = [None] * n
    for t in range(window - 1, n):
        seg = [values[k] for k in range(t - window + 1, t + 1)]
        if any(v is None for v in seg):
            continue
        out[t] = float(statistics.fmean(float(v) for v in seg if v is not None))
    return out


def _lag_series(values: Sequence[float | None], lag: int) -> list[float | None]:
    n = len(values)
    out: list[float | None] = [None] * n
    for t in range(lag, n):
        out[t] = values[t - lag]
    return out


def _deseasonalize_in_fold(
    grid: Sequence[str],
    raw_values: Sequence[float | None],
    train_grid_indices: Sequence[int],
) -> list[float | None]:
    """Computes calendar-month anomalies across `grid` using climatologies learned ONLY on `train_grid_indices`."""
    buckets: dict[int, list[float]] = {m: [] for m in range(1, 13)}
    train_vals_all: list[float] = []
    for gi in train_grid_indices:
        v = raw_values[gi]
        if v is None:
            continue
        fv = float(v)
        m = int(grid[gi][5:7])
        buckets[m].append(fv)
        train_vals_all.append(fv)

    fallback = statistics.fmean(train_vals_all) if train_vals_all else 0.0
    month_means = {
        m: (statistics.fmean(buckets[m]) if buckets[m] else fallback)
        for m in range(1, 13)
    }
    return [
        None if v is None else float(v) - month_means[int(d[5:7])]
        for d, v in zip(grid, raw_values)
    ]


def _detrend_in_fold_array(
    arr: np.ndarray,
    train_pos_indices: Sequence[int],
) -> np.ndarray:
    """Removes linear trend estimated strictly on `train_pos_indices` from a 1D feature/target array."""
    t_all = np.arange(len(arr), dtype=np.float64)
    t_tr = t_all[train_pos_indices]
    y_tr = arr[train_pos_indices]
    if len(t_tr) < 6 or np.std(y_tr) < 1e-12:
        return arr.copy()
    slope, intercept = np.polyfit(t_tr, y_tr, 1)
    return arr - (slope * t_all + intercept)


def _assemble_watershed_raw_grid(
    ws_id: str,
    common_dates: Sequence[str],
    ws_analyses: Mapping[str, Mapping[str, Any]],
    oc_analyses: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    """Aligns raw watershed & ocean series on a contiguous monthly grid (no deseasonalization yet)."""
    grid = _contiguous_month_grid(common_dates)
    ws_raws = {
        var: _reindex_to_grid(common_dates, ws_analyses[ws_id][var]["series"]["raw_values"], grid)
        for var in (WATERSHED_VARIABLES + DERIVED_WATERSHED_VARIABLES)
    }
    oc_raws: dict[str, dict[str, list[float | None]]] = {}
    for oc_id, oc_vars in oc_analyses.items():
        oc_raws[oc_id] = {
            var: _reindex_to_grid(common_dates, oc_vars[var]["series"]["raw_values"], grid)
            for var in OCEAN_VARIABLES
        }

    max_lag = 6
    valid_grid_idx: list[int] = []
    for g_idx in range(max_lag, len(grid)):
        window_ok = True
        for k in range(g_idx - max_lag, g_idx + 1):
            for ser in ws_raws.values():
                if ser[k] is None:
                    window_ok = False
                    break
            if not window_ok:
                break
            for oc_map in oc_raws.values():
                for ser in oc_map.values():
                    if ser[k] is None:
                        window_ok = False
                        break
                if not window_ok:
                    break
            if not window_ok:
                break
        if window_ok:
            valid_grid_idx.append(g_idx)

    return {
        "grid": grid,
        "valid_grid_idx": valid_grid_idx,
        "valid_dates": [grid[i] for i in valid_grid_idx],
        "ws_raws": ws_raws,
        "oc_raws": oc_raws,
    }


def _all_ocean_candidate_specs() -> list[tuple[str, str, int]]:
    specs: list[tuple[str, str, int]] = []
    for oc_id in ("pac_nino34", "atl_ne", "atl_tn", "atl_s"):
        for oc_var in OCEAN_VARIABLES:
            for lag in OCEAN_LAGS:
                specs.append((oc_id, oc_var, lag))
    for lag in OCEAN_LAGS:
        specs.append(("atl_meridional_grad", "TS", lag))
    return specs


def _select_in_fold_ocean_features(
    features_np: Mapping[str, np.ndarray],
    y_np: np.ndarray,
    target_name: str,
    train_pos_indices: Sequence[int],
    top_k: int = IN_FOLD_TOP_K_OCEAN,
) -> list[str]:
    """Selects top-K lagged ocean features strictly inside `train_pos_indices` (zero selection leakage)."""
    tr_idx = np.asarray(train_pos_indices, dtype=np.int64)
    y_tr = y_np[tr_idx]
    t_tr = tr_idx.astype(np.float64)

    scored: list[tuple[float, str, str]] = []
    for oc_id, oc_var, lag in _all_ocean_candidate_specs():
        fname = f"ocean_{oc_id}__{oc_var}_lag{lag}"
        x_tr = features_np[fname][tr_idx]
        y_lag_tr = features_np[f"{target_name}_lag{lag}"][tr_idx]
        z_cond: list[np.ndarray] = [t_tr, y_lag_tr]
        if oc_id != "pac_nino34":
            nino_tr = features_np[f"ocean_pac_nino34__TS_lag{lag}"][tr_idx]
            z_cond.append(nino_tr)
        part_res = _ar1_partial_correlation_test(x_tr, y_tr, z_cond)
        scored.append((abs(part_res["r"]), fname, f"{oc_id}__{oc_var}"))

    scored.sort(key=lambda item: item[0], reverse=True)
    selected: list[str] = []
    pair_counts: dict[str, int] = {}
    for _, fname, pair_key in scored:
        if pair_counts.get(pair_key, 0) >= 2:
            continue
        selected.append(fname)
        pair_counts[pair_key] = pair_counts.get(pair_key, 0) + 1
        if len(selected) >= top_k:
            break
    return selected


def _build_fold_feature_arrays(
    raw_bundle: Mapping[str, Any],
    train_pos_indices: Sequence[int],
    target_name: str,
) -> tuple[dict[str, np.ndarray], np.ndarray, list[str]]:
    """Builds strictly leakage-free in-fold deseasonalized features, target arrays, and in-fold ocean picks."""
    grid: Sequence[str] = raw_bundle["grid"]
    valid_grid_idx: Sequence[int] = raw_bundle["valid_grid_idx"]
    train_grid_idx = [valid_grid_idx[p] for p in train_pos_indices]

    ws_anom = {
        var: _deseasonalize_in_fold(grid, ser, train_grid_idx)
        for var, ser in raw_bundle["ws_raws"].items()
    }
    oc_anom: dict[str, dict[str, list[float | None]]] = {
        oc_id: {
            var: _deseasonalize_in_fold(grid, ser, train_grid_idx)
            for var, ser in var_map.items()
        }
        for oc_id, var_map in raw_bundle["oc_raws"].items()
    }
    tn_ts = oc_anom["atl_tn"]["TS"]
    s_ts = oc_anom["atl_s"]["TS"]
    oc_anom["atl_meridional_grad"] = {
        "TS": [
            None if (a is None or b is None) else float(a) - float(b)
            for a, b in zip(tn_ts, s_ts)
        ]
    }

    t_series = ws_anom[target_name]
    feature_series: dict[str, list[float | None]] = {
        # Target AR(1..6) persistence & conditioning lags
        f"{target_name}_lag1": _lag_series(t_series, 1),
        f"{target_name}_lag2": _lag_series(t_series, 2),
        f"{target_name}_lag3": _lag_series(t_series, 3),
        f"{target_name}_lag4": _lag_series(t_series, 4),
        f"{target_name}_lag6": _lag_series(t_series, 6),
        f"{target_name}_roll3_lag1": _rolling_mean_causal(t_series, 3),
        # Mode A strictly causal lagged hydro-met & soil memory (lag >= 1)
        "PRECTOTCORR_lag1": _lag_series(ws_anom["PRECTOTCORR"], 1),
        "PRECTOTCORR_roll3_lag1": _rolling_mean_causal(ws_anom["PRECTOTCORR"], 3),
        "PRECTOTCORR_roll6_lag1": _rolling_mean_causal(ws_anom["PRECTOTCORR"], 6),
        "T2M_lag1": _lag_series(ws_anom["T2M"], 1),
        "VPD_t2m_lag1": _lag_series(ws_anom["VPD_t2m_kpa"], 1),
        "GWETTOP_lag1": _lag_series(ws_anom["GWETTOP"], 1),
        "GWETROOT_lag1": _lag_series(ws_anom["GWETROOT"], 1),
        # Mode A strictly causal lagged radiative drivers (lag >= 1)
        "ALLSKY_SFC_SW_DWN_lag1": _lag_series(ws_anom["ALLSKY_SFC_SW_DWN"], 1),
        "ALLSKY_SFC_SW_DWN_roll3_lag1": _rolling_mean_causal(ws_anom["ALLSKY_SFC_SW_DWN"], 3),
        "sw_cloud_radiative_effect_lag1": _lag_series(ws_anom["sw_cloud_radiative_effect"], 1),
        "CLOUD_AMT_lag1": _lag_series(ws_anom["CLOUD_AMT"], 1),
        "ALLSKY_SRF_ALB_lag1": _lag_series(ws_anom["ALLSKY_SRF_ALB"], 1),
        # Mode B contemporaneous physical attribution drivers (month t + GWETROOT_lag1)
        "PRECTOTCORR_t": ws_anom["PRECTOTCORR"],
        "PRECTOTCORR_roll3_incl": _rolling_mean_inclusive(ws_anom["PRECTOTCORR"], 3),
        "T2M_t": ws_anom["T2M"],
        "VPD_t2m_t": ws_anom["VPD_t2m_kpa"],
        "ALLSKY_SFC_SW_DWN_t": ws_anom["ALLSKY_SFC_SW_DWN"],
        "CLRSKY_SFC_SW_DWN_t": ws_anom["CLRSKY_SFC_SW_DWN"],
        "sw_cloud_radiative_effect_t": ws_anom["sw_cloud_radiative_effect"],
        "CLOUD_AMT_t": ws_anom["CLOUD_AMT"],
        "ALLSKY_SRF_ALB_t": ws_anom["ALLSKY_SRF_ALB"],
    }

    for oc_id, oc_var, lag in _all_ocean_candidate_specs():
        fname = f"ocean_{oc_id}__{oc_var}_lag{lag}"
        feature_series[fname] = _lag_series(oc_anom[oc_id][oc_var], lag)

    features_np = {
        name: np.asarray([float(ser[g_idx]) for g_idx in valid_grid_idx], dtype=np.float64)
        for name, ser in feature_series.items()
    }
    y_np = np.asarray([float(t_series[g_idx]) for g_idx in valid_grid_idx], dtype=np.float64)

    in_fold_ocean_cols = _select_in_fold_ocean_features(
        features_np, y_np, target_name, train_pos_indices, top_k=IN_FOLD_TOP_K_OCEAN
    )
    return features_np, y_np, in_fold_ocean_cols


def _feature_regimes_for_target(
    target_name: str,
    ocean_cols: Sequence[str],
) -> dict[str, dict[str, Any]]:
    """Defines Mode A (lagged forecast) and dual Mode B (level vs. in-fold detrended attribution) regimes."""
    ar1_cols = [
        f"{target_name}_lag1",
        f"{target_name}_lag2",
        f"{target_name}_roll3_lag1",
    ]
    hydro_extra = [
        "PRECTOTCORR_lag1",
        "PRECTOTCORR_roll3_lag1",
        "PRECTOTCORR_roll6_lag1",
        "T2M_lag1",
        "VPD_t2m_lag1",
        "GWETTOP_lag1",
    ]
    if target_name != "GWETROOT":
        hydro_extra.append("GWETROOT_lag1")

    lagged_hydro_met = ar1_cols + hydro_extra
    lagged_radiative = lagged_hydro_met + [
        "ALLSKY_SFC_SW_DWN_lag1",
        "ALLSKY_SFC_SW_DWN_roll3_lag1",
        "sw_cloud_radiative_effect_lag1",
        "CLOUD_AMT_lag1",
        "ALLSKY_SRF_ALB_lag1",
    ]
    oc_list = list(ocean_cols)
    lagged_ocean_only = ar1_cols + oc_list
    lagged_full_teleconnection = lagged_radiative + oc_list

    contemp_met_soil = [
        "PRECTOTCORR_t",
        "PRECTOTCORR_roll3_incl",
        "T2M_t",
        "VPD_t2m_t",
        "GWETROOT_lag1",
    ]
    contemp_met_soil_radiative = contemp_met_soil + [
        "ALLSKY_SFC_SW_DWN_t",
        "CLRSKY_SFC_SW_DWN_t",
        "sw_cloud_radiative_effect_t",
        "CLOUD_AMT_t",
        "ALLSKY_SRF_ALB_t",
    ]

    return {
        "ar1_persistence": {"mode": "forecast_lagged", "detrend_in_fold": False, "cols": ar1_cols},
        "lagged_hydro_met": {"mode": "forecast_lagged", "detrend_in_fold": False, "cols": lagged_hydro_met},
        "lagged_radiative": {"mode": "forecast_lagged", "detrend_in_fold": False, "cols": lagged_radiative},
        "lagged_ocean_only": {"mode": "forecast_lagged", "detrend_in_fold": False, "cols": lagged_ocean_only},
        "lagged_full_teleconnection": {
            "mode": "forecast_lagged",
            "detrend_in_fold": False,
            "cols": lagged_full_teleconnection,
        },
        "contemp_met_soil": {
            "mode": "attribution_contemporaneous_level",
            "detrend_in_fold": False,
            "cols": contemp_met_soil,
        },
        "contemp_met_soil_radiative": {
            "mode": "attribution_contemporaneous_level",
            "detrend_in_fold": False,
            "cols": contemp_met_soil_radiative,
        },
        "contemp_detrended_met_soil": {
            "mode": "attribution_contemporaneous_detrended",
            "detrend_in_fold": True,
            "cols": contemp_met_soil,
        },
        "contemp_detrended_met_soil_radiative": {
            "mode": "attribution_contemporaneous_detrended",
            "detrend_in_fold": True,
            "cols": contemp_met_soil_radiative,
        },
    }


def blocked_timeseries_cv_indices(
    n_samples: int,
    n_blocks: int = N_CV_BLOCKS,
    purge_gap: int = PURGE_GAP,
) -> list[tuple[np.ndarray, np.ndarray]]:
    """Generates contiguous chronological validation blocks with symmetric purge gaps."""
    if n_samples < n_blocks * 12:
        raise ValueError(f"Too few samples ({n_samples}) for {n_blocks} blocked CV folds.")
    blocks = np.array_split(np.arange(n_samples), n_blocks)
    folds: list[tuple[np.ndarray, np.ndarray]] = []
    for val_idx in blocks:
        val_start = int(val_idx[0])
        val_end = int(val_idx[-1])
        train_idx = np.asarray(
            [i for i in range(n_samples) if i < val_start - purge_gap or i > val_end + purge_gap],
            dtype=np.int64,
        )
        folds.append((train_idx, val_idx))
    return folds


def _make_estimator(model_name: str):
    if model_name == "RidgeCV":
        return make_pipeline(
            StandardScaler(),
            RidgeCV(alphas=np.logspace(-2, 4, 19)),
        )
    if model_name == "SplineGAM_Ridge":
        return make_pipeline(
            StandardScaler(),
            SplineTransformer(
                n_knots=4,
                degree=2,
                knots="uniform",
                extrapolation="linear",
                include_bias=False,
            ),
            RidgeCV(alphas=np.logspace(-1, 5, 19)),
        )
    if model_name == "HistGradientBoostingRegressor":
        return HistGradientBoostingRegressor(
            max_iter=100,
            max_depth=3,
            learning_rate=0.05,
            min_samples_leaf=18,
            l2_regularization=2.0,
            random_state=42,
        )
    if model_name == "RandomForestRegressor":
        return RandomForestRegressor(
            n_estimators=120,
            max_depth=5,
            min_samples_leaf=10,
            max_features="sqrt",
            random_state=42,
            n_jobs=1,
        )
    raise ValueError(f"Unknown model: {model_name}")


def _regime_shift_error_diagnostics(
    dates: Sequence[str],
    y_true: np.ndarray,
    y_pred: np.ndarray,
    split_date: str,
) -> dict[str, Any]:
    """Compares out-of-fold error and bias pre/post split WITHOUT short-horizon slope extrapolation."""
    pre_mask = np.asarray([d < split_date for d in dates], dtype=bool)
    post_mask = ~pre_mask
    full_resid_std = max(1e-9, float(np.std(y_true - y_pred)))
    out: dict[str, Any] = {}
    for label, mask in (("pre", pre_mask), ("post", post_mask)):
        if int(np.sum(mask)) < 12:
            out[label] = None
            continue
        yt = y_true[mask]
        yp = y_pred[mask]
        resid = yt - yp
        sub_dates = [d for d, keep in zip(dates, mask) if keep]
        frac_gt_2sd = float(np.mean(np.abs(resid) > 2.0 * full_resid_std))
        out[label] = {
            "n_months": int(np.sum(mask)),
            "start": sub_dates[0],
            "end": sub_dates[-1],
            "r2": round(float(r2_score(yt, yp)), 4),
            "mae": round(float(mean_absolute_error(yt, yp)), 4),
            "rmse": round(float(math.sqrt(mean_squared_error(yt, yp))), 4),
            "mean_bias_true_minus_pred": round(float(np.mean(resid)), 4),
            "max_abs_resid": round(float(np.max(np.abs(resid))), 4),
            "frac_large_resid_gt2sd": round(frac_gt_2sd, 4),
        }
    return out


def _bootstrap_regime_thresholds(
    X: np.ndarray,
    feature_names: Sequence[str],
    y_vals: np.ndarray,
    *,
    n_boot: int = 40,
    block_len: int = 12,
) -> list[dict[str, Any]]:
    """Quantifies threshold stability via contiguous 12-month block bootstrap on OOF-deseasonalized arrays."""
    n = len(y_vals)
    if n < 60:
        return []
    rng = np.random.default_rng(42)
    n_blocks_draw = max(1, math.ceil(n / block_len))
    max_start = max(1, n - block_len + 1)

    per_feature: dict[str, list[tuple[float, float]]] = {}
    for _ in range(n_boot):
        starts = rng.integers(0, max_start, size=n_blocks_draw)
        boot_idx = np.concatenate([np.arange(s, min(n, s + block_len)) for s in starts])[:n]
        tree = DecisionTreeRegressor(max_depth=2, min_samples_leaf=20, random_state=42)
        tree.fit(X[boot_idx], y_vals[boot_idx])
        t_obj = tree.tree_
        if int(t_obj.node_count) <= 1 or int(t_obj.feature[0]) < 0:
            continue
        seen_in_tree: set[str] = set()
        for node_id in range(t_obj.node_count):
            feat_idx = int(t_obj.feature[node_id])
            if feat_idx < 0:
                continue
            fname = feature_names[feat_idx]
            if fname in seen_in_tree:
                continue
            seen_in_tree.add(fname)
            left_id = int(t_obj.children_left[node_id])
            right_id = int(t_obj.children_right[node_id])
            jump = float(t_obj.value[right_id][0][0] - t_obj.value[left_id][0][0])
            per_feature.setdefault(fname, []).append((float(t_obj.threshold[node_id]), jump))

    summaries: list[dict[str, Any]] = []
    for fname, entries in per_feature.items():
        if len(entries) < 4:
            continue
        thresh = np.asarray([e[0] for e in entries], dtype=np.float64)
        jumps = np.asarray([e[1] for e in entries], dtype=np.float64)
        summaries.append(
            {
                "feature": fname,
                "bootstrap_selection_freq": round(len(entries) / float(n_boot), 3),
                "threshold_median_anom": round(float(np.median(thresh)), 4),
                "threshold_iqr_25_75": [
                    round(float(np.quantile(thresh, 0.25)), 4),
                    round(float(np.quantile(thresh, 0.75)), 4),
                ],
                "mean_jump_right_minus_left": round(float(np.mean(jumps)), 4),
            }
        )
    summaries.sort(key=lambda item: (item["bootstrap_selection_freq"], abs(item["mean_jump_right_minus_left"])), reverse=True)
    return summaries[:5]


def _quantile_regime_profile(
    x_vals: np.ndarray,
    y_vals: np.ndarray,
    feature_name: str,
) -> dict[str, Any]:
    edges = np.quantile(x_vals, [0.0, 0.25, 0.5, 0.75, 1.0])
    bins: list[dict[str, Any]] = []
    for q_idx in range(4):
        lo, hi = float(edges[q_idx]), float(edges[q_idx + 1])
        mask = (x_vals >= lo) & (x_vals < hi) if q_idx < 3 else (x_vals >= lo) & (x_vals <= hi)
        if int(np.sum(mask)) == 0:
            continue
        bins.append(
            {
                "quartile": f"Q{q_idx + 1}",
                "x_range": [round(lo, 4), round(hi, 4)],
                "n": int(np.sum(mask)),
                "mean_target_anomaly": round(float(np.mean(y_vals[mask])), 4),
            }
        )
    return {"feature": feature_name, "quartiles": bins}


def evaluate_models_for_watershed(
    ws_id: str,
    raw_bundle: Mapping[str, Any],
) -> dict[str, Any]:
    """Runs purged 5-block CV with strict in-fold climatology, in-fold detrending, and in-fold ocean selection."""
    valid_dates: Sequence[str] = raw_bundle["valid_dates"]
    n_samples = len(valid_dates)
    folds = blocked_timeseries_cv_indices(n_samples, n_blocks=N_CV_BLOCKS, purge_gap=PURGE_GAP)
    model_names = (
        "RidgeCV",
        "SplineGAM_Ridge",
        "HistGradientBoostingRegressor",
        "RandomForestRegressor",
    )

    out: dict[str, Any] = {
        "watershed_id": ws_id,
        "n_samples": n_samples,
        "date_range": [valid_dates[0], valid_dates[-1]],
        "purge_gap_months": PURGE_GAP,
        "targets": {},
    }

    for target_name in TARGETS:
        fold_arrays = [
            _build_fold_feature_arrays(raw_bundle, train_idx, target_name)
            for train_idx, _ in folds
        ]
        in_fold_ocean_selections = [oc_cols for _, _, oc_cols in fold_arrays]

        # Build strictly out-of-fold deseasonalized feature & target matrix for threshold/quartile diagnostics
        oof_feat_map: dict[str, np.ndarray] = {}
        oof_y_deseas = np.zeros(n_samples, dtype=np.float64)
        for (_, val_idx), (feat_map, y_fold, _) in zip(folds, fold_arrays):
            oof_y_deseas[val_idx] = y_fold[val_idx]
            for fname, farr in feat_map.items():
                if fname not in oof_feat_map:
                    oof_feat_map[fname] = np.zeros(n_samples, dtype=np.float64)
                oof_feat_map[fname][val_idx] = farr[val_idx]

        # Reference regime definitions (using fold 0 ocean cols as structural template; actual ocean cols vary per fold)
        regimes_template = _feature_regimes_for_target(target_name, in_fold_ocean_selections[0])
        target_out: dict[str, Any] = {
            "in_fold_selected_ocean_features": {
                f"fold_{i + 1}": cols for i, cols in enumerate(in_fold_ocean_selections)
            },
            "feature_regimes": {},
        }

        for regime_name, rmeta in regimes_template.items():
            detrend_flag = bool(rmeta["detrend_in_fold"])
            regime_out: dict[str, Any] = {
                "scientific_mode": rmeta["mode"],
                "detrended_in_fold": detrend_flag,
                "n_features": len(rmeta["cols"]),
                "models": {},
            }

            for model_name in model_names:
                oof_y_true = np.zeros(n_samples, dtype=np.float64)
                oof_y_pred = np.zeros(n_samples, dtype=np.float64)
                fold_metrics: list[dict[str, Any]] = []
                perm_by_feature: dict[str, list[float]] = {}

                for fold_idx, ((train_idx, val_idx), (feat_map, y_fold, fold_oc_cols)) in enumerate(
                    zip(folds, fold_arrays)
                ):
                    fold_regimes = _feature_regimes_for_target(target_name, fold_oc_cols)
                    col_names = fold_regimes[regime_name]["cols"]

                    if detrend_flag:
                        X_fold = np.column_stack(
                            [_detrend_in_fold_array(feat_map[c], train_idx) for c in col_names]
                        )
                        y_work = _detrend_in_fold_array(y_fold, train_idx)
                    else:
                        X_fold = np.column_stack([feat_map[c] for c in col_names])
                        y_work = y_fold

                    est = _make_estimator(model_name)
                    est.fit(X_fold[train_idx], y_work[train_idx])
                    preds = est.predict(X_fold[val_idx])

                    oof_y_true[val_idx] = y_work[val_idx]
                    oof_y_pred[val_idx] = preds

                    fold_ev = float(explained_variance_score(y_work[val_idx], preds))
                    fold_r2_raw = float(r2_score(y_work[val_idx], preds))
                    # Under in-fold detrending, fold mean offsets from trend extrapolation punish raw r2_score (C4.1)
                    fold_r2 = fold_ev if detrend_flag else fold_r2_raw
                    fold_mae = float(mean_absolute_error(y_work[val_idx], preds))
                    fold_rmse = float(math.sqrt(mean_squared_error(y_work[val_idx], preds)))
                    fold_metrics.append(
                        {
                            "fold": fold_idx + 1,
                            "val_period": [valid_dates[int(val_idx[0])], valid_dates[int(val_idx[-1])]],
                            "n_train": int(len(train_idx)),
                            "n_val": int(len(val_idx)),
                            "r2": round(fold_r2, 4),
                            "explained_variance": round(fold_ev, 4),
                            "r2_raw": round(fold_r2_raw, 4),
                            "mae": round(fold_mae, 4),
                            "rmse": round(fold_rmse, 4),
                        }
                    )

                    perm = permutation_importance(
                        est,
                        X_fold[val_idx],
                        y_work[val_idx],
                        n_repeats=5,
                        random_state=42 + fold_idx,
                        scoring="explained_variance" if detrend_flag else "r2",
                    )
                    for cname, imp_val in zip(col_names, perm.importances_mean):
                        perm_by_feature.setdefault(cname, []).append(float(imp_val))

                fold_r2_vals = [f["r2"] for f in fold_metrics]
                fold_mean_r2 = float(np.mean(fold_r2_vals))
                fold_median_r2 = float(np.median(fold_r2_vals))
                fold_min_r2 = float(np.min(fold_r2_vals))
                oof_ev = float(explained_variance_score(oof_y_true, oof_y_pred))
                oof_r2 = float(oof_ev if detrend_flag else r2_score(oof_y_true, oof_y_pred))
                oof_mae = float(mean_absolute_error(oof_y_true, oof_y_pred))
                oof_rmse = float(math.sqrt(mean_squared_error(oof_y_true, oof_y_pred)))

                top_importances = [
                    {
                        "feature": cname,
                        "importance_r2_drop_mean": round(float(np.mean(vals)), 5),
                        "importance_r2_drop_std": round(float(np.std(vals)), 5),
                        "folds_selected_count": len(vals),
                    }
                    for cname, vals in perm_by_feature.items()
                ]
                top_importances.sort(key=lambda item: item["importance_r2_drop_mean"], reverse=True)

                # Remove Fold-0 unilateral future-to-past extrapolation bias before boundary-free CUSUM
                y_pred_cusum = oof_y_pred
                if len(folds) >= 3:
                    f0_val = folds[0][1]
                    interior_val = np.concatenate([f[1] for f in folds[1:-1]])
                    if len(f0_val) > 0 and len(interior_val) > 0:
                        raw_res = oof_y_true - oof_y_pred
                        delta0 = float(np.mean(raw_res[f0_val]) - np.mean(raw_res[interior_val]))
                        y_pred_cusum = oof_y_pred.copy()
                        y_pred_cusum[f0_val] += delta0

                regime_out["models"][model_name] = {
                    "fold_mean_r2": round(fold_mean_r2, 4),
                    "fold_median_r2": round(fold_median_r2, 4),
                    "fold_min_r2": round(fold_min_r2, 4),
                    "cv_oof_r2": round(oof_r2, 4),
                    "cv_oof_explained_variance": round(oof_ev, 4),
                    "cv_oof_mae": round(oof_mae, 4),
                    "cv_oof_rmse": round(oof_rmse, 4),
                    "folds": fold_metrics,
                    "permutation_importance_top10": top_importances[:10],
                    "regime_diagnostics_2020": _regime_shift_error_diagnostics(
                        valid_dates, oof_y_true, oof_y_pred, "2020-01"
                    ),
                    "cusum_coupling_break": detect_physical_coupling_break(
                        valid_dates, oof_y_true, y_pred_cusum, detrended_regime=detrend_flag
                    ),
                }

                if (
                    regime_name in ("contemp_met_soil_radiative", "contemp_detrended_met_soil_radiative", "lagged_radiative")
                    and model_name == "HistGradientBoostingRegressor"
                ):
                    stable_cols = [c for c in rmeta["cols"] if c in oof_feat_map]
                    # Apply symmetric detrending to X_oof_mat and quartile predictors when detrend_flag=True (C4.2)
                    X_oof_mat = np.column_stack(
                        [
                            _detrend_linear(oof_feat_map[c]) if detrend_flag else oof_feat_map[c]
                            for c in stable_cols
                        ]
                    )
                    y_oof_vec = _detrend_linear(oof_y_deseas) if detrend_flag else oof_y_deseas
                    regime_out["bootstrap_threshold_stability"] = _bootstrap_regime_thresholds(
                        X_oof_mat, stable_cols, y_oof_vec
                    )
                    top3_cols = [
                        item["feature"]
                        for item in top_importances
                        if item["feature"] in oof_feat_map
                    ][:3]
                    regime_out["top_feature_quartile_profiles"] = [
                        _quantile_regime_profile(
                            _detrend_linear(oof_feat_map[cname]) if detrend_flag else oof_feat_map[cname],
                            y_oof_vec,
                            cname,
                        )
                        for cname in top3_cols
                    ]

            target_out["feature_regimes"][regime_name] = regime_out

        # Compute scale-invariant Out-of-Fold Skill Scores vs best AR(1) baseline
        fr = target_out["feature_regimes"]
        ar1_models = fr["ar1_persistence"]["models"]
        best_ar1_model_name = min(model_names, key=lambda m: ar1_models[m]["cv_oof_rmse"])
        ar1_best_oof_rmse = max(1e-9, float(ar1_models[best_ar1_model_name]["cv_oof_rmse"]))
        ar1_best_oof_mae = max(1e-9, float(ar1_models[best_ar1_model_name]["cv_oof_mae"]))
        ar1_best_fold_r2 = max(ar1_models[m]["fold_mean_r2"] for m in model_names)

        for rblock in fr.values():
            for mblock in rblock["models"].values():
                m_rmse = float(mblock["cv_oof_rmse"])
                m_mae = float(mblock["cv_oof_mae"])
                mblock["skill_rmse_vs_ar1"] = round(1.0 - (m_rmse / ar1_best_oof_rmse), 4)
                mblock["skill_mse_vs_ar1"] = round(1.0 - ((m_rmse ** 2) / (ar1_best_oof_rmse ** 2)), 4)
                mblock["skill_mae_vs_ar1"] = round(1.0 - (m_mae / ar1_best_oof_mae), 4)

        mode_a_summary: dict[str, Any] = {}
        for rname in (
            "ar1_persistence",
            "lagged_hydro_met",
            "lagged_radiative",
            "lagged_ocean_only",
            "lagged_full_teleconnection",
        ):
            best_m = max(model_names, key=lambda m: fr[rname]["models"][m]["skill_rmse_vs_ar1"])
            mb = fr[rname]["models"][best_m]
            mode_a_summary[rname] = {
                "best_model": best_m,
                "skill_rmse_vs_ar1": mb["skill_rmse_vs_ar1"],
                "skill_mse_vs_ar1": mb["skill_mse_vs_ar1"],
                "cv_oof_rmse": mb["cv_oof_rmse"],
                "cv_oof_mae": mb["cv_oof_mae"],
                "fold_mean_r2": mb["fold_mean_r2"],
                "cv_oof_r2": mb["cv_oof_r2"],
                "skill_vs_best_ar1_fold_r2": round(mb["fold_mean_r2"] - ar1_best_fold_r2, 4),
            }

        def _summarize_mode_b(base_regime: str, rad_regime: str) -> dict[str, Any]:
            c_base = fr[base_regime]["models"]
            c_rad = fr[rad_regime]["models"]
            ridge_r2 = c_rad["RidgeCV"]["fold_mean_r2"]
            gam_r2 = c_rad["SplineGAM_Ridge"]["fold_mean_r2"]
            hgbr_r2 = c_rad["HistGradientBoostingRegressor"]["fold_mean_r2"]
            rf_r2 = c_rad["RandomForestRegressor"]["fold_mean_r2"]
            best_met = max(c_base[m]["fold_mean_r2"] for m in model_names)
            best_rad_m = max(model_names, key=lambda m: c_rad[m]["fold_mean_r2"])
            best_rad = c_rad[best_rad_m]["fold_mean_r2"]
            best_oof_r2 = c_rad[best_rad_m]["cv_oof_r2"]
            return {
                "best_met_soil_fold_mean_r2": best_met,
                "best_met_soil_radiative_model": best_rad_m,
                "best_met_soil_radiative_fold_mean_r2": best_rad,
                "best_met_soil_radiative_oof_r2": best_oof_r2,
                "delta_radiative_over_met_fold_r2": round(best_rad - best_met, 4),
                "by_model_fold_mean_r2": {
                    "RidgeCV": ridge_r2,
                    "SplineGAM_Ridge": gam_r2,
                    "HistGradientBoostingRegressor": hgbr_r2,
                    "RandomForestRegressor": rf_r2,
                },
                "nonlinearity_gam_minus_ridge_r2": round(gam_r2 - ridge_r2, 4),
                "nonlinearity_hgbr_minus_ridge_r2": round(hgbr_r2 - ridge_r2, 4),
                "cusum_coupling_break": c_rad[best_rad_m]["cusum_coupling_break"],
            }

        level_summary = _summarize_mode_b("contemp_met_soil", "contemp_met_soil_radiative")
        detrended_summary = _summarize_mode_b(
            "contemp_detrended_met_soil", "contemp_detrended_met_soil_radiative"
        )

        target_out["scientific_summary"] = {
            "mode_a_forecast_lagged": mode_a_summary,
            "mode_b_attribution_contemporaneous": level_summary,
            "mode_b_attribution_detrended_interannual": detrended_summary,
        }
        out["targets"][target_name] = target_out

    return out


def scan_ocean_teleconnections(
    valid_watersheds: Mapping[str, Any],
    common_dates: Sequence[str],
    ws_analyses: Mapping[str, Mapping[str, Any]],
    oc_analyses: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    """Tests lagged ocean->watershed teleconnections over the orthogonal target family (`TARGETS_TELECONNECTION`).

    Computes raw anomaly r, linear-detrended r, and partial correlation r(X_{t-tau}, Y_t | Z_total)
    conditioned on Z_total(tau, k) = {t, Y_{t-tau}, Nino3.4_{t-tau}} with df_eff = N_eff(e_X, e_Y) - 2 - |Z|.
    """
    tests: list[dict[str, Any]] = []

    ocean_predictors: dict[str, dict[str, np.ndarray]] = {}
    for oc_id, oc_vars in oc_analyses.items():
        ocean_predictors[oc_id] = {
            oc_var: np.asarray(oc_vars[oc_var]["series"]["anomaly_values"], dtype=np.float64)
            for oc_var in OCEAN_VARIABLES
        }
    ocean_predictors["atl_meridional_grad"] = {
        "TS": ocean_predictors["atl_tn"]["TS"] - ocean_predictors["atl_s"]["TS"]
    }
    nino34_ts_full = ocean_predictors["pac_nino34"]["TS"]

    for ws_id in valid_watersheds:
        for target_var in TARGETS_TELECONNECTION:
            y_full = np.asarray(ws_analyses[ws_id][target_var]["series"]["anomaly_values"], dtype=np.float64)
            for oc_id, oc_var_map in ocean_predictors.items():
                for oc_var, x_full in oc_var_map.items():
                    for lag in OCEAN_LAGS:
                        x_lag = x_full[:-lag]
                        y_cur = y_full[lag:]
                        y_lag = y_full[:-lag]
                        if len(x_lag) < 24:
                            continue
                        t_vec = np.arange(len(x_lag), dtype=np.float64)
                        z_cond: list[np.ndarray] = [t_vec, y_lag]
                        if oc_id != "pac_nino34":
                            z_cond.append(nino34_ts_full[:-lag])

                        anom_res = _ar1_pearson_test(x_lag, y_cur)
                        det_res = _ar1_pearson_test(_detrend_linear(x_lag), _detrend_linear(y_cur))
                        part_res = _ar1_partial_correlation_test(x_lag, y_cur, z_cond)

                        tests.append(
                            {
                                "watershed_id": ws_id,
                                "target_var": target_var,
                                "ocean_box_id": oc_id,
                                "ocean_var": oc_var,
                                "lag_months": lag,
                                "n_pairs": int(anom_res["n_pairs"]),
                                "conditioning_set": (
                                    ["t", f"{target_var}_t-{lag}"]
                                    if oc_id == "pac_nino34"
                                    else ["t", f"{target_var}_t-{lag}", f"pac_nino34.TS_t-{lag}"]
                                ),
                                "anomaly_r": round(anom_res["r"], 4),
                                "anomaly_n_eff_ar1": round(anom_res["n_eff"], 2),
                                "anomaly_p_ar1": round(anom_res["p_value_ar1"], 8),
                                "detrended_r": round(det_res["r"], 4),
                                "detrended_n_eff_ar1": round(det_res["n_eff"], 2),
                                "detrended_p_ar1": round(det_res["p_value_ar1"], 8),
                                "partial_r": round(part_res["r"], 4),
                                "partial_n_eff_ar1": round(part_res["n_eff"], 2),
                                "partial_df_eff": round(part_res["df_eff"], 2),
                                "partial_p_ar1": round(part_res["p_value_ar1"], 8),
                            }
                        )

    q_anom, sig_anom = apply_spatial_fdr_bh([t["anomaly_p_ar1"] for t in tests], alpha=0.05)
    q_det, sig_det = apply_spatial_fdr_bh([t["detrended_p_ar1"] for t in tests], alpha=0.05)
    q_part, sig_part = apply_spatial_fdr_bh([t["partial_p_ar1"] for t in tests], alpha=0.05)

    for test, qa, sa, qd, sd, qp, sp in zip(tests, q_anom, sig_anom, q_det, sig_det, q_part, sig_part):
        test["anomaly_fdr_q"] = round(float(qa), 8)
        test["is_anomaly_sig_fdr05"] = bool(sa)
        test["detrended_fdr_q"] = round(float(qd), 8)
        test["is_detrended_sig_fdr05"] = bool(sd)
        test["partial_fdr_q"] = round(float(qp), 8)
        test["is_partial_sig_fdr05"] = bool(sp)
        test["is_strictly_coupled_fdr05"] = bool(sa and sd)
        test["is_strictly_partial_coupled_fdr05"] = bool(sd and sp)

    # Also compute per-compartment partitioned FDR
    for tvar in TARGETS_TELECONNECTION:
        sub = [t for t in tests if t["target_var"] == tvar]
        if not sub:
            continue
        qp_sub, sp_sub = apply_spatial_fdr_bh([t["partial_p_ar1"] for t in sub], alpha=0.05)
        for t, qv, sv in zip(sub, qp_sub, sp_sub):
            t["partial_fdr_q_by_target"] = round(float(qv), 8)
            t["is_partial_sig_by_target_fdr05"] = bool(sv)

    by_detrended = sorted(tests, key=lambda item: abs(item["detrended_r"]), reverse=True)
    by_partial = sorted(tests, key=lambda item: abs(item["partial_r"]), reverse=True)
    strict_sig = [t for t in by_detrended if t["is_strictly_coupled_fdr05"]]
    partial_sig = [t for t in by_partial if t["is_partial_sig_fdr05"]]
    det_sig = [t for t in by_detrended if t["is_detrended_sig_fdr05"]]
    anom_sig = [t for t in by_detrended if t["is_anomaly_sig_fdr05"]]

    return {
        "targets_evaluated_orthogonal": list(TARGETS_TELECONNECTION),
        "total_tests": len(tests),
        "significant_anomaly_fdr05_count": len(anom_sig),
        "significant_detrended_fdr05_count": len(det_sig),
        "significant_partial_fdr05_count": len(partial_sig),
        "significant_strict_both_fdr05_count": len(strict_sig),
        "top_partial_coupled_fdr05": partial_sig[:25],
        "top_strict_coupled_fdr05": strict_sig[:25],
        "top_detrended_fdr05": det_sig[:25],
        "top_by_abs_detrended_r": by_detrended[:25],
    }


def run_pipeline(
    cache_dir: Path,
    output_json: Path,
    *,
    synthetic_self_test: bool = False,
) -> dict[str, Any]:
    """Executes end-to-end discovery pipeline and persists JSON in live mode."""
    if synthetic_self_test:
        fetched = _generate_synthetic_self_test_payload()
    else:
        cache = CellCacheStore(cache_dir)
        fetched = fetch_all_regions(cache=cache, cache_dir=cache_dir)

    valid_watersheds = {
        ws_id: entry
        for ws_id, entry in fetched["watersheds"].items()
        if entry["glofas_check"]["valid"]
    }
    if not valid_watersheds:
        raise RuntimeError("No watersheds passed GloFAS main-channel non-zero validation.")

    diagnostics = run_statistical_diagnostics(valid_watersheds, fetched["oceans"])
    common_dates = diagnostics["common_dates"]
    ws_analyses = diagnostics["watershed_analyses"]
    oc_analyses = diagnostics["ocean_analyses"]

    ml_results: dict[str, Any] = {}
    for ws_id in valid_watersheds:
        raw_bundle = _assemble_watershed_raw_grid(ws_id, common_dates, ws_analyses, oc_analyses)
        ml_results[ws_id] = {
            "watershed_name": valid_watersheds[ws_id]["spec"]["name"],
            "ml_evaluation": evaluate_models_for_watershed(ws_id, raw_bundle),
        }

    teleconnection_scan = scan_ocean_teleconnections(
        valid_watersheds, common_dates, ws_analyses, oc_analyses
    )

    output_payload: dict[str, Any] = {
        "metadata": {
            "pipeline": "earth_system_ml_discovery_v2",
            "schema_revision": "2.1_post_audit_passo0",
            "mode": "synthetic_self_test" if synthetic_self_test else "live_real_data",
            "window_requested": f"{START_YEAR:04d}-01..{END_YEAR:04d}-12",
            "window_intersecting": f"{common_dates[0]}..{common_dates[-1]}",
            "n_intersecting_months": len(common_dates),
            "cv_scheme": (
                f"{N_CV_BLOCKS}-block purged chronological CV (purge_gap={PURGE_GAP} months) "
                "with strictly in-fold climatological deseasonalization, in-fold linear detrending "
                "(Mode B interannual), and strictly in-fold top-K ocean feature selection"
            ),
            "models_evaluated": [
                "RidgeCV",
                "SplineGAM_Ridge",
                "HistGradientBoostingRegressor",
                "RandomForestRegressor",
            ],
        },
        "glofas_validation": fetched["glofas_checks"],
        "valid_watersheds_evaluated": list(valid_watersheds.keys()),
        "statistical_diagnostics": {
            "watersheds": {
                ws_id: {var: _extract_stats_summary(ana, common_dates) for var, ana in vars_map.items()}
                for ws_id, vars_map in ws_analyses.items()
            },
            "oceans": {
                oc_id: {var: _extract_stats_summary(ana, common_dates) for var, ana in vars_map.items()}
                for oc_id, vars_map in oc_analyses.items()
            },
            "smoke_cloud_radiative_decoupling": diagnostics["smoke_cloud_diagnostics"],
            "local_multiscale_couplings": diagnostics["local_couplings"],
            "spatial_dipoles": diagnostics["spatial_dipoles"],
        },
        "ocean_teleconnection_fdr_scan": teleconnection_scan,
        "ml_models": ml_results,
    }

    if not synthetic_self_test:
        output_json.parent.mkdir(parents=True, exist_ok=True)
        output_json.write_text(json.dumps(output_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    return output_payload


def _generate_synthetic_self_test_payload() -> dict[str, Any]:
    """Deterministic offline fixture validating physics, units, non-linearity, dipoles, and FDR."""
    rng = np.random.default_rng(42)
    dates = [f"{yr:04d}-{m:02d}" for yr in range(START_YEAR, END_YEAR + 1) for m in range(1, 13)]
    n = len(dates)
    t_idx = np.arange(n, dtype=np.float64)
    season = np.sin(2.0 * np.pi * (t_idx % 12.0) / 12.0)

    oceans_raw: dict[str, Any] = {}
    ocean_signals: dict[str, np.ndarray] = {}
    for oc in OCEAN_BOX_SPECS:
        sig = np.zeros(n)
        for k in range(1, n):
            sig[k] = 0.72 * sig[k - 1] + rng.normal(0.0, 0.65)
        ocean_signals[oc["id"]] = sig
        vars_out = {}
        for v in OCEAN_VARIABLES:
            base = 26.0 if v == "TS" else (55.0 if v == "CLOUD_AMT" else 20.0)
            scale = 0.9 if v == "TS" else (6.0 if v == "CLOUD_AMT" else 1.8)
            vars_out[v] = {
                "status": "OK",
                "series": {
                    d: round(float(base + scale * season[i] + 0.5 * scale * sig[i] + rng.normal(0, 0.15)), 4)
                    for i, d in enumerate(dates)
                },
            }
        oceans_raw[oc["id"]] = {"spec": oc, "ingestion": {"variables": vars_out}}

    watersheds_raw: dict[str, Any] = {}
    pac_sig = ocean_signals["pac_nino34"]
    for idx, ws in enumerate(WATERSHED_SPECS[:2]):
        sign = 1.0 if idx == 0 else -1.0
        rain = np.maximum(15.0, 160.0 + 95.0 * season + sign * 25.0 * np.roll(pac_sig, 2) + rng.normal(0.0, 15.0, n))
        rad = np.maximum(8.0, 18.5 - 3.2 * season + 0.04 * (t_idx / 12.0) + rng.normal(0.0, 0.9, n))
        clr = rad + 5.2 + 0.8 * np.maximum(0.0, season)
        # Inject synthetic smoke shock in 2024-09 (index 284)
        clr[284] -= 6.5
        t2m = 25.5 + 2.2 * season + 0.03 * (t_idx / 12.0) + rng.normal(0.0, 0.4, n)
        tmax = t2m + 4.8 + 0.5 * (rad - 18.5)
        tdew = 21.0 + 1.4 * season + rng.normal(0.0, 0.4, n)
        gwet = np.zeros(n)
        gwet[0] = 0.58
        for k in range(1, n):
            gwet[k] = float(
                np.clip(
                    0.58
                    + 0.65 * (gwet[k - 1] - 0.58)
                    + 0.0012 * (rain[k] - 160.0)
                    - 0.008 * (rad[k] - 18.5)
                    + sign * 0.018 * pac_sig[max(0, k - 2)]
                    + rng.normal(0, 0.015),
                    0.15,
                    0.92,
                )
            )
        q_mean = np.maximum(
            100.0,
            4500.0
            + 3800.0 * (gwet - 0.58)
            + 18.0 * (rain - 160.0)
            + 0.14 * np.maximum(0.0, rain - 220.0) ** 2
            - 220.0 * np.maximum(0.0, rad - 20.0)
            + sign * 420.0 * np.roll(pac_sig, 2)
            + rng.normal(0.0, 140.0, n),
        )
        q_min = np.maximum(60.0, 0.72 * q_mean)
        vars_map = {
            "river_discharge": q_mean,
            "river_discharge_min": q_min,
            "river_discharge_max": 1.38 * q_mean,
            "GWETROOT": gwet,
            "GWETTOP": np.clip(gwet + rng.normal(0, 0.02, n), 0.1, 0.96),
            "PRECTOTCORR": rain,
            "T2M": t2m,
            "T2M_MAX": tmax,
            "T2MDEW": tdew,
            "ALLSKY_SFC_SW_DWN": rad,
            "CLRSKY_SFC_SW_DWN": clr,
            "CLOUD_AMT": np.clip(62.0 + 14.0 * season - 2.1 * (rad - 18.5), 5.0, 99.0),
            "ALLSKY_SRF_ALB": np.clip(0.14 + 0.004 * (rad - 18.5), 0.05, 0.40),
        }
        ingestion_vars = {
            v: {"status": "OK", "agg_v": 2, "series": {d: round(float(arr[i]), 4) for i, d in enumerate(dates)}}
            for v, arr in vars_map.items()
        }
        watersheds_raw[ws["id"]] = {
            "spec": ws,
            "ingestion": {"variables": ingestion_vars},
            "glofas_check": validate_glofas_discharge(
                ws["name"],
                ingestion_vars,
                snapped_meta={"snapped_lat": ws["glofas_scout_center"][0], "snapped_lon": ws["glofas_scout_center"][1], "scout_2023_mean_m3s": 4500.0},
            ),
        }

    return {
        "watersheds": watersheds_raw,
        "oceans": oceans_raw,
        "glofas_checks": {k: v["glofas_check"] for k, v in watersheds_raw.items()},
    }


def _assert_self_test_invariants(payload: Mapping[str, Any]) -> None:
    """Verifies Invariant 3 units, FAO-56 VPD, non-tautological GAM r, CUSUM breaks, and orthogonal FDR."""
    ws0 = payload["valid_watersheds_evaluated"][0]
    ws_stats = payload["statistical_diagnostics"]["watersheds"][ws0]
    assert ws_stats["ALLSKY_SFC_SW_DWN"]["unit"] == "MJ/m²/day"
    assert ws_stats["CLRSKY_SFC_SW_DWN"]["unit"] == "MJ/m²/day"
    assert ws_stats["CLOUD_AMT"]["allow_percentage_change"] is False
    assert ws_stats["ALLSKY_SRF_ALB"]["allow_percentage_change"] is False
    assert ws_stats["VPD_t2m_kpa"]["unit"] == "kPa"
    assert ws_stats["sw_cloud_radiative_effect"]["allow_percentage_change"] is False
    assert "temporal_regime_break_cusum" in ws_stats["river_discharge_min"]

    # Verify Jensen's inequality: FAO-56 VPD > naive mean-temperature VPD when T2M_MAX > T2M
    vpd_naive = compute_vpd_fao56_series([25.0], [20.0])
    vpd_fao56 = compute_vpd_fao56_series([25.0], [20.0], t2m_max=[32.0])
    assert vpd_fao56[0] is not None and vpd_naive[0] is not None
    assert vpd_fao56[0] > vpd_naive[0], "FAO-56 convex VPD must exceed naive T2M VPD."

    local_couplings = payload["statistical_diagnostics"]["local_multiscale_couplings"][ws0]
    for c in local_couplings.values():
        assert "spatial_divergence_detected" not in c
        assert "detrended_fdr_q" in c
        assert "secular_gam_r" in c
        assert "secular_ols_r" not in c, "Tautological secular_ols_r must not be present."

    ml_eval = payload["ml_models"][ws0]["ml_evaluation"]
    assert ml_eval["purge_gap_months"] == 6
    qmin_res = ml_eval["targets"]["river_discharge_min"]
    assert "in_fold_selected_ocean_features" in qmin_res
    assert "contemp_detrended_met_soil_radiative" in qmin_res["feature_regimes"]
    for b in qmin_res["feature_regimes"]["contemp_met_soil_radiative"].get("bootstrap_threshold_stability", []):
        assert 0.0 <= b["bootstrap_selection_freq"] <= 1.0
    ridge_m = qmin_res["feature_regimes"]["lagged_radiative"]["models"]["RidgeCV"]
    assert "skill_rmse_vs_ar1" in ridge_m
    assert "cusum_coupling_break" in ridge_m

    scan = payload["ocean_teleconnection_fdr_scan"]
    assert scan["targets_evaluated_orthogonal"] == ["river_discharge_min", "GWETROOT"]
    assert scan["significant_partial_fdr05_count"] >= 1, "Synthetic Pacific dipole did not pass partial FDR."


def main() -> None:
    parser = argparse.ArgumentParser(description="Earth System ML Discovery Pipeline v2.1 (2001-2025).")
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=ROOT_DIR / "data" / "cache" / "storage",
        help="Path to CellCacheStore JSON storage directory.",
    )
    parser.add_argument(
        "--output-json",
        type=Path,
        default=Path(__file__).resolve().parent / "ml_discovery_results.json",
        help="Output path for structured JSON discovery findings.",
    )
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="Run in-memory synthetic verification without network calls or overwriting production JSON.",
    )
    args = parser.parse_args()

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        payload = run_pipeline(args.cache_dir, args.output_json, synthetic_self_test=args.self_test)

    if args.self_test:
        _assert_self_test_invariants(payload)

    print(
        json.dumps(
            {
                "pipeline": payload["metadata"]["pipeline"],
                "schema_revision": payload["metadata"]["schema_revision"],
                "mode": payload["metadata"]["mode"],
                "window": payload["metadata"]["window_intersecting"],
                "n_months": payload["metadata"]["n_intersecting_months"],
                "valid_watersheds": payload["valid_watersheds_evaluated"],
                "fdr_sig_partial_teleconnections": payload["ocean_teleconnection_fdr_scan"][
                    "significant_partial_fdr05_count"
                ],
                "fdr_sig_strict_both_teleconnections": payload["ocean_teleconnection_fdr_scan"][
                    "significant_strict_both_fdr05_count"
                ],
                "fdr_sig_detrended_teleconnections": payload["ocean_teleconnection_fdr_scan"][
                    "significant_detrended_fdr05_count"
                ],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
