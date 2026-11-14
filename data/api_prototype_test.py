#!/usr/bin/env python3
"""Protótipo de validação das 5 APIs e fluxo Local A (1 variável) vs. Local B (1 variável).

Usa apenas a biblioteca padrão do Python para permitir execução imediata sem dependências externas.
Execução:
    python3 data/api_prototype_test.py
"""

from __future__ import annotations

import base64
import calendar
import csv
import io
import json
import math
import os
import statistics
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent
OUTPUT_PATH = DATA_DIR / "sample_comparison_output.json"


def load_env_file(env_path: Path = DATA_DIR / ".env") -> None:
    """Carrega variáveis de data/.env sem sobrescrever variáveis já exportadas no shell."""
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


load_env_file()


def _log_api_pull(label: str, api_name: str, endpoint: str, variable: str) -> None:
    """Imprime indicação explícita de qual API está sendo puxada no momento."""
    print(f">>> PUXANDO API [{label}]: {api_name} | Endpoint: {endpoint} | Variável: {variable}")

INTERVAL_VARIABLES = {
    "T2M",
    "T2M_MAX",
    "T2M_MIN",
    "TS",
    "T2MDEW",
    "TAVG",
    "TMAX",
    "TMIN",
    "LST_Day_CMG",
    "LST_Night_CMG",
}


# ---------------------------------------------------------------------------
# Utilitários espaciais, HTTP e de sanitização (Regras DADOS-1)
# ---------------------------------------------------------------------------

def snap_merra2(lat: float, lon: float) -> tuple[float, float]:
    """Arredonda (lat, lon) para o centro da célula MERRA-2 (0.5° lat × 0.625° lon)."""
    lat_snap = round(round(lat / 0.5) * 0.5, 4)
    lon_snap = round(round(lon / 0.625) * 0.625, 4)
    return lat_snap, lon_snap


def snap_ceres(lat: float, lon: float) -> tuple[float, float]:
    """Arredonda (lat, lon) para o centro da célula CERES (1.0° × 1.0°, centros em .5)."""
    lat_snap = round(math.floor(lat) + 0.5, 4)
    lon_snap = round(math.floor(lon) + 0.5, 4)
    return lat_snap, lon_snap


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Impede seguir redirecionamentos automaticamente para detectar login Earthdata URS."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def http_request(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    timeout: int = 25,
    follow_redirects: bool = True,
) -> dict[str, Any]:
    """Executa uma requisição HTTP/HTTPS e retorna payload estruturado sem lançar exceções."""
    req = urllib.request.Request(url, method=method, headers=headers or {})
    t0 = time.monotonic()
    opener = (
        urllib.request.build_opener()
        if follow_redirects
        else urllib.request.build_opener(_NoRedirectHandler())
    )
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
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "status_code": None,
            "elapsed_s": round(time.monotonic() - t0, 3),
            "headers": {},
            "body": "",
            "error": str(exc),
        }


def _clean_power_value(raw_value: Any) -> float | None:
    """Converte sentinela -999 / -999.0 da NASA POWER para None."""
    if raw_value is None:
        return None
    try:
        val = float(raw_value)
    except (TypeError, ValueError):
        return None
    if math.isnan(val) or val <= -990.0:
        return None
    return val


# ---------------------------------------------------------------------------
# Testes das 5 APIs
# ---------------------------------------------------------------------------

