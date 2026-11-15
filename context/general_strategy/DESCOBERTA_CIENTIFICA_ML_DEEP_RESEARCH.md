# Scientific Discovery, Hypotheses & ML Pipeline (`earth_system_ml_discovery_v2` — `2.1_post_audit_passo0`)

**Responsible Role:** `NARR` (Scientific Narrative & Synthesis) in alignment with `DADOS-2` (Statistical Engine & Dynamic Layer) and `DADOS-1` (Multi-Grid Ingestion).
**Observed Sources of Truth:**
- Base Deep Research: `Tendências Globais do Sistema Terrestre.md`
- Layer 1 — Offline audit / scientific benchmark: [`backend/ml_discovery.py`](../../backend/ml_discovery.py) (`schema_revision: 2.1_post_audit_passo0`)
- Empirical evidence (`2001-01..2025-12`, $N = 300$ months): [`backend/ml_discovery_results.json`](../../backend/ml_discovery_results.json)
- Layer 2 — On-demand dynamic discovery (`POST /api/discover`): [`backend/discovery_engine.py`](../../backend/discovery_engine.py) and HTTP router [`data/api/server.py`](../../data/api/server.py)
- Engine and catalog technical references: [`backend/stats_engine.py`](../../backend/stats_engine.py) and [`data/catalog/environmental_catalog.py`](../../data/catalog/environmental_catalog.py)

---

## 1. Critical Synthesis of Deep Research & Unified Observational Window

The survey `Tendências Globais do Sistema Terrestre.md` mapped **15 global phenomena** across **5 physical axes** connecting ocean warming, atmospheric circulation, hydrological extremes, and surface radiative balance:

1. **Axis 1 — Radiative Forcing & Aerosols (CERES / NASA POWER):** Secular decline in cloud cover and surface *brightening* in regions of forest loss or cloud-band shifts, contrasted by sharp drops in clear-sky irradiance (`CLRSKY_SFC_SW_DWN`) during intense smoke/aerosol plumes.
2. **Axis 2 — Hydrosphere & Hydrological Extremes (GloFAS):** Intensification of compound floods and multi-year droughts in South American megabasins, requiring physical separation between actual monthly minimum (`river_discharge_min`), mean (`river_discharge`), and maximum (`river_discharge_max`) flows, plus isolation between **secular signals** and heavy-tailed **episodic shocks** (*El Niño* 2015–2016, *La Niña* 2020–2023, RS floods 2023–2024, and smoke/drought 2023–2024).
3. **Axis 3 — Cryosphere & Albedo:** Subtle surface albedo shifts (`ALLSKY_SRF_ALB`) in tropical/subtropical basins during severe droughts and atmospheric plumes.
4. **Axis 4 — Biosphere & Compound Soil–Atmosphere Droughts:** Nonlinear coupling between precipitation (`PRECTOTCORR`), convex FAO-56 vapor pressure deficit (`VPD_t2m_kpa`), and root-zone soil moisture memory (`GWETROOT`).
5. **Axis 5 — Ocean Thermodynamics & Teleconnections:** Asymmetries between the Equatorial Pacific (`pac_nino34`), North/South Tropical Atlantic (`atl_tn`, `atl_s`, meridional gradient `atl_meridional_grad`), and Extratropical Atlantic (`atl_ne`), driving lagged teleconnections and continental precipitation/radiation seesaws.

### Critical Methodological Constraint (2001–2025 Window)
Although atmospheric (`MERRA-2`) and hydrological (`GloFAS`) reanalyses extend back to the 1980s, radiative observations **CERES SYN1deg (`ALLSKY_SFC_SW_DWN`, `CLRSKY_SFC_SW_DWN`, `CLOUD_AMT`, `ALLSKY_SRF_ALB`) begin in 2000–2001**. To eliminate sample-composition bias across variables, the `earth_system_ml_discovery_v2` pipeline locks the **strict intersection window `2001-01` to `2025-12` ($N = 300$ months)** across the 5 live-validated South American GloFAS basins and 4 ocean boxes (*lagged* matrix of $N = 294$ months after lags up to 6 months: `2001-07..2025-12`).

---

## 2. The 2 Refined Scientific Hypotheses (Post-Audit v2.1)

We formulated two falsifiable hypotheses under conservative `AR(1)` autocorrelation correction (`max(p_naive, p_santer, p_hamed_rao)` in [`backend/stats_engine.py`](../../backend/stats_engine.py)) and *Benjamini–Hochberg FDR* multiple-testing control ($q < 0.05$):

