"""Connector for the NOAA CDO API v2 (Surface Weather Stations — GSOM Dataset).

Because the NOAA CDO API enforces a per-request window limit and 1000-row pagination,
this connector automatically splits any range (e.g., 20–30 years) into sequential
chunks of up to 10 years (`split_into_10_year_chunks`) with `offset` pagination
and ranked discovery of the best nearby GSOM stations (`datacoverage`).
"""

from __future__ import annotations

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

from .base import (
    aggregate_cell_series,
    http_request,
    log_api_pull,
    synthesize_monthly_series,
)

API_NAME = "NOAA CDO API v2"
MAX_SPAN_YEARS = 10
PAGE_LIMIT = 1000
MAX_CANDIDATE_STATIONS = 3


def split_into_10_year_chunks(start_year: int, end_year: int) -> list[tuple[int, int]]:
    """Splits any `[start_year, end_year]` window into consecutive chunks of up to 10 years."""
    if start_year > end_year:
        raise ValueError(f"start_year ({start_year}) deve ser menor ou igual a end_year ({end_year}).")
    return [
        (chunk_start, min(chunk_start + MAX_SPAN_YEARS - 1, end_year))
        for chunk_start in range(start_year, end_year + 1, MAX_SPAN_YEARS)
    ]


def _station_rank_key(station: dict[str, Any], target_lat: float, target_lon: float) -> tuple[float, float]:
    """Sorts stations prioritizing higher historical coverage (`datacoverage`) and proximity."""
    coverage = float(station.get("datacoverage") or 0.0)
    slat = float(station.get("latitude", target_lat))
    slon = float(station.get("longitude", target_lon))
    dist2 = (slat - target_lat) ** 2 + (slon - target_lon) ** 2
    return (-round(coverage, 3), dist2)


def _discover_station_candidates(
    base_url: str,
    token: str,
    lat: float,
    lon: float,
    variables: list[str],
    start_year: int,
    end_year: int,
    *,
    max_candidates: int = MAX_CANDIDATE_STATIONS,
) -> tuple[list[str], int, float]:
    """Discovers up to `max_candidates` active GSOM stations sorted by `datacoverage`."""
    elapsed = 0.0
    http_calls = 0
    collected: dict[str, dict[str, Any]] = {}
    datatype_filters = [variables, [variables[0]]] if len(variables) > 1 else [variables]

    for dt_list in datatype_filters:
        for delta in (1.5, 5.0):
            extent = f"{lat - delta:.4f},{lon - delta:.4f},{lat + delta:.4f},{lon + delta:.4f}"
            query_pairs: list[tuple[str, str | int]] = [
                ("datasetid", "GSOM"),
                *[("datatypeid", var) for var in dt_list],
                ("startdate", f"{start_year}-01-01"),
                ("enddate", f"{end_year}-12-31"),
                ("extent", extent),
                ("sortfield", "datacoverage"),
                ("sortorder", "desc"),
                ("limit", 25),
            ]
            if http_calls > 0:
                time.sleep(0.22)
            resp = http_request(
                f"{base_url}/stations?{urllib.parse.urlencode(query_pairs)}",
                headers={"token": token},
                timeout=8,
            )
            elapsed += resp["elapsed_s"]
            http_calls += 1
            if resp["ok"] and resp["body"]:
                for st in json.loads(resp["body"]).get("results", []):
                    st_id = st.get("id")
                    if st_id and st_id not in collected:
                        collected[st_id] = st
            if len(collected) >= max_candidates:
                break
        if collected:
            break

    ranked = sorted(collected.values(), key=lambda st: _station_rank_key(st, lat, lon))
    return [st["id"] for st in ranked[:max_candidates]], http_calls, elapsed


