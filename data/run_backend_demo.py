"""Script didático de demonstração e validação do backend modular em `data/`.

Demonstra e valida em sequência:
1. Catálogo oficial das 7 Famílias Ambientais (42 códigos de variáveis).
2. Fluxo atual (MVP): Local A (1 variável) vs. Local B (1 variável) na NASA POWER.
3. Fluxo cross-API: Local A (NASA POWER PRECTOTCORR) vs. Local B (GloFAS river_discharge).
4. Hit de cache em disco (`cache_hits >= 1`, `http_calls == 0`) ao repetir a consulta.
5. Extensão futura sem refatoração: Local A (3 variáveis em lote) vs. Local B (2 variáveis).
6. Conector NOAA CDO (`TAVG`, estação em solo, janela 2023-2023).
7. Roteador REST (`BackendRouter`: GET /api/health, GET /api/catalog, POST /api/compare).

Execução recomendada (a partir da raiz do repositório):
    python3 data/run_backend_demo.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

# Garante que `from data...` funcione tanto via `python3 data/run_backend_demo.py`
# quanto via `python3 -m data.run_backend_demo`.
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from data.api.server import BackendRouter  # noqa: E402
from data.cache.store import CellCacheStore  # noqa: E402
from data.catalog.environmental_catalog import (  # noqa: E402
    get_catalog_tree,
    get_variable_spec,
    list_variables_by_family,
)
from data.models.contracts import CellCoord, LocationQuery  # noqa: E402
from data.services.comparison_service import (  # noqa: E402
    compare_locations_multi_variable,
    compare_locations_single_variable,
)
from data.services.ingestion_service import fetch_location_single_variable  # noqa: E402

OUTPUT_PATH = Path(__file__).resolve().parent / "sample_backend_contract_output.json"


def _compact_pair_summary(result: dict[str, Any]) -> dict[str, Any]:
    """Extrai um resumo legível de uma comparação 1-vs-1 para exibição no terminal."""
    pair = result["comparison_pair"]
    loc_a = result["location_a"]
    loc_b = result["location_b"]
    return {
        "status": result["status"],
        "period": result["period"],
        "location_a": {
            "name": loc_a["location_name"],
            "variable": loc_a["variable_id"],
            "api_puxada": loc_a["api_puxada"],
            "slope_per_decade_sen": loc_a["regression"]["slope_per_decade_sen"],
            "regime_shape": loc_a["regression"]["regime_shape"],
            "allow_percentage_change": loc_a["allow_percentage_change"],
            "n_effective_ar1": loc_a["period"]["n_effective_ar1"],
            "outliers_count": len(loc_a["outliers_mahalanobis"]),
        },
        "location_b": {
            "name": loc_b["location_name"],
            "variable": loc_b["variable_id"],
            "api_puxada": loc_b["api_puxada"],
            "slope_per_decade_sen": loc_b["regression"]["slope_per_decade_sen"],
            "regime_shape": loc_b["regression"]["regime_shape"],
            "allow_percentage_change": loc_b["allow_percentage_change"],
            "n_effective_ar1": loc_b["period"]["n_effective_ar1"],
            "outliers_count": len(loc_b["outliers_mahalanobis"]),
        },
        "comparison_pair": pair,
    }


def main() -> None:
    print("=== 1. Catálogo das 7 Famílias Ambientais ===")
    catalog = get_catalog_tree()
    assert catalog["total_families"] == 7, f"Esperadas 7 famílias, obtidas {catalog['total_families']}"
    assert catalog["total_variables"] == 42, f"Esperadas 42 variáveis, obtidas {catalog['total_variables']}"
    assert get_variable_spec("T2M").allow_percentage_change is False
    assert get_variable_spec("PRECTOTCORR").allow_percentage_change is True
    river_vars = [spec.code for spec in list_variables_by_family("rios_vazao_bacias")]
    assert "river_discharge" in river_vars

    print(f"Total de famílias: {catalog['total_families']} | Total de variáveis: {catalog['total_variables']}")
    for fam in catalog["families"]:
        print(f"  - [{fam['order']}] {fam['family_id']}: {fam['variables_count']} variáveis")

    cache = CellCacheStore()

    print("\n=== 2. MVP Single-Variable A vs B (NASA POWER: PRECTOTCORR vs T2M, 2001-2023) ===")
    loc_a_power = LocationQuery(
        name="Amazônia Central (Manaus)",
        cells=[CellCoord(lat=-3.12, lon=-60.02)],
        variable="PRECTOTCORR",
    )
    loc_b_power = LocationQuery(
        name="Semiárido (Petrolina)",
        cells=[CellCoord(lat=-9.39, lon=-40.50)],
        variable="T2M",
    )
    comp_power_vs_power = compare_locations_single_variable(
        loc_a_power, loc_b_power, 2001, 2023, cache=cache
    )
    assert comp_power_vs_power["status"] == "OK"
    assert comp_power_vs_power["mode"] == "single_variable_ab"
    assert comp_power_vs_power["period"]["n_common_months"] >= 12
    assert comp_power_vs_power["location_a"]["api_puxada"] == "NASA POWER API v2"
    assert comp_power_vs_power["location_a"]["allow_percentage_change"] is True
    assert comp_power_vs_power["location_b"]["allow_percentage_change"] is False
    print(json.dumps(_compact_pair_summary(comp_power_vs_power), ensure_ascii=False, indent=2))

    print("\n=== 3. MVP Cross-API A vs B (NASA POWER PRECTOTCORR vs GloFAS river_discharge, 2001-2023) ===")
    loc_b_glofas = LocationQuery(
        name="Rio Negro / Amazonas (Manaus)",
        cells=[CellCoord(lat=-3.13, lon=-60.02)],
        variable="river_discharge",
    )
    comp_power_vs_glofas = compare_locations_single_variable(
        loc_a_power, loc_b_glofas, 2001, 2023, cache=cache
    )
    assert comp_power_vs_glofas["status"] == "OK"
    assert comp_power_vs_glofas["location_a"]["api_puxada"] == "NASA POWER API v2"
    assert comp_power_vs_glofas["location_b"]["api_puxada"] == "Open-Meteo Flood API (GloFAS)"
    assert comp_power_vs_glofas["period"]["n_common_months"] >= 12
    print(json.dumps(_compact_pair_summary(comp_power_vs_glofas), ensure_ascii=False, indent=2))

    print("\n=== 4. Validação de Cache Hit em Disco (0 chamadas HTTP na repetição) ===")
    cached_repeat = fetch_location_single_variable(
        loc_a_power, 2001, 2023, cache=cache, label="Cache Check Manaus"
    )
    assert cached_repeat["status"] == "OK"
    assert cached_repeat["cache_hits"] >= 1, f"Esperado cache_hits >= 1, obtido {cached_repeat['cache_hits']}"
    assert cached_repeat["http_calls"] == 0, f"Esperado http_calls == 0, obtido {cached_repeat['http_calls']}"
    print(
        f"Cache OK -> variável={cached_repeat['variable']} | "
        f"cache_hits={cached_repeat['cache_hits']} | http_calls={cached_repeat['http_calls']}"
    )

    print("\n=== 5. Extensão Modular Multi-Variável A (3 vars) vs B (2 vars) com Batching ===")
    loc_a_multi = LocationQuery(
        name="Amazônia Central (Manaus) Multi",
        cells=[CellCoord(lat=-3.12, lon=-60.02)],
        variables=["T2M", "PRECTOTCORR", "RH2M"],
    )
    loc_b_multi = LocationQuery(
        name="Semiárido (Petrolina) Multi",
        cells=[CellCoord(lat=-9.39, lon=-40.50)],
        variables=["T2M", "PRECTOTCORR"],
    )
    comp_multi = compare_locations_multi_variable(
        loc_a_multi, loc_b_multi, 2001, 2023, cache=cache
    )
    assert comp_multi["status"] == "OK"
    assert comp_multi["mode"] == "multi_variable_ab"
    assert set(comp_multi["location_a"]) == {"T2M", "PRECTOTCORR", "RH2M"}
    assert set(comp_multi["location_b"]) == {"T2M", "PRECTOTCORR"}
    assert len(comp_multi["cross_comparison_matrix"]) == 6
    print(
        f"Multi OK -> pares cruzados gerados={len(comp_multi['cross_comparison_matrix'])} | "
        f"meses comuns={comp_multi['period']['n_common_months']}"
    )

    print("\n=== 6. Smoke Check Conector NOAA CDO (Loop Automático 10 em 10 Anos: TAVG, 2001-2023) ===")
    loc_noaa = LocationQuery(
        name="Estação Meteorológica Referência (Central Park, NY)",
        cells=[CellCoord(lat=40.78, lon=-73.97)],
        variable="TAVG",
    )
    noaa_res = fetch_location_single_variable(
        loc_noaa, 2001, 2023, cache=cache, label="NOAA CDO 23 anos"
    )
    if noaa_res["status"] != "OK" or noaa_res["months_count"] < 200:
        # Fallback determinístico usando estação GSOM com série longa conhecida
        loc_noaa_fallback = LocationQuery(
            name="Estação Meteorológica Referência (Central Park USW00094728)",
            cells=[CellCoord(lat=40.78, lon=-73.97)],
            variable="TAVG",
            station_id="GHCND:USW00094728",
        )
        noaa_res = fetch_location_single_variable(
            loc_noaa_fallback, 2001, 2023, cache=cache, label="NOAA CDO 23 anos Fallback"
        )
    assert noaa_res["status"] == "OK", f"Falha no smoke check NOAA CDO: {noaa_res}"
    assert noaa_res["api_puxada"] == "NOAA CDO API v2"
    assert noaa_res["chunks_10y"] == ["2001-2010", "2011-2020", "2021-2023"], noaa_res["chunks_10y"]
    assert len(noaa_res["chunks_10y"]) == 3
    assert noaa_res["months_count"] >= 200, f"Esperados >= 200 meses, obtidos {noaa_res['months_count']}"
    print(
        f"NOAA CDO OK -> station_id={noaa_res.get('station_id')} | "
        f"chunks_10y={noaa_res['chunks_10y']} | "
        f"months_count={noaa_res['months_count']} | http_calls={noaa_res['http_calls']}"
    )

    print("\n=== 7. Smoke Check Roteador HTTP REST (BackendRouter) ===")
    router = BackendRouter(cache=cache)
    status_health, body_health = router.handle_get("/api/health")
    assert status_health == 200 and body_health["status"] == "OK"

    status_cat, body_cat = router.handle_get("/api/catalog")
    assert status_cat == 200 and body_cat["total_families"] == 7 and body_cat["total_variables"] == 42

    status_cmp, body_cmp = router.handle_post(
        "/api/compare",
        {
            "start_year": 2001,
            "end_year": 2023,
            "location_a": {
                "name": "Manaus (via REST)",
                "variable": "PRECTOTCORR",
                "cells": [{"lat": -3.12, "lon": -60.02}],
            },
            "location_b": {
                "name": "Petrolina (via REST)",
                "variable": "T2M",
                "cells": [{"lat": -9.39, "lon": -40.50}],
            },
        },
    )
    assert status_cmp == 200 and body_cmp["status"] == "OK"
    assert body_cmp["mode"] == "single_variable_ab"
    assert body_cmp["location_a"]["cache_hits"] >= 1
    assert body_cmp["location_a"]["http_calls"] == 0
    print(
        f"BackendRouter OK -> GET /api/health={status_health} | "
        f"GET /api/catalog={status_cat} | POST /api/compare={status_cmp} (cache hit 100%)"
    )

    contract_output = {
        "catalog_summary": {
            "total_families": catalog["total_families"],
            "total_variables": catalog["total_variables"],
            "families": [
                {
                    "order": fam["order"],
                    "family_id": fam["family_id"],
                    "name": fam["name"],
                    "variables_count": fam["variables_count"],
                }
                for fam in catalog["families"]
            ],
        },
        "single_variable_power_vs_power": comp_power_vs_power,
        "single_variable_power_vs_glofas": comp_power_vs_glofas,
        "cache_verification": {
            "variable": cached_repeat["variable"],
            "months_count": cached_repeat["months_count"],
            "cache_hits": cached_repeat["cache_hits"],
            "http_calls": cached_repeat["http_calls"],
        },
        "multi_variable_extension_summary": {
            "mode": comp_multi["mode"],
            "status": comp_multi["status"],
            "period": comp_multi["period"],
            "location_a_variables": list(comp_multi["location_a"].keys()),
            "location_b_variables": list(comp_multi["location_b"].keys()),
            "cross_comparison_matrix": comp_multi["cross_comparison_matrix"],
        },
        "noaa_cdo_smoke_check": {
            key: val for key, val in noaa_res.items() if key != "series"
        },
        "rest_router_checks": {
            "get_health": {"http_status": status_health, "body": body_health},
            "get_catalog": {
                "http_status": status_cat,
                "total_families": body_cat["total_families"],
                "total_variables": body_cat["total_variables"],
            },
            "post_compare": {
                "http_status": status_cmp,
                "mode": body_cmp["mode"],
                "status": body_cmp["status"],
                "comparison_pair": body_cmp["comparison_pair"],
            },
        },
    }
    OUTPUT_PATH.write_text(json.dumps(contract_output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\nContrato completo salvo em: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
