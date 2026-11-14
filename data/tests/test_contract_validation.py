from __future__ import annotations

import math
import unittest
from typing import Any
from unittest.mock import patch

from data.catalog.environmental_catalog import get_variable_spec
from data.services.comparison_service import (
    ContractSemanticError,
    _parse_contract_region,
    analyze_regions_contract,
)


def merra_region(cells: list[dict[str, object]]) -> dict[str, object]:
    return {
        "slot": "A",
        "region_id": "test-region",
        "source_model": "MERRA-2",
        "grid_resolution": {"dLat": 0.5, "dLon": 0.625},
        "cells": cells,
    }


def merra_cell(row: int, col: int) -> dict[str, object]:
    return {
        "cell_id": f"r{row}_c{col}",
        "row": row,
        "col": col,
        "lat": row * 0.5,
        "lon": col * 0.625,
    }


def ceres_region(cells: list[dict[str, object]], slot: str = "B") -> dict[str, object]:
    return {
        "slot": slot,
        "region_id": "test-ceres-region",
        "source_model": "CERES_SYN1deg",
        "grid_resolution": {"dLat": 1.0, "dLon": 1.0},
        "cells": cells,
    }


def ceres_cell(row: int, col: int) -> dict[str, object]:
    return {
        "cell_id": f"r{row}_c{col}",
        "row": row,
        "col": col,
        "lat": row + 0.5,
        "lon": col + 0.5,
    }


def _monthly_series(start_year: int, end_year: int, base: float, slope_per_year: float) -> dict[str, float]:
    series: dict[str, float] = {}
    for year in range(start_year, end_year + 1):
        for month in range(1, 13):
            seasonal = 1.8 * math.sin((2.0 * math.pi * (month - 1)) / 12.0)
            series[f"{year}-{month:02d}"] = round(base + slope_per_year * (year - start_year) + seasonal, 4)
    return series


def _assert_all_numbers_finite(node: Any, path: str = "root") -> None:
    if isinstance(node, bool):
        return
    if isinstance(node, (int, float)):
        if not math.isfinite(float(node)):
            raise AssertionError(f"Valor não finito em {path}: {node!r}")
    elif isinstance(node, dict):
        for key, value in node.items():
            _assert_all_numbers_finite(value, f"{path}.{key}")
    elif isinstance(node, (list, tuple)):
        for idx, value in enumerate(node):
            _assert_all_numbers_finite(value, f"{path}[{idx}]")


class ContractRegionValidationTests(unittest.TestCase):
    def test_accepts_connected_native_cells(self) -> None:
        region_id, count, query = _parse_contract_region(
            merra_region([merra_cell(-20, -80), merra_cell(-20, -79)]),
            "region_a",
            "T2M",
        )
        self.assertEqual(region_id, "test-region")
        self.assertEqual(count, 2)
        self.assertEqual(len(query.cells), 2)

    def test_rejects_disconnected_cells(self) -> None:
        with self.assertRaisesRegex(ContractSemanticError, "região conexa"):
            _parse_contract_region(
                merra_region([merra_cell(-20, -80), merra_cell(-20, -75)]),
                "region_a",
                "T2M",
            )

    def test_rejects_duplicate_cells(self) -> None:
        cell = merra_cell(-20, -80)
        with self.assertRaisesRegex(ContractSemanticError, "duplicada"):
            _parse_contract_region(merra_region([cell, dict(cell)]), "region_a", "T2M")

    def test_rejects_wrong_grid_metadata(self) -> None:
        region = merra_region([merra_cell(-20, -80)])
        region["grid_resolution"] = {"dLat": 1.0, "dLon": 1.0}
        with self.assertRaisesRegex(ContractSemanticError, "grid_resolution"):
            _parse_contract_region(region, "region_a", "T2M")


