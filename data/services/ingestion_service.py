"""Ingestion service guided by the 7 Environmental Families catalog.

Automatically resolves which API connector to call from the variable code in the
official catalog and exposes both the current flow (1 variable per location) and
the extensible flow (multiple variables per location with batch grouping).
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Callable

from data.cache.store import CellCacheStore
from data.catalog.environmental_catalog import VariableSpec, get_variable_spec
from data.connectors import nasa_appeears, nasa_giovanni, nasa_power, noaa_cdo, open_meteo_flood
from data.models.contracts import LocationQuery


def _enrich_with_catalog(spec: VariableSpec, payload: dict[str, Any]) -> dict[str, Any]:
    """Attaches environmental catalog metadata to the result returned by the connector."""
    return {
        **payload,
        "family_id": spec.family_id,
        "ui_name": spec.ui_name,
        "connector_id": spec.connector_id,
        "mode": spec.mode,
        "scale_type": spec.scale_type,
        "allow_percentage_change": spec.allow_percentage_change,
        "description": spec.description,
    }


def _call_single_connector(
    spec: VariableSpec,
    location: LocationQuery,
    start_year: int,
    end_year: int,
    cache: CellCacheStore,
    label: str,
) -> dict[str, Any]:
    if spec.connector_id == "nasa_power":
        raw = nasa_power.fetch_single_variable(
            spec.code, location.cells, start_year, end_year, cache=cache, label=label
        )
    elif spec.connector_id == "open_meteo_flood":
        raw = open_meteo_flood.fetch_single_variable(
            spec.code, location.cells, start_year, end_year, cache=cache, label=label
        )
    elif spec.connector_id == "noaa_cdo":
        raw = noaa_cdo.fetch_single_variable(
            spec.code,
            location.cells,
            start_year,
            end_year,
            station_id=location.station_id,
            cache=cache,
            label=label,
        )
    elif spec.connector_id == "nasa_appeears":
        raw = nasa_appeears.fetch_single_variable(
            spec.code, location.cells, start_year, end_year, cache=cache, label=label
        )
    elif spec.connector_id == "nasa_giovanni":
        raw = nasa_giovanni.fetch_single_variable(
            spec.code, location.cells, start_year, end_year, cache=cache, label=label
        )
    else:
        raise ValueError(f"Unknown connector in catalog: {spec.connector_id}")
    return _enrich_with_catalog(spec, raw)


_BATCH_CONNECTORS: dict[str, tuple[int, Callable[..., dict[str, dict[str, Any]]]]] = {
    "nasa_power": (20, nasa_power.fetch_multi_variables_batch),
    "open_meteo_flood": (4, open_meteo_flood.fetch_multi_variables_batch),
    "noaa_cdo": (7, noaa_cdo.fetch_multi_variables_batch),
}


def fetch_location_single_variable(
    location: LocationQuery,
    start_year: int,
    end_year: int,
    *,
    cache: CellCacheStore | None = None,
    label: str = "Location",
) -> dict[str, Any]:
    """Current flow (MVP): fetches exactly 1 variable for the given location."""
    vars_requested = location.get_variables()
    if len(vars_requested) != 1:
        raise ValueError(
            f"fetch_location_single_variable requires exactly 1 variable; received {len(vars_requested)}."
        )
    spec = get_variable_spec(vars_requested[0])
    cache_store = cache or CellCacheStore()
    return _call_single_connector(spec, location, start_year, end_year, cache_store, label)


def fetch_location_multiple_variables(
    location: LocationQuery,
    start_year: int,
    end_year: int,
    *,
    cache: CellCacheStore | None = None,
    label: str = "Location",
) -> dict[str, Any]:
    """Extensible modular flow: fetches 1 or N variables for the same location.

    Automatically batches variables from the same connector (e.g. up to 20 variables
    per call on the NASA POWER /point endpoint) to reduce latency and rate limits.
    """
    vars_requested = location.get_variables()
    cache_store = cache or CellCacheStore()
    specs = [get_variable_spec(code) for code in vars_requested]

    by_connector: dict[str, list[VariableSpec]] = defaultdict(list)
    for spec in specs:
        by_connector[spec.connector_id].append(spec)

    results_by_var: dict[str, dict[str, Any]] = {}
    for connector_id, group_specs in by_connector.items():
        if connector_id in _BATCH_CONNECTORS:
            max_batch, batch_fn = _BATCH_CONNECTORS[connector_id]
            codes = [s.code for s in group_specs]
            for start_idx in range(0, len(codes), max_batch):
                chunk = codes[start_idx : start_idx + max_batch]
                extra_kwargs: dict[str, Any] = {}
                if connector_id == "noaa_cdo" and location.station_id:
                    extra_kwargs["station_id"] = location.station_id
                batch_out = batch_fn(
                    chunk,
                    location.cells,
                    start_year,
                    end_year,
                    cache=cache_store,
                    label=f"{label} ({connector_id})",
                    **extra_kwargs,
                )
                for spec in group_specs[start_idx : start_idx + max_batch]:
                    results_by_var[spec.code] = _enrich_with_catalog(spec, batch_out[spec.code])
        else:
            for spec in group_specs:
                results_by_var[spec.code] = _call_single_connector(
                    spec, location, start_year, end_year, cache_store, label
                )

    ordered = {code: results_by_var[code] for code in vars_requested}
    return {
        "location_name": location.name,
        "cells_requested": [cell.to_dict() for cell in location.cells],
        "variables_count": len(ordered),
        "variables": ordered,
    }