def fetch_nasa_power_single_variable(
    variable: str,
    cells: list[dict[str, float]],
    start_year: int,
    end_year: int,
    *,
    community: str = "AG",
    label: str = "1/5",
) -> dict[str, Any]:
    """API 1 — NASA POWER API v2 (/api/temporal/monthly/point). Aberta (sem cadastro)."""
    if not (1 <= len(cells) <= 9):
        raise ValueError("cells deve conter entre 1 e 9 células adjacentes.")

    base_url = os.environ.get(
        "NASA_POWER_BASE_URL",
        "https://power.larc.nasa.gov/api/temporal/monthly/point",
    ).rstrip("/")
    api_name = "NASA POWER API v2"
    _log_api_pull(label, api_name, base_url, variable)

    snapped_cells = []
    seen = set()
    for cell in cells:
        slat, slon = snap_merra2(float(cell["lat"]), float(cell["lon"]))
        if (slat, slon) not in seen:
            seen.add((slat, slon))
            snapped_cells.append({"lat": slat, "lon": slon})

    monthly_buckets: dict[str, list[float]] = defaultdict(list)
    reported_unit = None
    latencies = []

    for idx, cell in enumerate(snapped_cells):
        if idx > 0:
            time.sleep(0.35)  # respeita limite de 30 req/min
        params = urllib.parse.urlencode({
            "parameters": variable,
            "community": community,
            "longitude": cell["lon"],
            "latitude": cell["lat"],
            "start": start_year,
            "end": end_year,
            "format": "JSON",
        })
        url = f"{base_url}?{params}"
        resp = http_request(url, timeout=30)
        latencies.append(resp["elapsed_s"])
        if not resp["ok"]:
            return {
                "api": api_name,
                "api_puxada": api_name,
                "endpoint_consultado": base_url,
                "requires_registration": False,
                "status": "ERRO",
                "error": resp["error"],
                "url": url,
            }

        payload = json.loads(resp["body"])
        param_meta = payload.get("parameters", {}).get(variable, {})
        reported_unit = reported_unit or param_meta.get("units", "")
        raw_series = (
            payload.get("properties", {})
            .get("parameter", {})
            .get(variable, {})
        )

        for yyyymm, raw_val in raw_series.items():
            if len(yyyymm) != 6 or yyyymm.endswith("13"):
                continue  # descarta obrigatoriamente a chave anual YYYY13
            year = int(yyyymm[:4])
            month = int(yyyymm[4:6])
            if not (1 <= month <= 12):
                continue
            val = _clean_power_value(raw_val)
            if val is None:
                continue
            # Converte PRECTOTCORR de mm/day para mm/mês considerando anos bissextos
            if variable == "PRECTOTCORR" and reported_unit == "mm/day":
                days_in_month = calendar.monthrange(year, month)[1]
                val *= days_in_month
            monthly_buckets[f"{year:04d}-{month:02d}"].append(val)

    output_unit = (
        "mm/mês"
        if variable == "PRECTOTCORR" and reported_unit == "mm/day"
        else (reported_unit or "desconhecida")
    )
    series = {
        month_key: round(statistics.fmean(vals), 4)
        for month_key, vals in sorted(monthly_buckets.items())
        if vals
    }

    return {
        "api": api_name,
        "api_puxada": api_name,
        "endpoint_consultado": base_url,
        "requires_registration": False,
        "registration_info": "Aberta (sem cadastro/token; limite 30 req/min).",
        "status": "OK" if series else "SEM_DADOS_TERRESTRES",
        "variable": variable,
        "raw_api_unit": reported_unit,
        "unit": output_unit,
        "snapped_cells": snapped_cells,
        "months_count": len(series),
        "elapsed_s": round(sum(latencies), 3),
        "series": series,
    }


