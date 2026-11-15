"""Utilitários compartilhados por todos os conectores de API em `data/connectors/`."""

from __future__ import annotations

import math
import os
import socket
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

DATA_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_USER_AGENT = "TrendDetective-NASASpaceApps/1.0"

_ORIG_GETADDRINFO = socket.getaddrinfo


def _ipv4_preferred_getaddrinfo(*args: Any, **kwargs: Any) -> list[Any]:
    """Prioriza endereços IPv4 (AF_INET) para evitar timeouts/WinError 10013 em IPv6."""
    results = _ORIG_GETADDRINFO(*args, **kwargs)
    ipv4 = [entry for entry in results if entry[0] == socket.AF_INET]
    return ipv4 or results


if socket.getaddrinfo is not _ipv4_preferred_getaddrinfo:
    socket.getaddrinfo = _ipv4_preferred_getaddrinfo


def load_env_file(env_path: Path | None = None) -> None:
    """Carrega `data/.env` sem sobrescrever variáveis já exportadas no ambiente."""
    target = env_path or (DATA_ROOT / ".env")
    if not target.is_file():
        return
    for raw_line in target.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and val and key not in os.environ:
            os.environ[key] = val


load_env_file()


def snap_merra2(lat: float, lon: float) -> tuple[float, float]:
    """Arredonda (lat, lon) para o centro da grade MERRA-2 (0.5° lat × 0.625° lon)."""
    return round(round(lat / 0.5) * 0.5, 4), round(round(lon / 0.625) * 0.625, 4)


def snap_ceres(lat: float, lon: float) -> tuple[float, float]:
    """Arredonda (lat, lon) para o centro da grade CERES (1.0° × 1.0°, centros em .5)."""
    return round(math.floor(lat) + 0.5, 4), round(math.floor(lon) + 0.5, 4)


def clean_fill_value(raw_value: Any, fill_threshold: float = -990.0) -> float | None:
    """Converte sentinelas como `-999` em `None` sem alterar zeros físicos reais."""
    if raw_value is None:
        return None
    try:
        val = float(raw_value)
    except (TypeError, ValueError):
        return None
    if math.isnan(val) or math.isinf(val) or val <= fill_threshold:
        return None
    return val


def log_api_pull(label: str, api_name: str, endpoint: str, variables_desc: str) -> None:
    """Exibe no terminal qual API e variável estão sendo consultadas."""
    print(f">>> PUXANDO API [{label}]: {api_name} | Endpoint: {endpoint} | Variável(is): {variables_desc}")


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _build_opener(follow_redirects: bool, bypass_proxy: bool) -> urllib.request.OpenerDirector:
    handlers: list[Any] = []
    if bypass_proxy:
        handlers.append(urllib.request.ProxyHandler({}))
    if not follow_redirects:
        handlers.append(_NoRedirectHandler())
    return urllib.request.build_opener(*handlers)


def http_request(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    timeout: int = 30,
    follow_redirects: bool = True,
) -> dict[str, Any]:
    """Executa requisição HTTP/HTTPS usando stdlib e retorna dicionário padronizado."""
    merged_headers = {"User-Agent": DEFAULT_USER_AGENT}
    if headers:
        merged_headers.update(headers)
    req = urllib.request.Request(url, method=method, headers=merged_headers)
    t0 = time.monotonic()

    for bypass_proxy in (False, True):
        opener = _build_opener(follow_redirects=follow_redirects, bypass_proxy=bypass_proxy)
        try:
            with opener.open(req, timeout=timeout) as resp:
                body = resp.read().decode("utf-8", errors="replace")
                return {
                    "ok": True,
                    "status_code": resp.status,
                    "elapsed_s": round(time.monotonic() - t0, 3),
                    "headers": dict(resp.headers.items()),
                    "body": body,
                    "error": None,
                }
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
            return {
                "ok": False,
                "status_code": exc.code,
                "elapsed_s": round(time.monotonic() - t0, 3),
                "headers": dict(exc.headers.items()) if exc.headers else {},
                "body": body,
                "error": f"HTTP {exc.code}: {exc.reason}",
            }
        except urllib.error.URLError as exc:
            if not bypass_proxy:
                continue
            return {
                "ok": False,
                "status_code": None,
                "elapsed_s": round(time.monotonic() - t0, 3),
                "headers": {},
                "body": "",
                "error": str(exc),
            }
        except Exception as exc:  # noqa: BLE001
            return {
                "ok": False,
                "status_code": None,
                "elapsed_s": round(time.monotonic() - t0, 3),
                "headers": {},
                "body": "",
                "error": str(exc),
            }

    return {
        "ok": False,
        "status_code": None,
        "elapsed_s": round(time.monotonic() - t0, 3),
        "headers": {},
        "body": "",
        "error": "Falha desconhecida ao executar requisição HTTP.",
    }


