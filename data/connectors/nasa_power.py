"""Conector para a NASA POWER API v2 (MERRA-2 / GPM / CERES)."""

from __future__ import annotations

import calendar
import json
import os
import statistics
import time
import urllib.parse
from collections import defaultdict
from typing import Any

from data.cache.store import CellCacheStore
from data.catalog.environmental_catalog import get_variable_spec
from data.models.contracts import CellCoord

from .base import clean_fill_value, http_request, log_api_pull, snap_ceres, snap_merra2

API_NAME = "NASA POWER API v2"


def _resolve_snap_fn(variables: list[str]):
    grid_types = {get_variable_spec(code).grid_type for code in variables}
    return snap_ceres if grid_types == {"ceres"} else snap_merra2


def _parse_power_parameter_series(
    variable: str,
    raw_series: dict[str, Any],
    reported_unit: str,
) -> dict[str, float]:
    """Limpa sentinela -999, descarta YYYY13 e converte PRECTOTCORR (mm/day -> mm/mês)."""
    cleaned: dict[str, float] = {}
    for yyyymm, raw_val in raw_series.items():
        if len(yyyymm) != 6 or yyyymm.endswith("13"):
            continue
        year = int(yyyymm[:4])
        month = int(yyyymm[4:6])
        if not (1 <= month <= 12):
            continue
        val = clean_fill_value(raw_val)
        if val is None:
            continue
        if variable == "PRECTOTCORR" and reported_unit == "mm/day":
            val *= calendar.monthrange(year, month)[1]
        elif (
            variable in {"ALLSKY_SFC_SW_DWN", "CLRSKY_SFC_SW_DWN", "ALLSKY_SFC_LW_DWN"}
            and reported_unit == "W/m^2"
        ):
            val *= 0.0864
        cleaned[f"{year:04d}-{month:02d}"] = round(val, 4)
    return cleaned


def fetch_multi_variables_batch(
    variables: list[str],
    cells: list[CellCoord],
    start_year: int,
    end_year: int,
    *,
    cache: CellCacheStore | None = None,
    community: str = "AG",
    label: str = "NASA POWER",
) -> dict[str, dict[str, Any]]:
    """Busca 1 ou até 20 variáveis da NASA POWER em lote por célula (/point) com cache."""
    if not variables:
        raise ValueError("Informe ao menos 1 variável para a NASA POWER.")
    if len(variables) > 20:
        raise ValueError("O endpoint /point da NASA POWER aceita no máximo 20 variáveis por chamada.")

    cache_store = cache or CellCacheStore()
    base_url = os.environ.get(
        "NASA_POWER_BASE_URL",
        "https://power.larc.nasa.gov/api/temporal/monthly/point",
    ).rstrip("/")
    snap_fn = _resolve_snap_fn(variables)

    snapped_cells: list[dict[str, float]] = []
    seen_coords: set[tuple[float, float]] = set()
    for cell in cells:
        slat, slon = snap_fn(cell.lat, cell.lon)
        if (slat, slon) not in seen_coords:
            seen_coords.add((slat, slon))
            snapped_cells.append({"lat": slat, "lon": slon})

    per_var_buckets: dict[str, dict[str, list[float]]] = {
        var: defaultdict(list) for var in variables
    }
    per_var_units: dict[str, str] = {}
    cache_hits = 0
    http_calls = 0
    total_elapsed = 0.0

    for cell in snapped_cells:
        slat, slon = cell["lat"], cell["lon"]
        missing_vars: list[str] = []
        for var in variables:
            cached = cache_store.get("nasa_power", var, slat, slon, start_year, end_year, community)
            if cached is not None:
                cache_hits += 1
                per_var_units[var] = cached.get("raw_api_unit", "")
                for ym, val in cached.get("series", {}).items():
                    per_var_buckets[var][ym].append(val)
            else:
                missing_vars.append(var)

        if not missing_vars:
            continue

        if http_calls > 0:
            time.sleep(0.35)  # respeita limite de 30 req/min
        http_calls += 1
        log_api_pull(label, API_NAME, base_url, ",".join(missing_vars))

        params = urllib.parse.urlencode({
            "parameters": ",".join(missing_vars),
            "community": community,
            "longitude": slon,
            "latitude": slat,
            "start": start_year,
            "end": end_year,
            "format": "JSON",
        })
        url = f"{base_url}?{params}"
        resp = http_request(url, timeout=30)
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
        params_meta = payload.get("parameters", {})
        params_data = payload.get("properties", {}).get("parameter", {})

        for var in missing_vars:
            raw_unit = params_meta.get(var, {}).get("units", "")
            per_var_units[var] = raw_unit
            cell_series = _parse_power_parameter_series(var, params_data.get(var, {}), raw_unit)
            cache_store.set(
                "nasa_power",
                var,
                slat,
                slon,
                start_year,
                end_year,
                {"raw_api_unit": raw_unit, "series": cell_series},
                community,
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
        status = "OK" if series else (
            "OCEANO_SEM_DADOS_TERRESTRES"
            if var in {"GWETTOP", "GWETROOT", "GWETPROF"}
            else "SEM_DADOS"
        )
        results[var] = {
            "api_puxada": API_NAME,
            "endpoint_consultado": base_url,
            "status": status,
            "variable": var,
            "unit": spec.unit,
            "raw_api_unit": per_var_units.get(var, spec.raw_unit),
            "snapped_cells": snapped_cells,
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
    label: str = "NASA POWER",
) -> dict[str, Any]:
    """Busca 1 única variável da NASA POWER reutilizando o motor em lote."""
    return fetch_multi_variables_batch(
        [variable],
        cells,
        start_year,
        end_year,
        cache=cache,
        label=label,
    )[variable]
