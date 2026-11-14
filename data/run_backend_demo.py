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
import math
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

_FRONTEND_VARIABLE_IDS = {
    "T2M", "T2M_MAX", "T2M_MIN", "PRECTOTCORR", "GWETTOP", "GWETROOT",
    "RH2M", "WS10M", "PS", "ALLSKY_SFC_SW_DWN", "CLDTOT", "ALLSKY_SFC_LW_DWN",
}
_ALLOWED_REGIME_SHAPES = {
    "linear", "accelerating_rise", "accelerating_decline", "saturating", "non_monotonic",
}
_ALLOWED_CONFIDENCE_TIERS = {
    "CONFIRMED_HIGH", "CONFIRMED_MODERATE", "INSUFFICIENT_SIGNAL", "NO_TREND",
}


def _assert_variable_statistics_contract(stats: dict[str, Any], prefix: str) -> None:
    """Espelho fiel de `validateVariableStatistics()` em `frontend/src/contracts/contractValidator.ts`."""
    assert stats["variable_id"] in _FRONTEND_VARIABLE_IDS, f"{prefix}.variable_id inválido: {stats['variable_id']}"
    assert stats["scale_type"] in {"interval", "ratio"}
    assert isinstance(stats["allow_percentage_change"], bool)
    if stats["scale_type"] == "interval":
        assert not stats["allow_percentage_change"], f"Invariante #3 violado em {prefix}"
    assert math.isfinite(stats["period"]["n_observations"])
    assert math.isfinite(stats["period"]["n_effective_ar1"])
    reg = stats["regression"]
    assert math.isfinite(reg["slope_per_decade_ols"])
    assert math.isfinite(reg["slope_per_decade_sen"])
    assert reg["regime_shape"] in _ALLOWED_REGIME_SHAPES, f"Regime inválido: {reg['regime_shape']}"
    sig = stats["significance"]
    for p_field in ("p_value_naive", "p_value_ar1_corrected", "fdr_q_value"):
        assert 0.0 <= sig[p_field] <= 1.0, f"{prefix}.{p_field} fora de [0,1]: {sig[p_field]}"
    assert isinstance(sig["is_significant_fdr05"], bool)
    assert sig["confidence_tier"] in _ALLOWED_CONFIDENCE_TIERS, f"Tier inválido: {sig['confidence_tier']}"
    for outlier in stats["outliers_mahalanobis"]:
        assert outlier["direction"] in {"above_ellipse", "below_ellipse"}
        assert isinstance(outlier["diagnostic_hint"], str) and outlier["diagnostic_hint"].strip()
    series = stats["series"]
    n_pts = len(series["dates"])
    assert n_pts >= 12
    for vec_key in ("raw_values", "anomaly_values", "linear_fit", "gam_smooth_fit"):
        assert len(series[vec_key]) == n_pts, f"Tamanho inconsistente em {prefix}.series.{vec_key}"