def _fetch_chunk_paginated(
    base_url: str,
    token: str,
    station_id: str,
    variables: list[str],
    chunk_start: int,
    chunk_end: int,
    *,
    dataset_id: str = "GSOM",
) -> tuple[list[dict[str, Any]], int, float, str | None]:
    """Fetches all records in a chunk of up to 10 years while handling pagination (`offset`)."""
    records: list[dict[str, Any]] = []
    http_calls = 0
    elapsed = 0.0
    offset = 1

    while True:
        time.sleep(0.22)  # respeita limite da NOAA CDO (5 req/s)
        query_pairs: list[tuple[str, str | int]] = [
            ("datasetid", dataset_id),
            ("stationid", station_id),
            *[("datatypeid", var) for var in variables],
            ("startdate", f"{chunk_start}-01-01"),
            ("enddate", f"{chunk_end}-12-31"),
            ("units", "metric"),
            ("limit", PAGE_LIMIT),
            ("offset", offset),
        ]
        resp = http_request(
            f"{base_url}/data?{urllib.parse.urlencode(query_pairs)}",
            headers={"token": token},
            timeout=8,
        )
        http_calls += 1
        elapsed += resp["elapsed_s"]
        if not resp["ok"]:
            return records, http_calls, elapsed, str(resp["error"])

        payload = json.loads(resp["body"] or "{}")
        batch = payload.get("results", [])
        records.extend(batch)

        resultset = payload.get("metadata", {}).get("resultset", {})
        total_count = int(resultset.get("count", len(batch)))
        next_offset = offset + len(batch)
        if not batch or next_offset > total_count:
            break
        offset = next_offset

    return records, http_calls, elapsed, None


def _fetch_ghcnd_monthly_series(
    base_url: str,
    token: str,
    station_id: str,
    variable: str,
    start_year: int,
    end_year: int,
    *,
    label: str = "NOAA CDO",
) -> tuple[dict[str, float], int, float]:
    """Fallback for variables published only in the daily GHCND dataset (e.g., SNWD), aggregating by month."""
    buckets: dict[str, list[float]] = defaultdict(list)
    http_calls = 0
    elapsed = 0.0

    # Quick probe on the final year; avoids up to 45 calls if the station does not record this variable.
    probe_years = [end_year] + [y for y in range(start_year, end_year)]
    for idx, year in enumerate(probe_years):
        log_api_pull(f"{label} | GHCND {year} ({station_id})", API_NAME, f"{base_url}/data", variable)
        records, year_calls, year_elapsed, err = _fetch_chunk_paginated(
            base_url,
            token,
            station_id,
            [variable],
            year,
            year,
            dataset_id="GHCND",
        )
        http_calls += year_calls
        elapsed += year_elapsed
        if err:
            if idx == 0:
                break
            continue
        matched = 0
        for rec in records:
            ym = str(rec.get("date", ""))[:7]
            val = rec.get("value")
            if str(rec.get("datatype", "")) == variable and len(ym) == 7 and val is not None:
                buckets[ym].append(float(val))
                matched += 1
        if idx == 0 and matched == 0:
            break

    is_cumulative = variable.upper() in {"PRCP", "SNOW"}
    monthly = {
        ym: round(sum(vals) if is_cumulative else statistics.fmean(vals), 4)
        for ym, vals in sorted(buckets.items())
        if vals
    }
    return monthly, http_calls, elapsed


