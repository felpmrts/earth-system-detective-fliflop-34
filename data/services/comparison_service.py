"""Serviço estatístico e comparador Local A vs. Local B.

Delega integralmente a computação matemática e os 7 Invariantes Estatísticos para o
motor estado da arte em `backend/stats_engine.py`:
- Anomalias climatológicas mensais dessazonalizadas com média aparada (Princípio Henrietta Leavitt).
- Regressão sobre toda a nuvem: OLS + declive robusto de Theil-Sen por década com IC 95%.
- Curva suave não-linear (Cubic Smoothing Spline com GCV + fallback LOWESS) + aceleração B2.
- Respeito estrito a escalas (proibição de % em variáveis intervalares).
- Significância corrigida AR(1) (Santer et al.) + Hamed-Rao Mann-Kendall + Benjamini-Hochberg FDR.
- Detecção bivariada robusta de outliers por Distância de Mahalanobis (MinCovDet, D_M > 2.5).
- Decomposição multiescala entre A e B: r_global vs. r_detrended com detecção de paradoxo.
"""

from __future__ import annotations

import math
import re
import sys
from pathlib import Path
from typing import Any

# Garante que `backend` na raiz do repositório esteja importável mesmo quando executado fora da raiz.
_REPO_ROOT = str(Path(__file__).resolve().parents[2])
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from backend.stats_engine import (
    SemanticContractError,
    analyze_single_series,
    apply_benjamini_hochberg_fdr,
    compute_multiscale_comparison,
    update_fdr_significance,
)
from data.cache.store import CellCacheStore
from data.catalog.environmental_catalog import get_variable_spec
from data.connectors.base import snap_ceres, snap_merra2
from data.models.contracts import CellCoord, LocationQuery, get_max_cells_per_region

from .ingestion_service import (
    fetch_location_multiple_variables,
    fetch_location_single_variable,
)

_YM_PATTERN = re.compile(r"^(\d{4})-(\d{2})$")

# Aliases entre os IDs do CONTRATO_DE_DADOS.md (frontend) e códigos do catálogo/APIs
_FRONTEND_VAR_TO_BACKEND: dict[str, str] = {
    "CLDTOT": "CLOUD_AMT",
}

# Regras normativas de escala do CONTRATO_DE_DADOS.md / frontend/src/contracts/catalog.ts
_CONTRACT_METADATA_OVERRIDES: dict[str, dict[str, Any]] = {
    "CLDTOT": {
        "variable_name": "Cobertura Total de Nuvens",
        "scale_type": "ratio",
        "unit": "%",
        "trend_unit": "p.p./década",
        "allow_percentage_change": False,
        "min_year": 1984,
    },
    "PS": {
        "scale_type": "interval",
        "unit": "kPa",
        "trend_unit": "kPa/década",
        "allow_percentage_change": False,
        "min_year": 1981,
    },
    "RH2M": {
        "scale_type": "ratio",
        "unit": "%",
        "trend_unit": "p.p./década",
        "allow_percentage_change": False,
        "min_year": 1981,
    },
    "GWETTOP": {
        "scale_type": "ratio",
        "unit": "fração (0–1)",
        "trend_unit": "fração/década",
        "allow_percentage_change": False,
        "min_year": 1981,
    },
    "GWETROOT": {
        "scale_type": "ratio",
        "unit": "fração (0–1)",
        "trend_unit": "fração/década",
        "allow_percentage_change": False,
        "min_year": 1981,
    },
    "GWETPROF": {
        "scale_type": "ratio",
        "unit": "fração (0–1)",
        "trend_unit": "fração/década",
        "allow_percentage_change": False,
        "min_year": 1981,
    },
    "ALLSKY_SRF_ALB": {
        "scale_type": "ratio",
        "unit": "fração (0–1)",
        "trend_unit": "fração/década",
        "allow_percentage_change": False,
        "min_year": 1984,
    },
    "ALLSKY_SFC_SW_DWN": {"min_year": 1984},
    "ALLSKY_SFC_LW_DWN": {"min_year": 1984},
}


