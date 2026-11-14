"""Conectores individuais para as 5 APIs do Earth System Trend Detective."""

from . import nasa_appeears, nasa_giovanni, nasa_power, noaa_cdo, open_meteo_flood

__all__ = [
    "nasa_appeears",
    "nasa_giovanni",
    "nasa_power",
    "noaa_cdo",
    "open_meteo_flood",
]