### Hypothesis 1 — Cloud vs. Smoke Radiative Separation & Soil–VPD–Discharge Coupling
- **Statement:** The secular increase in downward solar radiation (`ALLSKY_SFC_SW_DWN`) in Brazilian tropical basins between 2001 and 2025 **does not stem from clearer cloud-free skies (`CLRSKY_SFC_SW_DWN`)**, but rather from a **significant retreat in cloud cover (`CLOUD_AMT`) and shortwave cloud radiative effect (`sw_cloud_radiative_effect = CLRSKY - ALLSKY`)**. In parallel, extreme drought/wildfire events produce **episodic negative shocks in `CLRSKY_SFC_SW_DWN`** (`diagnose_smoke_cloud_decoupling`), detectable outside the Mahalanobis ellipse ($D_M > 2.5$), while adding hydrometeorological and radiative predictors yields RMSE skill (*Out-of-Fold* `skill_rmse_vs_ar1 > 0`) over `AR(1–3)` persistence.
- **Measurable Predictions:**
  1. `ALLSKY_SFC_SW_DWN` rises significantly in Madeira (`+0.2927`) and Tapajós (`+0.3090 MJ/m²/day/dec`) with falling `CLOUD_AMT` (`-3.08` and `-2.82 p.p./dec`) and statistically stationary `CLRSKY_SFC_SW_DWN` (`q > 0.55`).
  2. Negative spikes in `CLRSKY_SFC_SW_DWN` in September 2024 emerge as extreme Mahalanobis *outliers* across all four basins hit by the continental plume (`D_M = 19.69` in Madeira; `9.96` in Guaíba; `9.88` in Tapajós; `8.33` in Paraná).
  3. Convex **FAO-56** calculation of `VPD_t2m_kpa` (via `T2M_MAX`, `T_min = 2·T2M - T2M_MAX`, and `T2MDEW`) corrects the Jensen's Inequality bias present in mean-`T2M` approximations.

### Hypothesis 2 — Partial Oceanic Teleconnections (`Conditioned AR(1) + BH-FDR`) & South American Dipoles
- **Statement:** After simultaneous removal of monthly climatology, secular trend, and orthogonal conditioning on local memory and ENSO ($\mathbf{Z}_{\text{total}}(\tau, k) = \{t, Y_{t-\tau}, \text{Niño3.4}_{t-\tau}\}$), physically genuine ocean–basin teleconnections preserve dual significance (`partial_fdr_q < 0.05` and `detrended_fdr_q < 0.05`), exposing:
  1. Radiative coupling of the **South Tropical Atlantic (`atl_s.CLRSKY_SFC_SW_DWN`, `atl_s.ALLSKY_SFC_SW_DWN`)** on minimum discharge in *Tapajós* (positive, lag 3–4m) and *Paraná* (negative, lag 1–3m);
  2. The **Atlantic meridional dipole** (`atl_meridional_grad.TS`, lag 1–2m) and **`atl_ne.TS` (`lag=2–4m`)** modulating minimum discharge and soil moisture in *São Francisco*;
  3. Direct forcing from the **Equatorial Pacific (`pac_nino34.TS` and `CLRSKY_SFC_SW_DWN`, lag 1–2m)** on *South/Guaíba*, in continental radiative opposition against *São Francisco* (`r_detrended = -0.5288`) and *Tapajós* (`-0.2872`).

---

## 3. Scientific Audit & Implemented Fixes (`v1 → v2.0 → v2.1_post_audit_passo0`)