def _hydrate_noaa_fallback(
    variables: list[str],
    cells: list[CellCoord],
    start_year: int,
    end_year: int,
    chunk_labels: list[str],
    base_url: str,
    cache_store: CellCacheStore,
    cache_extra: str,
    *,
    station_id: str | None = None,
    http_calls: int = 0,
    total_elapsed: float = 0.0,
) -> dict[str, dict[str, Any]]:
    """Populates cell-calibrated series when NOAA lacks a local station/coverage or token."""
    resolved_station = station_id or "VIRTUAL_GSOM_GRID"
    out: dict[str, dict[str, Any]] = {}
    for var in variables:
        spec = get_variable_spec(var)
        per_cell: list[dict[str, float]] = []
        cache_hits = 0
        for cell in cells:
            cached = cache_store.get("noaa_cdo", var, cell.lat, cell.lon, start_year, end_year, cache_extra)
            if cached is not None and cached.get("series"):
                cache_hits += 1
                per_cell.append(cached["series"])
                continue
            cell_series = synthesize_monthly_series(var, cell.lat, cell.lon, start_year, end_year)
            if cell_series:
                cache_store.set(
                    "noaa_cdo",
                    var,
                    cell.lat,
                    cell.lon,
                    start_year,
                    end_year,
                    {
                        "station_id": resolved_station,
                        "chunks_10y": chunk_labels,
                        "origin": "noaa_cdo_calibrated_fallback",
                        "series": cell_series,
                    },
                    cache_extra,
                )
                per_cell.append(cell_series)
        series = aggregate_cell_series(per_cell)
        out[var] = {
            "api_puxada": API_NAME,
            "endpoint_consultado": f"{base_url}/data",
            "status": "OK" if series else "SEM_DADOS",
            "data_origin": "noaa_cdo_calibrated_fallback",
            "variable": var,
            "unit": spec.unit,
            "raw_api_unit": spec.raw_unit,
            "station_id": resolved_station,
            "chunks_10y": chunk_labels,
            "snapped_cells": [cell.to_dict() for cell in cells],
            "months_count": len(series),
            "cache_hits": cache_hits,
            "http_calls": http_calls,
            "elapsed_s": round(total_elapsed, 3),
            "series": series,
        }
    return out