def fetch_open_meteo_flood_single_variable(
    variable: str,
    cells: list[dict[str, float]],
    start_year: int,
    end_year: int,
    *,
    label: str = "2/5",
) -> dict[str, Any]:
    """API 2 — Open-Meteo Flood API (GloFAS). Aberta para uso não-comercial."""
    if not (1 <= len(cells) <= 9):
        raise ValueError("cells deve conter entre 1 e 9 células.")

    base_url = os.environ.get(
        "OPEN_METEO_FLOOD_BASE_URL",
        "https://flood-api.open-meteo.com/v1/flood",
    ).rstrip("/")
    api_name = "Open-Meteo Flood API (GloFAS)"
    _log_api_pull(label, api_name, base_url, variable)

    monthly_buckets: dict[str, list[float]] = defaultdict(list)
    reported_unit = None
    latencies = []

    for cell in cells:
        params = urllib.parse.urlencode({
            "latitude": cell["lat"],
            "longitude": cell["lon"],
            "daily": variable,
            "start_date": f"{start_year}-01-01",
            "end_date": f"{end_year}-12-31",
        })
        url = f"{base_url}?{params}"
        resp = http_request(url, timeout=30)
        latencies.append(resp["elapsed_s"])
        if not resp["ok"]:
            return {
                "api": api_name,
                "api_puxada": api_name,
                "endpoint_consultado": base_url,
                "requires_registration": False,
                "status": "ERRO",
                "error": resp["error"],
                "url": url,
            }

        payload = json.loads(resp["body"])
        reported_unit = reported_unit or payload.get("daily_units", {}).get(variable, "m³/s")
        daily = payload.get("daily", {})
        dates = daily.get("time", [])
        values = daily.get(variable, [])

        cell_monthly: dict[str, list[float]] = defaultdict(list)
        for date_str, raw_val in zip(dates, values):
            if raw_val is None:
                continue
            ym = date_str[:7]
            cell_monthly[ym].append(float(raw_val))

        for ym, vals in cell_monthly.items():
            if vals:
                monthly_buckets[ym].append(statistics.fmean(vals))

    series = {
        ym: round(statistics.fmean(vals), 4)
        for ym, vals in sorted(monthly_buckets.items())
        if vals
    }

    return {
        "api": api_name,
        "api_puxada": api_name,
        "endpoint_consultado": base_url,
        "requires_registration": False,
        "registration_info": "Aberta (sem cadastro para uso não-comercial).",
        "status": "OK" if series else "SEM_DADOS",
        "variable": variable,
        "unit": reported_unit or "m³/s",
        "cells": cells,
        "months_count": len(series),
        "elapsed_s": round(sum(latencies), 3),
        "series": series,
    }


def test_noaa_cdo(
    label: str = "3/5",
    start_year: int = 2001,
    end_year: int = 2023,
) -> dict[str, Any]:
    """API 3 — NOAA CDO API v2 em loop automático de 10 em 10 anos (GSOM/TAVG)."""
    api_name = "NOAA CDO API v2"
    base_url = os.environ.get(
        "NOAA_CDO_BASE_URL",
        "https://www.ncei.noaa.gov/cdo-web/api/v2",
    ).rstrip("/")
    _log_api_pull(label, api_name, base_url, f"GSOM/TAVG ({start_year}-{end_year})")
    token = os.environ.get("NOAA_CDO_TOKEN", "").strip()
    signup_url = "https://www.ncdc.noaa.gov/cdo-web/token"

    if not token:
        probe_url = f"{base_url}/datasets?limit=1"
        resp = http_request(probe_url, timeout=20)
        return {
            "api": api_name,
            "api_puxada": api_name,
            "endpoint_consultado": probe_url,
            "requires_registration": True,
            "registration_info": (
                f"Exige token gratuito enviado por e-mail em {signup_url} "
                "(preencher NOAA_CDO_TOKEN em data/.env)."
            ),
            "status": "REQUER_TOKEN_CADASTRO",
            "probe_http_status": resp["status_code"],
            "probe_response": resp["body"][:200],
            "elapsed_s": resp["elapsed_s"],
        }

    station_id = "GHCND:USW00094728"  # estação referência GSOM ativa (Central Park, NY)
    stations_url = (
        f"{base_url}/stations?"
        + urllib.parse.urlencode({
            "datasetid": "GSOM",
            "datatypeid": "TAVG",
            "startdate": f"{start_year}-01-01",
            "enddate": f"{end_year}-12-31",
            "extent": "39.28,-75.47,42.28,-72.47",
            "sortfield": "datacoverage",
            "sortorder": "desc",
            "limit": 1,
        })
    )
    stations_resp = http_request(stations_url, headers={"token": token}, timeout=25)
    total_elapsed = stations_resp["elapsed_s"]
    if stations_resp["ok"] and stations_resp["body"]:
        st_results = json.loads(stations_resp["body"]).get("results", [])
        if st_results:
            station_id = st_results[0]["id"]

    chunks_10y: list[str] = []
    all_results: list[dict[str, Any]] = []
    for chunk_start in range(start_year, end_year + 1, 10):
        chunk_end = min(chunk_start + 9, end_year)
        chunks_10y.append(f"{chunk_start}-{chunk_end}")
        time.sleep(0.22)
        params = urllib.parse.urlencode({
            "datasetid": "GSOM",
            "stationid": station_id,
            "datatypeid": "TAVG",
            "startdate": f"{chunk_start}-01-01",
            "enddate": f"{chunk_end}-12-31",
            "units": "metric",
            "limit": 1000,
        })
        url = f"{base_url}/data?{params}"
        resp = http_request(url, headers={"token": token}, timeout=25)
        total_elapsed += resp["elapsed_s"]
        if not resp["ok"]:
            return {
                "api": api_name,
                "api_puxada": api_name,
                "endpoint_consultado": url,
                "requires_registration": True,
                "status": "ERRO",
                "http_status": resp["status_code"],
                "error": resp["error"],
                "chunks_10y": chunks_10y,
                "elapsed_s": round(total_elapsed, 3),
            }
        payload = json.loads(resp["body"] or "{}")
        all_results.extend(payload.get("results", []))

    return {
        "api": api_name,
        "api_puxada": api_name,
        "endpoint_consultado": f"{base_url}/data",
        "requires_registration": True,
        "status": "OK" if all_results else "OK_SEM_REGISTROS_NA_JANELA",
        "station_id": station_id,
        "chunks_10y": chunks_10y,
        "records_returned": len(all_results),
        "sample_records": all_results[:2],
        "elapsed_s": round(total_elapsed, 3),
    }


