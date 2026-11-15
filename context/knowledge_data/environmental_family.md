# Catalog of Environmental Families and Variables — Earth System Trend Detective

> **Guide for Frontend and Backend:** This document organizes all available variables across the project's integrated APIs into intuitive **Environmental Families** for the user journey ("Data Detective").

---

## 🌡️ Family 1: Temperature and Heat (Atmosphere & Surface)
**Investigation Focus:** Global warming, heatwaves, urban heat islands, and changes in diurnal temperature range.

| UI Display Name | Code / Parameter | Source / API | Mode | Unit | Plain-Language Explanation for User |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Mean Air Temperature (2m)** | `T2M` | NASA POWER (MERRA-2) | ⚡ Real-Time | °C | Mean air temperature at human height (2 meters). Primary indicator of climate warming. |
| **Maximum Air Temperature (2m)** | `T2M_MAX` | NASA POWER (MERRA-2) | ⚡ Real-Time | °C | Extreme heat peaks recorded each month. |
| **Minimum Air Temperature (2m)** | `T2M_MIN` | NASA POWER (MERRA-2) | ⚡ Real-Time | °C | Coolest early-morning temperatures; rapid increases indicate nighttime heat retention. |
| **Diurnal Temperature Range** | `T2M_RANGE` | NASA POWER (MERRA-2) | ⚡ Real-Time | °C | Difference between daily high and low. Abrupt shifts affect crops and ecosystems. |
| **Surface Skin Temperature** | `TS` | NASA POWER (MERRA-2) | ⚡ Real-Time | °C | Temperature of Earth's "skin" (asphalt, bare soil, forest canopy). |
| **Daytime Land Surface Temp. (Satellite)** | `LST_Day_CMG` (`MOD11C3`) | AppEEARS (MODIS) | 🛰️ Queue / Cache | K $\rightarrow$ °C | High-resolution (5 km) daytime thermal measurement. Ideal for detecting **urban heat islands**. |
| **Nighttime Land Surface Temp. (Satellite)** | `LST_Night_CMG` (`MOD11C3`) | AppEEARS (MODIS) | 🛰️ Queue / Cache | K $\rightarrow$ °C | Nighttime satellite thermal measurement; shows how slowly land or cities cool at night. |
| **Dew Point Temperature (2m)** | `T2MDEW` | NASA POWER (MERRA-2) | ⚡ Real-Time | °C | Temperature at which water vapor condenses; linked to mugginess and fog formation. |

---

## 🌧️ Family 2: Rainfall and Atmospheric Moisture
**Investigation Focus:** Shifts in rainfall regimes, meteorological droughts, storms, and air aridification.

| UI Display Name | Code / Parameter | Source / API | Mode | Unit | Plain-Language Explanation for User |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Bias-Corrected Total Precipitation** | `PRECTOTCORR` | NASA POWER (GPM/MERRA-2) | ⚡ Real-Time | mm/day *(or mm/month)* | Rainfall volume combining satellite and rain gauges. Shows whether the region is getting wetter or drier. |
| **Satellite Precipitation (High Res.)** | `GPM_3IMERGM` | Giovanni (IMERG V07) | 📊 Validation / Demo | mm/month | Fine-grid (0.1°) GPM satellite product. Ideal for validating regional precipitation trends. |
| **Relative Humidity (2m)** | `RH2M` | NASA POWER (MERRA-2) | ⚡ Real-Time | % | Percentage of vapor saturation in the air. Multi-decade declines indicate **aridification**. |
| **Specific Humidity (2m)** | `QV2M` | NASA POWER (MERRA-2) | ⚡ Real-Time | g/kg | Actual mass of water vapor in the air (independent of temperature swings). |
| **Total Precipitable Water** | `TQV` | NASA POWER / Giovanni | ⚡ Real-Time | kg/m² (mm) | Total water vapor in the atmospheric column; indicates potential for heavy rainfall. |

---

## 🌱 Family 3: Soil, Agricultural Drought, and Evapotranspiration
**Investigation Focus:** Desertification, water availability for crops/forests, and subsurface water stress.
*(⚠️ Technical note: Over oceans, `GWET*` variables return `-999` and must be treated as `NaN`).*

| UI Display Name | Code / Parameter | Source / API | Mode | Unit | Plain-Language Explanation for User |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Surface Soil Wetness** | `GWETTOP` | NASA POWER (MERRA-2 Land) | ⚡ Real-Time | Fraction (0 to 1) | Water saturation in the top 5 cm of soil (0 = completely dry, 1 = saturated soil). |
| **Root-Zone Soil Wetness** | `GWETROOT` | NASA POWER (MERRA-2 Land) | ⚡ Real-Time | Fraction (0 to 1) | Available water down to ~1 meter depth, where plant and crop roots absorb moisture. |
| **Deep Soil Profile Wetness** | `GWETPROF` | NASA POWER (MERRA-2 Land) | ⚡ Real-Time | Fraction (0 to 1) | Total soil profile water reserve down to the shallow water table. |
| **Total Evapotranspiration** | `Evap_tavg` (`GLDAS_NOAH`) | Giovanni / Hydrology TS | 📊 Validation / Demo | mm/day | Sum of soil evaporation + plant transpiration. Rising while rain falls accelerates drought. |
| **Surface Runoff** | `Qs_acc` (`GLDAS_NOAH`) | Giovanni / Hydrology TS | 📊 Validation / Demo | kg/m² | Rainwater that fails to infiltrate soil and runs off into rivers (rises with paving and deforestation). |

---

## 🌊 Family 4: Rivers, Discharge, and Watersheds
**Investigation Focus:** Severe floods, long-term river volume decline, and impact of dams/land use.

