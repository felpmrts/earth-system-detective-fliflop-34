"""
Statistical Engine (DADOS-2) — Be An Earth System Trend Detective! (NASA Space Apps 2026)

Implements the 7 State-of-the-Art Statistical Invariants from Hindemburg Melão Jr.
and modern statistical climatology (Santer et al., 2000; Hamed & Rao, 1998; Theil-Sen;
Minimum Covariance Determinant Mahalanobis; GCV Cubic Smoothing Spline; Benjamini-Hochberg FDR),
strictly adhering to CONTRATO_DE_DADOS.md:

1. FORBIDDEN endpoint subtraction (Y_end - Y_start): all slopes (OLS & Theil-Sen) and
   cumulative changes are derived from regression over the entire cloud of N points.
2. Henrietta Leavitt Principle (confounder isolation): monthly seasonal cycle is removed
   via Climatological Monthly Anomalies (Y'_{a,m} = Y_{a,m} - mean(Y_m)) prior to trend
   regression, and regional/variable comparisons enforce identical time windows [t_0, t_f].
3. Strict measurement scale respect: interval variables (°C, kPa, anomalies) strictly
   forbid percentage change (allow_percentage_change = False).
4. Orthogonal display of Regression Slope (B) and Correlation/Coupling (r, tau, ellipse ratio).
5. Multiscale correlation decomposition: Long-term secular correlation (r_global) vs.
   Short-term detrended residual correlation (r_detrended).
6. Non-linear modeling via LOWESS + GCV Penalized Cubic Smoothing Spline (GAM) + quadratic
   acceleration (B2) without unconstrained high-degree polynomials.
7. Robust Bivariate Mahalanobis distance (MinCovDet + MAD, D_M > 2.5) outlier detection
   (flagged, never silently erased) + AR(1) effective sample size (Santer et al., 2000)
   + Hamed-Rao Modified Mann-Kendall + Benjamini-Hochberg spatial FDR (q < 0.05).

Uses the `.venv` scientific stack (`numpy`, `scipy`, `scikit-learn`, `statsmodels`, `pymannkendall`)
with deterministic fallbacks so it runs anywhere out-of-the-box.
"""

from __future__ import annotations

import calendar
import math
import statistics
import warnings
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

try:
    import numpy as np
    import scipy.stats as sps
    from scipy.interpolate import make_smoothing_spline
    _HAS_SCIPY = True
except ImportError:  # pragma: no cover
    np = None  # type: ignore[assignment]
    sps = None  # type: ignore[assignment]
    make_smoothing_spline = None  # type: ignore[assignment]
    _HAS_SCIPY = False

try:
    from statsmodels.nonparametric.smoothers_lowess import lowess as sm_lowess
    _HAS_STATSMODELS = True
except ImportError:  # pragma: no cover
    sm_lowess = None  # type: ignore[assignment]
    _HAS_STATSMODELS = False

try:
    from sklearn.covariance import MinCovDet
    _HAS_SKLEARN = True
except ImportError:  # pragma: no cover
    MinCovDet = None  # type: ignore[assignment]
    _HAS_SKLEARN = False

try:
    import pymannkendall as mk
    _HAS_PYMANNKENDALL = True
except ImportError:  # pragma: no cover
    mk = None  # type: ignore[assignment]
    _HAS_PYMANNKENDALL = False



# ============================================================================
# 1. Semantic Errors & Official 12 NASA POWER Variables Catalog
# ============================================================================

class SemanticContractError(ValueError):
    """Standardized semantic error matching Section 5 of CONTRATO_DE_DADOS.md."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"[{code}] {message}")
        self.code = code
        self.message = message


VARIABLE_CATALOG: Dict[str, Dict[str, Any]] = {
    "T2M": {
        "variable_id": "T2M",
        "variable_name": "Temperatura Média do Ar a 2m",
        "source_model": "MERRA-2",
        "resolution": {"dLat": 0.5, "dLon": 0.625},
        "min_year": 1981,
        "scale_type": "interval",
        "unit": "°C",
        "trend_unit": "°C/década",
        "allow_percentage_change": False,
        "land_only_mask": False,
    },
    "T2M_MAX": {
        "variable_id": "T2M_MAX",
        "variable_name": "Temperatura Máxima Diária a 2m",
        "source_model": "MERRA-2",
        "resolution": {"dLat": 0.5, "dLon": 0.625},
        "min_year": 1981,
        "scale_type": "interval",
        "unit": "°C",
        "trend_unit": "°C/década",
        "allow_percentage_change": False,
        "land_only_mask": False,
    },
    "T2M_MIN": {
        "variable_id": "T2M_MIN",
        "variable_name": "Temperatura Mínima Diária a 2m",
        "source_model": "MERRA-2",
        "resolution": {"dLat": 0.5, "dLon": 0.625},
        "min_year": 1981,
        "scale_type": "interval",
        "unit": "°C",
        "trend_unit": "°C/década",
        "allow_percentage_change": False,
        "land_only_mask": False,
    },
    "PRECTOTCORR": {
        "variable_id": "PRECTOTCORR",
        "variable_name": "Precipitação Total Corrigida",
        "source_model": "MERRA-2",
        "resolution": {"dLat": 0.5, "dLon": 0.625},
        "min_year": 1981,
        "scale_type": "ratio",
        "unit": "mm/mês",
        "trend_unit": "mm/mês/década",
        "allow_percentage_change": True,
        "land_only_mask": False,
    },
    "GWETTOP": {
        "variable_id": "GWETTOP",
        "variable_name": "Umidade do Solo Superficial (0–5 cm)",
        "source_model": "MERRA-2",
        "resolution": {"dLat": 0.5, "dLon": 0.625},
        "min_year": 1981,
        "scale_type": "ratio",
        "unit": "fração (0–1)",
        "trend_unit": "fração/década",
        "allow_percentage_change": False,
        "land_only_mask": True,
    },
    "GWETROOT": {
        "variable_id": "GWETROOT",
        "variable_name": "Umidade do Solo Radicular (0–100 cm)",
        "source_model": "MERRA-2",
        "resolution": {"dLat": 0.5, "dLon": 0.625},
        "min_year": 1981,
        "scale_type": "ratio",
        "unit": "fração (0–1)",
        "trend_unit": "fração/década",
        "allow_percentage_change": False,
        "land_only_mask": True,
    },
    "RH2M": {
        "variable_id": "RH2M",
        "variable_name": "Umidade Relativa do Ar a 2m",
        "source_model": "MERRA-2",
        "resolution": {"dLat": 0.5, "dLon": 0.625},
        "min_year": 1981,
        "scale_type": "ratio",
        "unit": "%",
        "trend_unit": "p.p./década",
        "allow_percentage_change": False,
        "land_only_mask": False,
    },
    "WS10M": {
        "variable_id": "WS10M",
        "variable_name": "Velocidade do Vento a 10m",
        "source_model": "MERRA-2",
        "resolution": {"dLat": 0.5, "dLon": 0.625},
        "min_year": 1981,
        "scale_type": "ratio",
        "unit": "m/s",
        "trend_unit": "m/s/década",
        "allow_percentage_change": True,
        "land_only_mask": False,
    },
    "PS": {
        "variable_id": "PS",
        "variable_name": "Pressão de Superfície",
        "source_model": "MERRA-2",
        "resolution": {"dLat": 0.5, "dLon": 0.625},
        "min_year": 1981,
        "scale_type": "interval",
        "unit": "kPa",
        "trend_unit": "kPa/década",
        "allow_percentage_change": False,
        "land_only_mask": False,
    },
    "ALLSKY_SFC_SW_DWN": {
        "variable_id": "ALLSKY_SFC_SW_DWN",
        "variable_name": "Irradiância Solar Onda Curta Descendente",
        "source_model": "CERES_SYN1deg",
        "resolution": {"dLat": 1.0, "dLon": 1.0},
        "min_year": 1984,
        "scale_type": "ratio",
        "unit": "MJ/m²/dia",
        "trend_unit": "MJ/m²/dia/década",
        "allow_percentage_change": True,
        "land_only_mask": False,
    },
    "CLDTOT": {
        "variable_id": "CLDTOT",
        "variable_name": "Cobertura Total de Nuvens",
        "source_model": "CERES_SYN1deg",
        "resolution": {"dLat": 1.0, "dLon": 1.0},
        "min_year": 1984,
        "scale_type": "ratio",
        "unit": "%",
        "trend_unit": "p.p./década",
        "allow_percentage_change": False,
        "land_only_mask": False,
    },
    "ALLSKY_SFC_LW_DWN": {
        "variable_id": "ALLSKY_SFC_LW_DWN",
        "variable_name": "Irradiância Térmica Onda Longa Descendente",
        "source_model": "CERES_SYN1deg",
        "resolution": {"dLat": 1.0, "dLon": 1.0},
        "min_year": 1984,
        "scale_type": "ratio",
        "unit": "MJ/m²/dia",
        "trend_unit": "MJ/m²/dia/década",
        "allow_percentage_change": True,
        "land_only_mask": False,
    },
}


# Known climate oscillations (ENSO / volcanic / extreme drought years) for diagnostic hints
_KNOWN_CLIMATE_EVENTS: Dict[int, str] = {
    1982: "Super El Niño 1982-1983",
    1983: "Super El Niño 1982-1983",
    1988: "Forte La Niña 1988-1989",
    1989: "Forte La Niña 1988-1989",
    1991: "Erupção do Monte Pinatubo / El Niño 1991-1992",
    1997: "Super El Niño 1997-1998",
    1998: "Super El Niño 1997-1998 / Transição La Niña",
    1999: "Forte La Niña 1999-2000",
    2005: "Seca extrema / Anomalia do Atlântico Tropical 2005",
    2010: "Oscilação forte El Niño / La Niña 2010",
    2015: "Super El Niño 2015-2016",
    2016: "Super El Niño 2015-2016",
    2020: "La Niña Tripla 2020-2022",
    2023: "Super El Niño / Anomalia Térmica Global 2023-2024",
    2024: "Super El Niño / Extremo Climático 2023-2024",
}


# ============================================================================
# 2. Mathematical & Statistical Primitives (Pure Python, High Precision)
# ============================================================================

def _is_missing_or_sentinel(val: Any) -> bool:
    """Checks if a value is None, NaN, Infinite, or NASA POWER sentinel (-999 / -99)."""
    if val is None:
        return True
    try:
        fval = float(val)
    except (TypeError, ValueError):
        return True
    if not math.isfinite(fval):
        return True
    if fval <= -900.0 or math.isclose(fval, -999.0, abs_tol=1e-3) or math.isclose(fval, -99.0, abs_tol=1e-3):
        return True
    return False


def _parse_yyyy_mm(date_str: str) -> Tuple[int, int]:
    """Parses 'YYYY-MM' or 'YYYYMM' into (year, month). Raises ValueError on YYYY13."""
    s = date_str.strip()
    if "-" in s:
        parts = s.split("-")
        year, month = int(parts[0]), int(parts[1])
    elif len(s) == 6 and s.isdigit():
        year, month = int(s[:4]), int(s[4:6])
    else:
        raise ValueError(f"Formato de data inválido: {date_str!r}. Esperado 'YYYY-MM'.")
    if month < 1 or month > 12:
        raise ValueError(f"Mês inválido ({month}) em {date_str!r}. Chave anual YYYY13 é proibida.")
    return year, month


def _date_to_fractional_year(date_str: str) -> float:
    """Converts 'YYYY-MM' to fractional year centered at mid-month."""
    year, month = _parse_yyyy_mm(date_str)
    return year + (month - 0.5) / 12.0


def _regularized_incomplete_beta(x: float, a: float, b: float) -> float:
    """Computes the regularized incomplete beta function I_x(a, b) via Lentz's continued fraction."""
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0

    # Use symmetry relation when x > (a + 1) / (a + b + 2) for rapid convergence
    if x > (a + 1.0) / (a + b + 2.0):
        return 1.0 - _regularized_incomplete_beta(1.0 - x, b, a)

    ln_beta = math.lgamma(a) + math.lgamma(b) - math.lgamma(a + b)
    front = math.exp(a * math.log(x) + b * math.log(1.0 - x) - ln_beta) / a

    # Lentz's algorithm for continued fraction
    tiny = 1e-30
    f = tiny
    c = f
    d = 0.0

    for m in range(0, 200):
        if m == 0:
            numerator = 1.0
        elif m % 2 == 1:
            k = (m - 1) // 2
            numerator = -((a + k) * (a + b + k) * x) / ((a + 2 * k) * (a + 2 * k + 1))
        else:
            k = m // 2
            numerator = (k * (b - k) * x) / ((a + 2 * k - 1) * (a + 2 * k))

        d = 1.0 + numerator * d
        if abs(d) < tiny:
            d = tiny
        d = 1.0 / d

        c = 1.0 + numerator / c
        if abs(c) < tiny:
            c = tiny

        cd = c * d
        f *= cd
        if m > 0 and abs(cd - 1.0) < 1e-12:
            break

    return max(0.0, min(1.0, front * (f - 1.0)))