| Detected Vulnerability | State-of-the-Art Fix Implemented (`v2.1`) | Observed Impact on Data |
| :--- | :--- | :--- |
| **1. Step 0 — Flattening of GloFAS extremes (`mean=min=max`) and cached synthetic fallback (`murray_darling`).** | [`open_meteo_flood.py`](../../data/connectors/open_meteo_flood.py) (`GLOFAS_AGGREGATION_VERSION = 2`): true physical daily `min`/`fmean`/`max` aggregation, explicit rejection of cache lacking `agg_v == 2`, and **prohibition of writing or accepting `glofas_calibrated_fallback` as valid**. | Physical $\overline{Q}_{\max} / \overline{Q}_{\min}$ ratio restored (**`7.11×`** in Guaíba vs `1.28×` in Paraná); **`murray_darling` rejected (`valid=False`, `glofas_calibrated_fallback`)**, leaving 5 genuine South American basins. |
| **2. Jensen's Inequality in `VPD_t2m_kpa` (linear approximation via `T2M`).** | Convex **FAO-56** formulation: $e_s = 0.5[e_s(T_{\max}) + e_s(T_{\min})]$ with $T_{\min} = \min(T_{\max}, 2\cdot\text{T2M} - T_{\max})$. | VPD slopes corrected upward: Madeira `+0.095 → +0.1340`, Paraná `+0.144 → +0.1880 kPa/dec` (`q=0.01233`), Tapajós `+0.138 → +0.1841`, São Francisco `+0.075 → +0.0953 kPa/dec`. |
| **3. Underestimation of `p`-value with `N ≥ 60` & biased secular `OLS` correlation.** | [`backend/stats_engine.py`](../../backend/stats_engine.py) adopts conservative envelope `max(p_naive, p_santer, hr_p_out)` for `N ≥ 60`; `ml_discovery.py` computes **`secular_gam_r`** on smoothed GAM curves instead of comparing straight lines. | Multiple inference resistant to finite-sample variance of Santer and Hamed–Rao; long-term coupling respects nonlinear geometry. |
| **4. Subtle CV leakage & out-of-fold ocean selection.** | 5 chronological blocks with `purge_gap = 6` months, *in-fold* deseasonalization, ***in-fold* detrending** in detrended Mode B, and **strictly *in-fold* top-K ocean feature selection**. | Eliminates selection leakage and guarantees out-of-sample evaluation with **`skill_rmse_vs_ar1`**. |
| **5. Orthogonal targets + ENSO partialization in ocean scan.** | `TARGETS_TELECONNECTION = ("river_discharge_min", "GWETROOT")`, totaling **850 tests** (`5 basins × 2 targets × 17 vars × 5 lags`), adding `partial_r` conditioned on $\mathbf{Z}_{\text{total}} = \{t, Y_{t-\tau}, \text{Niño3.4}_{t-\tau}\}$. | Filters ENSO/persistence redundancy: **96** pass *detrended FDR*, **53** strict (`anom + detrend`), and **19** survive strict partial control (`partial_fdr_q < 0.05`). |
| **6. Fold 0 edge artifact in Mode B CUSUM (`2006-11 / 2007-01 / 2007-11`).** | In `evaluate_models_for_watershed`, Fold 0's one-sided bias (trained only on future `2006-12..2025-12` and extrapolated backward to `2001-07..2006-05`) is aligned to bilateral interior blocks (`folds[1:-1]`) before `detect_physical_coupling_break` (without altering `cv_oof_r2` or `fold_metrics`). | Eliminates edge false positives in `GWETROOT` (`2006-11 / 2007-01 / 2007-11`) and exposes real interior breaks: **`2017-11`** (Paraná), **`2020-01/02`** (Madeira `q_min`), **`2020-11/12`** (Tapajós `q_min`), and **`2014-09`** (São Francisco `q_min`). |

---

## 4. Verified Empirical Results (`2001-01..2025-12`, $N = 300$)

### 4.1 GloFAS Hydrological Validation (`9×9` `0.05°` Snapping, `agg_v = 2`)

| Basin | Snapped Point (Channel) | Mean Min Flow (`q_min`) | Mean Flow (`river_discharge`) | Mean Max Flow (`q_max`) | Ratio $\overline{Q}_{\max}/\overline{Q}_{\min}$ | Max Peak (`qmax_abs`) | Status |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **`amazonia_madeira`** | `(-8.575, -63.725)` | `16,420.83 m³/s` | `20,223.24 m³/s` | `25,098.16 m³/s` | `1.53×` | `72,276.02 m³/s` | **VALID (live `cache_hit`)** |
| **`amazonia_tapajos`** | `(-4.125, -55.775)` | `10,573.83 m³/s` | `12,682.55 m³/s` | `14,945.38 m³/s` | `1.41×` | `36,896.76 m³/s` | **VALID (live `cache_hit`)** |
| **`parana_foz_iguacu`** | `(-25.725, -54.675)` | `10,019.05 m³/s` | `11,122.47 m³/s` | `12,787.97 m³/s` | `1.28×` | `36,056.88 m³/s` | **VALID (live `cache_hit`)** |
| **`sul_guaiba`** | `(-29.925, -51.525)` | `508.10 m³/s` | `1,594.06 m³/s` | `3,611.82 m³/s` | **`7.11×`** | `15,847.93 m³/s` | **VALID (live `cache_hit`)** |
| **`sao_francisco_sobradinho`** | `(-9.425, -40.525)` | `1,975.61 m³/s` | `2,345.54 m³/s` | `2,810.11 m³/s` | `1.42×` | `17,059.82 m³/s` | **VALID (live `cache_hit`)** |
| **`murray_darling`** | `(-34.125, 141.875)` | `202.04 m³/s` | `358.20 m³/s` | `539.10 m³/s` | `2.67×` | `938.95 m³/s` | **REJECTED (`glofas_calibrated_fallback`)** |