def _assert_frontend_analysis_contract(payload: dict[str, Any]) -> None:
    """Espelho fiel de `validateAnalysisResponse()` de `origin/frontend`."""
    meta = payload["request_meta"]
    assert 1 <= meta["cells_count_a"] <= 9
    assert meta["spatial_aggregation"] == "nanmean"
    assert meta["source"] == "backend_api"
    _assert_variable_statistics_contract(payload["region_a_analysis"], "region_a_analysis")

    if meta.get("region_b_id") is not None:
        assert isinstance(meta["region_b_id"], str) and meta["region_b_id"].strip()
        assert 1 <= meta["cells_count_b"] <= 9
        assert payload["region_b_analysis"] is not None
    else:
        assert 0 <= meta["cells_count_b"] <= 9

    if payload["region_b_analysis"] is not None:
        _assert_variable_statistics_contract(payload["region_b_analysis"], "region_b_analysis")
        assert payload["comparison_pair"] is not None

    if payload["comparison_pair"] is not None:
        pair = payload["comparison_pair"]
        assert isinstance(pair["region_a_id"], str) and pair["region_a_id"].strip()
        assert isinstance(pair["region_b_id"], str) and pair["region_b_id"].strip()
        assert isinstance(pair["spatial_divergence_detected"], bool)
        if pair["slope_difference_per_decade"] is not None:
            assert math.isfinite(pair["slope_difference_per_decade"])
        mc = pair["multiscale_correlation"]
        assert -1.0 <= mc["long_term_secular_r"] <= 1.0
        assert -1.0 <= mc["short_term_detrended_r"] <= 1.0
        assert isinstance(mc["paradox_type"], str) and mc["paradox_type"].strip()
        assert isinstance(mc["interpretation"], str) and mc["interpretation"].strip()


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

    print("\n=== 8. Validação 100% Contrato Frontend (`POST /api/analyze` / `CONTRATO_DE_DADOS.md`) ===")
    status_anz_ab, body_anz_ab = router.handle_post(
        "/api/analyze",
        {
            "variable_a": "PRECTOTCORR",
            "variable_b": "T2M",
            "region_a": {
                "slot": "A",
                "region_id": "MERRA-2__r173_c239",
                "source_model": "MERRA-2",
                "grid_resolution": {"dLat": 0.5, "dLon": 0.625},
                "cells": [{"cell_id": "r173_c239", "row": 173, "col": 239, "lat": -3.12, "lon": -60.02}],
            },
            "region_b": {
                "slot": "B",
                "region_id": "MERRA-2__r161_c271",
                "source_model": "MERRA-2",
                "grid_resolution": {"dLat": 0.5, "dLon": 0.625},
                "cells": [{"cell_id": "r161_c271", "row": 161, "col": 271, "lat": -9.39, "lon": -40.50}],
            },
            "start_date": "2001-01",
            "end_date": "2023-12",
        },
    )
    assert status_anz_ab == 200, f"Erro POST /api/analyze A/B: {body_anz_ab}"
    _assert_frontend_analysis_contract(body_anz_ab)

    # Caso 2: mesma Região A com 2 variáveis distintas (region_b=None, variable_b="T2M_MAX")
    status_anz_same, body_anz_same = router.handle_post(
        "/api/analyze",
        {
            "variable_a": "T2M",
            "variable_b": "T2M_MAX",
            "region_a": {
                "slot": "A",
                "region_id": "MERRA-2__r173_c239",
                "source_model": "MERRA-2",
                "grid_resolution": {"dLat": 0.5, "dLon": 0.625},
                "cells": [{"cell_id": "r173_c239", "row": 173, "col": 239, "lat": -3.12, "lon": -60.02}],
            },
            "region_b": None,
            "start_date": "2001-01",
            "end_date": "2023-12",
        },
    )
    assert status_anz_same == 200, f"Erro POST /api/analyze mesma região: {body_anz_same}"
    _assert_frontend_analysis_contract(body_anz_same)
    assert body_anz_same["request_meta"]["region_b_id"] is None
    assert body_anz_same["request_meta"]["cells_count_b"] == 0
    assert body_anz_same["comparison_pair"]["slope_difference_per_decade"] is not None

    # Caso 3: região isolada + alias CLDTOT -> CLOUD_AMT e escala intervalar PS
    status_anz_cldtot, body_anz_cldtot = router.handle_post(
        "/api/analyze",
        {
            "variable_a": "CLDTOT",
            "variable_b": None,
            "region_a": {
                "slot": "A",
                "region_id": "CERES__r86_c119",
                "source_model": "CERES_SYN1deg",
                "grid_resolution": {"dLat": 1.0, "dLon": 1.0},
                "cells": [{"cell_id": "r86_c119", "row": 86, "col": 119, "lat": -3.5, "lon": -60.5}],
            },
            "region_b": None,
            "start_date": "2001-01",
            "end_date": "2023-12",
        },
    )
    assert status_anz_cldtot == 200, f"Erro POST /api/analyze CLDTOT: {body_anz_cldtot}"
    _assert_frontend_analysis_contract(body_anz_cldtot)
    assert body_anz_cldtot["region_a_analysis"]["variable_id"] == "CLDTOT"
    assert body_anz_cldtot["region_b_analysis"] is None
    assert body_anz_cldtot["comparison_pair"] is None

    # Caso 4: Máscara oceânica para GWETTOP no meio do Atlântico deve retornar OCEAN_MASK_NO_DATA
    status_ocean, body_ocean = router.handle_post(
        "/api/analyze",
        {
            "variable_a": "GWETTOP",
            "variable_b": None,
            "region_a": {
                "slot": "A",
                "region_id": "MERRA-2__r180_c240",
                "source_model": "MERRA-2",
                "grid_resolution": {"dLat": 0.5, "dLon": 0.625},
                "cells": [{"cell_id": "r180_c240", "row": 180, "col": 240, "lat": 0.0, "lon": -30.0}],
            },
            "region_b": None,
            "start_date": "2010-01",
            "end_date": "2015-12",
        },
    )
    assert status_ocean == 422 and body_ocean.get("code") == "OCEAN_MASK_NO_DATA", (
        f"Esperado OCEAN_MASK_NO_DATA, obtido HTTP {status_ocean}: {body_ocean}"
    )

    print(
        f"Contrato Frontend 100% OK -> A/B={status_anz_ab} | Mesma Região 2 vars={status_anz_same} | "
        f"CLDTOT isolado={status_anz_cldtot} | Máscara oceânica={status_ocean} ({body_ocean['code']})"
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
            "post_analyze_frontend_contract": {
                "ab_http_status": status_anz_ab,
                "same_region_http_status": status_anz_same,
                "cldtot_http_status": status_anz_cldtot,
                "ocean_mask_check": {"http_status": status_ocean, **body_ocean},
                "ab_request_meta": body_anz_ab["request_meta"],
                "ab_comparison_pair": body_anz_ab["comparison_pair"],
            },
        },
    }
    OUTPUT_PATH.write_text(json.dumps(contract_output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\nContrato completo salvo em: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
