"""Official catalog of the 7 Environmental Families and their variables."""

from .environmental_catalog import (
    ENVIRONMENTAL_FAMILIES,
    EnvironmentalFamily,
    VariableSpec,
    get_catalog_tree,
    get_variable_spec,
    list_variables_by_family,
)

__all__ = [
    "ENVIRONMENTAL_FAMILIES",
    "EnvironmentalFamily",
    "VariableSpec",
    "get_catalog_tree",
    "get_variable_spec",
    "list_variables_by_family",
]