def test_nasa_appeears(label: str = "4/5") -> dict[str, Any]:
    """API 4 — NASA AppEEARS API. Catálogo é aberto; tarefas exigem NASA Earthdata Login."""
    api_name = "NASA AppEEARS API (MODIS)"
    base_url = os.environ.get(
        "NASA_APPEEARS_BASE_URL",
        "https://appeears.earthdatacloud.nasa.gov/api",
    ).rstrip("/")
    catalog_url = f"{base_url}/product/MOD13A3.061"
    _log_api_pull(label, api_name, base_url, "MOD13A3.061/_1_km_monthly_NDVI")

    catalog_resp = http_request(catalog_url, timeout=25)
    username = os.environ.get("EARTHDATA_USERNAME", "").strip()
    password = os.environ.get("EARTHDATA_PASSWORD", "").strip()

    auth_status = "NAO_AUTENTICADO_SEM_CREDENCIAIS"
    tasks_http_status = None
    existing_tasks_count = None
    login_elapsed = 0.0
    if username and password:
        creds = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
        login_resp = http_request(
            f"{base_url}/login",
            method="POST",
            headers={"Authorization": f"Basic {creds}"},
            timeout=25,
        )
        login_elapsed += login_resp["elapsed_s"]
        if login_resp["ok"]:
            login_payload = json.loads(login_resp["body"] or "{}")
            session_token = login_payload.get("token", "")
            if session_token:
                tasks_resp = http_request(
                    f"{base_url}/task?limit=2",
                    headers={"Authorization": f"Bearer {session_token}"},
                    timeout=25,
                )
                login_elapsed += tasks_resp["elapsed_s"]
                tasks_http_status = tasks_resp["status_code"]
                if tasks_resp["ok"]:
                    tasks_list = json.loads(tasks_resp["body"] or "[]")
                    existing_tasks_count = len(tasks_list)
                    auth_status = "OK_AUTENTICADO"
                else:
                    auth_status = f"TOKEN_OBTIDO_ERRO_TASK ({tasks_resp['error']})"
            else:
                auth_status = "ERRO_LOGIN_SEM_TOKEN"
        else:
            auth_status = f"ERRO_LOGIN ({login_resp['error']})"

    product_info = {}
    if catalog_resp["ok"]:
        parsed = json.loads(catalog_resp["body"])
        ndvi_layer = parsed.get("_1_km_monthly_NDVI", {})
        product_info = {
            "product": "MOD13A3.061",
            "layers_count": len(parsed),
            "sample_layer": ndvi_layer.get("Layer"),
            "Description": ndvi_layer.get("Description"),
            "ScaleFactor": ndvi_layer.get("ScaleFactor"),
            "FillValue": ndvi_layer.get("FillValue"),
            "Available": ndvi_layer.get("Available"),
        }

    overall_status = (
        "OK"
        if catalog_resp["ok"] and auth_status == "OK_AUTENTICADO"
        else ("CATALOGO_OK_TAREFAS_REQUEREM_EARTHDATA" if catalog_resp["ok"] else "ERRO")
    )

    return {
        "api": api_name,
        "api_puxada": api_name,
        "endpoint_consultado": base_url,
        "requires_registration": True,
        "registration_info": (
            "Catálogo de produtos é público, mas submeter/baixar tarefas (/api/login, /api/task) "
            "exige conta gratuita NASA Earthdata Login em https://urs.earthdata.nasa.gov/users/new "
            "(EARTHDATA_USERNAME e EARTHDATA_PASSWORD)."
        ),
        "status": overall_status,
        "catalog_http_status": catalog_resp["status_code"],
        "auth_status": auth_status,
        "tasks_http_status": tasks_http_status,
        "existing_tasks_count": existing_tasks_count,
        "product_sample": product_info,
        "elapsed_s": round(catalog_resp["elapsed_s"] + login_elapsed, 3),
    }