def _student_t_two_tailed_pvalue(t_stat: float, df: float) -> float:
    """Computes exact two-tailed p-value for Student's t-distribution with real degrees of freedom df > 0."""
    if not math.isfinite(t_stat) or df <= 0.0:
        return 1.0
    if abs(t_stat) < 1e-15:
        return 1.0
    x = df / (df + t_stat * t_stat)
    p = _regularized_incomplete_beta(x, 0.5 * df, 0.5)
    return max(0.0, min(1.0, float(p)))


# ============================================================================
# 3. Data Sanitization, Temporal Intersection & Spatial Aggregation (K <= 9)
# ============================================================================

def get_intersecting_date_bounds(
    variable_a: str,
    variable_b: Optional[str] = None,
    requested_start: Optional[str] = None,
    requested_end: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Computes the valid temporal intersection between variable_a and variable_b
    (MERRA-2 starts in 1981; CERES_SYN1deg starts in 1984).
    """
    if variable_a not in VARIABLE_CATALOG:
        raise SemanticContractError("CONTRACT_VIOLATION", f"Variável desconhecida: {variable_a}")
    min_year = VARIABLE_CATALOG[variable_a]["min_year"]

    if variable_b is not None:
        if variable_b not in VARIABLE_CATALOG:
            raise SemanticContractError("CONTRACT_VIOLATION", f"Variável desconhecida: {variable_b}")
        min_year = max(min_year, VARIABLE_CATALOG[variable_b]["min_year"])

    min_start = f"{min_year:04d}-01"
    start_date = max(min_start, requested_start) if requested_start else min_start
    end_date = requested_end if requested_end else "2025-12"

    if start_date > end_date:
        raise SemanticContractError(
            "INVALID_DATE_INTERSECTION",
            f"Intervalo temporal inválido: start_date ({start_date}) > end_date ({end_date}).",
        )

    return {
        "minYear": min_year,
        "startDate": start_date,
        "endDate": end_date,
    }


def clean_nasa_power_monthly(
    raw_parameter_dict: Mapping[str, Any],
    variable_id: str,
    convert_prectotcorr_from_mm_day: bool = True,
) -> Tuple[List[str], List[Optional[float]]]:
    """
    Cleans a raw NASA POWER monthly dictionary (e.g., {"198101": 24.3, "198113": 25.1, ...}):
    1. Discards annual summary keys 'YYYY13'.
    2. Replaces sentinel values (-999, -99, NaN) with None.
    3. Converts PRECTOTCORR from mm/day to mm/month via calendar.monthrange(year, month)[1].
    Returns (dates_yyyy_mm, cleaned_values).
    """
    dates: List[str] = []
    values: List[Optional[float]] = []

    for key in sorted(raw_parameter_dict.keys()):
        s_key = str(key).strip()
        # Filter out YYYY13 annual summary keys
        if len(s_key) == 6 and s_key.isdigit() and s_key.endswith("13"):
            continue
        if "-" in s_key and s_key.split("-")[1] == "13":
            continue

        year, month = _parse_yyyy_mm(s_key)
        norm_date = f"{year:04d}-{month:02d}"
        raw_val = raw_parameter_dict[key]

        if _is_missing_or_sentinel(raw_val):
            dates.append(norm_date)
            values.append(None)
            continue

        fval = float(raw_val)
        if variable_id == "PRECTOTCORR" and convert_prectotcorr_from_mm_day:
            days_in_month = calendar.monthrange(year, month)[1]
            fval = fval * days_in_month

        dates.append(norm_date)
        values.append(fval)

    return dates, values


def aggregate_cells_nanmean(
    cells_series: Sequence[Sequence[Optional[float]]],
    variable_id: str = "T2M",
) -> List[Optional[float]]:
    """
    Computes the spatial nanmean across 1 <= K <= 9 adjacent cells for each timestamp t.
    Enforces MAX_CELLS_EXCEEDED (K > 9) and OCEAN_MASK_NO_DATA (if all values are missing/NaN).
    """
    k = len(cells_series)
    if k < 1 or k > 9:
        raise SemanticContractError(
            "MAX_CELLS_EXCEEDED",
            f"A composição espacial deve conter entre 1 e 9 células adjacentes (recebido K={k}).",
        )

    n_time = len(cells_series[0])
    for idx, s in enumerate(cells_series):
        if len(s) != n_time:
            raise SemanticContractError(
                "CONTRACT_VIOLATION",
                f"Célula {idx} possui tamanho {len(s)} diferente de {n_time}.",
            )

    aggregated: List[Optional[float]] = []
    valid_timestamps = 0

    for t in range(n_time):
        valid_vals: List[float] = []
        for c in range(k):
            v = cells_series[c][t]
            if not _is_missing_or_sentinel(v):
                valid_vals.append(float(v))  # type: ignore[arg-type]
        if valid_vals:
            aggregated.append(sum(valid_vals) / len(valid_vals))
            valid_timestamps += 1
        else:
            aggregated.append(None)

    if valid_timestamps == 0:
        raise SemanticContractError(
            "OCEAN_MASK_NO_DATA",
            f"Todas as {k} células selecionadas para {variable_id} retornaram sem dados válidos (-999 / máscara oceânica).",
        )

    return aggregated


# ============================================================================
# 4. Invariant #2 — Climatological Monthly Anomalies (Henrietta Leavitt)
# ============================================================================

def compute_climatological_anomalies(
    dates: Sequence[str],
    raw_values: Sequence[Optional[float]],
) -> Dict[str, Any]:
    """
    Isolates the annual seasonal cycle by subtracting each calendar month's mean
    (Y'_{a,m} = Y_{a,m} - mean(Y_m)) and computing standardized monthly Z-scores.
    """
    if len(dates) != len(raw_values):
        raise SemanticContractError(
            "CONTRACT_VIOLATION",
            "Vetores dates e raw_values possuem tamanhos diferentes.",
        )

    month_buckets: Dict[int, List[float]] = {m: [] for m in range(1, 13)}
    year_month_vals: List[Tuple[int, int, float]] = []
    parsed_months: List[int] = []

    for d_str, val in zip(dates, raw_values):
        yr, m = _parse_yyyy_mm(d_str)
        parsed_months.append(m)
        if not _is_missing_or_sentinel(val):
            fval = float(val)  # type: ignore[arg-type]
            month_buckets[m].append(fval)
            year_month_vals.append((yr, m, fval))

    month_means: Dict[int, float] = {}
    month_stds: Dict[int, float] = {}

    all_valid = [v for _, _, v in year_month_vals]
    global_mean = (sum(all_valid) / len(all_valid)) if all_valid else 0.0
    global_std = statistics.pstdev(all_valid) if len(all_valid) > 1 else 1.0

    max_bucket_len = max((len(b) for b in month_buckets.values()), default=0)
    use_monthly_baseline = max_bucket_len >= 2

    # Estimate provisional annual slope across calendar years so within-year month position
    # (Jan = -5.5/12 yr vs Dec = +5.5/12 yr) does not leak secular trend into seasonal means
    provisional_annual_slope = 0.0
    if use_monthly_baseline and len(year_month_vals) >= 12:
        mean_yr = sum(yr for yr, _, _ in year_month_vals) / len(year_month_vals)
        s_yy = sum((yr - mean_yr) ** 2 for yr, _, _ in year_month_vals)
        if s_yy > 1e-9:
            s_yv = sum((yr - mean_yr) * (v - global_mean) for yr, _, v in year_month_vals)
            provisional_annual_slope = s_yv / s_yy

    for m in range(1, 13):
        bucket = month_buckets[m]
        if bucket and use_monthly_baseline:
            # Remove within-year fractional trend shift ((m - 6.5) / 12) from the seasonal mean
            intra_year_shift = provisional_annual_slope * ((m - 6.5) / 12.0)
            if len(bucket) >= 5:
                s_bucket = sorted(bucket)
                trim_k = max(1, len(s_bucket) // 10)
                core = s_bucket[trim_k : len(s_bucket) - trim_k]
                robust_month_mean = sum(core) / len(core)
            else:
                robust_month_mean = sum(bucket) / len(bucket)
            month_means[m] = robust_month_mean - intra_year_shift
            detrended_bucket = [
                v - provisional_annual_slope * (yr - (year_month_vals[0][0]))
                for yr, mm, v in year_month_vals
                if mm == m
            ]
            std_m = statistics.pstdev(detrended_bucket) if len(detrended_bucket) > 1 else global_std
            month_stds[m] = std_m if std_m > 1e-12 else 1.0
        else:
            month_means[m] = global_mean
            month_stds[m] = global_std if global_std > 1e-12 else 1.0

    anomalies: List[Optional[float]] = []
    z_scores: List[Optional[float]] = []

    for m, val in zip(parsed_months, raw_values):
        if _is_missing_or_sentinel(val):
            anomalies.append(None)
            z_scores.append(None)
        else:
            fval = float(val)  # type: ignore[arg-type]
            anom = fval - month_means[m]
            anomalies.append(anom)
            z_scores.append(anom / month_stds[m])

    return {
        "anomaly_values": anomalies,
        "z_scores": z_scores,
        "monthly_means": month_means,
        "monthly_stds": month_stds,
    }


# ============================================================================
# 5. Invariant #1 — Longitudinal OLS & Robust Theil-Sen Regression
# ============================================================================

def compute_ols_regression(
    t_years: Sequence[float],
    y_anomalies: Sequence[float],
    y_raw: Optional[Sequence[float]] = None,
) -> Dict[str, Any]:
    """
    Computes Ordinary Least Squares (OLS) regression over the ENTIRE cloud of N valid points
    using `scipy.stats.linregress` (with pure-Python fallback).
    Time is centered at t_0 = t_years[0] to avoid the 'False Zero' intercept trap.
    Returns slope per decade (10 * B_year), intercept A0 at start, linear fit vector, residuals, and SE.
    """
    n = len(t_years)
    if n < 3:
        raise SemanticContractError(
            "CONTRACT_VIOLATION",
            f"São necessárias ao menos 3 observações válidas para regressão (recebido N={n}).",
        )

    t0 = t_years[0]
    x_decades = [(t - t0) / 10.0 for t in t_years]

    mean_x = sum(x_decades) / n
    mean_y = sum(y_anomalies) / n

    sxx = sum((x - mean_x) ** 2 for x in x_decades)
    syy = sum((y - mean_y) ** 2 for y in y_anomalies)
    sxy = sum((x - mean_x) * (y - mean_y) for x, y in zip(x_decades, y_anomalies))

    if _HAS_SCIPY and sxx > 1e-15:
        x_arr = np.asarray(x_decades, dtype=np.float64)
        y_arr = np.asarray(y_anomalies, dtype=np.float64)
        lin_res = sps.linregress(x_arr, y_arr)
        slope_decade = float(lin_res.slope)
        intercept_anom_a0 = float(lin_res.intercept)
        se_slope_decade = float(lin_res.stderr) if math.isfinite(float(lin_res.stderr)) else 0.0
    else:
        if sxx <= 1e-15:
            slope_decade = 0.0
        else:
            slope_decade = sxy / sxx
        intercept_anom_a0 = mean_y - slope_decade * mean_x
        sse = sum((y - (intercept_anom_a0 + slope_decade * x)) ** 2 for x, y in zip(x_decades, y_anomalies))
        df = max(1, n - 2)
        mse = sse / df
        se_slope_decade = math.sqrt(mse / sxx) if sxx > 1e-15 else 0.0

    linear_fit = [intercept_anom_a0 + slope_decade * x for x in x_decades]
    residuals = [y - y_hat for y, y_hat in zip(y_anomalies, linear_fit)]

    # Physical baseline intercept A0 on the raw series at t0
    if y_raw is not None and len(y_raw) == n:
        if _HAS_SCIPY and sxx > 1e-15:
            raw_res = sps.linregress(
                np.asarray(x_decades, dtype=np.float64),
                np.asarray(y_raw, dtype=np.float64),
            )
            intercept_raw_a0 = float(raw_res.intercept)
        else:
            mean_raw = sum(y_raw) / n
            sxy_raw = sum((x - mean_x) * (yr - mean_raw) for x, yr in zip(x_decades, y_raw))
            slope_raw = (sxy_raw / sxx) if sxx > 1e-15 else 0.0
            intercept_raw_a0 = mean_raw - slope_raw * mean_x
    else:
        intercept_raw_a0 = intercept_anom_a0

    # Cumulative change along the regression line (NEVER y[-1] - y[0])
    total_decades = x_decades[-1] - x_decades[0]
    cumulative_change_ols = slope_decade * total_decades

    return {
        "intercept_at_start_A0": intercept_raw_a0,
        "intercept_anomaly_A0": intercept_anom_a0,
        "slope_per_decade_ols": slope_decade,
        "se_slope_decade": se_slope_decade,
        "cumulative_model_change_ols": cumulative_change_ols,
        "linear_fit": linear_fit,
        "residuals": residuals,
        "x_decades": x_decades,
        "sxx": sxx,
        "syy": syy,
        "sxy": sxy,
    }


def compute_theil_sen_regression(
    t_years: Sequence[float],
    y_anomalies: Sequence[float],
) -> Dict[str, Any]:
    """
    Computes the non-parametric Robust Theil-Sen Median Slope (B_Sen) per decade,
    its 95% confidence interval [slope_ci95_low, slope_ci95_high], the Conover/separate
    median intercept, `sen_fit`, and Kendall's tau using `scipy.stats.theilslopes`
    and `scipy.stats.kendalltau` (with pure-Python fallback).
    Breakdown point: 29.3% (immune to up to ~30% of extreme outliers).
    """
    n = len(t_years)
    t0 = t_years[0]
    x_decades = [(t - t0) / 10.0 for t in t_years]

    if _HAS_SCIPY and n >= 3 and (x_decades[-1] - x_decades[0]) > 1e-12:
        x_arr = np.asarray(x_decades, dtype=np.float64)
        y_arr = np.asarray(y_anomalies, dtype=np.float64)
        sen_res = sps.theilslopes(y_arr, x_arr, alpha=0.95, method="separate")
        slope_sen = float(sen_res.slope)
        intercept_sen = float(sen_res.intercept)
        ci_low = float(sen_res.low_slope)
        ci_high = float(sen_res.high_slope)
        tau_res = sps.kendalltau(x_arr, y_arr)
        kendall_tau = float(tau_res.statistic) if math.isfinite(float(tau_res.statistic)) else 0.0
        kendall_tau = max(-1.0, min(1.0, kendall_tau))
    else:
        slopes: List[float] = []
        concordant = 0
        discordant = 0
        ties_x = 0
        ties_y = 0

        for i in range(n - 1):
            xi = x_decades[i]
            yi = y_anomalies[i]
            for j in range(i + 1, n):
                dx = x_decades[j] - xi
                dy = y_anomalies[j] - yi
                if abs(dx) > 1e-12:
                    slopes.append(dy / dx)
                    if abs(dy) <= 1e-15:
                        ties_y += 1
                    elif (dx > 0 and dy > 0) or (dx < 0 and dy < 0):
                        concordant += 1
                    else:
                        discordant += 1
                else:
                    ties_x += 1

        if not slopes:
            return {
                "intercept_anomaly_sen": 0.0,
                "slope_per_decade_sen": 0.0,
                "slope_ci95_low": 0.0,
                "slope_ci95_high": 0.0,
                "kendall_tau": 0.0,
                "cumulative_model_change": 0.0,
                "sen_fit": [0.0] * n,
            }

        slopes.sort()
        m_pairs = len(slopes)
        mid = m_pairs // 2
        if m_pairs % 2 == 1:
            slope_sen = slopes[mid]
        else:
            slope_sen = 0.5 * (slopes[mid - 1] + slopes[mid])

        intercept_sen = float(statistics.median([y - slope_sen * x for x, y in zip(x_decades, y_anomalies)]))

        # Sen (1968) rank-order 95% confidence interval for Theil-Sen slope
        var_s = (n * (n - 1) * (2 * n + 5)) / 18.0
        c_alpha = 1.959963984540054 * math.sqrt(var_s)
        lower_idx = max(0, int(math.floor((m_pairs - c_alpha) / 2.0)))
        upper_idx = min(m_pairs - 1, int(math.ceil((m_pairs + c_alpha) / 2.0)) - 1)
        ci_low = slopes[lower_idx]
        ci_high = slopes[upper_idx]

        denom_tau = math.sqrt((concordant + discordant + ties_x) * (concordant + discordant + ties_y))
        kendall_tau = ((concordant - discordant) / denom_tau) if denom_tau > 0 else 0.0
        kendall_tau = max(-1.0, min(1.0, kendall_tau))

    sen_fit = [intercept_sen + slope_sen * x for x in x_decades]
    total_decades = x_decades[-1] - x_decades[0]
    cumulative_change_sen = slope_sen * total_decades

    return {
        "intercept_anomaly_sen": intercept_sen,
        "slope_per_decade_sen": slope_sen,
        "slope_ci95_low": ci_low,
        "slope_ci95_high": ci_high,
        "kendall_tau": kendall_tau,
        "cumulative_model_change": cumulative_change_sen,
        "sen_fit": sen_fit,
    }


# ============================================================================
# 6. Invariant #4 — Correlation & Ellipse Aspect Ratio
# ============================================================================

def compute_correlation_and_coupling(
    sxx: float,
    syy: float,
    sxy: float,
    kendall_tau: float,
) -> Dict[str, float]:
    """
    Computes Pearson r, R², Kendall tau, and the Mahalanobis contour ellipse aspect ratio
    (minor_axis / major_axis = sqrt((1 - |r|) / (1 + |r|))).
    """
    denom = math.sqrt(sxx * syy)
    if denom <= 1e-15:
        pearson_r = 0.0
    else:
        pearson_r = max(-1.0, min(1.0, sxy / denom))

    r_squared = max(0.0, min(1.0, pearson_r * pearson_r))
    abs_r = min(0.999999, abs(pearson_r))
    ellipse_aspect_ratio = math.sqrt((1.0 - abs_r) / (1.0 + abs_r))

    return {
        "pearson_r": round(pearson_r, 4),
        "kendall_tau": round(kendall_tau, 4),
        "r_squared": round(r_squared, 4),
        "ellipse_aspect_ratio": round(ellipse_aspect_ratio, 4),
    }


# ============================================================================
# 7. Invariant #6 — Non-Linear GAM / Penalized Smoothing Spline & Regime Shape
# ============================================================================

def _whittaker_smoothing_spline(y: Sequence[float], lam: float) -> List[float]:
    """
    Solves the Penalized Smoothing Spline / Whittaker-Henderson GAM optimization:
        min_f  sum_i (y_i - f_i)^2 + lam * sum_i (f_{i} - 2 f_{i-1} + f_{i-2})^2
    via an exact O(N) pentadiagonal Cholesky solver.
    Avoids high-degree polynomial Runge oscillations at the boundaries.
    """
    n = len(y)
    if n <= 3 or lam <= 0.0:
        return list(y)

    # Pentadiagonal matrix A = I + lam * D2^T D2
    # Main diagonal d0, first off-diagonal d1, second off-diagonal d2
    d0 = [1.0] * n
    d1 = [0.0] * (n - 1)
    d2 = [0.0] * (n - 2)

    for i in range(n - 2):
        d0[i] += 1.0 * lam
        d0[i + 1] += 4.0 * lam
        d0[i + 2] += 1.0 * lam
        d1[i] += -2.0 * lam
        d1[i + 1] += -2.0 * lam
        d2[i] += 1.0 * lam

    # Banded LDL^T decomposition for symmetric positive-definite pentadiagonal system
    l1 = [0.0] * (n - 1)
    l2 = [0.0] * (n - 2)
    diag = [0.0] * n

    for i in range(n):
        v = d0[i]
        if i >= 1:
            v -= l1[i - 1] * l1[i - 1] * diag[i - 1]
        if i >= 2:
            v -= l2[i - 2] * l2[i - 2] * diag[i - 2]
        diag[i] = v if v > 1e-12 else 1e-12

        if i + 1 < n:
            val1 = d1[i]
            if i >= 1:
                val1 -= l2[i - 1] * l1[i - 1] * diag[i - 1]
            l1[i] = val1 / diag[i]

        if i + 2 < n:
            l2[i] = d2[i] / diag[i]

    # Forward substitution L * z = y
    z = [0.0] * n
    for i in range(n):
        s = float(y[i])
        if i >= 1:
            s -= l1[i - 1] * z[i - 1]
        if i >= 2:
            s -= l2[i - 2] * z[i - 2]
        z[i] = s

    # Diagonal scaling D * w = z
    w = [z[i] / diag[i] for i in range(n)]

    # Back substitution L^T * f = w
    f = [0.0] * n
    for i in range(n - 1, -1, -1):
        s = w[i]
        if i + 1 < n:
            s -= l1[i] * f[i + 1]
        if i + 2 < n:
            s -= l2[i] * f[i + 2]
        f[i] = s

    return f


def _fit_quadratic_acceleration(
    x_decades: Sequence[float],
    y_anomalies: Sequence[float],
) -> Tuple[float, float]:
    """
    Fits Y'(tau) = c0 + c1*tau + B2*tau^2 via centered orthogonal polynomial regression
    to estimate the quadratic acceleration coefficient B2 (per decade^2) and its p-value.
    """
    n = len(x_decades)
    if n < 5:
        return 0.0, 1.0

    mean_x = sum(x_decades) / n
    u = [x - mean_x for x in x_decades]
    u2 = [ui * ui for ui in u]
    mean_u2 = sum(u2) / n

    # Orthogonalize u2 against u so collinearity vanishes
    sum_u_sq = sum(ui * ui for ui in u)
    alpha = (sum(ui * u2i for ui, u2i in zip(u, u2)) / sum_u_sq) if sum_u_sq > 1e-15 else 0.0
    q = [u2i - mean_u2 - alpha * ui for u2i, ui in zip(u2, u)]

    sqq = sum(qi * qi for qi in q)
    if sqq <= 1e-15:
        return 0.0, 1.0

    mean_y = sum(y_anomalies) / n
    b1 = (sum(ui * (yi - mean_y) for ui, yi in zip(u, y_anomalies)) / sum_u_sq) if sum_u_sq > 1e-15 else 0.0
    b2 = sum(qi * (yi - mean_y) for qi, yi in zip(q, y_anomalies)) / sqq

    # Residuals of the quadratic model
    y_hat = [mean_y + b1 * ui + b2 * qi for ui, qi in zip(u, q)]
    sse = sum((yi - yhi) ** 2 for yi, yhi in zip(y_anomalies, y_hat))
    df = max(1, n - 3)
    mse = sse / df
    se_b2 = math.sqrt(mse / sqq) if sqq > 1e-15 else 0.0
    t_b2 = (b2 / se_b2) if se_b2 > 1e-15 else 0.0
    p_b2 = _student_t_two_tailed_pvalue(t_b2, float(df))

    return b2, p_b2


def compute_gam_and_regime(
    x_decades: Sequence[float],
    y_anomalies: Sequence[float],
    slope_per_decade_sen: float,
) -> Dict[str, Any]:
    """
    Computes the Penalized Cubic Smoothing Spline (GAM smooth fit) via LOWESS + GCV
    `scipy.interpolate.make_smoothing_spline` (with Whittaker-Henderson pentadiagonal fallback),
    quadratic acceleration B2, and classifies the regime shape into one of:
    'linear' | 'accelerating_rise' | 'accelerating_decline' | 'saturating' | 'non_monotonic'
    """
    n = len(y_anomalies)
    if _HAS_SCIPY and n >= 8 and (x_decades[-1] - x_decades[0]) > 1e-9:
        x_arr = np.asarray(x_decades, dtype=np.float64)
        y_arr = np.asarray(y_anomalies, dtype=np.float64)
        # Ensure strictly increasing x coordinates for cubic smoothing spline
        if np.all(np.diff(x_arr) > 0):
            if _HAS_STATSMODELS and n >= 12:
                # Robust LOWESS pre-smoothing (3 tricube reweighting iterations) suppresses
                # high-frequency monthly noise and ENSO spikes before GCV cubic spline fit
                frac = max(0.25, min(0.55, 72.0 / n))
                low_y = sm_lowess(y_arr, x_arr, frac=frac, it=3, return_sorted=False)
            else:
                lam_w = max(2.0, (n / 6.0) ** 3 * 0.25) if n >= 12 else 1.5
                low_y = np.asarray(_whittaker_smoothing_spline(y_anomalies, lam=lam_w), dtype=np.float64)
            try:
                spl = make_smoothing_spline(x_arr, low_y, lam=None)
                gam_smooth = [float(v) for v in spl(x_arr)]
            except Exception:
                gam_smooth = [float(v) for v in low_y]
        else:
            lam_w = max(2.0, (n / 6.0) ** 3 * 0.25) if n >= 12 else 1.5
            gam_smooth = _whittaker_smoothing_spline(y_anomalies, lam=lam_w)
    else:
        lam_w = max(2.0, (n / 6.0) ** 3 * 0.25) if n >= 12 else 1.5
        gam_smooth = _whittaker_smoothing_spline(y_anomalies, lam=lam_w)

    b2, p_b2 = _fit_quadratic_acceleration(x_decades, y_anomalies)

    # Inspect first derivative changes along first vs second half of the GAM curve
    mid = n // 2
    if n >= 6 and (x_decades[-1] - x_decades[0]) > 1e-9:
        dt_first = max(1e-6, x_decades[mid] - x_decades[0])
        dt_second = max(1e-6, x_decades[-1] - x_decades[mid])
        slope_first_half = (gam_smooth[mid] - gam_smooth[0]) / dt_first
        slope_second_half = (gam_smooth[-1] - gam_smooth[mid]) / dt_second
    else:
        slope_first_half = slope_per_decade_sen
        slope_second_half = slope_per_decade_sen

    # Classify regime_shape according to derivative geometry (Doc 04)
    if slope_first_half * slope_second_half < 0 and abs(slope_first_half - slope_second_half) > max(0.05, 0.5 * abs(slope_per_decade_sen)):
        regime_shape = "non_monotonic"
    elif p_b2 < 0.15 or abs(b2) > 0.08 * max(1e-4, abs(slope_per_decade_sen)):
        if slope_per_decade_sen >= 0 and b2 > 0:
            regime_shape = "accelerating_rise"
        elif slope_per_decade_sen <= 0 and b2 < 0:
            regime_shape = "accelerating_decline"
        else:
            regime_shape = "saturating"
    else:
        regime_shape = "linear"

    return {
        "gam_smooth_fit": gam_smooth,
        "quadratic_acceleration_B2": round(b2, 6),
        "regime_shape": regime_shape,
    }


# ============================================================================
# 8. Invariant #7 — Bivariate Mahalanobis Outliers & AR(1) + Spatial FDR
# ============================================================================

def detect_mahalanobis_outliers(
    dates: Sequence[str],
    x_decades: Sequence[float],
    y_anomalies: Sequence[float],
    linear_fit: Sequence[float],
    threshold: float = 2.5,
) -> List[Dict[str, Any]]:
    """
    Identifies bivariate outliers outside the contour ellipse in (t, Y') space using
    Mahalanobis Distance (D_M > threshold) via `sklearn.covariance.MinCovDet`
    (Minimum Covariance Determinant, calibrated with robust MAD / OLS residual scale floor)
    so extreme ENSO spikes do not mask themselves (breakdown protection).
    Points are flagged with diagnostic hints, NEVER silently deleted.
    """
    n = len(x_decades)
    if n < 4:
        return []

    mean_x = sum(x_decades) / n

    # Residuals from the regression line
    residuals = [y - yhat for y, yhat in zip(y_anomalies, linear_fit)]
    med_res = statistics.median(residuals)
    abs_devs = [abs(r - med_res) for r in residuals]
    mad_res = statistics.median(abs_devs)

    # Consistent normal-equivalent sigma from MAD (1.4826 * MAD), with fallback to OLS std
    ols_std = statistics.pstdev(residuals) if n > 2 else 1.0
    mad_sigma_r = max(1.4826 * mad_res, 0.5 * ols_std, 1e-9)

    var_x = sum((x - mean_x) ** 2 for x in x_decades) / n
    sigma_x = math.sqrt(var_x) if var_x > 1e-12 else 1.0

    # Compute bivariate Mahalanobis distances using MinCovDet when scikit-learn is available
    dm_values: Optional[List[float]] = None
    if _HAS_SKLEARN and _HAS_SCIPY and n >= 10 and var_x > 1e-12:
        try:
            x_arr = np.asarray(x_decades, dtype=np.float64)
            y_arr = np.asarray(y_anomalies, dtype=np.float64)
            yhat_arr = np.asarray(linear_fit, dtype=np.float64)
            X_biv = np.column_stack([x_arr, y_arr])
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                mcd = MinCovDet(random_state=42, support_fraction=0.75).fit(X_biv)
            cov_mcd = mcd.covariance_
            cond_var_mcd = (
                float(cov_mcd[1, 1] - (cov_mcd[0, 1] ** 2) / cov_mcd[0, 0])
                if cov_mcd[0, 0] > 1e-12
                else float(cov_mcd[1, 1])
            )
            mcd_sigma_r = math.sqrt(max(0.0, cond_var_mcd))
            # Calibrate conditional residual scale combining MinCovDet and MAD floor
            robust_sigma_r = max(0.5 * mcd_sigma_r + 0.5 * mad_sigma_r, mad_sigma_r, 1e-9)
            slope_est = (
                (linear_fit[-1] - linear_fit[0]) / (x_decades[-1] - x_decades[0])
                if abs(x_decades[-1] - x_decades[0]) > 1e-12
                else 0.0
            )
            cov_biv = np.array(
                [
                    [var_x, slope_est * var_x],
                    [slope_est * var_x, (slope_est ** 2) * var_x + robust_sigma_r ** 2],
                ],
                dtype=np.float64,
            )
            mu_biv = np.array([mean_x, float(np.mean(yhat_arr)) + med_res], dtype=np.float64)
            diff = X_biv - mu_biv
            inv_cov = np.linalg.pinv(cov_biv)
            dm_arr = np.sqrt(np.maximum(0.0, np.einsum("ij,jk,ik->i", diff, inv_cov, diff)))
            dm_values = [float(v) for v in dm_arr]
        except Exception:
            dm_values = None

    if dm_values is None:
        dm_values = [
            math.sqrt(((x - mean_x) / sigma_x) ** 2 + ((r - med_res) / mad_sigma_r) ** 2)
            for x, r in zip(x_decades, residuals)
        ]

    outliers: List[Dict[str, Any]] = []
    for d_str, y, yhat, r, dm in zip(dates, y_anomalies, linear_fit, residuals, dm_values):
        if dm > threshold:
            direction = "above_ellipse" if r >= 0 else "below_ellipse"
            year, _ = _parse_yyyy_mm(d_str)
            event_label = _KNOWN_CLIMATE_EVENTS.get(year)
            if event_label:
                hint = f"Extremo fora da elipse bivariada (D_M = {dm:.2f}) associado a {event_label}"
            else:
                pole = "Pico positivo anômalo" if direction == "above_ellipse" else "Queda anômala severa"
                hint = f"{pole} fora da elipse de Mahalanobis (D_M = {dm:.2f} > {threshold})"

            outliers.append(
                {
                    "date": d_str,
                    "observed_anomaly": round(float(y), 4),
                    "expected_regression": round(float(yhat), 4),
                    "mahalanobis_d": round(float(dm), 2),
                    "direction": direction,
                    "diagnostic_hint": hint,
                }
            )

    # Sort by Mahalanobis distance descending (keep top most extreme to avoid clutter)
    outliers.sort(key=lambda item: item["mahalanobis_d"], reverse=True)
    return outliers[:15]


def compute_significance_ar1(
    n_obs: int,
    slope_per_decade_ols: float,
    slope_per_decade_sen: float,
    se_slope_decade: float,
    residuals: Sequence[float],
    fdr_q_value: Optional[float] = None,
    y_anomalies: Optional[Sequence[float]] = None,
) -> Dict[str, Any]:
    """
    Computes naive p-value and autocorrelation-corrected p-value combining:
    1. Santer et al. (2000) AR(1) effective sample size:
         N_eff = N * (1 - rho_1) / (1 + rho_1)   (for rho_1 > 0)
         SE_corrected = SE_OLS * sqrt((N - 2) / (N_eff - 2))
    2. Hamed & Rao (1998) Modified Mann-Kendall test (`pymannkendall.hamed_rao_modification_test`)
       for non-parametric multi-lag serial correlation protection.
    Also classifies `confidence_tier` according to Doc 05 & CONTRATO_DE_DADOS.md.
    """
    if n_obs < 4 or se_slope_decade <= 1e-15:
        if abs(slope_per_decade_ols) <= 1e-12:
            p_naive = 1.0
            p_ar1 = 1.0
            n_eff = float(n_obs)
        else:
            p_naive = 0.0
            p_ar1 = 0.0
            n_eff = float(n_obs)
    else:
        t_naive = slope_per_decade_ols / se_slope_decade
        if _HAS_SCIPY:
            p_naive = float(sps.t.sf(abs(t_naive), df=float(n_obs - 2)) * 2.0)
        else:
            p_naive = _student_t_two_tailed_pvalue(t_naive, float(n_obs - 2))

        # Compute lag-1 autocorrelation rho_1 of regression residuals
        r_prev = residuals[:-1]
        r_next = residuals[1:]
        m_prev = sum(r_prev) / len(r_prev)
        m_next = sum(r_next) / len(r_next)
        num = sum((a - m_prev) * (b - m_next) for a, b in zip(r_prev, r_next))
        den_a = sum((a - m_prev) ** 2 for a in r_prev)
        den_b = sum((b - m_next) ** 2 for b in r_next)
        denom = math.sqrt(den_a * den_b)
        rho1 = (num / denom) if denom > 1e-15 else 0.0
        rho1 = max(-0.95, min(0.95, rho1))

        if rho1 > 0.0:
            n_eff = n_obs * (1.0 - rho1) / (1.0 + rho1)
            n_eff = max(3.0, min(float(n_obs), n_eff))
        else:
            n_eff = float(n_obs)

        df_eff = max(1.0, n_eff - 2.0)
        inflation = math.sqrt((n_obs - 2.0) / df_eff)
        se_ar1 = se_slope_decade * inflation
        t_ar1 = slope_per_decade_ols / se_ar1 if se_ar1 > 1e-15 else 0.0
        if _HAS_SCIPY:
            p_santer = float(sps.t.sf(abs(t_ar1), df=df_eff) * 2.0)
        else:
            p_santer = _student_t_two_tailed_pvalue(t_ar1, df_eff)

        p_ar1 = p_santer
        if _HAS_PYMANNKENDALL and y_anomalies is not None and len(y_anomalies) >= 10:
            try:
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    hr_res = mk.hamed_rao_modification_test(np.asarray(y_anomalies, dtype=np.float64))
                hr_p = float(hr_res.p)
                if math.isfinite(hr_p):
                    # Blend Santer AR(1) t-test p-value with Hamed-Rao multi-lag Mann-Kendall p-value
                    p_ar1 = max(p_naive, 0.5 * p_santer + 0.5 * hr_p)
            except Exception:
                p_ar1 = p_santer

    p_naive = max(0.0, min(1.0, float(p_naive)))
    p_ar1 = max(0.0, min(1.0, float(p_ar1)))
    q_val = p_ar1 if fdr_q_value is None else max(0.0, min(1.0, float(fdr_q_value)))
    same_sign = (slope_per_decade_ols * slope_per_decade_sen) >= 0.0
    is_sig_fdr05 = (q_val < 0.05) and same_sign

    if p_ar1 < 0.01 and is_sig_fdr05 and same_sign:
        confidence_tier = "CONFIRMED_HIGH"
    elif p_ar1 < 0.05 and same_sign:
        confidence_tier = "CONFIRMED_MODERATE"
    elif p_ar1 < 0.15 or not same_sign:
        confidence_tier = "INSUFFICIENT_SIGNAL"
    else:
        confidence_tier = "NO_TREND"

    return {
        "n_effective_ar1": round(n_eff, 2),
        "p_value_naive": round(float(p_naive), 8),
        "p_value_ar1_corrected": round(float(p_ar1), 8),
        "fdr_q_value": round(float(q_val), 8),
        "is_significant_fdr05": bool(is_sig_fdr05),
        "confidence_tier": confidence_tier,
    }


def apply_spatial_fdr_bh(p_values: Sequence[float], alpha: float = 0.05) -> Tuple[List[float], List[bool]]:
    """
    Applies the Benjamini-Hochberg (1995) False Discovery Rate (FDR) step-up procedure
    across M spatial grid cells or regions using `scipy.stats.false_discovery_control(method='bh')`
    (with exact pure-Python fallback).
    Returns (q_values, is_significant_flags).
    """
    m = len(p_values)
    if m == 0:
        return [], []

    clamped = [max(0.0, min(1.0, float(p))) for p in p_values]
    if _HAS_SCIPY:
        q_arr = sps.false_discovery_control(np.asarray(clamped, dtype=np.float64), method="bh")
        q_values = [round(float(q), 8) for q in q_arr]
        is_sig = [q < alpha for q in q_values]
        return q_values, is_sig

    indexed = sorted(enumerate(clamped), key=lambda pair: pair[1])
    q_sorted = [1.0] * m

    # Step-up monotonicity enforcement from largest to smallest rank k
    running_min = 1.0
    for rank_idx in range(m - 1, -1, -1):
        rank_k = rank_idx + 1
        p_val = indexed[rank_idx][1]
        bh_val = (p_val * m) / rank_k
        running_min = min(running_min, bh_val)
        q_sorted[rank_idx] = max(0.0, min(1.0, running_min))

    q_values = [1.0] * m
    is_sig = [False] * m
    for rank_idx, (orig_idx, _) in enumerate(indexed):
        q = round(q_sorted[rank_idx], 8)
        q_values[orig_idx] = q
        is_sig[orig_idx] = q < alpha

    return q_values, is_sig


# ============================================================================
# 9. Single-Region Complete Pipeline & Multiscale Comparison (Invariant #5)
# ============================================================================

def analyze_region_series(
    variable_id: str,
    dates: Sequence[str],
    raw_values: Sequence[Optional[float]],
    fdr_q_value: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Executes the complete statistical pipeline on a region's monthly series and returns
    a `VariableStatistics` dictionary strictly conforming to CONTRATO_DE_DADOS.md.
    """
    if variable_id not in VARIABLE_CATALOG:
        raise SemanticContractError("CONTRACT_VIOLATION", f"Variável desconhecida no catálogo: {variable_id}")

    meta = VARIABLE_CATALOG[variable_id]
    # Invariant #3 hard check: interval scales never allow percentage change
    allow_pct = False if meta["scale_type"] == "interval" else bool(meta["allow_percentage_change"])

    if len(dates) != len(raw_values) or len(dates) == 0:
        raise SemanticContractError("CONTRACT_VIOLATION", "Séries dates e raw_values vazias ou desalinhadas.")

    anom_res = compute_climatological_anomalies(dates, raw_values)
    anomaly_values = anom_res["anomaly_values"]

    # Extract valid indices for regression calculation
    valid_indices = [
        i for i, (r, a) in enumerate(zip(raw_values, anomaly_values))
        if r is not None and a is not None and not _is_missing_or_sentinel(r)
    ]

    if len(valid_indices) < 3:
        raise SemanticContractError(
            "OCEAN_MASK_NO_DATA",
            f"Observações válidas insuficientes ({len(valid_indices)}) para {variable_id}.",
        )

    valid_dates = [dates[i] for i in valid_indices]
    valid_t = [_date_to_fractional_year(d) for d in valid_dates]
    valid_raw = [float(raw_values[i]) for i in valid_indices]  # type: ignore[arg-type]
    valid_anom = [float(anomaly_values[i]) for i in valid_indices]  # type: ignore[arg-type]

    ols = compute_ols_regression(valid_t, valid_anom, valid_raw)
    sen = compute_theil_sen_regression(valid_t, valid_anom)
    coupling = compute_correlation_and_coupling(
        ols["sxx"], ols["syy"], ols["sxy"], sen["kendall_tau"]
    )
    gam = compute_gam_and_regime(
        ols["x_decades"], valid_anom, sen["slope_per_decade_sen"]
    )
    sig = compute_significance_ar1(
        n_obs=len(valid_indices),
        slope_per_decade_ols=ols["slope_per_decade_ols"],
        slope_per_decade_sen=sen["slope_per_decade_sen"],
        se_slope_decade=ols["se_slope_decade"],
        residuals=ols["residuals"],
        fdr_q_value=fdr_q_value,
        y_anomalies=valid_anom,
    )
    outliers = detect_mahalanobis_outliers(
        dates=valid_dates,
        x_decades=ols["x_decades"],
        y_anomalies=valid_anom,
        linear_fit=ols["linear_fit"],
        threshold=2.5,
    )

    # Project linear_fit, sen_fit, and gam_smooth_fit onto all timestamps in `dates`
    t0 = valid_t[0]
    full_linear_fit: List[float] = []
    full_sen_fit: List[float] = []
    full_gam_fit: List[float] = []
    valid_map = {orig_i: pos for pos, orig_i in enumerate(valid_indices)}

    for idx, d_str in enumerate(dates):
        t_cur = _date_to_fractional_year(d_str)
        x_dec = (t_cur - t0) / 10.0
        lin_val = ols["intercept_anomaly_A0"] + ols["slope_per_decade_ols"] * x_dec
        sen_val = sen["intercept_anomaly_sen"] + sen["slope_per_decade_sen"] * x_dec
        full_linear_fit.append(round(lin_val, 5))
        full_sen_fit.append(round(sen_val, 5))
        if idx in valid_map:
            full_gam_fit.append(round(gam["gam_smooth_fit"][valid_map[idx]], 5))
        else:
            full_gam_fit.append(round(sen_val, 5))

    return {
        "variable_id": meta["variable_id"],
        "variable_name": meta["variable_name"],
        "scale_type": meta["scale_type"],
        "unit": meta["unit"],
        "trend_unit": meta["trend_unit"],
        "allow_percentage_change": allow_pct,
        "period": {
            "start": dates[0],
            "end": dates[-1],
            "n_observations": len(valid_indices),
            "n_effective_ar1": sig["n_effective_ar1"],
        },
        "regression": {
            "intercept_at_start_A0": round(ols["intercept_at_start_A0"], 4),
            "slope_per_decade_ols": round(ols["slope_per_decade_ols"], 4),
            "slope_per_decade_sen": round(sen["slope_per_decade_sen"], 4),
            "slope_ci95_low": round(sen["slope_ci95_low"], 4),
            "slope_ci95_high": round(sen["slope_ci95_high"], 4),
            "cumulative_model_change": round(sen["cumulative_model_change"], 4),
            "quadratic_acceleration_B2": round(gam["quadratic_acceleration_B2"], 6),
            "regime_shape": gam["regime_shape"],
        },
        "correlation_and_coupling": coupling,
        "significance": {
            "p_value_naive": sig["p_value_naive"],
            "p_value_ar1_corrected": sig["p_value_ar1_corrected"],
            "fdr_q_value": sig["fdr_q_value"],
            "is_significant_fdr05": sig["is_significant_fdr05"],
            "confidence_tier": sig["confidence_tier"],
        },
        "outliers_mahalanobis": outliers,
        "series": {
            "dates": list(dates),
            "raw_values": [None if _is_missing_or_sentinel(v) else round(float(v), 4) for v in raw_values],  # type: ignore[arg-type]
            "anomaly_values": [None if v is None else round(float(v), 4) for v in anomaly_values],
            "linear_fit": full_linear_fit,
            "sen_fit": full_sen_fit,
            "gam_smooth_fit": full_gam_fit,
        },
    }


def _pearson_corr_pairs(pairs: Sequence[Tuple[float, float]]) -> Tuple[float, float]:
    """Computes Pearson correlation r and two-tailed p-value over paired observations."""
    n = len(pairs)
    if n < 3:
        return 0.0, 1.0
    mx = sum(p[0] for p in pairs) / n
    my = sum(p[1] for p in pairs) / n
    sxx = sum((p[0] - mx) ** 2 for p in pairs)
    syy = sum((p[1] - my) ** 2 for p in pairs)
    sxy = sum((p[0] - mx) * (p[1] - my) for p in pairs)
    denom = math.sqrt(sxx * syy)
    if denom <= 1e-15:
        return 0.0, 1.0
    r = max(-1.0, min(1.0, sxy / denom))
    if abs(r) >= 0.999999:
        return r, 0.0
    df = float(n - 2)
    t_stat = r * math.sqrt(df / max(1e-15, 1.0 - r * r))
    p_val = _student_t_two_tailed_pvalue(t_stat, df)
    return round(r, 4), round(p_val, 8)


def compare_regions(
    region_a_id: str,
    region_b_id: str,
    analysis_a: Mapping[str, Any],
    analysis_b: Mapping[str, Any],
) -> Dict[str, Any]:
    """
    Implements Invariant #5 (Multiscale Correlation Decomposition & Spatial Divergence):
    - Enforces identical temporal intersection [start, end] (Leavitt's confounder control).
    - Computes long_term_secular_r (GAM / trend-coupled trajectory) vs.
      short_term_detrended_r (short-term residuals after removing the secular linear fit).
    - Detects Multiscale Paradox (e.g., positive long-term correlation with negative short-term dipole).
    """
    dates_a = analysis_a["series"]["dates"]
    dates_b = analysis_b["series"]["dates"]
    if dates_a[0] != dates_b[0] or dates_a[-1] != dates_b[-1]:
        raise SemanticContractError(
            "INVALID_DATE_INTERSECTION",
            f"Comparação proibida entre janelas desalinhadas: A ({dates_a[0]}..{dates_a[-1]}) vs B ({dates_b[0]}..{dates_b[-1]}).",
        )

    map_a = {
        d: (anom, lin, gam)
        for d, anom, lin, gam in zip(
            dates_a,
            analysis_a["series"]["anomaly_values"],
            analysis_a["series"]["linear_fit"],
            analysis_a["series"]["gam_smooth_fit"],
        )
        if anom is not None
    }
    map_b = {
        d: (anom, lin, gam)
        for d, anom, lin, gam in zip(
            dates_b,
            analysis_b["series"]["anomaly_values"],
            analysis_b["series"]["linear_fit"],
            analysis_b["series"]["gam_smooth_fit"],
        )
        if anom is not None
    }

    common_dates = sorted(set(map_a.keys()).intersection(map_b.keys()))
    if len(common_dates) < 3:
        raise SemanticContractError(
            "INVALID_DATE_INTERSECTION",
            "Menos de 3 meses em comum válidos entre as duas séries comparadas.",
        )

    # Long-term secular correlation (low-frequency GAM smooth + deseasonalized anomaly cloud)
    secular_pairs: List[Tuple[float, float]] = []
    detrended_pairs: List[Tuple[float, float]] = []

    for d in common_dates:
        anom_a, lin_a, gam_a = map_a[d]
        anom_b, lin_b, gam_b = map_b[d]
        # Secular component blends the smooth GAM trajectory with the full anomaly series
        secular_pairs.append((0.7 * float(gam_a) + 0.3 * float(anom_a), 0.7 * float(gam_b) + 0.3 * float(anom_b)))
        # Detrended short-term residual: e(t) = Y'(t) - Y_hat_linear(t)
        detrended_pairs.append((float(anom_a) - float(lin_a), float(anom_b) - float(lin_b)))

    r_secular, _ = _pearson_corr_pairs(secular_pairs)
    r_detrended, _ = _pearson_corr_pairs(detrended_pairs)

    slope_a = float(analysis_a["regression"]["slope_per_decade_sen"])
    slope_b = float(analysis_b["regression"]["slope_per_decade_sen"])
    var_a = analysis_a["variable_id"]
    var_b = analysis_b["variable_id"]

    same_unit = analysis_a["trend_unit"] == analysis_b["trend_unit"]
    slope_diff = round(slope_a - slope_b, 4) if same_unit else None
    spatial_divergence = (slope_a * slope_b < 0.0) and (region_a_id != region_b_id)

    # Classify Multiscale Paradox (Doc 03)
    if r_secular > 0.25 and r_detrended < -0.20:
        paradox_type = "MULTISCALE_PARADOX_POS_GLOBAL_NEG_LOCAL"
        interpretation = (
            f"Paradoxo Multiescala Detectado: a longo prazo ({var_a} vs {var_b}) caminham na mesma direção "
            f"(r_global = {r_secular:+.2f}), mas a curto prazo operam em oposição de fase / gangorra climática "
            f"(r_detrended = {r_detrended:+.2f})."
        )
    elif r_secular < -0.25 and r_detrended > 0.20:
        paradox_type = "MULTISCALE_PARADOX_NEG_GLOBAL_POS_LOCAL"
        interpretation = (
            f"Paradoxo Multiescala Invertido: divergência secular de longo prazo (r_global = {r_secular:+.2f}), "
            f"porém oscilações de curto prazo sincronizadas em fase (r_detrended = {r_detrended:+.2f})."
        )
    elif spatial_divergence:
        paradox_type = "OPPOSING_SECULAR_AND_COUPLED_DIPOLE"
        interpretation = (
            f"Divergência espacial confirmada ('sobe aqui, cai ali'): Região A apresenta {slope_a:+.3f} "
            f"{analysis_a['trend_unit']} enquanto Região B apresenta {slope_b:+.3f} {analysis_b['trend_unit']}."
        )
    elif abs(r_detrended) >= 0.30 and (r_secular * r_detrended > 0):
        paradox_type = "LOCAL_PHYSICAL_COUPLING"
        interpretation = (
            f"Acoplamento físico consistente entre {var_a} e {var_b} tanto na tendência secular "
            f"(r_global = {r_secular:+.2f}) quanto na variabilidade interanual (r_detrended = {r_detrended:+.2f})."
        )
    elif abs(r_secular) >= 0.40:
        paradox_type = "SYNCHRONOUS_SECULAR_TREND"
        interpretation = (
            f"Co-evolução secular forte (r_global = {r_secular:+.2f}) com baixa interferência de curto prazo "
            f"(r_detrended = {r_detrended:+.2f})."
        )
    else:
        paradox_type = "UNCOUPLED_REGIMES"
        interpretation = (
            f"Regimes fracamente acoplados no período analisado (r_global = {r_secular:+.2f}, "
            f"r_detrended = {r_detrended:+.2f})."
        )

    return {
        "region_a_id": region_a_id,
        "region_b_id": region_b_id,
        "spatial_divergence_detected": bool(spatial_divergence),
        "slope_difference_per_decade": slope_diff,
        "multiscale_correlation": {
            "long_term_secular_r": r_secular,
            "short_term_detrended_r": r_detrended,
            "paradox_type": paradox_type,
            "interpretation": interpretation,
        },
    }


def analyze_request(
    request_payload: Mapping[str, Any],
    dates_a: Sequence[str],
    cells_series_a: Sequence[Sequence[Optional[float]]],
    dates_b: Optional[Sequence[str]] = None,
    cells_series_b: Optional[Sequence[Sequence[Optional[float]]]] = None,
    source: str = "backend_api",
) -> Dict[str, Any]:
    """
    High-level orchestrator for `POST /api/analyze` (Fluxo B of CONTRATO_DE_DADOS.md).
    Aggregates K <= 9 cells via nanmean, aligns time windows, runs the statistical engine,
    applies Benjamini-Hochberg FDR across active analyses, and builds RegionAnalysisResponse.
    """
    var_a = str(request_payload["variable_a"])
    var_b_raw = request_payload.get("variable_b")
    var_b = str(var_b_raw) if var_b_raw else None

    region_a = request_payload["region_a"]
    region_b = request_payload.get("region_b")

    region_a_id = str(region_a["region_id"])
    cells_count_a = len(region_a.get("cells", cells_series_a))

    bounds = get_intersecting_date_bounds(
        var_a,
        var_b,
        request_payload.get("start_date"),
        request_payload.get("end_date"),
    )
    start_date, end_date = bounds["startDate"], bounds["endDate"]

    agg_a = aggregate_cells_nanmean(cells_series_a, variable_id=var_a)
    filtered_dates_a: List[str] = []
    filtered_vals_a: List[Optional[float]] = []
    for d, v in zip(dates_a, agg_a):
        if start_date <= d <= end_date:
            filtered_dates_a.append(d)
            filtered_vals_a.append(v)

    stats_a = analyze_region_series(var_a, filtered_dates_a, filtered_vals_a)

    has_second_series = (
        cells_series_b is not None
        and dates_b is not None
        and (region_b is not None or (var_b is not None and var_b != var_a))
    )

    if has_second_series and cells_series_b is not None and dates_b is not None:
        effective_var_b = var_b if var_b is not None else var_a
        region_b_id = str(region_b["region_id"]) if region_b is not None else region_a_id
        cells_count_b = len(region_b.get("cells", cells_series_b)) if region_b is not None else cells_count_a

        agg_b = aggregate_cells_nanmean(cells_series_b, variable_id=effective_var_b)
        filtered_dates_b: List[str] = []
        filtered_vals_b: List[Optional[float]] = []
        for d, v in zip(dates_b, agg_b):
            if start_date <= d <= end_date:
                filtered_dates_b.append(d)
                filtered_vals_b.append(v)

        stats_b = analyze_region_series(effective_var_b, filtered_dates_b, filtered_vals_b)

        # Apply Benjamini-Hochberg FDR jointly across the two tested series
        q_vals, _ = apply_spatial_fdr_bh(
            [
                stats_a["significance"]["p_value_ar1_corrected"],
                stats_b["significance"]["p_value_ar1_corrected"],
            ]
        )
        stats_a["significance"]["fdr_q_value"] = q_vals[0]
        stats_a["significance"]["is_significant_fdr05"] = (
            q_vals[0] < 0.05
            and (stats_a["regression"]["slope_per_decade_ols"] * stats_a["regression"]["slope_per_decade_sen"] >= 0)
        )
        stats_b["significance"]["fdr_q_value"] = q_vals[1]
        stats_b["significance"]["is_significant_fdr05"] = (
            q_vals[1] < 0.05
            and (stats_b["regression"]["slope_per_decade_ols"] * stats_b["regression"]["slope_per_decade_sen"] >= 0)
        )

        comp_pair = compare_regions(region_a_id, region_b_id, stats_a, stats_b)
    else:
        region_b_id = None
        cells_count_b = 0
        stats_b = None
        comp_pair = None

    return {
        "request_meta": {
            "variable_a": var_a,
            "variable_b": var_b,
            "region_a_id": region_a_id,
            "region_b_id": region_b_id,
            "cells_count_a": cells_count_a,
            "cells_count_b": cells_count_b,
            "spatial_aggregation": "nanmean",
            "source": source,
        },
        "region_a_analysis": stats_a,
        "region_b_analysis": stats_b,
        "comparison_pair": comp_pair,
    }


def build_global_grid_payload(
    variable_id: str,
    period_start: str,
    period_end: str,
    raw_grid_cells: Sequence[Mapping[str, Any]],
) -> Dict[str, Any]:
    """
    Builds Fluxo A (`public/data/{var_id}_grid.json`) applying spatial Benjamini-Hochberg FDR
    across all M cells in the map grid so false positives are controlled globally (q < 0.05).
    Each entry in `raw_grid_cells` can provide either precomputed `slope_sen_decade` + `p_value_ar1`
    or `dates` + `raw_values`.
    """
    if variable_id not in VARIABLE_CATALOG:
        raise SemanticContractError("CONTRACT_VIOLATION", f"Variável desconhecida: {variable_id}")
    meta = VARIABLE_CATALOG[variable_id]

    interim_points: List[Dict[str, Any]] = []
    p_values: List[float] = []

    for cell in raw_grid_cells:
        lat = float(cell["lat"])
        lon = float(cell["lon"])
        if "slope_sen_decade" in cell and "p_value_ar1" in cell:
            slope_sen = float(cell["slope_sen_decade"])
            p_ar1 = float(cell["p_value_ar1"])
        else:
            st = analyze_region_series(variable_id, cell["dates"], cell["raw_values"])
            slope_sen = float(st["regression"]["slope_per_decade_sen"])
            p_ar1 = float(st["significance"]["p_value_ar1_corrected"])

        interim_points.append({"lat": lat, "lon": lon, "slope_sen_decade": round(slope_sen, 4)})
        p_values.append(p_ar1)

    q_values, is_sig_flags = apply_spatial_fdr_bh(p_values, alpha=0.05)

    points = [
        {
            "lat": pt["lat"],
            "lon": pt["lon"],
            "slope_sen_decade": pt["slope_sen_decade"],
            "q_value_fdr": round(q_val, 6),
            "is_sig": bool(sig_flag),
        }
        for pt, q_val, sig_flag in zip(interim_points, q_values, is_sig_flags)
    ]

    return {
        "variable_id": meta["variable_id"],
        "unit": meta["unit"],
        "trend_unit": meta["trend_unit"],
        "period": {"start": period_start, "end": period_end},
        "points": points,
    }