---

### 4.2 Secular Trends (`Theil–Sen` per decade + Conservative `AR(1)` + `BH-FDR`) and Shocks ($D_M$)

#### A. Watersheds (Confirmed Signals and Mahalanobis Extremes)

| Basin | Hydrology & Atmospheric Drought (`VPD` FAO-56) | Radiative Balance & Cloud–Smoke Decoupling | Main Mahalanobis Extremes ($D_M$) |
| :--- | :--- | :--- | :--- |
| **`amazonia_madeira`** | `PRECTOTCORR`: **`-15.313 mm/month/dec`** (`q=0.00003`)<br>`T2M`: **`+0.520 °C/dec`** (`q=0.00594`)<br>`VPD_t2m_kpa`: **`+0.1340 kPa/dec`** (`q=0.00685`)<br>`GWETROOT`: `-0.0217/dec` (`p_ar1=0.0585`, `q=0.111`)<br>`river_discharge_min`: `-364.04 m³/s/dec` (`q=0.809`, *NO_TREND*) | `ALLSKY`: **`+0.2927 MJ/m²/day/dec`** (`q=0.02475`)<br>`CLOUD_AMT`: **`-3.0788 p.p./dec`** (`q=0.01319`)<br>`sw_cloud_rad_eff`: **`-0.2655 MJ/m²/day/dec`** (`q=0.00043`)<br>`CLRSKY`: `+0.0120` (`q=0.990`, *stationary*) | **Smoke `CLRSKY` 2024-09:** `-8.171 MJ/m²/day` (**$D_M = 19.69$**, `clrsky_z=-9.76`, `aerosol_masking=True`)<br>**`CLRSKY` 2007-09:** `-4.747` (**$D_M = 11.43$**)<br>**Albedo `2024-09`:** `+0.0445` (**$D_M = 10.36$**)<br>**Flood `q_min` 2014-02:** `+26,385.7 m³/s` (**$D_M = 9.23$**)<br>**VPD 2023-11:** `+1.4437 kPa` ($D_M = 4.95$) |
| **`amazonia_tapajos`** | `PRECTOTCORR`: **`-20.834 mm/month/dec`** (`q < 1e-5`)<br>`GWETROOT`: **`-0.0436/dec`** (`q=0.03524`)<br>`T2M`: **`+0.649 °C/dec`** (`q=0.00474`)<br>`VPD_t2m_kpa`: **`+0.1841 kPa/dec`** (`q=0.00685`)<br>`river_discharge_min`: `-602.59 m³/s/dec` (`q=0.309`, *NO_TREND*) | `ALLSKY`: **`+0.3090 MJ/m²/day/dec`** (`q=0.00223`)<br>`CLOUD_AMT`: **`-2.8194 p.p./dec`** (`q=0.03524`)<br>`sw_cloud_rad_eff`: **`-0.2316 MJ/m²/day/dec`** (`q=0.00305`)<br>`CLRSKY`: `+0.0386` (`q=0.554`, *NO_TREND*) | **Smoke `CLRSKY` 2024-09:** `-3.503 MJ/m²/day` (**$D_M = 9.88$**)<br>**Low water `q_min` 2024-03:** `-10,983.6 m³/s` (**$D_M = 7.09$**)<br>**Albedo 2023-08:** `+0.0224` ($D_M = 6.51$)<br>**VPD 2015-09:** `+1.3587 kPa` ($D_M = 5.12$) |
| **`parana_foz_iguacu`** | `river_discharge_min`: **`-2,470.84 m³/s/dec`** (`q=0.01039`)<br>`river_discharge`: **`-2,594.17 m³/s/dec`** (`q=0.01175`)<br>`PRECTOTCORR`: **`-10.526 mm/month/dec`** (`q=0.01009`)<br>`GWETROOT`: **`-0.0257/dec`** (`q=0.01136`)<br>`T2M`: **`+0.590 °C/dec`** (`q=0.00223`)<br>`VPD_t2m_kpa`: **`+0.1880 kPa/dec`** (`q=0.01233`) | `CLOUD_AMT`: **`-2.4033 p.p./dec`** (`q=0.00613`)<br>`sw_cloud_rad_eff`: **`-0.2200 MJ/m²/day/dec`** (`q=0.02475`)<br>`ALLSKY_SRF_ALB`: **`+0.0017/dec`** (`q=0.00594`)<br>`CLRSKY`: `-0.0758` (`p_ar1=0.07115`, `q=0.129`) | **Smoke `CLRSKY` 2024-09:** `-2.545 MJ/m²/day` (**$D_M = 8.33$**)<br>**`CLRSKY` 2005-09:** `-1.933` ($D_M = 6.84$)<br>**Flood 2011-03:** `+17,724.2 m³/s` ($D_M = 7.35$)<br>**Flood `q_min` 2010-02:** `+11,826.3 m³/s` ($D_M = 5.82$) |
| **`sul_guaiba`** | `T2M`: **`+0.354 °C/dec`** (`q=0.01825`)<br>`T2M_MAX`: **`+0.765 °C/dec`** (`q=0.01039`)<br>`VPD_t2m_kpa`: `+0.0804 kPa/dec` (`p_ar1=0.0483`, `q=0.0936`, *CONFIRMED_MODERATE*)<br>`river_discharge_min`: `-62.69 m³/s/dec` (`q=0.544`, *NO_TREND*) | `CLRSKY`: `-0.1109 MJ/m²/day/dec` (`p_ar1=0.0356`, `q=0.0736`, *CONFIRMED_MODERATE*)<br>`ALLSKY_SRF_ALB`: `+0.0012/dec` (`p_ar1=0.0371`, `q=0.0750`)<br>`ALLSKY`: `+0.0225` (`q=0.944`, *NO_TREND*) | **RS Flood 2024-05:** `q_min` `+3,621.95 m³/s` (**$D_M = 15.01$**), `q_mean` `+6,524.74 m³/s` (**$D_M = 8.80$**), `PRECTOTCORR` `+276.56 mm/month` ($D_M = 5.25$)<br>**Smoke `CLRSKY` 2024-09:** `-3.470` (**$D_M = 9.96$**)<br>**VPD 2020-03:** `+1.0265 kPa` ($D_M = 4.49$) |
| **`sao_francisco_sobradinho`** | `river_discharge_min`: **`-256.56 m³/s/dec`** (`q=0.01825`)<br>`river_discharge`: **`-331.59 m³/s/dec`** (`q=0.04609`)<br>`T2M`: **`+0.413 °C/dec`** (`q=0.00335`)<br>`VPD_t2m_kpa`: **`+0.0953 kPa/dec`** (`q=0.03660`)<br>`PRECTOTCORR`: `-2.053 mm/month/dec` (`q=0.180`) | `sw_cloud_rad_eff`: **`-0.2100 MJ/m²/day/dec`** (`q=0.03660`, *CONFIRMED_MODERATE*)<br>`ALLSKY`: `+0.1834` (`q=0.140`)<br>`CLOUD_AMT`: `-1.1460 p.p./dec` (`q=0.166`) | **La Niña Flood 2022-02:** `q_min` `+6,442.35 m³/s` (**$D_M = 17.41$**), `q_mean` `+7,522.6 m³/s` (**$D_M = 14.25$**)<br>**Rain 2016-01:** `+259.7 mm/month` (**$D_M = 11.58$**)<br>**`GWETROOT` 2004-02:** `+0.1384` ($D_M = 8.66$) |

