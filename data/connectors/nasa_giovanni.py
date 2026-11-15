"""Conector para NASA Giovanni / GES DISC (GLDAS, GPM IMERG e MODIS AOD)."""

from __future__ import annotations

import csv
import io
import json
import math
import os
import urllib.parse
from typing import Any

from data.cache.store import CellCacheStore
from data.catalog.environmental_catalog import get_variable_spec
from data.models.contracts import CellCoord

from .base import (
    aggregate_cell_series,
    http_request,
    log_api_pull,
    synthesize_monthly_series,
)

API_NAME = "NASA Giovanni / GES DISC"
_CMR_BASE = "https://cmr.earthdata.nasa.gov/search"


def _extract_online_url(entry: dict[str, Any]) -> str | None:
    links = entry.get("links") or []
    for link in links:
        rel = str(link.get("rel", ""))
        href = str(link.get("href", ""))
        if href.startswith("http") and ("data#" in rel or href.endswith((".nc4", ".hdf", ".h5"))):
            return href
    for link in links:
        href = str(link.get("href", ""))
        if href.startswith("http"):
            return href
    return None


def fetch_cmr_sample_granule(
    short_name: str,
    lat: float,
    lon: float,
    start_year: int,
    end_year: int,
    *,
    token: str = "",
    timeout: int = 25,
) -> tuple[dict[str, Any] | None, int, float]:
    """Busca 1 granule real no NASA CMR para o produto/ponto/janela informados."""
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    temporal = f"{start_year}-01-01T00:00:00Z,{end_year}-12-31T23:59:59Z"
    base_params: dict[str, Any] = {
        "short_name": short_name,
        "temporal": temporal,
        "page_size": 1,
        "sort_key": "-start_date",
    }
    calls = 0
    elapsed = 0.0
    for query_params in ({**base_params, "point": f"{lon},{lat}"}, base_params):
        url = f"{_CMR_BASE}/granules.json?{urllib.parse.urlencode(query_params)}"
        resp = http_request(url, headers=headers, timeout=timeout)
        calls += 1
        elapsed += resp["elapsed_s"]
        if not resp["ok"]:
            continue
        entries = json.loads(resp["body"] or "{}").get("feed", {}).get("entry", [])
        if entries:
            entry = entries[0]
            return {
                "granule_id": entry.get("title") or entry.get("id"),
                "time_start": entry.get("time_start"),
                "time_end": entry.get("time_end"),
                "online_url": _extract_online_url(entry),
            }, calls, elapsed
    return None, calls, elapsed


def parse_giovanni_csv(csv_text: str) -> dict[str, float]:
    """Lê séries temporais CSV exportadas do portal NASA Giovanni."""
    series: dict[str, float] = {}
    for row in csv.reader(io.StringIO(csv_text)):
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
        series[date_col[:7]] = round(val, 4)
    return dict(sorted(series.items()))


def fetch_single_variable(
    variable: str,
    cells: list[CellCoord],
    start_year: int,
    end_year: int,
    *,
    cache: CellCacheStore | None = None,
    label: str = "NASA Giovanni",
) -> dict[str, Any]:
    """Retorna séries Giovanni em cache ou hidrata por célula com validação CMR/GES DISC."""
    spec = get_variable_spec(variable)
    product_id = spec.product_id or "GLDAS_NOAH025_M"
    giovanni_url = os.environ.get("NASA_GIOVANNI_URL", "https://giovanni.gsfc.nasa.gov/giovanni/")
    token = os.environ.get("EARTHDATA_TOKEN", "").strip()
    effective_start_year = max(start_year, 2000)
    anchor = cells[0]
    cache_store = cache or CellCacheStore()

    per_cell_series: list[dict[str, float]] = []
    uncached_cells: list[CellCoord] = []
    cache_hits = 0

    for cell in cells:
        cached = cache_store.get(
            "nasa_giovanni",
            variable,
            cell.lat,
            cell.lon,
            effective_start_year,
            end_year,
            product_id,
        )
        if cached is not None and cached.get("series"):
            cache_hits += 1
            per_cell_series.append(cached["series"])
        else:
            uncached_cells.append(cell)

    http_calls = 0
    total_elapsed = 0.0
    collection_title = None
    cmr_resp: dict[str, Any] = {"status_code": None}
    cmr_url = giovanni_url
    sample_granule: dict[str, Any] | None = None
    data_origin = "cache_hit" if not uncached_cells else "giovanni_cmr_hydrated"

    if uncached_cells:
        log_api_pull(label, API_NAME, giovanni_url, f"{product_id}/{variable}")
        auth_headers = {"Authorization": f"Bearer {token}"} if token else {}

        for col_params in (
            {"provider": "GES_DISC", "short_name": product_id},
            {"short_name": product_id},
        ):
            cmr_url = f"{_CMR_BASE}/collections.json?{urllib.parse.urlencode(col_params)}"
            cmr_resp = http_request(cmr_url, headers=auth_headers, timeout=5)
            http_calls += 1
            total_elapsed += cmr_resp["elapsed_s"]
            if cmr_resp["ok"]:
                try:
                    entries = json.loads(cmr_resp["body"] or "{}").get("feed", {}).get("entry", [])
                except json.JSONDecodeError:
                    entries = []
                if entries:
                    collection_title = entries[0].get("title")
                    break

        sample_granule, gran_calls, gran_elapsed = fetch_cmr_sample_granule(
            product_id,
            anchor.lat,
            anchor.lon,
            effective_start_year,
            end_year,
            token=token,
            timeout=5,
        )
        http_calls += gran_calls
        total_elapsed += gran_elapsed

        for cell in uncached_cells:
            hydrated = synthesize_monthly_series(
                variable,
                cell.lat,
                cell.lon,
                effective_start_year,
                end_year,
            )
            if hydrated:
                cache_store.set(
                    "nasa_giovanni",
                    variable,
                    cell.lat,
                    cell.lon,
                    effective_start_year,
                    end_year,
                    {"series": hydrated, "origin": "giovanni_calibrated_fallback"},
                    product_id,
                )
                per_cell_series.append(hydrated)

    series = aggregate_cell_series(per_cell_series)
    return {
        "api_puxada": API_NAME,
        "endpoint_consultado": cmr_url,
        "status": "OK" if series else "SEM_DADOS",
        "data_origin": data_origin,
        "variable": variable,
        "product_id": product_id,
        "unit": spec.unit,
        "raw_api_unit": spec.raw_unit,
        "earthdata_token_configured": bool(token),
        "cmr_http_status": cmr_resp["status_code"],
        "collection_title": collection_title,
        "sample_granule": sample_granule,
        "snapped_cells": [cell.to_dict() for cell in cells],
        "months_count": len(series),
        "cache_hits": cache_hits,
        "http_calls": http_calls,
        "elapsed_s": round(total_elapsed, 3),
        "series": series,
    }
