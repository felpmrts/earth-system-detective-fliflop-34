"""Conector para a NOAA CDO API v2 (Estações Meteorológicas em Solo — Dataset GSOM).

Como a API NOAA CDO impõe limite de janela por requisição e paginação de 1000 linhas,
este conector fatia automaticamente qualquer intervalo (ex.: 20–30 anos) em blocos
sequenciais de até 10 anos (`split_into_10_year_chunks`) com paginação via `offset`
e descoberta ranqueada das melhores estações GSOM próximas (`datacoverage`).
"""

from __future__ import annotations

import json
import os
import time
import urllib.parse
from collections import defaultdict
from typing import Any

from data.cache.store import CellCacheStore
from data.catalog.environmental_catalog import get_variable_spec
from data.models.contracts import CellCoord

from .base import http_request, log_api_pull

API_NAME = "NOAA CDO API v2"
MAX_SPAN_YEARS = 10
PAGE_LIMIT = 1000
MAX_CANDIDATE_STATIONS = 3


def split_into_10_year_chunks(start_year: int, end_year: int) -> list[tuple[int, int]]:
    """Divide qualquer janela `[start_year, end_year]` em blocos consecutivos de até 10 anos."""
    if start_year > end_year:
        raise ValueError(f"start_year ({start_year}) deve ser menor ou igual a end_year ({end_year}).")
    return [
        (chunk_start, min(chunk_start + MAX_SPAN_YEARS - 1, end_year))
        for chunk_start in range(start_year, end_year + 1, MAX_SPAN_YEARS)
    ]


def _station_rank_key(station: dict[str, Any], target_lat: float, target_lon: float) -> tuple[float, float]:
    """Ordena estações priorizando maior cobertura histórica (`datacoverage`) e proximidade."""
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
    """Descobre até `max_candidates` estações GSOM ativas ordenadas por `datacoverage`."""
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
                timeout=25,
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
) -> tuple[list[dict[str, Any]], int, float, str | None]:
    """Busca todos os registros de um bloco de até 10 anos tratando paginação (`offset`)."""
    records: list[dict[str, Any]] = []
    http_calls = 0
    elapsed = 0.0
    offset = 1

    while True:
        time.sleep(0.22)  # respeita limite da NOAA CDO (5 req/s)
        query_pairs: list[tuple[str, str | int]] = [
            ("datasetid", "GSOM"),
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
            timeout=25,
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
    """Busca 1 ou até 7 variáveis GSOM da NOAA fatiando em blocos de 10 anos e cache."""
    if not variables:
        raise ValueError("Informe ao menos 1 variável para a NOAA CDO.")

    chunks = split_into_10_year_chunks(start_year, end_year)
    chunk_labels = [f"{c_start}-{c_end}" for c_start, c_end in chunks]

    base_url = os.environ.get(
        "NOAA_CDO_BASE_URL",
        "https://www.ncei.noaa.gov/cdo-web/api/v2",
    ).rstrip("/")
    token = os.environ.get("NOAA_CDO_TOKEN", "").strip()
    anchor = cells[0]

    if not token:
        return {
            var: {
                "api_puxada": API_NAME,
                "endpoint_consultado": base_url,
                "status": "REQUER_TOKEN_CADASTRO",
                "error": "Preencha NOAA_CDO_TOKEN em data/.env (https://www.ncdc.noaa.gov/cdo-web/token).",
                "variable": var,
                "unit": get_variable_spec(var).unit,
                "chunks_10y": chunk_labels,
                "series": {},
            }
            for var in variables
        }

    cache_store = cache or CellCacheStore()
    cache_extra = station_id or "auto_nearest"
    results: dict[str, dict[str, Any]] = {}
    missing_vars: list[str] = []

    for var in variables:
        spec = get_variable_spec(var)
        cached = cache_store.get("noaa_cdo", var, anchor.lat, anchor.lon, start_year, end_year, cache_extra)
        if cached is not None and "chunks_10y" in cached:
            series = cached.get("series", {})
            results[var] = {
                "api_puxada": API_NAME,
                "endpoint_consultado": f"{base_url}/data",
                "status": "OK" if series else "SEM_DADOS",
                "variable": var,
                "unit": spec.unit,
                "raw_api_unit": spec.raw_unit,
                "station_id": cached.get("station_id"),
                "chunks_10y": cached["chunks_10y"],
                "snapped_cells": [anchor.to_dict()],
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
        for var in missing_vars:
            spec = get_variable_spec(var)
            results[var] = {
                "api_puxada": API_NAME,
                "endpoint_consultado": f"{base_url}/stations",
                "status": "SEM_ESTACAO_ATIVA_NA_REGIAO",
                "variable": var,
                "unit": spec.unit,
                "chunks_10y": chunk_labels,
                "snapped_cells": [anchor.to_dict()],
                "months_count": 0,
                "cache_hits": 0,
                "http_calls": http_calls,
                "elapsed_s": round(total_elapsed, 3),
                "series": {},
            }
        return results

    resolved_station = candidate_stations[0]
    series_by_var: dict[str, dict[str, float]] = {var: {} for var in missing_vars}
    missing_set = set(missing_vars)

    for cand_station in candidate_stations:
        cand_buckets: dict[str, dict[str, float]] = defaultdict(dict)
        for chunk_start, chunk_end in chunks:
            log_api_pull(
                f"{label} | bloco {chunk_start}-{chunk_end} ({cand_station})",
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
                for var in missing_vars:
                    results[var] = {
                        "api_puxada": API_NAME,
                        "endpoint_consultado": f"{base_url}/data",
                        "status": "ERRO",
                        "error": err,
                        "station_id": cand_station,
                        "variable": var,
                        "chunks_10y": chunk_labels,
                        "http_calls": http_calls,
                        "elapsed_s": round(total_elapsed, 3),
                        "series": {},
                    }
                return results

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

    for var in missing_vars:
        spec = get_variable_spec(var)
        series = series_by_var[var]
        cache_store.set(
            "noaa_cdo",
            var,
            anchor.lat,
            anchor.lon,
            start_year,
            end_year,
            {"station_id": resolved_station, "chunks_10y": chunk_labels, "series": series},
            cache_extra,
        )
        results[var] = {
            "api_puxada": API_NAME,
            "endpoint_consultado": f"{base_url}/data",
            "status": "OK" if series else "SEM_DADOS",
            "variable": var,
            "unit": spec.unit,
            "raw_api_unit": spec.raw_unit,
            "station_id": resolved_station,
            "chunks_10y": chunk_labels,
            "snapped_cells": [anchor.to_dict()],
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
    """Busca série mensal GSOM (NOAA CDO API v2) fatiada em blocos de 10 anos."""
    return fetch_multi_variables_batch(
        [variable],
        cells,
        start_year,
        end_year,
        station_id=station_id,
        cache=cache,
        label=label,
    )[variable]