def parse_giovanni_hydrology_csv(csv_text: str) -> dict[str, float]:
    """Lê séries CSV/ASC2 exportadas do Giovanni / GES DISC Hydrology Time Series."""
    series: dict[str, float] = {}
    reader = csv.reader(io.StringIO(csv_text))
    for row in reader:
        if not row or len(row) < 2 or row[0].startswith("#"):
            continue
        date_col = row[0].strip()
        val_col = row[1].strip()
        if not date_col or date_col[0].isalpha():
            continue
        try:
            val = float(val_col)
        except ValueError:
            continue
        if math.isnan(val) or val <= -990.0:
            continue
        series[date_col[:7]] = val
    return series


def test_giovanni_hydrology(label: str = "5/5") -> dict[str, Any]:
    """API 5 — NASA Giovanni / GES DISC (CMR + Portal Giovanni). Exige Earthdata Login."""
    api_name = "NASA Giovanni / GES DISC"
    token = os.environ.get("EARTHDATA_TOKEN", "").strip()
    giovanni_url = os.environ.get(
        "NASA_GIOVANNI_URL",
        "https://giovanni.gsfc.nasa.gov/giovanni/",
    )
    cmr_collection_url = (
        "https://cmr.earthdata.nasa.gov/search/collections.json"
        "?provider=GES_DISC&short_name=GLDAS_NOAH025_M"
    )
    cmr_granules_url = (
        "https://cmr.earthdata.nasa.gov/search/granules.json"
        "?short_name=GLDAS_NOAH025_M&temporal=2023-01-01T00:00:00Z,2023-03-31T23:59:59Z&page_size=2"
    )
    _log_api_pull(label, api_name, giovanni_url, "GLDAS_NOAH025_M / Evap_tavg")

    giovanni_resp = http_request(giovanni_url, timeout=20)
    auth_headers = {"Authorization": f"Bearer {token}"} if token else {}
    cmr_col_resp = http_request(cmr_collection_url, headers=auth_headers, timeout=25)
    cmr_gran_resp = http_request(cmr_granules_url, headers=auth_headers, timeout=25)

    data_rods_url = (
        "https://hydro1.gesdisc.eosdis.nasa.gov/daac-bin/access/timeseries.cgi"
        "?variable=GLDAS2:GLDAS_NOAH025_M_v2.1:Evap_tavg"
        "&startDate=2023-01-01T00&endDate=2023-03-01T00"
        "&location=GEOM:POINT(-60.0,-3.0)&type=asc2"
    )
    rods_resp = http_request(data_rods_url, headers=auth_headers, timeout=25, follow_redirects=False)
    redirect_loc = rods_resp["headers"].get("Location") or rods_resp["headers"].get("location")

    collection_title = None
    granules_sample = []
    if cmr_col_resp["ok"]:
        entries = json.loads(cmr_col_resp["body"] or "{}").get("feed", {}).get("entry", [])
        if entries:
            collection_title = entries[0].get("title")
    if cmr_gran_resp["ok"]:
        g_entries = json.loads(cmr_gran_resp["body"] or "{}").get("feed", {}).get("entry", [])
        granules_sample = [
            {
                "title": g.get("title"),
                "time_start": g.get("time_start"),
                "time_end": g.get("time_end"),
            }
            for g in g_entries
        ]

    if token and giovanni_resp["ok"] and cmr_col_resp["ok"] and cmr_gran_resp["ok"]:
        status = "OK"
    elif cmr_col_resp["status_code"] == 401 or cmr_gran_resp["status_code"] == 401:
        status = "TOKEN_EARTHDATA_INVALIDO_OU_EXPIRADO"
    elif redirect_loc and "discontinued" in redirect_loc.lower():
        status = "PORTAL_GIOVANNI_OK_DATA_RODS_TRANSICAO"
    elif giovanni_resp["ok"]:
        status = "PORTAL_GIOVANNI_OK_REQUER_EARTHDATA"
    else:
        status = "ERRO"

    total_elapsed = round(
        giovanni_resp["elapsed_s"]
        + cmr_col_resp["elapsed_s"]
        + cmr_gran_resp["elapsed_s"]
        + rods_resp["elapsed_s"],
        3,
    )

    return {
        "api": api_name,
        "api_puxada": api_name,
        "endpoint_consultado": giovanni_url,
        "requires_registration": True,
        "registration_info": (
            "Exige conta gratuita NASA Earthdata Login (https://urs.earthdata.nasa.gov/users/new) "
            "para exportar CSVs no portal Giovanni ou acessar coleções/granules GES DISC com EARTHDATA_TOKEN."
        ),
        "status": status,
        "earthdata_token_configured": bool(token),
        "giovanni_portal_http": giovanni_resp["status_code"],
        "cmr_authenticated_collection_http": cmr_col_resp["status_code"],
        "cmr_authenticated_granules_http": cmr_gran_resp["status_code"],
        "collection_title": collection_title,
        "granules_sample": granules_sample,
        "hydrology_rods_legacy_http": rods_resp["status_code"],
        "hydrology_rods_legacy_redirect": redirect_loc,
        "elapsed_s": total_elapsed,
    }


