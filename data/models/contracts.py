"""Input and output contracts for the data backend."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

DEFAULT_MAX_CELLS_PER_REGION = 25


def get_max_cells_per_region() -> int:
    """Reads the maximum cells per region from `MAX_CELLS_PER_REGION` (default 25)."""
    raw = os.environ.get("MAX_CELLS_PER_REGION", "").strip()
    if not raw:
        return DEFAULT_MAX_CELLS_PER_REGION
    try:
        value = int(raw)
        return value if value >= 1 else DEFAULT_MAX_CELLS_PER_REGION
    except ValueError:
        return DEFAULT_MAX_CELLS_PER_REGION


MAX_CELLS_PER_REGION = get_max_cells_per_region()


@dataclass(frozen=True)
class CellCoord:
    """Geographic coordinate of a cell selected on the map."""

    lat: float
    lon: float

    def to_dict(self) -> dict[str, float]:
        return {"lat": float(self.lat), "lon": float(self.lon)}


@dataclass
class LocationQuery:
    """Selection of a location (A or B) with 1 to N adjacent cells and 1 or N variables.

    - Current (MVP): provide `variable="T2M"` (1 variable per location).
    - Future (expansion): provide `variables=["T2M", "PRECTOTCORR"]` (multiple variables at the same location).
    """

    name: str
    cells: list[CellCoord]
    variable: str | None = None
    variables: list[str] | None = None
    station_id: str | None = None

    def __post_init__(self) -> None:
        max_cells = get_max_cells_per_region()
        if not (1 <= len(self.cells) <= max_cells):
            raise ValueError(
                f"Location '{self.name}' must have between 1 and {max_cells} adjacent cells."
            )
        self.get_variables()  # validate immediately on creation

    def get_variables(self) -> list[str]:
        """Normalizes access to always return a non-empty deduplicated list."""
        raw: list[str] = []
        if self.variable:
            raw.append(self.variable)
        if self.variables:
            raw.extend(self.variables)
        unique: list[str] = []
        seen: set[str] = set()
        for code in raw:
            clean = code.strip()
            if clean and clean not in seen:
                seen.add(clean)
                unique.append(clean)
        if not unique:
            raise ValueError(
                f"Location '{self.name}' must define 'variable' (1 variable) or 'variables' (list)."
            )
        return unique

    @classmethod
    def from_dict(cls, payload: dict[str, Any], *, default_name: str = "Location") -> LocationQuery:
        """Builds `LocationQuery` from JSON received via REST API or script."""
        raw_cells = payload.get("cells") or []
        cells = [
            CellCoord(lat=float(item["lat"]), lon=float(item["lon"]))
            for item in raw_cells
        ]
        return cls(
            name=str(payload.get("name") or default_name),
            cells=cells,
            variable=payload.get("variable"),
            variables=payload.get("variables"),
            station_id=payload.get("station_id"),
        )