#### B. Ocean Boxes (`2001–2025`)

| Ocean Box | Surface Skin Temperature (`TS`) | Cloud Cover (`CLOUD_AMT`) |
| :--- | :--- | :--- |
| **`atl_ne`** (Subtropical NE Atl.) | **`+0.1802 °C/dec`** (`p_ar1=0.02037`, **`q=0.04629`**, *CONFIRMED_MODERATE*) | **`-4.3330 p.p./dec`** (`p_ar1=0.00001`, **`q=0.00036`**, *CONFIRMED_HIGH*) |
| **`atl_s`** (South Tropical Atl.) | `+0.0346 °C/dec` (`q=0.775`, *NO_TREND*) | **`-2.0478 p.p./dec`** (`p_ar1=0.00065`, **`q=0.00493`**, *CONFIRMED_HIGH*) |
| **`atl_tn`** (North Tropical Atl.) | `+0.0132 °C/dec` (`q=0.944`, *NO_TREND*) | `-2.0899 p.p./dec` (`p_ar1=0.03378`, `q=0.07149`, *CONFIRMED_MODERATE*) |
| **`pac_nino34`** (Niño 3.4) | `-0.0299 °C/dec` (`q=0.986`, *INSUFFICIENT_SIGNAL*) | `-0.5462 p.p./dec` (`q=0.776`, *NO_TREND*) |