# ---------------------------------------------------------------------------
# Motor estatístico mínimo do protótipo (Local A vs. Local B)
# ---------------------------------------------------------------------------

def _climatological_anomalies(series: dict[str, float]) -> dict[str, float]:
    """Extrai anomalias mensais dessazonalizadas (Y'_{a,m} = Y_{a,m} - média_mês_m)."""
    by_month: dict[int, list[float]] = defaultdict(list)
    for ym, val in series.items():
        by_month[int(ym[5:7])].append(val)
    month_means = {m: statistics.fmean(vals) for m, vals in by_month.items()}
    return {
        ym: round(val - month_means[int(ym[5:7])], 6)
        for ym, val in sorted(series.items())
    }


def _ols_fit(xs: list[float], ys: list[float]) -> tuple[float, float, list[float]]:
    """Ajusta Y = A0 + B*X sobre toda a nuvem de pontos e retorna (A0, B, resíduos)."""
    mx = statistics.fmean(xs)
    my = statistics.fmean(ys)
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    den = sum((x - mx) ** 2 for x in xs)
    slope = num / den if den > 0 else 0.0
    intercept = my - slope * mx
    residuals = [y - (intercept + slope * x) for x, y in zip(xs, ys)]
    return intercept, slope, residuals


def _theil_sen_slope(xs: list[float], ys: list[float]) -> float:
    """Calcula a inclinação mediana robusta de Theil-Sen sobre todos os pares i < j."""
    slopes = []
    n = len(xs)
    for i in range(n):
        for j in range(i + 1, n):
            dx = xs[j] - xs[i]
            if dx != 0:
                slopes.append((ys[j] - ys[i]) / dx)
    return statistics.median(slopes) if slopes else 0.0


