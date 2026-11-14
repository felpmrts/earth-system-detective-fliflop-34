"""Conector para a Open-Meteo Flood API (Modelo GloFAS — Vazão de Rios)."""

from __future__ import annotations

import datetime as _dt
import json
import os
import statistics
import urllib.parse
from collections import defaultdict
from typing import Any

from data.cache.store import CellCacheStore
from data.catalog.environmental_catalog import get_variable_spec
from data.models.contracts import CellCoord

from .base import http_request, log_api_pull, synthesize_monthly_series

API_NAME = "Open-Meteo Flood API (GloFAS)"


def _aggregate_daily_to_monthly(dates: list[str], values: list[Any]) -> dict[str, float]:
    buckets: dict[str, list[float]] = defaultdict(list)
    for date_str, raw_val in zip(dates, values):
        if raw_val is None:
            continue
        buckets[date_str[:7]].append(float(raw_val))
    return {
        ym: round(statistics.fmean(vals), 4)
        for ym, vals in sorted(buckets.items())
        if vals
    }


def fetch_multi_variables_batch(
    variables: list[str],
    cells: list[CellCoord],
    start_year: int,
    end_year: int,
    *,
    cache: CellCacheStore | None = None,
    label: str = "Open-Meteo GloFAS",
) -> dict[str, dict[str, Any]]:
    """Busca 1 ou N variáveis hidrológicas do GloFAS com agregação mensal e cache."""
    if not variables:
        raise ValueError("Informe ao menos 1 variável hidrológica.")

    cache_store = cache or CellCacheStore()
    base_url = os.environ.get(
        "OPEN_METEO_FLOOD_BASE_URL",
        "https://flood-api.open-meteo.com/v1/flood",
    ).rstrip("/")
    effective_start_year = max(start_year, 1984)
    today_iso = _dt.datetime.now(_dt.timezone.utc).date().isoformat()
    api_end_date = min(today_iso, f"{end_year:04d}-12-31")

    per_var_buckets: dict[str, dict[str, list[float]]] = {
        var: defaultdict(list) for var in variables
    }
    cache_hits = 0
    http_calls = 0
    total_elapsed = 0.0
    used_fallback = False
    used_live_api = False
    requested_cells = [cell.to_dict() for cell in cells]

    for cell in cells:
        missing_vars: list[str] = []
        for var in variables:
            cached = cache_store.get("open_meteo_flood", var, cell.lat, cell.lon, effective_start_year, end_year)
            if cached is not None and cached.get("series"):
                cache_hits += 1
                for ym, val in cached["series"].items():
                    per_var_buckets[var][ym].append(val)
            else:
                missing_vars.append(var)

        if not missing_vars:
            continue

        payload_daily: dict[str, Any] = {}
        dates: list[str] = []
        if f"{effective_start_year:04d}-01-01" <= api_end_date:
            http_calls += 1
            log_api_pull(label, API_NAME, base_url, ",".join(missing_vars))
            params = urllib.parse.urlencode({
                "latitude": cell.lat,
                "longitude": cell.lon,
                "daily": ",".join(missing_vars),
                "start_date": f"{effective_start_year:04d}-01-01",
                "end_date": api_end_date,
            })
            resp = http_request(f"{base_url}?{params}", timeout=15)
            total_elapsed += resp["elapsed_s"]
            if resp["ok"] and resp["body"]:
                try:
                    payload = json.loads(resp["body"])
                    payload_daily = payload.get("daily", {})
                    dates = payload_daily.get("time", []) or []
                except json.JSONDecodeError:
                    payload_daily = {}
                    dates = []

        for var in missing_vars:
            cell_series = _aggregate_daily_to_monthly(dates, payload_daily.get(var, [])) if dates else {}
            if len(cell_series) >= 12 or (end_year == effective_start_year and cell_series):
                used_live_api = True
                origin = "open_meteo_flood_live"
            else:
                cell_series = synthesize_monthly_series(var, cell.lat, cell.lon, effective_start_year, end_year)
                used_fallback = True
                origin = "glofas_calibrated_fallback"

            if cell_series:
                cache_store.set(
                    "open_meteo_flood",
                    var,
                    cell.lat,
                    cell.lon,
                    effective_start_year,
                    end_year,
                    {"series": cell_series, "origin": origin},
                )
                for ym, val in cell_series.items():
                    per_var_buckets[var][ym].append(val)

    data_origin = "cache_hit"
    if used_live_api and not used_fallback:
        data_origin = "open_meteo_flood_live"
    elif used_fallback:
        data_origin = "glofas_calibrated_fallback"

    results: dict[str, dict[str, Any]] = {}
    for var in variables:
        spec = get_variable_spec(var)
        series = {
            ym: round(statistics.fmean(vals), 4)
            for ym, vals in sorted(per_var_buckets[var].items())
            if vals
        }
        results[var] = {
            "api_puxada": API_NAME,
            "endpoint_consultado": base_url,
            "status": "OK" if series else "SEM_DADOS",
            "data_origin": data_origin,
            "variable": var,
            "unit": spec.unit,
            "raw_api_unit": spec.raw_unit,
            "snapped_cells": requested_cells,
            "months_count": len(series),
            "cache_hits": cache_hits,
            "http_calls": http_calls,
            "elapsed_s": round(total_elapsed, 3),
            "series": series,
        }
    return results


def fetch_single_variable(
    variable: str,
    cells: list[CellCoord],
    start_year: int,
    end_year: int,
    *,
    cache: CellCacheStore | None = None,
    label: str = "Open-Meteo GloFAS",
) -> dict[str, Any]:
    """Busca 1 única variável hidrológica reutilizando o fluxo em lote."""
    return fetch_multi_variables_batch(
        [variable],
        cells,
        start_year,
        end_year,
        cache=cache,
        label=label,
    )[variable]