class ContractSemanticError(ValueError):
    """Erro semântico padronizado conforme Seção 5 do CONTRATO_DE_DADOS.md."""

    def __init__(self, code: str, message: str, status_code: int = 422) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code


def _trend_unit_from_unit(unit: str) -> str:
    if unit == "%":
        return "p.p./década"
    if unit.lower().startswith("fração"):
        return "fração/década"
    return f"{unit}/década" if unit else "unidade/década"


def _build_variable_meta(fetched: dict[str, Any], requested_var_id: str | None = None) -> dict[str, Any]:
    """Constrói metadados compatíveis com `backend.stats_engine` preservando as 42 variáveis e invariantes."""
    var_id = requested_var_id or str(fetched["variable"])
    unit = str(fetched.get("unit") or "")
    scale_type = str(fetched.get("scale_type") or "ratio")
    allow_pct = bool(fetched.get("allow_percentage_change", scale_type == "ratio"))
    if scale_type == "interval" or var_id in {
        "GWETTOP",
        "GWETROOT",
        "GWETPROF",
        "RH2M",
        "CLDTOT",
        "CLOUD_AMT",
        "ALLSKY_SRF_ALB",
    }:
        allow_pct = False

    meta: dict[str, Any] = {
        "variable_id": var_id,
        "variable_name": str(fetched.get("ui_name") or var_id),
        "scale_type": scale_type,
        "unit": unit,
        "trend_unit": _trend_unit_from_unit(unit),
        "allow_percentage_change": allow_pct,
    }
    overrides = _CONTRACT_METADATA_OVERRIDES.get(var_id, {})
    for key, val in overrides.items():
        if key != "min_year":
            meta[key] = val
    if meta["scale_type"] == "interval":
        meta["allow_percentage_change"] = False
    return meta


def _apply_joint_fdr(blocks: list[dict[str, Any]]) -> None:
    """Aplica controle Benjamini-Hochberg FDR conjunto sobre múltiplos blocos analisados."""
    if not blocks:
        return
    p_vals = [float(b["significance"]["p_value_ar1_corrected"]) for b in blocks]
    q_vals, _ = apply_benjamini_hochberg_fdr(p_vals, alpha=0.05)
    for block, q_val in zip(blocks, q_vals):
        update_fdr_significance(block, q_val, alpha=0.05)


def build_variable_statistics(
    location_name: str,
    fetched: dict[str, Any],
    common_months: list[str],
    xs_years: list[float] | None = None,
    *,
    requested_var_id: str | None = None,
    fdr_q_override: float | None = None,
) -> tuple[dict[str, Any], list[float], list[float]]:
    """Gera o bloco completo do Contrato de Dados delegando ao motor `backend/stats_engine.py`."""
    del xs_years  # O motor calcula tempo fracionário exato diretamente de common_months
    var_meta = _build_variable_meta(fetched, requested_var_id=requested_var_id)
    series_map = fetched["series"]
    raw_values = [series_map.get(ym) for ym in common_months]

    try:
        stats = analyze_single_series(
            var_meta["variable_id"],
            common_months,
            raw_values,
            fdr_q_value=fdr_q_override,
            variable_meta=var_meta,
        )
    except SemanticContractError as exc:
        raise ContractSemanticError(exc.code, exc.message, 422) from exc

    block: dict[str, Any] = {
        "location_name": location_name,
        "api_puxada": fetched.get("api_puxada"),
        "endpoint_consultado": fetched.get("endpoint_consultado"),
        "family_id": fetched.get("family_id"),
        "cells_snapped": fetched.get("snapped_cells", []),
        "cache_hits": fetched.get("cache_hits", 0),
        "http_calls": fetched.get("http_calls", 0),
        **stats,
    }

    anomalies = [0.0 if a is None else float(a) for a in stats["series"]["anomaly_values"]]
    residuals = [
        float(a) - float(lin)
        for a, lin in zip(anomalies, stats["series"]["linear_fit"])
    ]
    return block, anomalies, residuals


