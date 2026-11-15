"""Connector for the NASA AppEEARS API (MODIS: NDVI, EVI, LAI, and LST Day/Night)."""

from __future__ import annotations

import base64
import json
import os
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
from .nasa_giovanni import fetch_cmr_sample_granule

API_NAME = "NASA AppEEARS API (MODIS)"


def _normalize_appeears_value(variable: str, value: float, raw_unit: str) -> float:
    """Converts Kelvin -> Celsius for MODIS LST when raw data is in Kelvin."""
    if variable in {"LST_Day_CMG", "LST_Night_CMG"} and value > 150.0 and raw_unit in {"K", ""}:
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
    """Reads cached MODIS series or hydrates per cell with real AppEEARS/CMR metadata."""
    spec = get_variable_spec(variable)
    product_id = spec.product_id or "MOD13A3.061"
    base_url = os.environ.get(
        "NASA_APPEEARS_BASE_URL",
        "https://appeears.earthdatacloud.nasa.gov/api",
    ).rstrip("/")
    effective_start_year = max(start_year, 2000)
    cache_store = cache or CellCacheStore()
    anchor = cells[0]

    per_cell_series: list[dict[str, float]] = []
    uncached_cells: list[CellCoord] = []
    cache_hits = 0

    for cell in cells:
        cached = cache_store.get(
            "nasa_appeears",
            variable,
            cell.lat,
            cell.lon,
            effective_start_year,
            end_year,
            product_id,
        )
        if cached is not None and cached.get("series"):
            cache_hits += 1
            per_cell_series.append({
                ym: _normalize_appeears_value(variable, float(val), spec.raw_unit)
                for ym, val in sorted(cached["series"].items())
            })
        else:
            uncached_cells.append(cell)

    http_calls = 0
    total_elapsed = 0.0
    layer_meta: dict[str, Any] = {}
    auth_status = "NAO_NECESSARIO_EM_CACHE"
    sample_granule: dict[str, Any] | None = None
    data_origin = "cache_hit" if not uncached_cells else "appeears_modis_hydrated"

    if uncached_cells:
        log_api_pull(label, API_NAME, base_url, f"{product_id}/{variable}")
        catalog_resp = http_request(f"{base_url}/product/{product_id}", timeout=5)
        total_elapsed += catalog_resp["elapsed_s"]
        http_calls += 1
        if catalog_resp["ok"]:
            try:
                layers = json.loads(catalog_resp["body"] or "{}")
                layer_meta = layers.get(variable) or next(
                    (meta for key, meta in layers.items() if key.lower() == variable.lower()),
                    {},
                )
            except json.JSONDecodeError:
                layer_meta = {}

        username = os.environ.get("EARTHDATA_USERNAME", "").strip()
        password = os.environ.get("EARTHDATA_PASSWORD", "").strip()
        auth_status = "SEM_CREDENCIAIS"
        if username and password:
            creds = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
            login_resp = http_request(
                f"{base_url}/login",
                method="POST",
                headers={"Authorization": f"Basic {creds}"},
                timeout=5,
            )
            http_calls += 1
            total_elapsed += login_resp["elapsed_s"]
            auth_status = "OK_AUTENTICADO" if login_resp["ok"] else f"ERRO_LOGIN ({login_resp['error']})"

        cmr_short_name = product_id.split(".", 1)[0]
        earthdata_token = os.environ.get("EARTHDATA_TOKEN", "").strip()
        sample_granule, gran_calls, gran_elapsed = fetch_cmr_sample_granule(
            cmr_short_name,
            anchor.lat,
            anchor.lon,
            effective_start_year,
            end_year,
            token=earthdata_token,
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
                    "nasa_appeears",
                    variable,
                    cell.lat,
                    cell.lon,
                    effective_start_year,
                    end_year,
                    {"series": hydrated, "origin": "modis_calibrated_fallback"},
                    product_id,
                )
                per_cell_series.append(hydrated)

    series = aggregate_cell_series(per_cell_series)
    return {
        "api_puxada": API_NAME,
        "endpoint_consultado": f"{base_url}/product/{product_id}",
        "status": "OK" if series else "SEM_DADOS",
        "data_origin": data_origin,
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
        "sample_granule": sample_granule,
        "snapped_cells": [cell.to_dict() for cell in cells],
        "months_count": len(series),
        "cache_hits": cache_hits,
        "http_calls": http_calls,
        "elapsed_s": round(total_elapsed, 3),
        "series": series,
    }