| UI Display Name | Code / Parameter | Source / API | Mode | Unit | Plain-Language Explanation for User |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **River Discharge (Time Series)** | `river_discharge` | Open-Meteo Flood (GloFAS) | ⚡ Real-Time | m³/s | Water volume flowing through the river channel per second. Detects whether a river is losing flow over decades. |
| **Mean River Discharge** | `river_discharge_mean` | Open-Meteo Flood (GloFAS) | ⚡ Real-Time | m³/s | Average flow behavior to compare regular years against extreme years. |
| **Maximum Flood Peak** | `river_discharge_max` | Open-Meteo Flood (GloFAS) | ⚡ Real-Time | m³/s | Assesses whether extreme floods are growing larger each decade. |
| **Critical Minimum Flow (Low Water)** | `river_discharge_min` | Open-Meteo Flood (GloFAS) | ⚡ Real-Time | m³/s | Measures the lowest level a river reaches in the dry season (critical for water supply and hydropower). |

---

## 🌳 Family 5: Vegetation, Forests, and Land Cover
**Investigation Focus:** Deforestation, forest regeneration, wildfire impacts, and biomass vigor.

| UI Display Name | Code / Parameter | Source / API | Mode | Unit | Plain-Language Explanation for User |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Vegetation Index (NDVI)** | `_1_km_monthly_NDVI` (`MOD13A3`) | AppEEARS / Giovanni | 🛰️ Queue / Cache | Index (-1 to +1) | Measures "greenness" and green leaf density. Significant drops indicate **deforestation or degradation**. |
| **Enhanced Vegetation Index (EVI)** | `_1_km_monthly_EVI` (`MOD13A3`) | AppEEARS (MODIS) | 🛰️ Queue / Cache | Index (-1 to +1) | Similar to NDVI, but does not saturate in dense forests (ideal for monitoring the **Amazon** and Atlantic Forest). |
| **Leaf Area Index (LAI)** | `Lai_500m` (`MOD15A2H`) | AppEEARS (MODIS) | 🛰️ Queue / Cache | m²/m² | Number of leaf layers over the ground; measures structural density of forests or crops. |
| **Surface Albedo** | `ALLSKY_SRF_ALB` | NASA POWER | ⚡ Real-Time | Fraction (0 to 1) | Fraction of sunlight reflected by the ground. When forest becomes pasture/city or ice melts, albedo shifts. |

---

## ☀️ Family 6: Solar Radiation, Clouds, Winds, and Atmosphere
**Investigation Focus:** Solar/wind energy potential, cloudiness, wind circulation, and smoke/pollution.

| UI Display Name | Code / Parameter | Source / API | Mode | Unit | Plain-Language Explanation for User |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **All-Sky Solar Irradiance** | `ALLSKY_SFC_SW_DWN` | NASA POWER | ⚡ Real-Time | kW-hr/m²/day | Solar energy reaching the ground (including clouds). Essential for agriculture and solar PV. |
| **Clear-Sky Solar Irradiance** | `CLRSKY_SFC_SW_DWN` | NASA POWER | ⚡ Real-Time | kW-hr/m²/day | Solar radiation without cloud interference; drops indicate smoke or atmospheric pollution. |
| **Longwave Infrared Radiation (Greenhouse)**| `ALLSKY_SFC_LW_DWN` | NASA POWER | ⚡ Real-Time | W/m² | Thermal radiation emitted by the atmosphere back toward the ground (linked to heat trapping and greenhouse effect). |
| **Cloud Cover** | `CLOUD_AMT` | NASA POWER | ⚡ Real-Time | % | Average percentage of sky covered by clouds across months and decades. |
| **Wind Speed (2m & 10m)** | `WS2M` / `WS10M` | NASA POWER | ⚡ Real-Time | m/s | Mean wind speed near the ground (2m, affects evaporation) and at standard meteorological height (10m). |
| **Turbine-Height Wind Speed (50m)** | `WS50M` | NASA POWER | ⚡ Real-Time | m/s | Wind at wind-turbine height; reveals whether wind power potential is changing in the region. |
| **Surface Atmospheric Pressure** | `PS` | NASA POWER | ⚡ Real-Time | kPa | Weight of the air column; long-term trends indicate shifts in high/low-pressure systems. |
| **Aerosol Optical Depth (Smoke)**| `AOD_550` (`MOD08_M3`) | Giovanni (MODIS) | 📊 Validation / Demo | Dimensionless | Measures suspended airborne particles (wildfire smoke plumes, desert dust, and urban pollution). |

---

## 📡 Family 7: Ground Weather Stations (Local Validation)
**Investigation Focus:** Confronting satellite and global model estimates with real physical measurements from airports and ground stations (`NOAA CDO API v2` — `GSOM` / `GHCND` datasets).

| UI Display Name | Code / Parameter | Source / API | Mode | Unit | Plain-Language Explanation for User |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Station Rainfall (Rain Gauge)** | `PRCP` | NOAA CDO API v2 | ⚡ Real-Time | mm | Accumulated water physically measured inside the local weather station's collector. |
| **Station Mean Temperature** | `TAVG` | NOAA CDO API v2 | ⚡ Real-Time | °C | Mean temperature recorded by the official physical thermometer at the ground station. |
| **Station Max & Min Temperature** | `TMAX` / `TMIN` | NOAA CDO API v2 | ⚡ Real-Time | °C | Thermal extremes physically measured inside the local weather shelter. |
| **Snowfall & Snow Depth** | `SNOW` / `SNWD` | NOAA CDO API v2 | ⚡ Real-Time | mm | Fallen snow and accumulated ground depth (useful for investigating melt in cold/mountain regions). |
| **Mean Wind Speed (Ground)** | `AWND` | NOAA CDO API v2 | ⚡ Real-Time | m/s | Mean wind speed measured directly by the station's physical anemometer. |