---

### 4.3 Local Couplings, Continental Dipoles & Partial Teleconnections

#### A. Contemporaneous Local Couplings (*Detrended* `AR(1) + BH-FDR`)
- **`sul_guaiba`:** Immediate pluvio-radiative control: `PRECTOTCORR vs river_discharge` (**`det_r = +0.6872`**, `sec_r = +0.7837`) and `vs river_discharge_min` (**`det_r = +0.5134`**), `ALLSKY vs river_discharge_min` (**`det_r = -0.5292`**), `sw_cloud_radiative_effect vs q_min` (**`det_r = +0.4876`**), `CLOUD_AMT` (**`det_r = +0.4460`**), `CLRSKY` (`-0.3970`), `VPD_t2m_kpa` (`-0.3719`), all with `q_d < 1e-5`.
- **`parana_foz_iguacu`:** `VPD_t2m_kpa vs river_discharge_min` (**`det_r = -0.4698`**, `sec_r = -0.9523`, `q_d < 1e-5`), `ALLSKY vs GWETROOT` (**`det_r = -0.4313`**, `q_d < 1e-5`), `PRECTOTCORR vs q` (`+0.2579`, `q_d = 0.00018`) and `vs q_min` (`+0.2164`, `q_d = 0.00222`).
- **`amazonia_tapajos`:** `PRECTOTCORR vs river_discharge` (`det_r = +0.3148`, `q_d < 1e-5`) and `vs q_min` (`+0.2066`, `q_d = 0.00426`), `ALLSKY_SRF_ALB vs GWETROOT` (`+0.1741`, `q_d = 0.01142`), `ALLSKY vs GWETROOT` (`-0.1611`, `q_d = 0.02916`).
- **`sao_francisco_sobradinho`:** `ALLSKY vs GWETROOT` (**`det_r = -0.5229`**, `q_d < 1e-5`), `VPD_t2m_kpa vs q_min` (**`det_r = -0.2907`**, `q_d = 0.00006`) and `CLRSKY vs q_min` (`-0.1603`, `q_d = 0.01824`).

#### B. Orthogonal Scan of 850 Ocean Teleconnections (`lag = 1, 2, 3, 4, 6 months`)
- Total: **`850`** tests → **`67`** pass *anomaly FDR*, **`96`** pass *detrended FDR*, **`53`** satisfy both strict criteria, and **`19` survive partial correlation conditioned on $\{t, Y_{t-\tau}, \text{Niño3.4}_{t-\tau}\}$ (`partial_fdr_q < 0.05`)**:

| Target Basin (`variable`) | Ocean Box & Variable | Lag | `partial_r` (`q_part`) | `detrended_r` (`q_det`) | $n_\text{eff}$ (`AR(1)`) | Physical Interpretation |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| `amazonia_tapajos` (`q_min`) | `atl_s.CLRSKY_SFC_SW_DWN` | `4m` | **`+0.3522`** (`0.00015`) | `+0.3815` (`0.00005`) | `201.3` | Main ENSO-independent radiative teleconnection (also `lag=3m`, `part_r=+0.2405`) |
| `parana_foz_iguacu` (`q_min`) | `atl_s.ALLSKY_SFC_SW_DWN` | `1m` | **`-0.3064`** (`0.00006`) | `-0.2477` (`0.00724`) | `299.0` | Inverse signal via radiation/`CLOUD_AMT` (`+0.2470`, `q_part=0.00486`) in the South Atlantic |
| `sao_francisco_sobradinho` (`GWETROOT`) | `atl_ne.TS` | `3m` | **`+0.2839`** (`0.03946`) | `+0.2572` (`0.02995`) | `152.1` | Extratropical NE Atlantic thermal modulation (also `lag=2m`, `part_r=+0.2665`) |
| `sul_guaiba` (`q_min`) | `pac_nino34.TS` | `2m` | **`+0.2596`** (`0.04090`) | `+0.3145` (`0.00942`) | `172.2` | Direct *El Niño* forcing after removing discharge persistence (`lag=1m` `part_r=+0.2382`) |
| `sao_francisco_sobradinho` (`q_min`) | `atl_meridional_grad.TS` | `2m` | **`+0.2576`** (`0.03946`) | `+0.2965` (`0.00780`) | `179.0` | Positive Atlantic meridional dipole (complemented by `atl_s.TS` `-0.2469`) |
| `sul_guaiba` (`q_min`) | `pac_nino34.CLRSKY_SFC_SW_DWN` | `2m` | **`-0.2447`** (`0.03352`) | `-0.3004` (`0.00724`) | `214.6` | Increased moisture/aerosols over Niño 3.4 precede Southern floods |

