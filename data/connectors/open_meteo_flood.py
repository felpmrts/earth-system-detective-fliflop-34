"""Conector para a Open-Meteo Flood API (Modelo GloFAS — Vazão de Rios)."""

from __future__ import annotations

import json
import os
import statistics
import urllib.parse
from collections import defaultdict
from typing import Any

from data.cache.store import CellCacheStore
from data.catalog.environmental_catalog import get_variable_spec
from data.models.contracts import CellCoord

from .base import http_request, log_api_pull

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

    per_var_buckets: dict[str, dict[str, list[float]]] = {
        var: defaultdict(list) for var in variables
    }
    cache_hits = 0
    http_calls = 0
    total_elapsed = 0.0
    requested_cells = [cell.to_dict() for cell in cells]

    for cell in cells:
        missing_vars: list[str] = []
        for var in variables:
            cached = cache_store.get("open_meteo_flood", var, cell.lat, cell.lon, start_year, end_year)
            if cached is not None:
                cache_hits += 1
                for ym, val in cached.get("series", {}).items():
                    per_var_buckets[var][ym].append(val)
            else:
                missing_vars.append(var)

        if not missing_vars:
            continue

        http_calls += 1
        log_api_pull(label, API_NAME, base_url, ",".join(missing_vars))
        params = urllib.parse.urlencode({
            "latitude": cell.lat,
            "longitude": cell.lon,
            "daily": ",".join(missing_vars),
            "start_date": f"{start_year}-01-01",
            "end_date": f"{end_year}-12-31",
        })
        resp = http_request(f"{base_url}?{params}", timeout=30)
        total_elapsed += resp["elapsed_s"]
        if not resp["ok"]:
            return {
                var: {
                    "api_puxada": API_NAME,
                    "endpoint_consultado": base_url,
                    "status": "ERRO",
                    "error": resp["error"],
                    "variable": var,
                    "cache_hits": cache_hits,
                }
                for var in variables
            }

        payload = json.loads(resp["body"])
        daily = payload.get("daily", {})
        dates = daily.get("time", [])

        for var in missing_vars:
            cell_series = _aggregate_daily_to_monthly(dates, daily.get(var, []))
            cache_store.set(
                "open_meteo_flood",
                var,
                cell.lat,
                cell.lon,
                start_year,
                end_year,
                {"series": cell_series},
            )
            for ym, val in cell_series.items():
                per_var_buckets[var][ym].append(val)

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