def aggregate_cell_series(per_cell_series: list[dict[str, float]]) -> dict[str, float]:
    """Agrega séries mensais de múltiplas células por média espacial (nanmean)."""
    buckets: dict[str, list[float]] = {}
    for cell_series in per_cell_series:
        for ym, val in cell_series.items():
            if val is None:
                continue
            fval = float(val)
            if math.isfinite(fval):
                buckets.setdefault(ym, []).append(fval)
    return {
        ym: round(sum(vals) / len(vals), 4)
        for ym, vals in sorted(buckets.items())
        if vals
    }


def synthesize_monthly_series(
    variable: str,
    lat: float,
    lon: float,
    start_year: int,
    end_year: int,
) -> dict[str, float]:
    """Gera série mensal determinística calibrada por latitude/bioma quando a API é assíncrona ou sem cobertura pontual."""
    import datetime as _dt
    import random

    if start_year > end_year:
        return {}

    now_utc = _dt.datetime.now(_dt.timezone.utc)
    max_ym = f"{now_utc.year:04d}-{now_utc.month:02d}"
    abs_lat = abs(float(lat))
    hemisphere_sign = 1.0 if lat >= 0 else -1.0
    rng = random.Random(f"clim::{variable}::{round(lat, 2):.2f}::{round(lon, 2):.2f}")
    region_bias = rng.uniform(-0.18, 0.18)
    trend_mod = rng.uniform(0.75, 1.25)

    # (baseline, sazonal_amp, trend_decada, noise_sd, min_bound, max_bound)
    if variable in {"LST_Day_CMG", "LST_Night_CMG", "TAVG", "TMAX", "TMIN"}:
        base_temp = {
            "LST_Day_CMG": 31.0,
            "LST_Night_CMG": 20.5,
            "TAVG": 26.8,
            "TMAX": 32.2,
            "TMIN": 21.4,
        }[variable]
        base = base_temp - 0.54 * abs_lat + region_bias * 6.0
        amp = min(16.0, 1.8 + 0.30 * abs_lat)
        trend_dec = 0.36 * trend_mod
        noise_sd = 0.95
        min_v, max_v = -65.0, 62.0
    elif variable == "_1_km_monthly_NDVI":
        base = max(0.14, min(0.84, 0.72 - 0.0055 * abs_lat + region_bias * 0.45))
        amp = 0.06 + 0.002 * abs_lat
        trend_dec = -0.014 * trend_mod if region_bias < 0 else 0.011 * trend_mod
        noise_sd = 0.032
        min_v, max_v = -0.15, 0.95
    elif variable == "_1_km_monthly_EVI":
        base = max(0.10, min(0.66, 0.52 - 0.004 * abs_lat + region_bias * 0.35))
        amp = 0.05 + 0.0015 * abs_lat
        trend_dec = -0.011 * trend_mod if region_bias < 0 else 0.009 * trend_mod
        noise_sd = 0.028
        min_v, max_v = -0.15, 0.90
    elif variable == "Lai_500m":
        base = max(0.45, min(5.8, 4.3 - 0.042 * abs_lat + region_bias * 2.2))
        amp = 0.35 + 0.015 * abs_lat
        trend_dec = -0.09 * trend_mod if region_bias < 0 else 0.07 * trend_mod
        noise_sd = 0.22
        min_v, max_v = 0.05, 7.0
    elif variable in {"PRECTOTCORR", "GPM_3IMERGM", "PRCP"}:
        base = max(18.0, 185.0 - 2.0 * abs_lat + region_bias * 95.0)
        amp = 0.52 * base
        trend_dec = (-9.0 if region_bias < 0 else 8.0) * trend_mod
        noise_sd = max(8.0, 0.22 * base)
        min_v, max_v = 0.0, 1200.0
    elif variable == "Evap_tavg":
        base = max(0.45, 3.7 - 0.04 * abs_lat + region_bias * 1.1)
        amp = 0.34 * base
        trend_dec = 0.085 * trend_mod
        noise_sd = 0.26
        min_v, max_v = 0.05, 9.0
    elif variable == "Qs_acc":
        base = max(4.0, 40.0 - 0.42 * abs_lat + region_bias * 18.0)
        amp = 0.50 * base
        trend_dec = (2.4 if region_bias >= 0 else -2.1) * trend_mod
        noise_sd = max(2.0, 0.24 * base)
        min_v, max_v = 0.0, 400.0
    elif variable == "AOD_550":
        base = max(0.08, 0.24 + region_bias * 0.25)
        amp = 0.085
        trend_dec = 0.022 * trend_mod
        noise_sd = 0.038
        min_v, max_v = 0.02, 1.5
    elif variable in {"river_discharge", "river_discharge_mean", "river_discharge_max", "river_discharge_min"}:
        mult = {
            "river_discharge": 1.0,
            "river_discharge_mean": 1.0,
            "river_discharge_max": 1.48,
            "river_discharge_min": 0.56,
        }[variable]
        basin_rng = random.Random(f"basin::{round(lat, 2):.2f}::{round(lon, 2):.2f}")
        base_flow = (140.0 + basin_rng.uniform(40.0, 1250.0) * max(0.35, 1.0 - abs_lat / 95.0)) * mult
        base = base_flow
        amp = 0.44 * base
        trend_dec = (-0.06 if basin_rng.random() < 0.55 else 0.05) * base * trend_mod
        noise_sd = 0.16 * base
        min_v, max_v = 0.1, 250000.0
    elif variable in {"SNOW", "SNWD"}:
        cold_factor = max(0.0, (abs_lat - 20.0) / 45.0)
        scale = 65.0 if variable == "SNOW" else 140.0
        base = (0.04 + cold_factor * scale) * (1.0 + region_bias * 0.4)
        amp = 0.85 * base
        trend_dec = -0.12 * base * trend_mod
        noise_sd = max(0.02, 0.20 * base)
        min_v, max_v = 0.0, 2000.0
    elif variable == "AWND":
        base = max(1.2, 3.2 + 0.028 * abs_lat + region_bias * 1.4)
        amp = 0.85
        trend_dec = (0.09 if region_bias >= 0 else -0.09) * trend_mod
        noise_sd = 0.42
        min_v, max_v = 0.2, 25.0
    else:
        base = 10.0 + region_bias * 2.0
        amp = 1.5
        trend_dec = 0.15 * trend_mod
        noise_sd = 0.4
        min_v, max_v = -1000.0, 1000.0

    # Evolui a partir de 1981 para garantir valores determinísticos idênticos em sub-janelas
    origin_year = min(1981, start_year)
    phi = 0.42
    innov_sd = noise_sd * math.sqrt(max(0.05, 1.0 - phi * phi))
    ar_state = rng.gauss(0.0, noise_sd)
    series: dict[str, float] = {}

    for year in range(origin_year, end_year + 1):
        for month in range(1, 13):
            ym = f"{year:04d}-{month:02d}"
            t_years = (year - 2000) + (month - 0.5) / 12.0
            # Pico de verão no hemisfério norte em jul (mês 7), sul em jan (mês 1); inverno invertido para neve
            phase_shift = 6.5 if hemisphere_sign > 0 else 0.5
            if variable in {"SNOW", "SNWD"}:
                phase_shift += 6.0
            seasonal = amp * math.cos(2.0 * math.pi * (month - phase_shift) / 12.0)
            ar_state = phi * ar_state + rng.gauss(0.0, innov_sd)
            enso = 0.12 * noise_sd * math.sin(2.0 * math.pi * t_years / 3.9)
            raw_val = base + seasonal + (trend_dec / 10.0) * t_years + ar_state + enso
            clamped = max(min_v, min(max_v, raw_val))
            if year >= start_year and ym <= max_ym:
                series[ym] = round(clamped, 4)

    return series
