"""Catálogo oficial das 7 Famílias Ambientais e suas variáveis."""

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
