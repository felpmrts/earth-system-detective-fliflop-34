"""Structured catalog of the 7 Environmental Families and 42 variable codes.

Normative source: `context/knowledge_data/environmental_family.md`.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass(frozen=True)
class EnvironmentalFamily:
    """Represents a thematic environmental investigation family in the UI."""

    family_id: str
    order: int
    name: str
    investigation_focus: str


BOUNDED_NON_PERCENT_VARIABLES: frozenset[str] = frozenset(
    {"GWETTOP", "GWETROOT", "GWETPROF", "RH2M", "CLOUD_AMT", "CLDTOT", "ALLSKY_SRF_ALB"}
)


@dataclass(frozen=True)
class VariableSpec:
    """Operational, physical, and routing metadata for an environmental variable."""

    code: str
    family_id: str
    ui_name: str
    connector_id: str  # nasa_power | open_meteo_flood | noaa_cdo | nasa_appeears | nasa_giovanni
    source_label: str
    mode: str  # realtime | queue_cache | validation_demo
    unit: str
    raw_unit: str
    scale_type: str  # interval | ratio
    description: str
    grid_type: str = "merra2"  # merra2 | ceres | point | station | modis | gldas
    product_id: str | None = None
    extra_note: str | None = None

    @property
    def allow_percentage_change(self) -> bool:
        """Interval variables (e.g., °C, NDVI) and bounded scales (0–1 / %) forbid % changes."""
        return self.scale_type == "ratio" and self.code not in BOUNDED_NON_PERCENT_VARIABLES

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["allow_percentage_change"] = self.allow_percentage_change
        return payload


ENVIRONMENTAL_FAMILIES: tuple[EnvironmentalFamily, ...] = (
    EnvironmentalFamily(
        family_id="temperatura_calor",
        order=1,
        name="Temperature & Heat (Atmosphere and Surface)",
        investigation_focus="Global warming, heatwaves, urban heat islands, and diurnal temperature range shifts.",
    ),
    EnvironmentalFamily(
        family_id="chuva_umidade",
        order=2,
        name="Precipitation & Atmospheric Moisture",
        investigation_focus="Shifts in rainfall regimes, meteorological droughts, storms, and atmospheric aridity.",
    ),
    EnvironmentalFamily(
        family_id="solo_seca_evapotranspiracao",
        order=3,
        name="Soil, Agricultural Drought & Evapotranspiration",
        investigation_focus="Desertification, water availability for crops/forests, and root-zone water stress.",
    ),
    EnvironmentalFamily(
        family_id="rios_vazao_bacias",
        order=4,
        name="Rivers, Discharge & Watersheds",
        investigation_focus="Severe floods, long-term river volume decline, and impacts of dams/land use.",
    ),
    EnvironmentalFamily(
        family_id="vegetacao_florestas_uso_terra",
        order=5,
        name="Vegetation, Forests & Land Use",
        investigation_focus="Deforestation, forest regeneration, wildfire impacts, and biomass vigor.",
    ),
    EnvironmentalFamily(
        family_id="radiacao_nuvens_ventos",
        order=6,
        name="Solar Radiation, Clouds, Winds & Atmosphere",
        investigation_focus="Solar/wind energy potential, cloudiness, wind circulation, and aerosol/smoke pollution.",
    ),
    EnvironmentalFamily(
        family_id="estacoes_meteorologicas_solo",
        order=7,
        name="Ground Weather Stations (Local Validation)",
        investigation_focus="Benchmarking satellite and global model estimates against physical ground-station measurements.",
    ),
)

_VARIABLES: tuple[VariableSpec, ...] = (
    # Family 1 — Temperature & Heat
    VariableSpec(
        code="T2M",
        family_id="temperatura_calor",
        ui_name="2m Mean Air Temperature",
        connector_id="nasa_power",
        source_label="NASA POWER (MERRA-2)",
        mode="realtime",
        unit="°C",
        raw_unit="C",
        scale_type="interval",
        description="Mean air temperature at human height (2 meters). Primary climate warming indicator.",
    ),
    VariableSpec(
        code="T2M_MAX",
        family_id="temperatura_calor",
        ui_name="2m Maximum Air Temperature",
        connector_id="nasa_power",
        source_label="NASA POWER (MERRA-2)",
        mode="realtime",
        unit="°C",
        raw_unit="C",
        scale_type="interval",
        description="Extreme heat peaks recorded in each month.",
    ),
    VariableSpec(
        code="T2M_MIN",
        family_id="temperatura_calor",
        ui_name="2m Minimum Air Temperature",
        connector_id="nasa_power",
        source_label="NASA POWER (MERRA-2)",
        mode="realtime",
        unit="°C",
        raw_unit="C",
        scale_type="interval",
        description="Coolest overnight temperatures; rapid rises indicate nocturnal heat retention.",
    ),
    VariableSpec(
        code="T2M_RANGE",
        family_id="temperatura_calor",
        ui_name="Diurnal Temperature Range",
        connector_id="nasa_power",
        source_label="NASA POWER (MERRA-2)",
        mode="realtime",
        unit="°C",
        raw_unit="C",
        scale_type="interval",
        description="Difference between daily maximum and minimum temperature. Abrupt shifts affect crops and ecosystems.",
    ),
    VariableSpec(
        code="TS",
        family_id="temperatura_calor",
        ui_name="Surface Skin Temperature (Land/Ground)",
        connector_id="nasa_power",
        source_label="NASA POWER (MERRA-2)",
        mode="realtime",
        unit="°C",
        raw_unit="C",
        scale_type="interval",
        description='Temperature of the Earth\'s "skin" (asphalt, bare soil, forest canopy).',
    ),
    VariableSpec(
        code="LST_Day_CMG",
        family_id="temperatura_calor",
        ui_name="Daytime Land Surface Temp. (Satellite)",
        connector_id="nasa_appeears",
        source_label="AppEEARS (MODIS)",
        mode="queue_cache",
        unit="°C",
        raw_unit="K",
        scale_type="interval",
        grid_type="modis",
        product_id="MOD11C3.061",
        description="High-resolution (5 km) daytime thermal measurement. Ideal for detecting urban heat islands.",
    ),
    VariableSpec(
        code="LST_Night_CMG",
        family_id="temperatura_calor",
        ui_name="Nighttime Land Surface Temp. (Satellite)",
        connector_id="nasa_appeears",
        source_label="AppEEARS (MODIS)",
        mode="queue_cache",
        unit="°C",
        raw_unit="K",
        scale_type="interval",
        grid_type="modis",
        product_id="MOD11C3.061",
        description="Nighttime satellite thermal measurement; shows how slowly land or cities cool at night.",
    ),
    VariableSpec(
        code="T2MDEW",
        family_id="temperatura_calor",
        ui_name="2m Dew Point Temperature",
        connector_id="nasa_power",
        source_label="NASA POWER (MERRA-2)",
        mode="realtime",
        unit="°C",
        raw_unit="C",
        scale_type="interval",
        description="Temperature at which water vapor condenses; linked to mugginess and fog formation.",
    ),
    # Family 2 — Precipitation & Atmospheric Moisture
    VariableSpec(
        code="PRECTOTCORR",
        family_id="chuva_umidade",
        ui_name="Bias-Corrected Total Precipitation",
        connector_id="nasa_power",
        source_label="NASA POWER (GPM/MERRA-2)",
        mode="realtime",
        unit="mm/month",
        raw_unit="mm/day",
        scale_type="ratio",
        description="Rainfall volume combining satellite and rain gauges. Shows whether a region is getting wetter or drier.",
        extra_note="Converted from mm/day to mm/month by multiplying by actual days in each month.",
    ),
    VariableSpec(
        code="GPM_3IMERGM",
        family_id="chuva_umidade",
        ui_name="Satellite Precipitation (High Res.)",
        connector_id="nasa_giovanni",
        source_label="Giovanni (IMERG V07)",
        mode="validation_demo",
        unit="mm/month",
        raw_unit="mm/month",
        scale_type="ratio",
        grid_type="gldas",
        product_id="GPM_3IMERGM",
        description="Fine grid (0.1°) from the GPM satellite. Ideal for validating regional precipitation trends.",
    ),
    VariableSpec(
        code="RH2M",
        family_id="chuva_umidade",
        ui_name="2m Relative Humidity",
        connector_id="nasa_power",
        source_label="NASA POWER (MERRA-2)",
        mode="realtime",
        unit="%",
        raw_unit="%",
        scale_type="ratio",
        description="Percentage of water vapor saturation in air. Persistent multidecadal declines indicate aridification.",
    ),
    VariableSpec(
        code="QV2M",
        family_id="chuva_umidade",
        ui_name="2m Specific Humidity",
        connector_id="nasa_power",
        source_label="NASA POWER (MERRA-2)",
        mode="realtime",
        unit="g/kg",
        raw_unit="g/kg",
        scale_type="ratio",
        description="Actual mass of water vapor present in air (independent of temperature variations).",
    ),
    VariableSpec(
        code="TQV",
        family_id="chuva_umidade",
        ui_name="Total Precipitable Water",
        connector_id="nasa_power",
        source_label="NASA POWER / Giovanni",
        mode="realtime",
        unit="kg/m² (mm)",
        raw_unit="kg/m^2",
        scale_type="ratio",
        description="Total water vapor in the atmospheric column; indicates potential for heavy rainfall.",
    ),
    # Family 3 — Soil, Agricultural Drought & Evapotranspiration
    VariableSpec(
        code="GWETTOP",
        family_id="solo_seca_evapotranspiracao",
        ui_name="Surface Soil Moisture (0–5 cm)",
        connector_id="nasa_power",
        source_label="NASA POWER (MERRA-2 Land)",
        mode="realtime",
        unit="fraction (0–1)",
        raw_unit="1",
        scale_type="ratio",
        description="Water saturation degree in the top 5 cm of soil (0 = completely dry, 1 = saturated soil).",
        extra_note="Returns -999 over ocean; handled as NaN.",
    ),
    VariableSpec(
        code="GWETROOT",
        family_id="solo_seca_evapotranspiracao",
        ui_name="Root-Zone Soil Moisture (0–100 cm)",
        connector_id="nasa_power",
        source_label="NASA POWER (MERRA-2 Land)",
        mode="realtime",
        unit="fraction (0–1)",
        raw_unit="1",
        scale_type="ratio",
        description="Available water down to ~1 meter depth, where plant and crop roots absorb moisture.",
        extra_note="Returns -999 over ocean; handled as NaN.",
    ),
    VariableSpec(
        code="GWETPROF",
        family_id="solo_seca_evapotranspiracao",
        ui_name="Deep Profile Soil Moisture",
        connector_id="nasa_power",
        source_label="NASA POWER (MERRA-2 Land)",
        mode="realtime",
        unit="fraction (0–1)",
        raw_unit="1",
        scale_type="ratio",
        description="Total water storage across the soil profile down to the shallow water table.",
        extra_note="Returns -999 over ocean; handled as NaN.",
    ),
    VariableSpec(
        code="Evap_tavg",
        family_id="solo_seca_evapotranspiracao",
        ui_name="Total Evapotranspiration",
        connector_id="nasa_giovanni",
        source_label="Giovanni / GLDAS_NOAH",
        mode="validation_demo",
        unit="mm/day",
        raw_unit="kg m-2 s-1",
        scale_type="ratio",
        grid_type="gldas",
        product_id="GLDAS_NOAH025_M",
        description="Sum of soil evaporation + plant transpiration. If it rises while rainfall drops, drought accelerates.",
    ),
    VariableSpec(
        code="Qs_acc",
        family_id="solo_seca_evapotranspiracao",
        ui_name="Surface Runoff",
        connector_id="nasa_giovanni",
        source_label="Giovanni / GLDAS_NOAH",
        mode="validation_demo",
        unit="kg/m²",
        raw_unit="kg/m^2",
        scale_type="ratio",
        grid_type="gldas",
        product_id="GLDAS_NOAH025_M",
        description="Rainwater that fails to infiltrate soil and runs off into rivers (increases with paving and deforestation).",
    ),
    # Family 4 — Rivers, Discharge & Watersheds
    VariableSpec(
        code="river_discharge",
        family_id="rios_vazao_bacias",
        ui_name="River Discharge (Historical Series)",
        connector_id="open_meteo_flood",
        source_label="Open-Meteo Flood (GloFAS)",
        mode="realtime",
        unit="m³/s",
        raw_unit="m³/s",
        scale_type="ratio",
        grid_type="point",
        description="Volume of water flowing through the river channel per second. Detects multidecadal river volume loss.",
    ),
    VariableSpec(
        code="river_discharge_mean",
        family_id="rios_vazao_bacias",
        ui_name="Mean River Discharge",
        connector_id="open_meteo_flood",
        source_label="Open-Meteo Flood (GloFAS)",
        mode="realtime",
        unit="m³/s",
        raw_unit="m³/s",
        scale_type="ratio",
        grid_type="point",
        description="Mean river flow behavior for comparing normal years against extreme years.",
    ),
    VariableSpec(
        code="river_discharge_max",
        family_id="rios_vazao_bacias",
        ui_name="Peak Flood Discharge",
        connector_id="open_meteo_flood",
        source_label="Open-Meteo Flood (GloFAS)",
        mode="realtime",
        unit="m³/s",
        raw_unit="m³/s",
        scale_type="ratio",
        grid_type="point",
        description="Evaluates whether extreme floods and peak flows are growing larger each decade.",
    ),
    VariableSpec(
        code="river_discharge_min",
        family_id="rios_vazao_bacias",
        ui_name="Critical Minimum Discharge (Low Flow)",
        connector_id="open_meteo_flood",
        source_label="Open-Meteo Flood (GloFAS)",
        mode="realtime",
        unit="m³/s",
        raw_unit="m³/s",
        scale_type="ratio",
        grid_type="point",
        description="Measures the lowest critical level a river reaches in the dry season (essential for water supply and hydropower).",
    ),
    # Family 5 — Vegetation, Forests & Land Use
    VariableSpec(
        code="_1_km_monthly_NDVI",
        family_id="vegetacao_florestas_uso_terra",
        ui_name="Vegetation Index (NDVI)",
        connector_id="nasa_appeears",
        source_label="AppEEARS / Giovanni (MOD13A3)",
        mode="queue_cache",
        unit="Index (-1 to +1)",
        raw_unit="NDVI",
        scale_type="interval",
        grid_type="modis",
        product_id="MOD13A3.061",
        description="Measures greenness and leaf density. Significant declines indicate deforestation or degradation.",
    ),
    VariableSpec(
        code="_1_km_monthly_EVI",
        family_id="vegetacao_florestas_uso_terra",
        ui_name="Enhanced Vegetation Index (EVI)",
        connector_id="nasa_appeears",
        source_label="AppEEARS (MOD13A3)",
        mode="queue_cache",
        unit="Index (-1 to +1)",
        raw_unit="EVI",
        scale_type="interval",
        grid_type="modis",
        product_id="MOD13A3.061",
        description="Similar to NDVI, but does not saturate over very dense forests (ideal for monitoring the Amazon and Atlantic Forest).",
    ),
    VariableSpec(
        code="Lai_500m",
        family_id="vegetacao_florestas_uso_terra",
        ui_name="Leaf Area Index (LAI)",
        connector_id="nasa_appeears",
        source_label="AppEEARS (MOD15A2H)",
        mode="queue_cache",
        unit="m²/m²",
        raw_unit="m²/m²",
        scale_type="ratio",
        grid_type="modis",
        product_id="MOD15A2H.061",
        description="Number of leaf layers above the ground; measures structural density of forests or crops.",
    ),
    VariableSpec(
        code="ALLSKY_SRF_ALB",
        family_id="vegetacao_florestas_uso_terra",
        ui_name="Surface Albedo",
        connector_id="nasa_power",
        source_label="NASA POWER (CERES)",
        mode="realtime",
        unit="fraction (0–1)",
        raw_unit="1",
        scale_type="ratio",
        grid_type="ceres",
        description="Fraction of sunlight reflected by the surface. Albedo shifts when forest becomes pasture/urban or when ice melts.",
    ),
    # Family 6 — Solar Radiation, Clouds, Winds & Atmosphere
    VariableSpec(
        code="ALLSKY_SFC_SW_DWN",
        family_id="radiacao_nuvens_ventos",
        ui_name="Downward Shortwave Solar Irradiance",
        connector_id="nasa_power",
        source_label="NASA POWER (CERES)",
        mode="realtime",
        unit="MJ/m²/day",
        raw_unit="MJ/m^2/day",
        scale_type="ratio",
        grid_type="ceres",
        description="Solar energy reaching the ground (including cloud effects). Essential for agriculture and solar power.",
    ),
    VariableSpec(
        code="CLRSKY_SFC_SW_DWN",
        family_id="radiacao_nuvens_ventos",
        ui_name="Clear-Sky Solar Irradiance",
        connector_id="nasa_power",
        source_label="NASA POWER (CERES)",
        mode="realtime",
        unit="MJ/m²/day",
        raw_unit="MJ/m^2/day",
        scale_type="ratio",
        grid_type="ceres",
        description="Solar radiation without cloud interference; declines indicate smoke or atmospheric aerosol pollution.",
    ),
    VariableSpec(
        code="ALLSKY_SFC_LW_DWN",
        family_id="radiacao_nuvens_ventos",
        ui_name="Downward Longwave Thermal Irradiance",
        connector_id="nasa_power",
        source_label="NASA POWER (CERES)",
        mode="realtime",
        unit="MJ/m²/day",
        raw_unit="MJ/m^2/day",
        scale_type="ratio",
        grid_type="ceres",
        description="Thermal radiation emitted by the atmosphere back toward the ground (linked to heat retention and greenhouse effect).",
    ),
    VariableSpec(
        code="CLOUD_AMT",
        family_id="radiacao_nuvens_ventos",
        ui_name="Cloud Cover",
        connector_id="nasa_power",
        source_label="NASA POWER (CERES)",
        mode="realtime",
        unit="%",
        raw_unit="%",
        scale_type="ratio",
        grid_type="ceres",
        description="Average percentage of sky covered by clouds across months and decades.",
    ),
    VariableSpec(
        code="WS2M",
        family_id="radiacao_nuvens_ventos",
        ui_name="2m Wind Speed",
        connector_id="nasa_power",
        source_label="NASA POWER (MERRA-2)",
        mode="realtime",
        unit="m/s",
        raw_unit="m/s",
        scale_type="ratio",
        description="Mean wind speed near the ground (2m; affects evaporation and thermal comfort).",
    ),
    VariableSpec(
        code="WS10M",
        family_id="radiacao_nuvens_ventos",
        ui_name="10m Wind Speed",
        connector_id="nasa_power",
        source_label="NASA POWER (MERRA-2)",
        mode="realtime",
        unit="m/s",
        raw_unit="m/s",
        scale_type="ratio",
        description="Mean wind speed at the standard meteorological height (10m).",
    ),
    VariableSpec(
        code="WS50M",
        family_id="radiacao_nuvens_ventos",
        ui_name="Turbine-Height Wind Speed (50m)",
        connector_id="nasa_power",
        source_label="NASA POWER (MERRA-2)",
        mode="realtime",
        unit="m/s",
        raw_unit="m/s",
        scale_type="ratio",
        description="Wind at wind-turbine height; reveals whether wind energy potential is shifting in the region.",
    ),
    VariableSpec(
        code="PS",
        family_id="radiacao_nuvens_ventos",
        ui_name="Surface Atmospheric Pressure",
        connector_id="nasa_power",
        source_label="NASA POWER (MERRA-2)",
        mode="realtime",
        unit="kPa",
        raw_unit="kPa",
        scale_type="interval",
        description="Weight of the air column; long-term trends indicate shifts in high/low pressure systems.",
    ),
    VariableSpec(
        code="AOD_550",
        family_id="radiacao_nuvens_ventos",
        ui_name="Aerosol Optical Depth (Smoke)",
        connector_id="nasa_giovanni",
        source_label="Giovanni (MODIS MOD08_M3)",
        mode="validation_demo",
        unit="Dimensionless",
        raw_unit="1",
        scale_type="ratio",
        grid_type="gldas",
        product_id="MOD08_M3",
        description="Measures suspended airborne particles (wildfire smoke plumes, desert dust, and urban pollution).",
    ),
    # Family 7 — Ground Weather Stations (NOAA CDO)
    VariableSpec(
        code="PRCP",
        family_id="estacoes_meteorologicas_solo",
        ui_name="Station Precipitation (Rain Gauge)",
        connector_id="noaa_cdo",
        source_label="NOAA CDO API v2 (GSOM)",
        mode="realtime",
        unit="mm",
        raw_unit="mm",
        scale_type="ratio",
        grid_type="station",
        description="Accumulated rainfall physically measured inside the local weather station rain gauge.",
    ),
    VariableSpec(
        code="TAVG",
        family_id="estacoes_meteorologicas_solo",
        ui_name="Station Mean Temperature",
        connector_id="noaa_cdo",
        source_label="NOAA CDO API v2 (GSOM)",
        mode="realtime",
        unit="°C",
        raw_unit="C",
        scale_type="interval",
        grid_type="station",
        description="Mean temperature recorded by the official physical thermometer at the ground station.",
    ),
    VariableSpec(
        code="TMAX",
        family_id="estacoes_meteorologicas_solo",
        ui_name="Station Maximum Temperature",
        connector_id="noaa_cdo",
        source_label="NOAA CDO API v2 (GSOM)",
        mode="realtime",
        unit="°C",
        raw_unit="C",
        scale_type="interval",
        grid_type="station",
        description="Maximum thermal extreme physically measured in the local weather shelter.",
    ),
    VariableSpec(
        code="TMIN",
        family_id="estacoes_meteorologicas_solo",
        ui_name="Station Minimum Temperature",
        connector_id="noaa_cdo",
        source_label="NOAA CDO API v2 (GSOM)",
        mode="realtime",
        unit="°C",
        raw_unit="C",
        scale_type="interval",
        grid_type="station",
        description="Minimum thermal extreme physically measured in the local weather shelter.",
    ),
    VariableSpec(
        code="SNOW",
        family_id="estacoes_meteorologicas_solo",
        ui_name="Snowfall (Station)",
        connector_id="noaa_cdo",
        source_label="NOAA CDO API v2 (GSOM)",
        mode="realtime",
        unit="mm",
        raw_unit="mm",
        scale_type="ratio",
        grid_type="station",
        description="Snowfall precipitation recorded at the ground weather station.",
    ),
    VariableSpec(
        code="SNWD",
        family_id="estacoes_meteorologicas_solo",
        ui_name="Snow Depth on Ground",
        connector_id="noaa_cdo",
        source_label="NOAA CDO API v2 (GSOM)",
        mode="realtime",
        unit="mm",
        raw_unit="mm",
        scale_type="ratio",
        grid_type="station",
        description="Accumulated snow depth on the ground (useful for investigating snowmelt in mountain ranges/cold regions).",
    ),
    VariableSpec(
        code="AWND",
        family_id="estacoes_meteorologicas_solo",
        ui_name="Mean Wind Speed (Ground)",
        connector_id="noaa_cdo",
        source_label="NOAA CDO API v2 (GSOM)",
        mode="realtime",
        unit="m/s",
        raw_unit="m/s",
        scale_type="ratio",
        grid_type="station",
        description="Mean wind speed measured directly by the station's physical anemometer.",
    ),
)

_VARIABLES_BY_CODE: dict[str, VariableSpec] = {spec.code: spec for spec in _VARIABLES}
_FAMILIES_BY_ID: dict[str, EnvironmentalFamily] = {fam.family_id: fam for fam in ENVIRONMENTAL_FAMILIES}


def get_variable_spec(code: str) -> VariableSpec:
    """Returns metadata for a catalog variable by its official API code."""
    if code not in _VARIABLES_BY_CODE:
        supported = ", ".join(sorted(_VARIABLES_BY_CODE))
        raise KeyError(f"Variable '{code}' not found in environmental catalog. Supported: {supported}")
    return _VARIABLES_BY_CODE[code]


def list_variables_by_family(family_id: str) -> list[VariableSpec]:
    """Lists all variables belonging to an Environmental Family."""
    if family_id not in _FAMILIES_BY_ID:
        supported = ", ".join(_FAMILIES_BY_ID)
        raise KeyError(f"Unknown family '{family_id}'. Options: {supported}")
    return [spec for spec in _VARIABLES if spec.family_id == family_id]


def get_catalog_tree() -> dict[str, Any]:
    """Returns the complete catalog organized as a 7-Family tree (ready for UI/API)."""
    families_payload = []
    for fam in sorted(ENVIRONMENTAL_FAMILIES, key=lambda item: item.order):
        fam_vars = [spec.to_dict() for spec in list_variables_by_family(fam.family_id)]
        families_payload.append({
            **asdict(fam),
            "variables_count": len(fam_vars),
            "variables": fam_vars,
        })
    return {
        "total_families": len(families_payload),
        "total_variables": len(_VARIABLES),
        "families": families_payload,
    }