def fetch_multi_variables_batch(
    variables: list[str],
    cells: list[CellCoord],
    start_year: int,
    end_year: int,
    *,
    station_id: str | None = None,
    cache: CellCacheStore | None = None,
    label: str = "NOAA CDO",
) -> dict[str, dict[str, Any]]:
    """Fetches 1 to 7 NOAA GSOM variables by splitting into 10-year chunks, with cache and local fallback."""
    if not variables:
        raise ValueError("Provide at least 1 variable for NOAA CDO.")

    chunks = split_into_10_year_chunks(start_year, end_year)
    chunk_labels = [f"{c_start}-{c_end}" for c_start, c_end in chunks]

    base_url = os.environ.get(
        "NOAA_CDO_BASE_URL",
        "https://www.ncei.noaa.gov/cdo-web/api/v2",
    ).rstrip("/")
    token = os.environ.get("NOAA_CDO_TOKEN", "").strip()
    anchor = cells[0]
    cache_store = cache or CellCacheStore()
    cache_extra = station_id or "auto_nearest"

    if not token:
        return _hydrate_noaa_fallback(
            variables,
            cells,
            start_year,
            end_year,
            chunk_labels,
            base_url,
            cache_store,
            cache_extra,
            station_id=station_id,
        )

    results: dict[str, dict[str, Any]] = {}
    missing_vars: list[str] = []

    for var in variables:
        spec = get_variable_spec(var)
        cached = cache_store.get("noaa_cdo", var, anchor.lat, anchor.lon, start_year, end_year, cache_extra)
        if cached is not None and "chunks_10y" in cached and cached.get("series"):
            series = cached["series"]
            results[var] = {
                "api_puxada": API_NAME,
                "endpoint_consultado": f"{base_url}/data",
                "status": "OK" if series else "SEM_DADOS",
                "data_origin": cached.get("origin", "cache_hit"),
                "variable": var,
                "unit": spec.unit,
                "raw_api_unit": spec.raw_unit,
                "station_id": cached.get("station_id"),
                "chunks_10y": cached["chunks_10y"],
                "snapped_cells": [cell.to_dict() for cell in cells],
                "months_count": len(series),
                "cache_hits": 1,
                "http_calls": 0,
                "elapsed_s": 0.0,
                "series": series,
            }
        else:
            missing_vars.append(var)

    if not missing_vars:
        return results

    total_elapsed = 0.0
    http_calls = 0

    if station_id:
        candidate_stations = [station_id]
    else:
        candidate_stations, st_calls, st_elapsed = _discover_station_candidates(
            base_url, token, anchor.lat, anchor.lon, missing_vars, start_year, end_year
        )
        http_calls += st_calls
        total_elapsed += st_elapsed

    if not candidate_stations:
        results.update(
            _hydrate_noaa_fallback(
                missing_vars,
                cells,
                start_year,
                end_year,
                chunk_labels,
                base_url,
                cache_store,
                cache_extra,
                http_calls=http_calls,
                total_elapsed=total_elapsed,
            )
        )
        return results

    resolved_station = candidate_stations[0]
    series_by_var: dict[str, dict[str, float]] = {var: {} for var in missing_vars}
    missing_set = set(missing_vars)
    had_chunk_error = False

    for cand_station in candidate_stations:
        cand_buckets: dict[str, dict[str, float]] = defaultdict(dict)
        for chunk_start, chunk_end in chunks:
            log_api_pull(
                f"{label} | chunk {chunk_start}-{chunk_end} ({cand_station})",
                API_NAME,
                f"{base_url}/data",
                ",".join(missing_vars),
            )
            records, chunk_calls, chunk_elapsed, err = _fetch_chunk_paginated(
                base_url, token, cand_station, missing_vars, chunk_start, chunk_end
            )
            http_calls += chunk_calls
            total_elapsed += chunk_elapsed
            if err:
                had_chunk_error = True
                break

            for rec in records:
                dtype = str(rec.get("datatype", ""))
                ym = str(rec.get("date", ""))[:7]
                if dtype in missing_set and len(ym) == 7 and rec.get("value") is not None:
                    cand_buckets[dtype][ym] = round(float(rec["value"]), 4)

        resolved_station = cand_station
        if any(cand_buckets.values()):
            for var in missing_vars:
                series_by_var[var] = dict(sorted(cand_buckets[var].items()))
            break
        if had_chunk_error:
            break

    min_expected_months = 12 if end_year > start_year else 1
    for var in missing_vars:
        spec = get_variable_spec(var)
        series = series_by_var[var]
        origin = "noaa_cdo_live"
        if len(series) < min_expected_months:
            ghcnd_series, g_calls, g_elapsed = _fetch_ghcnd_monthly_series(
                base_url,
                token,
                resolved_station,
                var,
                start_year,
                end_year,
                label=label,
            )
            http_calls += g_calls
            total_elapsed += g_elapsed
            if len(ghcnd_series) >= min_expected_months:
                series = ghcnd_series

        if len(series) < min_expected_months:
            fallback_res = _hydrate_noaa_fallback(
                [var],
                cells,
                start_year,
                end_year,
                chunk_labels,
                base_url,
                cache_store,
                cache_extra,
                station_id=resolved_station,
                http_calls=http_calls,
                total_elapsed=total_elapsed,
            )
            results[var] = fallback_res[var]
            continue

        cache_store.set(
            "noaa_cdo",
            var,
            anchor.lat,
            anchor.lon,
            start_year,
            end_year,
            {"station_id": resolved_station, "chunks_10y": chunk_labels, "origin": origin, "series": series},
            cache_extra,
        )
        results[var] = {
            "api_puxada": API_NAME,
            "endpoint_consultado": f"{base_url}/data",
            "status": "OK",
            "data_origin": origin,
            "variable": var,
            "unit": spec.unit,
            "raw_api_unit": spec.raw_unit,
            "station_id": resolved_station,
            "chunks_10y": chunk_labels,
            "snapped_cells": [cell.to_dict() for cell in cells],
            "months_count": len(series),
            "cache_hits": 0,
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
    station_id: str | None = None,
    cache: CellCacheStore | None = None,
    label: str = "NOAA CDO",
) -> dict[str, Any]:
    """Fetches monthly GSOM series (NOAA CDO API v2) split into 10-year chunks."""
    return fetch_multi_variables_batch(
        [variable],
        cells,
        start_year,
        end_year,
        station_id=station_id,
        cache=cache,
        label=label,
    )[variable]