#### C. Cross-Basin Spatial Dipoles (`compare_regions`, Same Variable)
- **Amazonia Coherence (`madeira` vs `tapajos`):** Strong *detrended* synchrony in `ALLSKY_SFC_SW_DWN` (`det_r = +0.6591`, `sec_r = +0.7813`, `p = 0.0`), `river_discharge` (`det_r = +0.5878`), `river_discharge_min` (`+0.5610`), and `GWETROOT` (`+0.5103`).
- **South vs. Center-North Radiative Seesaw (`ALLSKY_SFC_SW_DWN`):** `sul_guaiba` vs `sao_francisco_sobradinho` exhibit strong anticorrelation (`det_r = -0.5288`, `sec_r = -0.4768`, `p = 0.0`); `amazonia_tapajos` vs `sul_guaiba` also oppose signs (`det_r = -0.2872`, `p = 7.5e-7`), whereas `parana_foz_iguacu` vs `sul_guaiba` co-vary (`det_r = +0.2904`, `p = 5.2e-7`).

---

### 4.4 Machine Learning: Mode A (`skill_rmse_vs_ar1`) vs. Mode B & Clean CUSUM Breaks

Across all 5 basins under **5 purged chronological blocks (`purge_gap = 6` months)** with strictly *in-fold* deseasonalization/detrending/ocean selection, linear/smooth additive models (`RidgeCV`, `SplineGAM_Ridge`) dominate trees under *out-of-range* extremes:

| Basin | Mode A `AR(1)` (`q_min`, `fold_R²` / `oof_R²`) | Best Mode A `q_min` (`skill_rmse_vs_ar1` / `fold_R²` / `oof_R²`) | Best Mode A `river_discharge` (`skill_rmse_vs_ar1` / `fold_R²`) | Mode B `GWETROOT` (`fold_R²` / `oof_R²`) | Clean CUSUM Break (`RidgeCV` Mode B, no Fold 0 artifact) |
| :--- | :---: | :--- | :--- | :---: | :--- |
| **`parana_foz_iguacu`** | `0.4148` / `0.7584` (`SplineGAM`) | **`lagged_radiative` (`SplineGAM`)**: **`+0.0924`** (`0.3736` / **`0.8010`**) | **`lagged_radiative` (`SplineGAM`)**: **`+0.1516`** (`0.4874` / `0.7793`) | **`0.8467`** / **`0.9022`** (`SplineGAM`) | `q_min`: **`2017-11`** (`2.279` level / `2.056` *detrended*) — megadrought<br>`GWETROOT`: **no spurious break** (`stat=1.190`) |
| **`amazonia_tapajos`** | `0.3451` / `0.5471` (`RidgeCV`) | **`lagged_radiative` (`RidgeCV`)**: **`+0.1034`** (**`0.4438` / `0.6359`**) | **`lagged_radiative` (`RidgeCV`)**: `+0.0285` (`0.5350` / `0.6894`) | **`0.8983`** / **`0.9512`** (`RidgeCV`) | `q_min`: **`2020-11/12`** (`1.464` level / `1.649` *detrended*)<br>`GWETROOT` *detrended*: **`2016-02`** (`1.534`, post-El Niño; level no break `1.185`) |
| **`amazonia_madeira`** | `0.2615` / `0.4965` (`RidgeCV`) | **`lagged_radiative` (`RidgeCV`)**: **`+0.0757`** (**`0.3632` / `0.5698`**) | **`lagged_hydro_met` (`RidgeCV`)**: **`+0.0724`** (`0.4988` / `0.6574`) | **`0.8280`** / **`0.9050`** (`RidgeCV`) | `q_min`: **`2020-01/02`** (`1.692` level / `1.757` *detrended*) — post-2020 bias `-3,606 m³/s`<br>`GWETROOT` *detrended*: **`2016-02`** (`1.936`; level no break `0.928`) |
| **`sul_guaiba`** | `0.0704` / `0.1264` (`RidgeCV`) | **`lagged_hydro_met` (`RidgeCV`)**: **`+0.0434`** (`0.1425` / `0.2006`) | **`lagged_hydro_met` (`RidgeCV`)**: `+0.0373` (`0.1894` / `0.2430`) | **`0.9072`** / **`0.9212`** (`RidgeCV`) | **Zero breaks** in `q_min` (`1.028`), `q_mean` (`1.092`), and `GWETROOT` (`0.661`) — stationary coupling; Mode B `q_mean = 0.4776` (`POST 2020 q_min = 0.397`) |
| **`sao_francisco_sobradinho`** | `0.0431` / `0.2500` (`HGBR`) | **`lagged_radiative` (`RF`)**: **`+0.0532`** (`0.1649` / `0.3276`) | **`lagged_radiative` (`RidgeCV`)**: **`+0.1277`** (**`0.4268` / `0.5693`**) | **`0.8544`** / **`0.8686`** (`RidgeCV`) | `q_min` level: **`2014-09`** (`1.775`, Sobradinho drought; *detrended* no break `2020-03`, `stat=1.262`)<br>`GWETROOT`: no break (`1.062` / `1.349`) |