class CatalogInvariantTests(unittest.TestCase):
    def test_surface_pressure_is_interval_scale(self) -> None:
        ps = get_variable_spec("PS")
        self.assertEqual(ps.scale_type, "interval")
        self.assertFalse(ps.allow_percentage_change)

    def test_trend_unit_has_no_extra_spaces(self) -> None:
        series_t2m = _monthly_series(1984, 2023, 25.0, 0.03)
        series_ps = _monthly_series(1984, 2023, 100.5, 0.005)
        with patch("data.services.comparison_service.fetch_location_single_variable") as mock_fetch:
            mock_fetch.side_effect = [
                {
                    "status": "OK",
                    "api_puxada": "NASA POWER",
                    "endpoint_consultado": "https://power.larc.nasa.gov/api/temporal/monthly/point",
                    "family_id": "temperatura",
                    "variable": "T2M",
                    "ui_name": "Temperatura Média do Ar a 2m",
                    "unit": "°C",
                    "scale_type": "interval",
                    "allow_percentage_change": False,
                    "snapped_cells": [],
                    "series": series_t2m,
                },
                {
                    "status": "OK",
                    "api_puxada": "NASA POWER",
                    "endpoint_consultado": "https://power.larc.nasa.gov/api/temporal/monthly/point",
                    "family_id": "dinamica",
                    "variable": "PS",
                    "ui_name": "Pressão de Superfície",
                    "unit": "kPa",
                    "scale_type": "interval",
                    "allow_percentage_change": False,
                    "snapped_cells": [],
                    "series": series_ps,
                },
            ]
            result = analyze_regions_contract(
                {
                    "variable_a": "T2M",
                    "variable_b": "PS",
                    "region_a": merra_region([merra_cell(-6, -96)]),
                    "region_b": merra_region([merra_cell(-19, -65)]),
                    "start_date": "1984-01",
                    "end_date": "2023-12",
                }
            )
        self.assertEqual(result["region_a_analysis"]["trend_unit"], "°C/década")
        self.assertEqual(result["region_b_analysis"]["trend_unit"], "kPa/década")
        self.assertNotIn(" / ", result["region_a_analysis"]["trend_unit"])
        self.assertFalse(result["region_b_analysis"]["allow_percentage_change"])

    def test_merra2_1981_vs_ceres_1984_trimming_and_zero_nan(self) -> None:
        merra_series = _monthly_series(1981, 2023, 26.2, 0.035)
        ceres_sw_series = _monthly_series(1984, 2023, 18.4, 0.04)
        ceres_cldtot_series = _monthly_series(1984, 2023, 55.0, -0.18)

        for ceres_var, ceres_series, expected_trend_unit in (
            ("ALLSKY_SFC_SW_DWN", ceres_sw_series, "MJ/m²/dia/década"),
            ("CLDTOT", ceres_cldtot_series, "p.p./década"),
        ):
            backend_var = "CLOUD_AMT" if ceres_var == "CLDTOT" else ceres_var
            spec_ceres = get_variable_spec(backend_var)
            with patch("data.services.comparison_service.fetch_location_single_variable") as mock_fetch:
                mock_fetch.side_effect = [
                    {
                        "status": "OK",
                        "api_puxada": "NASA POWER",
                        "endpoint_consultado": "https://power.larc.nasa.gov/api/temporal/monthly/point",
                        "family_id": "temperatura",
                        "variable": "T2M",
                        "ui_name": "Temperatura Média do Ar a 2m",
                        "unit": "°C",
                        "scale_type": "interval",
                        "allow_percentage_change": False,
                        "snapped_cells": [],
                        "series": merra_series,
                    },
                    {
                        "status": "OK",
                        "api_puxada": "NASA POWER",
                        "endpoint_consultado": "https://power.larc.nasa.gov/api/temporal/monthly/point",
                        "family_id": spec_ceres.family_id,
                        "variable": backend_var,
                        "ui_name": spec_ceres.ui_name,
                        "unit": spec_ceres.unit,
                        "scale_type": spec_ceres.scale_type,
                        "allow_percentage_change": spec_ceres.allow_percentage_change,
                        "snapped_cells": [],
                        "series": ceres_series,
                    },
                ]
                result = analyze_regions_contract(
                    {
                        "variable_a": "T2M",
                        "variable_b": ceres_var,
                        "region_a": merra_region([merra_cell(-6, -96)]),
                        "region_b": ceres_region([ceres_cell(-4, -61)]),
                        "start_date": "1981-01",
                        "end_date": "2023-12",
                    }
                )

            _assert_all_numbers_finite(result)
            reg_a = result["region_a_analysis"]
            reg_b = result["region_b_analysis"]
            self.assertEqual(reg_a["period"]["start"], "1984-01")
            self.assertEqual(reg_b["period"]["start"], "1984-01")
            self.assertEqual(reg_a["period"]["end"], "2023-12")
            self.assertEqual(reg_a["period"]["n_observations"], 480)
            self.assertEqual(reg_b["period"]["n_observations"], 480)
            self.assertEqual(reg_b["trend_unit"], expected_trend_unit)
            self.assertEqual(len(reg_a["series"]["dates"]), 480)
            self.assertEqual(len(reg_b["series"]["dates"]), 480)


if __name__ == "__main__":
    unittest.main()
