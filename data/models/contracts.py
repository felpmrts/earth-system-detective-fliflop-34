"""Contratos de entrada e saída do backend de dados."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

DEFAULT_MAX_CELLS_PER_REGION = 25


def get_max_cells_per_region() -> int:
    """Lê o teto de células por região de `MAX_CELLS_PER_REGION` (padrão 25)."""
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
    """Coordenada geográfica de uma célula selecionada no mapa."""

    lat: float
    lon: float

    def to_dict(self) -> dict[str, float]:
        return {"lat": float(self.lat), "lon": float(self.lon)}


@dataclass
class LocationQuery:
    """Seleção de um local (A ou B) com 1 a 9 células adjacentes e 1 ou N variáveis.

    - Hoje (MVP): informe `variable="T2M"` (1 variável por local).
    - Futuro (expansão): informe `variables=["T2M", "PRECTOTCORR"]` (várias variáveis no mesmo local).
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
                f"Local '{self.name}' deve possuir entre 1 e {max_cells} células adjacentes."
            )
        self.get_variables()  # valida imediatamente na criação

    def get_variables(self) -> list[str]:
        """Normaliza o acesso para sempre devolver uma lista não-vazia sem duplicatas."""
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
                f"Local '{self.name}' precisa definir 'variable' (1 variável) ou 'variables' (lista)."
            )
        return unique

    @classmethod
    def from_dict(cls, payload: dict[str, Any], *, default_name: str = "Local") -> LocationQuery:
        """Constrói `LocationQuery` a partir de um JSON recebido via API REST ou script."""
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
