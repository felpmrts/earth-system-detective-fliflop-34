"""JSON cache storage per cell, variable, and time window."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


class CellCacheStore:
    """Lightweight disk cache (JSON) to avoid repeated HTTP calls to APIs."""

    def __init__(self, cache_dir: Path | None = None) -> None:
        self.cache_dir = cache_dir or (Path(__file__).resolve().parent / "storage")
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _build_key(
        connector_id: str,
        variable: str,
        lat: float,
        lon: float,
        start_year: int,
        end_year: int,
        extra: str = "",
    ) -> str:
        raw = f"{connector_id}|{variable}|{lat:.4f}|{lon:.4f}|{start_year}|{end_year}|{extra}"
        digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:12]
        safe_var = "".join(ch if ch.isalnum() or ch in ("_", "-") else "_" for ch in variable)
        return f"{connector_id}__{safe_var}__{lat:.2f}_{lon:.2f}__{start_year}_{end_year}__{digest}.json"

    def get(
        self,
        connector_id: str,
        variable: str,
        lat: float,
        lon: float,
        start_year: int,
        end_year: int,
        extra: str = "",
    ) -> dict[str, Any] | None:
        """Reads the cached entry if it exists; returns None on cache miss."""
        path = self.cache_dir / self._build_key(
            connector_id, variable, lat, lon, start_year, end_year, extra
        )
        if not path.is_file():
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None

    def set(
        self,
        connector_id: str,
        variable: str,
        lat: float,
        lon: float,
        start_year: int,
        end_year: int,
        payload: dict[str, Any],
        extra: str = "",
    ) -> Path:
        """Persists a clean entry in the disk cache."""
        path = self.cache_dir / self._build_key(
            connector_id, variable, lat, lon, start_year, end_year, extra
        )
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return path
