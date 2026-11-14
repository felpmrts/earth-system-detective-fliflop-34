"""Conector para a NASA AppEEARS API (MODIS: NDVI, EVI, LAI e LST Day/Night)."""

from __future__ import annotations

import base64
import json
import os
from typing import Any

from data.cache.store import CellCacheStore
from data.catalog.environmental_catalog import get_variable_spec
from data.models.contracts import CellCoord

from .base import http_request, log_api_pull

API_NAME = "NASA AppEEARS API (MODIS)"


def _normalize_appeears_value(variable: str, value: float, raw_unit: str) -> float:
    """Converte Kelvin -> Celsius para LST MODIS quando necessário."""
    if variable in {"LST_Day_CMG", "LST_Night_CMG"} and (raw_unit == "K" or value > 150.0):
        return round(value - 273.15, 4)
    return round(value, 4)


def fetch_single_variable(
    variable: str,
    cells: list[CellCoord],
    start_year: int,
    end_year: int,
    *,
    cache: CellCacheStore | None = None,
    label: str = "NASA AppEEARS",
) -> dict[str, Any]:
    """Lê série pré-cacheadas MODIS ou valida autenticação e metadados na API AppEEARS."""
    spec = get_variable_spec(variable)
    product_id = spec.product_id or "MOD13A3.061"
    base_url = os.environ.get(
        "NASA_APPEEARS_BASE_URL",
        "https://appeears.earthdatacloud.nasa.gov/api",
    ).rstrip("/")
    anchor = cells[0]
    cache_store = cache or CellCacheStore()

    cached = cache_store.get("nasa_appeears", variable, anchor.lat, anchor.lon, start_year, end_year, product_id)
    if cached is not None and cached.get("series"):
        converted = {
            ym: _normalize_appeears_value(variable, float(val), spec.raw_unit)
            for ym, val in sorted(cached["series"].items())
        }
        return {
            "api_puxada": API_NAME,
            "endpoint_consultado": base_url,
            "status": "OK",
            "variable": variable,
            "product_id": product_id,
            "unit": spec.unit,
            "raw_api_unit": spec.raw_unit,
            "snapped_cells": [anchor.to_dict()],
            "months_count": len(converted),
            "cache_hits": 1,
            "http_calls": 0,
            "elapsed_s": 0.0,
            "series": converted,
        }

    log_api_pull(label, API_NAME, base_url, f"{product_id}/{variable}")
    catalog_resp = http_request(f"{base_url}/product/{product_id}", timeout=25)
    total_elapsed = catalog_resp["elapsed_s"]
    layer_meta = {}
    if catalog_resp["ok"]:
        layer_meta = json.loads(catalog_resp["body"] or "{}").get(variable, {})

    username = os.environ.get("EARTHDATA_USERNAME", "").strip()
    password = os.environ.get("EARTHDATA_PASSWORD", "").strip()
    auth_status = "SEM_CREDENCIAIS"
    if username and password:
        creds = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
        login_resp = http_request(
            f"{base_url}/login",
            method="POST",
            headers={"Authorization": f"Basic {creds}"},
            timeout=25,
        )
        total_elapsed += login_resp["elapsed_s"]
        auth_status = "OK_AUTENTICADO" if login_resp["ok"] else f"ERRO_LOGIN ({login_resp['error']})"

    return {
        "api_puxada": API_NAME,
        "endpoint_consultado": f"{base_url}/product/{product_id}",
        "status": "REQUER_TASK_ASSINCRONA_OU_CACHE",
        "variable": variable,
        "product_id": product_id,
        "unit": spec.unit,
        "raw_api_unit": spec.raw_unit,
        "auth_status": auth_status,
        "layer_metadata": {
            "Description": layer_meta.get("Description"),
            "ScaleFactor": layer_meta.get("ScaleFactor"),
            "FillValue": layer_meta.get("FillValue"),
            "Units": layer_meta.get("Units"),
            "Available": layer_meta.get("Available"),
        },
        "snapped_cells": [anchor.to_dict()],
        "months_count": 0,
        "cache_hits": 0,
        "http_calls": 2 if (username and password) else 1,
        "elapsed_s": round(total_elapsed, 3),
        "series": {},
        "note": "AppEEARS processa extrações em fila assíncrona (/task). Para tempo real na demo, popular cache local.",
    }
