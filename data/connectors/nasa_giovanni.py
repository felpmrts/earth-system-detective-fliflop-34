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

from .base import http_request, log_api_pull

API_NAME = "NASA Giovanni / GES DISC"


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
    """Retorna série pré-cacheadas do Giovanni ou valida acesso autenticado no CMR/GES DISC."""
    spec = get_variable_spec(variable)
    product_id = spec.product_id or "GLDAS_NOAH025_M"
    giovanni_url = os.environ.get("NASA_GIOVANNI_URL", "https://giovanni.gsfc.nasa.gov/giovanni/")
    token = os.environ.get("EARTHDATA_TOKEN", "").strip()
    anchor = cells[0]
    cache_store = cache or CellCacheStore()

    cached = cache_store.get("nasa_giovanni", variable, anchor.lat, anchor.lon, start_year, end_year, product_id)
    if cached is not None and cached.get("series"):
        return {
            "api_puxada": API_NAME,
            "endpoint_consultado": giovanni_url,
            "status": "OK",
            "variable": variable,
            "product_id": product_id,
            "unit": spec.unit,
            "raw_api_unit": spec.raw_unit,
            "snapped_cells": [anchor.to_dict()],
            "months_count": len(cached["series"]),
            "cache_hits": 1,
            "http_calls": 0,
            "elapsed_s": 0.0,
            "series": cached["series"],
        }

    log_api_pull(label, API_NAME, giovanni_url, f"{product_id}/{variable}")
    auth_headers = {"Authorization": f"Bearer {token}"} if token else {}
    cmr_url = "https://cmr.earthdata.nasa.gov/search/collections.json?" + urllib.parse.urlencode({
        "provider": "GES_DISC",
        "short_name": product_id,
    })
    cmr_resp = http_request(cmr_url, headers=auth_headers, timeout=25)
    collection_title = None
    if cmr_resp["ok"]:
        entries = json.loads(cmr_resp["body"] or "{}").get("feed", {}).get("entry", [])
        if entries:
            collection_title = entries[0].get("title")

    return {
        "api_puxada": API_NAME,
        "endpoint_consultado": cmr_url,
        "status": "REQUER_CACHE_CSV_GIOVANNI",
        "variable": variable,
        "product_id": product_id,
        "unit": spec.unit,
        "raw_api_unit": spec.raw_unit,
        "earthdata_token_configured": bool(token),
        "cmr_http_status": cmr_resp["status_code"],
        "collection_title": collection_title,
        "snapped_cells": [anchor.to_dict()],
        "months_count": 0,
        "cache_hits": 0,
        "http_calls": 1,
        "elapsed_s": cmr_resp["elapsed_s"],
        "series": {},
        "note": "Giovanni atua como validação/demo com CSVs exportados (endpoint legado Data Rods em transição).",
    }
