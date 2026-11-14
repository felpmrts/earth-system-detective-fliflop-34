from __future__ import annotations

import unittest

from data.catalog.environmental_catalog import get_variable_spec
from data.services.comparison_service import ContractSemanticError, _parse_contract_region


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


if __name__ == "__main__":
    unittest.main()