def _compute_pair_comparison(
    name_a: str,
    block_a: dict[str, Any],
    anomalies_a: list[float],
    residuals_a: list[float],
    name_b: str,
    block_b: dict[str, Any],
    anomalies_b: list[float],
    residuals_b: list[float],
    *,
    region_a_id: str | None = None,
    region_b_id: str | None = None,
) -> dict[str, Any]:
    """Delega a comparação multiescala e detecção de paradoxo ao `backend/stats_engine.py`."""
    del anomalies_a, residuals_a, anomalies_b, residuals_b
    eff_a = region_a_id or name_a
    eff_b = region_b_id or name_b
    try:
        pair = compute_multiscale_comparison(eff_a, eff_b, block_a, block_b)
    except SemanticContractError as exc:
        raise ContractSemanticError(exc.code, exc.message, 422) from exc

    return {
        **pair,
        "location_a_name": name_a,
        "location_a_variable": block_a["variable_id"],
        "location_b_name": name_b,
        "location_b_variable": block_b["variable_id"],
    }


def _common_months_and_axis(series_list: list[dict[str, float]]) -> tuple[list[str], list[float]]:
    common = sorted(set.intersection(*(set(s) for s in series_list)))
    if len(common) < 12:
        return common, []
    t0_year, t0_month = int(common[0][:4]), int(common[0][5:7])
    t0 = t0_year + (t0_month - 0.5) / 12.0
    xs_years = [
        (int(ym[:4]) + (int(ym[5:7]) - 0.5) / 12.0) - t0
        for ym in common
    ]
    return common, xs_years


def compare_locations_single_variable(
    location_a: LocationQuery,
    location_b: LocationQuery,
    start_year: int,
    end_year: int,
    *,
    cache: CellCacheStore | None = None,
) -> dict[str, Any]:
    """Fluxo principal (MVP): 1 variável no Local A vs. 1 variável no Local B."""
    cache_store = cache or CellCacheStore()
    fetched_a = fetch_location_single_variable(
        location_a, start_year, end_year, cache=cache_store, label="Local A"
    )
    fetched_b = fetch_location_single_variable(
        location_b, start_year, end_year, cache=cache_store, label="Local B"
    )

    if fetched_a["status"] != "OK" or fetched_b["status"] != "OK":
        return {
            "mode": "single_variable_ab",
            "status": "ERRO_OU_DADOS_INDISPONIVEIS",
            "location_a": fetched_a,
            "location_b": fetched_b,
        }

    common_months, xs_years = _common_months_and_axis([fetched_a["series"], fetched_b["series"]])
    if len(common_months) < 12:
        return {
            "mode": "single_variable_ab",
            "status": "JANELA_COMUM_INSUFICIENTE",
            "common_months_count": len(common_months),
        }

    block_a, anom_a, res_a = build_variable_statistics(location_a.name, fetched_a, common_months, xs_years)
    block_b, anom_b, res_b = build_variable_statistics(location_b.name, fetched_b, common_months, xs_years)
    _apply_joint_fdr([block_a, block_b])
    pair = _compute_pair_comparison(
        location_a.name, block_a, anom_a, res_a, location_b.name, block_b, anom_b, res_b
    )

    return {
        "mode": "single_variable_ab",
        "status": "OK",
        "period": {
            "start": common_months[0],
            "end": common_months[-1],
            "n_common_months": len(common_months),
        },
        "location_a": block_a,
        "location_b": block_b,
        "comparison_pair": pair,
    }