def _pearson_r(xs: list[float], ys: list[float]) -> float:
    """Calcula correlação linear de Pearson r entre duas séries alinhadas."""
    mx = statistics.fmean(xs)
    my = statistics.fmean(ys)
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    den_x = math.sqrt(sum((x - mx) ** 2 for x in xs))
    den_y = math.sqrt(sum((y - my) ** 2 for y in ys))
    if den_x == 0 or den_y == 0:
        return 0.0
    return num / (den_x * den_y)


def _summarize_location(
    loc_cfg: dict[str, Any],
    fetched: dict[str, Any],
    common_months: list[str],
    anomalies_aligned: list[float],
    xs_years: list[float],
) -> dict[str, Any]:
    """Calcula métricas de tendência da variável única selecionada para o local."""
    a0, slope_ols_yr, residuals = _ols_fit(xs_years, anomalies_aligned)
    slope_sen_yr = _theil_sen_slope(xs_years, anomalies_aligned)
    var_code = loc_cfg["variable"]
    scale_type = "interval" if var_code in INTERVAL_VARIABLES else "ratio"
    return {
        "name": loc_cfg["name"],
        "api_puxada": fetched["api_puxada"],
        "endpoint_consultado": fetched.get("endpoint_consultado"),
        "source": fetched["api"],
        "variable": var_code,
        "unit": fetched["unit"],
        "scale_type": scale_type,
        "allow_percentage_change": scale_type == "ratio",
        "cells_requested": loc_cfg["cells"],
        "cells_snapped": fetched.get("snapped_cells", loc_cfg["cells"]),
        "n_months": len(common_months),
        "intercept_at_start_A0": round(a0, 4),
        "slope_per_decade_ols": round(slope_ols_yr * 10.0, 4),
        "slope_per_decade_sen": round(slope_sen_yr * 10.0, 4),
        "residuals_detrended": residuals,
    }


def fetch_location_single_variable(
    loc_cfg: dict[str, Any],
    start_year: int,
    end_year: int,
    *,
    label: str = "Local",
) -> dict[str, Any]:
    """Busca exatamente 1 variável para um único local (A ou B)."""
    source = loc_cfg["source"]
    if source == "nasa_power":
        return fetch_nasa_power_single_variable(
            loc_cfg["variable"],
            loc_cfg["cells"],
            start_year,
            end_year,
            label=label,
        )
    if source == "open_meteo_flood":
        return fetch_open_meteo_flood_single_variable(
            loc_cfg["variable"],
            loc_cfg["cells"],
            start_year,
            end_year,
            label=label,
        )
    raise ValueError(f"Fonte não suportada no fluxo ao vivo: {source}")


def compare_location_a_and_b(
    location_a: dict[str, Any],
    location_b: dict[str, Any],
    start_year: int,
    end_year: int,
    *,
    comparison_label: str = "Comparação A vs. B",
) -> dict[str, Any]:
    """Executa o fluxo: Local A (1 var) + Local B (1 var) -> comparação alinhada."""
    fetched_a = fetch_location_single_variable(
        location_a, start_year, end_year, label=f"{comparison_label} | Local A"
    )
    fetched_b = fetch_location_single_variable(
        location_b, start_year, end_year, label=f"{comparison_label} | Local B"
    )

    if fetched_a["status"] != "OK" or fetched_b["status"] != "OK":
        return {
            "status": "ERRO_COLETA",
            "location_a": fetched_a,
            "location_b": fetched_b,
        }

    anom_a = _climatological_anomalies(fetched_a["series"])
    anom_b = _climatological_anomalies(fetched_b["series"])
    common_months = sorted(set(anom_a).intersection(anom_b))
    if len(common_months) < 12:
        return {
            "status": "JANELA_COMUM_INSUFICIENTE",
            "common_months": len(common_months),
        }

    t0_year, t0_month = int(common_months[0][:4]), int(common_months[0][5:7])
    t0 = t0_year + (t0_month - 0.5) / 12.0
    xs_years = [
        (int(ym[:4]) + (int(ym[5:7]) - 0.5) / 12.0) - t0
        for ym in common_months
    ]
    ys_a = [anom_a[ym] for ym in common_months]
    ys_b = [anom_b[ym] for ym in common_months]

    summary_a = _summarize_location(location_a, fetched_a, common_months, ys_a, xs_years)
    summary_b = _summarize_location(location_b, fetched_b, common_months, ys_b, xs_years)

    r_global = _pearson_r(ys_a, ys_b)
    r_detrended = _pearson_r(
        summary_a.pop("residuals_detrended"),
        summary_b.pop("residuals_detrended"),
    )

    return {
        "status": "OK",
        "period": {
            "start": common_months[0],
            "end": common_months[-1],
            "n_common_months": len(common_months),
        },
        "location_a": summary_a,
        "location_b": summary_b,
        "comparison": {
            "long_term_secular_r": round(r_global, 4),
            "short_term_detrended_r": round(r_detrended, 4),
            "sample_last_3_months": [
                {
                    "month": ym,
                    "a_raw": fetched_a["series"][ym],
                    "a_anomaly": round(anom_a[ym], 4),
                    "b_raw": fetched_b["series"][ym],
                    "b_anomaly": round(anom_b[ym], 4),
                }
                for ym in common_months[-3:]
            ],
        },
    }


