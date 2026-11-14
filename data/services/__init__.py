"""Camada de serviços (roteamento de ingestão e comparação estatística A/B)."""

from .comparison_service import (
    compare_locations_multi_variable,
    compare_locations_single_variable,
)
from .ingestion_service import (
    fetch_location_multiple_variables,
    fetch_location_single_variable,
)

__all__ = [
    "compare_locations_multi_variable",
    "compare_locations_single_variable",
    "fetch_location_multiple_variables",
    "fetch_location_single_variable",
]