---

## 5. Layer 2 — On-Demand Dynamic Engine (`POST /api/discover` & `backend/discovery_engine.py`)

To bring these discoveries to any map point clicked by the user (without precomputing a single fixed location), **Layer 2** was implemented in [`backend/discovery_engine.py`](../../backend/discovery_engine.py) and integrated into the [`data/api/server.py`](../../data/api/server.py) router at **`POST /api/discover`**:

1. **`detect_regime_and_gam_geometry`**: Computes CUSUM over Theil–Sen residuals with `AR(1)` correction + 1st and 2nd derivatives of the penalized GAM curve to geometrically classify the regime (`PHASE_REVERSAL_OR_HUMP_REGIME`, `PERSISTENT_ACCELERATING_REGIME_RAMP`, `STRUCTURAL_MEAN_SHIFT`, `SATURATING_DISSIPATIVE_TRAJECTORY`, `QUASI_LINEAR_SECULAR_REGIME`).
2. **`scan_dynamic_partial_teleconnections`**: Orthogonally projects X and Y onto $\mathbf{Z}_{\text{total}}(\tau, k) = \{t, Y_{t-\tau}, \text{Niño3.4}_{t-\tau}\}$ via RAM-cached matrices (`load_cached_ocean_anomalies`, offline read `allow_network=False` over `data/cache/storage/`), evaluates vectorized Student-$t$ distribution with $df_{\text{eff}} = N_{\text{eff}}(e_X, e_Y) - 2 - |Z|$, and applies *BH-FDR* in `< 50 ms` on the synthetic subset and `~93 ms` on the 85 real in-memory ocean tests.
3. **`compute_fast_gcv_physical_attribution`**: When secondary local predictors are available, executes closed-form Ridge SVD decomposition with analytical $\lambda$ selection via **GCV (Generalized Cross-Validation)** in $O(n \cdot p^2)$, generating LOO residuals $(I - H)_{\text{diag}}^{-1}$ free of inter-block boundary bias and ranking drivers by `standardized_beta` and $\Delta R^2$.
4. **`attribute_mahalanobis_outliers`**: Crosses peaks detected outside the Mahalanobis ellipse ($D_M > 2.5$) against extreme deviations ($|z| \ge 1.5$) of the Pacific (`pac_nino34`) and Atlantic meridional gradient (`atl_meridional_grad`) at lags `0..3` months.

---

## 6. Traceability for the Pitch & Reproducibility

- **Scientific Differentiator for Judges:** Instead of spurious correlations or seasonal *overfitting*, we deliver **two complementary levels**: (i) rigorous anti-leakage validation across 5 real basins (`ml_discovery_results.json`, including automatic rejection of synthetic fallback in `murray_darling`, FAO-56 Jensen VPD, clean post-2017/2020 break, and orthogonal partial teleconnections); and (ii) a real-time algebraic dynamic engine (`POST /api/discover`) replicating the same forensic signature for any coordinate explored in the UI.
- **Reproducibility:**
  - Synthetic invariants (Layer 1): `.venv/bin/python backend/ml_discovery.py --self-test`
  - Full evidence generation (`v2.1_post_audit_passo0`): `.venv/bin/python backend/ml_discovery.py`
  - Backend unit suites (`31` tests, including `backend/test_discovery_engine.py`) and data contracts (`9` tests): `unittest discover` in `backend/` and `data/tests/`.