def compare_locations_multi_variable(
    location_a: LocationQuery,
    location_b: LocationQuery,
    start_year: int,
    end_year: int,
    *,
    cache: CellCacheStore | None = None,
) -> dict[str, Any]:
    """Extensão futura: N variáveis no Local A vs. M variáveis no Local B (matriz cruzada)."""
    cache_store = cache or CellCacheStore()
    batch_a = fetch_location_multiple_variables(
        location_a, start_year, end_year, cache=cache_store, label="Local A Multi"
    )
    batch_b = fetch_location_multiple_variables(
        location_b, start_year, end_year, cache=cache_store, label="Local B Multi"
    )

    ok_a = {code: data for code, data in batch_a["variables"].items() if data.get("status") == "OK"}
    ok_b = {code: data for code, data in batch_b["variables"].items() if data.get("status") == "OK"}
    if not ok_a or not ok_b:
        return {
            "mode": "multi_variable_ab",
            "status": "ERRO_OU_DADOS_INDISPONIVEIS",
            "location_a_raw": batch_a,
            "location_b_raw": batch_b,
        }

    common_months, xs_years = _common_months_and_axis(
        [d["series"] for d in ok_a.values()] + [d["series"] for d in ok_b.values()]
    )
    if len(common_months) < 12:
        return {
            "mode": "multi_variable_ab",
            "status": "JANELA_COMUM_INSUFICIENTE",
            "common_months_count": len(common_months),
        }

    stats_a = {
        code: build_variable_statistics(location_a.name, data, common_months, xs_years)
        for code, data in ok_a.items()
    }
    stats_b = {
        code: build_variable_statistics(location_b.name, data, common_months, xs_years)
        for code, data in ok_b.items()
    }
    _apply_joint_fdr(
        [vals[0] for vals in stats_a.values()] + [vals[0] for vals in stats_b.values()]
    )

    cross_matrix = [
        _compute_pair_comparison(
            location_a.name, blk_a, anom_a, res_a, location_b.name, blk_b, anom_b, res_b
        )
        for blk_a, anom_a, res_a in stats_a.values()
        for blk_b, anom_b, res_b in stats_b.values()
    ]

    return {
        "mode": "multi_variable_ab",
        "status": "OK",
        "period": {
            "start": common_months[0],
            "end": common_months[-1],
            "n_common_months": len(common_months),
        },
        "location_a": {code: vals[0] for code, vals in stats_a.items()},
        "location_b": {code: vals[0] for code, vals in stats_b.items()},
        "cross_comparison_matrix": cross_matrix,
    }


def _parse_year_month(raw: Any, field_name: str) -> tuple[str, int]:
    """Valida string YYYY-MM do CONTRATO_DE_DADOS.md e devolve (YYYY-MM, ano)."""
    text = str(raw or "").strip()
    match = _YM_PATTERN.match(text)
    if not match:
        raise ContractSemanticError(
            "INVALID_DATE_INTERSECTION",
            f"Campo '{field_name}' inválido (esperado YYYY-MM): {raw!r}",
        )
    year, month = int(match.group(1)), int(match.group(2))
    if not (1 <= month <= 12):
        raise ContractSemanticError(
            "INVALID_DATE_INTERSECTION",
            f"Mês fora do intervalo 01..12 em '{field_name}': {text}",
        )
    return text, year


def _slot_human_label(slot_label: str) -> str:
    return "Local A" if slot_label == "region_a" else "Local B"