def main() -> None:
    print("=== Teste das 5 APIs do Earth System Trend Detective ===\n")

    api_tests = {
        "1_nasa_power": fetch_nasa_power_single_variable(
            "T2M",
            [{"lat": -3.12, "lon": -60.02}],
            2020,
            2023,
        ),
        "2_open_meteo_flood": fetch_open_meteo_flood_single_variable(
            "river_discharge",
            [{"lat": -3.13, "lon": -60.02}],
            2020,
            2023,
        ),
        "3_noaa_cdo": test_noaa_cdo(),
        "4_nasa_appeears": test_nasa_appeears(),
        "5_giovanni_hydrology": test_giovanni_hydrology(),
    }

    for key, result in api_tests.items():
        compact = {k: v for k, v in result.items() if k != "series"}
        print(
            f"[{key}] API_PUXADA={compact.get('api_puxada')} | "
            f"status={compact.get('status')} | requires_registration={compact.get('requires_registration')}"
        )
        print(json.dumps(compact, ensure_ascii=False, indent=2))
        print()

    print("=== Fluxo Protótipo: Local A (1 variável) vs. Local B (1 variável) ===\n")
    location_a = {
        "name": "Amazônia Central (Manaus)",
        "source": "nasa_power",
        "variable": "PRECTOTCORR",
        "cells": [{"lat": -3.12, "lon": -60.02}],
    }
    location_b = {
        "name": "Semiárido (Petrolina)",
        "source": "nasa_power",
        "variable": "T2M",
        "cells": [{"lat": -9.39, "lon": -40.50}],
    }
    comparison_power_vs_power = compare_location_a_and_b(
        location_a,
        location_b,
        start_year=2001,
        end_year=2023,
        comparison_label="POWER vs POWER",
    )

    # Também valida comparação cross-API: Local A (NASA POWER) vs Local B (Open-Meteo GloFAS)
    location_b_river = {
        "name": "Rio Negro / Amazonas (Manaus)",
        "source": "open_meteo_flood",
        "variable": "river_discharge",
        "cells": [{"lat": -3.13, "lon": -60.02}],
    }
    comparison_cross_api = compare_location_a_and_b(
        location_a,
        location_b_river,
        start_year=2001,
        end_year=2023,
        comparison_label="POWER vs GloFAS",
    )

    output = {
        "api_smoke_tests": {
            key: {k: v for k, v in val.items() if k != "series"}
            for key, val in api_tests.items()
        },
        "prototype_comparison_power_vs_power": comparison_power_vs_power,
        "prototype_comparison_power_vs_glofas": comparison_cross_api,
    }
    OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Resultado salvo em: {OUTPUT_PATH}")
    print("\nResumo comparação POWER vs POWER:")
    print(json.dumps(comparison_power_vs_power, ensure_ascii=False, indent=2))
    print("\nResumo comparação POWER vs GloFAS:")
    print(json.dumps(comparison_cross_api, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