def _parse_contract_region(
    raw_region: Any,
    slot_label: str,
    backend_var_code: str,
) -> tuple[str, int, LocationQuery]:
    """Converte `region_a` ou `region_b` de `RegionAnalysisRequest` para `LocationQuery`."""
    slot_name = _slot_human_label(slot_label)
    if not isinstance(raw_region, dict):
        raise ContractSemanticError(
            "CONTRACT_VIOLATION",
            f"Os dados enviados para o {slot_name} estão em formato inválido.",
            400,
        )
    region_id = str(raw_region.get("region_id") or "").strip()
    if not region_id:
        raise ContractSemanticError(
            "CONTRACT_VIOLATION",
            f"Identificador ausente para o {slot_name} (region_id obrigatório).",
            400,
        )
    raw_cells = raw_region.get("cells")
    if not isinstance(raw_cells, list) or len(raw_cells) == 0:
        raise ContractSemanticError(
            "CONTRACT_VIOLATION",
            f"Selecione pelo menos 1 retângulo no mapa para o {slot_name}.",
            400,
        )
    max_cells = get_max_cells_per_region()
    if len(raw_cells) > max_cells:
        raise ContractSemanticError(
            "MAX_CELLS_EXCEEDED",
            f"O {slot_name} possui {len(raw_cells)} retângulos selecionados, mas o limite máximo é de {max_cells} retângulos adjacentes por região.",
        )
    spec = get_variable_spec(backend_var_code)
    grid_contracts = {
        "merra2": ("MERRA-2", 0.5, 0.625, snap_merra2),
        "ceres": ("CERES_SYN1deg", 1.0, 1.0, snap_ceres),
    }
    grid_contract = grid_contracts.get(spec.grid_type)

    if grid_contract:
        expected_model, expected_dlat, expected_dlon, _ = grid_contract
        if raw_region.get("source_model") != expected_model:
            raise ContractSemanticError(
                "CONTRACT_VIOLATION",
                f"'{slot_label}.source_model' incompatível com {backend_var_code}: esperado {expected_model}.",
                400,
            )
        resolution = raw_region.get("grid_resolution")
        try:
            dlat = float(resolution.get("dLat", math.nan)) if isinstance(resolution, dict) else math.nan
            dlon = float(resolution.get("dLon", math.nan)) if isinstance(resolution, dict) else math.nan
        except (TypeError, ValueError) as exc:
            raise ContractSemanticError(
                "CONTRACT_VIOLATION",
                f"'{slot_label}.grid_resolution' incompatível com {backend_var_code}.",
                400,
            ) from exc
        if not math.isclose(dlat, expected_dlat) or not math.isclose(dlon, expected_dlon):
            raise ContractSemanticError(
                "CONTRACT_VIOLATION",
                f"'{slot_label}.grid_resolution' incompatível com {backend_var_code}.",
                400,
            )

    cells: list[CellCoord] = []
    grid_indices: list[tuple[int, int]] = []
    seen_coords: set[tuple[float, float]] = set()
    for index, item in enumerate(raw_cells):
        if not isinstance(item, dict):
            raise ContractSemanticError(
                "CONTRACT_VIOLATION", f"'{slot_label}.cells[{index}]' inválida ({slot_name}).", 400
            )
        try:
            lat, lon = float(item["lat"]), float(item["lon"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ContractSemanticError(
                "CONTRACT_VIOLATION",
                f"As coordenadas selecionadas para o {slot_name} estão incompletas ou inválidas.",
                400,
            ) from exc
        if not math.isfinite(lat) or not math.isfinite(lon) or not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
            raise ContractSemanticError(
                "CONTRACT_VIOLATION",
                f"Coordenadas fora do domínio em '{slot_label}.cells[{index}]'.",
                400,
            )
        coord = (round(lat, 4), round(lon, 4))
        if coord in seen_coords:
            raise ContractSemanticError(
                "CONTRACT_VIOLATION", f"Célula duplicada em '{slot_label}': {coord}.", 400
            )
        seen_coords.add(coord)

        if grid_contract:
            _, _, _, snap_fn = grid_contract
            snapped = snap_fn(lat, lon)
            if coord != snapped:
                raise ContractSemanticError(
                    "CONTRACT_VIOLATION",
                    f"Célula {coord} não está no centro da grade nativa de {backend_var_code}.",
                    400,
                )
            if spec.grid_type == "ceres":
                expected_row, expected_col = math.floor(min(lat, 89.9999)), math.floor(min(lon, 179.9999))
            else:
                expected_row, expected_col = round(lat / 0.5), round(lon / 0.625)
            if item.get("row") != expected_row or item.get("col") != expected_col:
                raise ContractSemanticError(
                    "CONTRACT_VIOLATION",
                    f"Índices de grade inválidos em '{slot_label}.cells[{index}]'.",
                    400,
                )
            expected_cell_id = f"r{expected_row}_c{expected_col}"
            if item.get("cell_id") != expected_cell_id:
                raise ContractSemanticError(
                    "CONTRACT_VIOLATION",
                    f"cell_id inválido em '{slot_label}.cells[{index}]': esperado {expected_cell_id}.",
                    400,
                )
            grid_indices.append((expected_row, expected_col))
        cells.append(CellCoord(lat=lat, lon=lon))

    if grid_contract and len(grid_indices) > 1:
        visited = {grid_indices[0]}
        pending = [grid_indices[0]]
        while pending:
            row, col = pending.pop()
            for candidate in grid_indices:
                if candidate not in visited and max(abs(candidate[0] - row), abs(candidate[1] - col)) <= 1:
                    visited.add(candidate)
                    pending.append(candidate)
        if len(visited) != len(grid_indices):
            raise ContractSemanticError(
                "NOT_ADJACENT",
                f"As células de '{slot_label}' ({slot_name}) precisam formar uma região conexa em 8 vizinhos.",
            )
    station_id = raw_region.get("station_id")
    query = LocationQuery(
        name=region_id,
        cells=cells,
        variable=backend_var_code,
        station_id=str(station_id) if station_id else None,
    )
    return region_id, len(cells), query


def _fetch_contract_series(
    query: LocationQuery,
    requested_var_id: str,
    start_date: str,
    end_date: str,
    start_year: int,
    end_year: int,
    *,
    cache: CellCacheStore,
    label: str,
) -> dict[str, Any]:
    """Busca e filtra a série mensal no intervalo [start_date, end_date] tratando erros semânticos."""
    fetched = fetch_location_single_variable(
        query, start_year, end_year, cache=cache, label=label
    )
    if fetched.get("status") == "OCEANO_SEM_DADOS_TERRESTRES":
        raise ContractSemanticError(
            "OCEAN_MASK_NO_DATA",
            f"Células sobre oceano sem dados terrestres para '{requested_var_id}'.",
        )
    if fetched.get("status") != "OK":
        raise ContractSemanticError(
            "BACKEND_UNAVAILABLE",
            str(fetched.get("error") or f"Falha ao obter '{requested_var_id}' ({fetched.get('status')})."),
            502,
        )
    filtered_series = {
        ym: val for ym, val in fetched.get("series", {}).items() if start_date <= ym <= end_date
    }
    # No endpoint /point da NASA POWER (MERRA-2 Land), células oceânicas retornam -999 ou 1.0 constante
    if requested_var_id in {"GWETTOP", "GWETROOT", "GWETPROF"} and (
        not filtered_series or set(filtered_series.values()) <= {1.0}
    ):
        raise ContractSemanticError(
            "OCEAN_MASK_NO_DATA",
            f"Células sobre oceano sem variação terrestre para '{requested_var_id}'.",
        )
    return {**fetched, "series": filtered_series}


def analyze_regions_contract(
    request_body: dict[str, Any],
    *,
    cache: CellCacheStore | None = None,
) -> dict[str, Any]:
    """Executa análise compatível 100% com `RegionAnalysisRequest -> RegionAnalysisResponse` (POST /api/analyze)."""
    if not isinstance(request_body, dict):
        raise ContractSemanticError("CONTRACT_VIOLATION", "Payload JSON inválido.", 400)

    var_a = str(request_body.get("variable_a") or "").strip()
    if not var_a:
        raise ContractSemanticError("CONTRACT_VIOLATION", "Campo 'variable_a' obrigatório.", 400)
    raw_var_b = request_body.get("variable_b")
    var_b = str(raw_var_b).strip() if raw_var_b else None

    start_date, start_year = _parse_year_month(request_body.get("start_date"), "start_date")
    end_date, end_year = _parse_year_month(request_body.get("end_date"), "end_date")
    if start_date > end_date:
        raise ContractSemanticError(
            "INVALID_DATE_INTERSECTION",
            f"Janela temporal inválida: {start_date} > {end_date}.",
        )

    backend_var_a = _FRONTEND_VAR_TO_BACKEND.get(var_a, var_a)
    region_a_id, cells_count_a, query_a = _parse_contract_region(
        request_body.get("region_a"), "region_a", backend_var_a
    )

    cache_store = cache or CellCacheStore()
    fetched_a = _fetch_contract_series(
        query_a, var_a, start_date, end_date, start_year, end_year,
        cache=cache_store, label="Analyze Region A",
    )

    raw_region_b = request_body.get("region_b")
    has_second_series = raw_region_b is not None or var_b is not None

    if not has_second_series:
        common_months, xs_years = _common_months_and_axis([fetched_a["series"]])
        if len(common_months) < 12:
            raise ContractSemanticError(
                "INVALID_DATE_INTERSECTION",
                f"Menos de 12 meses válidos para '{var_a}' em [{start_date}, {end_date}].",
            )
        block_a, _, _ = build_variable_statistics(
            region_a_id, fetched_a, common_months, xs_years, requested_var_id=var_a
        )
        return {
            "request_meta": {
                "variable_a": var_a,
                "variable_b": None,
                "region_a_id": region_a_id,
                "region_b_id": None,
                "cells_count_a": cells_count_a,
                "cells_count_b": 0,
                "spatial_aggregation": "nanmean",
                "source": "backend_api",
            },
            "region_a_analysis": block_a,
            "region_b_analysis": None,
            "comparison_pair": None,
        }

    second_req_var = var_b or var_a
    backend_var_b = _FRONTEND_VAR_TO_BACKEND.get(second_req_var, second_req_var)
    if raw_region_b is not None:
        region_b_id: str | None
        region_b_id, cells_count_b, query_b = _parse_contract_region(
            raw_region_b, "region_b", backend_var_b
        )
        pair_region_b_id = region_b_id
    else:
        # Mesma Região A com 2 variáveis distintas (var_a vs var_b)
        region_b_id = None
        cells_count_b = 0
        pair_region_b_id = region_a_id
        query_b = LocationQuery(
            name=region_a_id,
            cells=query_a.cells,
            variable=backend_var_b,
            station_id=query_a.station_id,
        )

    fetched_b = _fetch_contract_series(
        query_b, second_req_var, start_date, end_date, start_year, end_year,
        cache=cache_store, label="Analyze Region B",
    )

    common_months, xs_years = _common_months_and_axis([fetched_a["series"], fetched_b["series"]])
    if len(common_months) < 12:
        raise ContractSemanticError(
            "INVALID_DATE_INTERSECTION",
            f"Interseção comum insuficiente ({len(common_months)} meses) entre '{var_a}' e '{second_req_var}'.",
        )

    block_a, anom_a, res_a = build_variable_statistics(
        region_a_id, fetched_a, common_months, xs_years, requested_var_id=var_a
    )
    block_b, anom_b, res_b = build_variable_statistics(
        pair_region_b_id, fetched_b, common_months, xs_years, requested_var_id=second_req_var
    )
    _apply_joint_fdr([block_a, block_b])

    pair = _compute_pair_comparison(
        region_a_id,
        block_a,
        anom_a,
        res_a,
        pair_region_b_id,
        block_b,
        anom_b,
        res_b,
        region_a_id=region_a_id,
        region_b_id=pair_region_b_id,
    )

    return {
        "request_meta": {
            "variable_a": var_a,
            "variable_b": var_b,
            "region_a_id": region_a_id,
            "region_b_id": region_b_id,
            "cells_count_a": cells_count_a,
            "cells_count_b": cells_count_b,
            "spatial_aggregation": "nanmean",
            "source": "backend_api",
        },
        "region_a_analysis": block_a,
        "region_b_analysis": block_b,
        "comparison_pair": pair,
    }
