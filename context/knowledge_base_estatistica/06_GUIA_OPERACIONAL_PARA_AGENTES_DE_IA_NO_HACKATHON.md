# 06. Operational Guide and Statistical Contract for AI Agents at the Hackathon

> **Base Reference:** Executable synthesis of Documents `01` through `05` integrated with the governance of [`ESTRATEGIA_TREND_DETECTIVE.md`](../general_strategy/ESTRATEGIA_TREND_DETECTIVE.md)
> **Goal for AI Agents:** This document is the **pocket manual and audit checklist** for any AI agent (GPT, Claude, Gemini, or subagents) invoked during the 39 hours of the hackathon. It defines **what must go into the Data Contract (Phase 1)**, **how each challenge question is answered mathematically**, and **which errors must never be committed**.

---

## 1. Official Mathematical Mapping of the 4 Challenge Questions (#14)

As defined in Section 1 of [`ESTRATEGIA_TREND_DETECTIVE.md`](../general_strategy/ESTRATEGIA_TREND_DETECTIVE.md#L30), the acceptance criterion ("definition of done") requires that, for any clicked variable and region, the tool immediately answers: **What, Where, How Much, and Significance**.

Below is the **State-of-the-Art** specification (grounded in Hindemburg Melão Jr.'s teachings in `transcricao.txt`) for each of the 4 answers:

| Challenge Question | Primary Metric (Mandatory) | Complementary Metric (State of the Art) | Absolute Prohibition (Anti-Error) |
| :--- | :--- | :--- | :--- |
| **1. WHAT is changing?** | Physical variable name + **Climatological Anomaly** ($Y'_{a,m} = Y_{a,m} - \bar{Y}_m$) + Curve regime (**Constant linear**, **Accelerating**, or **Decelerating/Saturating** via GAM/derivative). | Identification of extreme events outside the **Mahalanobis Ellipse** ($D_M > 2.5$) and diagnosis of sensor jumps. | Never mix unharmonized sensors or regress raw monthly series dominated by summer/winter waves without extracting the anomaly (Henrietta Leavitt Principle). |
| **2. WHERE is it changing?** | Coordinates/Region + **Spatial Divergence Map** colored by $B_{\text{decade}}$ + direct comparison with an opposing-trend region (*"Up here, down there"*). | **Multiscale Correlation Decomposition** between regions: Long-Term Secular Correlation ($r_{\text{global}}$) vs. Short-Term Residual Correlation ($r_{\text{local}}$). | Never compare two regions using different year windows (e.g., $2000\text{–}2025$ vs. $2012\text{–}2025$). |
| **3. HOW MUCH is it changing?** | **Regression Slope over the entire cloud** expressed per decade: **Robust Sen's Slope ($B_{\text{Sen}}$)** and **OLS ($B_{\text{OLS}}$)** + Cumulative line change $\Delta \hat{Y} = B \cdot \Delta t$. | Centered initial-level parameter $A_0 = \hat{Y}(t_{\text{start}})$ + Nonlinear **GAM / Monotonic Spline** curve to capture physical curvature. | **FORBIDDEN:** Computing $Y_{\text{final}} - Y_{\text{initial}}$ (primary start/end point error) and **FORBIDDEN** computing percentage change ($\%$) on interval scales such as $^\circ\text{C}$ or anomalies! |
| **4. IS IT SIGNIFICANT?** | **$\text{AR}(1)$-Autocorrelation-Corrected $p\text{-value}$** (Santer $N_{\text{effective}}$ / Hamed-Rao) + **Spatial False Discovery Rate Control (Benjamini-Hochberg FDR, $q < 0.05$)**. | **Correlation Coefficient (Pearson's $r$ and Kendall's $\tau$)** measuring ellipse tightness (how well time predicts the variable). | Never use naive $p < 0.05$ without correcting serial autocorrelation and controlling multiple tests across the map grid. |

---

## 2. Specification of Statistical Fields for the "Data Contract" (Phase 1 — Saturday 09:45)

In **Phase 1** of [`ESTRATEGIA_TREND_DETECTIVE.md`](../general_strategy/ESTRATEGIA_TREND_DETECTIVE.md#L228), `DADOS-1`, `DADOS-2`, and `PROD-1` lock the **Data Contract** by 10:30 AM Saturday so the Frontend can work in parallel with *mock data* while the Backend processes real NASA data.

So that the Frontend (`PROD-1` and `PROD-2`) is built ready to display state-of-the-art statistics without rework, each region/point's JSON in the Data Contract should include the following `statistics` block:

```json
{
  "variable_id": "grace_tws_anomaly",
  "variable_name": "Terrestrial Water Storage Anomaly (GRACE/GRACE-FO)",
  "scale_type": "interval",
  "unit": "cm EWT",
  "trend_unit": "cm / decade",
  "allow_percentage_change": false,
  "period": {
    "start": "2002-04",
    "end": "2025-12",
    "n_observations": 248,
    "n_effective_ar1": 54.2
  },
  "regression": {
    "intercept_at_start_A0": 2.14,
    "slope_per_decade_ols": -14.20,
    "slope_per_decade_sen": -13.85,
    "slope_ci95_low": -16.90,
    "slope_ci95_high": -11.10,
    "cumulative_model_change": -32.89,
    "quadratic_acceleration_B2": -0.042,
    "regime_shape": "accelerating_decline"
  },
  "correlation_and_coupling": {
    "pearson_r": -0.86,
    "kendall_tau": -0.71,
    "r_squared": 0.74,
    "ellipse_aspect_ratio": 0.26
  },
  "significance": {
    "p_value_naive": 1.2e-28,
    "p_value_ar1_corrected": 0.00018,
    "fdr_q_value": 0.00095,
    "is_significant_fdr05": true,
    "confidence_tier": "CONFIRMED_HIGH"
  },
  "outliers_mahalanobis": [
    {
      "date": "2015-11",
      "observed_anomaly": -29.4,
      "expected_regression": -16.2,
      "mahalanobis_d": 3.12,
      "direction": "below_ellipse",
      "diagnostic_hint": "Drought peak associated with the 2015-2016 Super El Niño"
    }
  ],
  "series": {
    "dates": ["2002-04", "2002-05", "..."],
    "raw_values": [4.1, 6.2, "..."],
    "anomaly_values": [1.8, 2.0, "..."],
    "linear_fit": [2.14, 2.02, "..."],
    "gam_smooth_fit": [1.95, 1.90, "..."]
  }
}
```

### And for the 2-Region Divergence Comparator (`PROD-2`):

```json
{
  "comparison_pair": {
    "region_a_id": "amazon_south",
    "region_b_id": "sahel_east",
    "spatial_divergence_detected": true,
    "slope_difference_per_decade": -22.4,
    "multiscale_correlation": {
      "long_term_secular_r": -0.78,
      "short_term_detrended_r": -0.64,
      "paradox_type": "OPPOSING_SECULAR_AND_COUPLED_DIPOLE",
      "interpretation": "While Region A loses water over the long term (-14.2 cm/decade), Region B gains (+8.2 cm/decade), driven by a meridional shift of the ITCZ."
    }
  }
}
```

---

## 3. "Four-Eyes" Audit Checklist for Phase 5 and Phase 6 (`DADOS-2` + `NARR`)

Before recording the pitch video on Sunday (Phase 7) or declaring any "scientific finding" in Phase 5, the AI agent and the `DADOS-2` lead must pass every discovery through the **10 Hindemburg Shielding Tests**:

- [ ] **1. Zero Start/End Error:** Did the rate of change cited in text and video come from regression slope $B$ over the full point cloud (and **not** from subtracting the first value from the last)?
- [ ] **2. Seasonal Isolation (Leavitt):** Was regression computed on **deseasonalized monthly anomalies** (or full annual means), eliminating summer/winter contamination?
- [ ] **3. Variable Scale Respect:** If the variable is on an interval scale ($^\circ\text{C}$ or an anomaly with positive and negative values), did we ensure **no percentage ($\%$)** is attached to it on screen or in the script?
- [ ] **4. OLS vs. Robust (Theil-Sen) Agreement:** Do the Ordinary Least Squares slope ($B_{\text{OLS}}$) and Sen's Median Slope ($B_{\text{Sen}}$) point in the same direction? If they diverge, did we inspect which *outliers* outside the Mahalanobis ellipse caused the divergence?
- [ ] **5. Distinction Between Slope ($B$) and Correlation ($r$):** Did we clearly explain to the user both the speed of change ($B$, from regression) and the tightness/predictability of the cloud ($r$, from correlation)?
- [ ] **6. Curvature and Physical Constraint Check (GAM):** Does the smooth curve (GAM/Spline) show recent acceleration or physical saturation? Did we ensure no unconstrained polynomial produced a non-physical reversal at the ends of the series?
- [ ] **7. Diagnosis of "Bumps" and Sensor Breaks:** If there is a jump or "bump" in the series, did we verify in `DADOS-1`'s log that it is not a satellite swap (e.g., MODIS/VIIRS transition or GRACE gap)?
- [ ] **8. Significance Corrected for Climate Memory ($\text{AR}(1)$):** Does the reported $p\text{-value}$ account for effective sample size ($N_{\text{eff}}$)?
- [ ] **9. Spatial False Discovery Rate Control (FDR):** Did the significance map pass through the Benjamini-Hochberg filter so we do not paint $5\%$ of the planet as significant by pure chance?
- [ ] **10. Absence of Contaminated Correlation and Causal Caution:** When cross-referencing two variables or regions, did we ensure they are not derived from the same internal mathematical formula, and did we avoid claiming "X caused Y" without documented physical backing?

---

## 4. How to Explain Our Statistical Rigor in 20 Seconds in the Pitch Video (Phase 7)

In item 5 of the pitch video structure in [`ESTRATEGIA_TREND_DETECTIVE.md`](../general_strategy/ESTRATEGIA_TREND_DETECTIVE.md#L358) (*"5. Rigor: how we guarantee it's not noise"*), `NARR` can use a killer argument directly inspired by this knowledge base:

> **Suggested Pitch Script Line (High Impact on NASA Scientist Judges):**
> *"Most analyses fail by comparing only the start and end of a series — easily fooled by an El Niño year or seasonality. Our statistical engine first isolates climatological anomalies and analyzes the full 20-year cloud by combining robust Theil-Sen regression, Generalized Additive Models (GAM) to capture physical accelerations, bivariate Mahalanobis Distance outlier filtering, and significance tests corrected for climate memory ($\text{AR}(1)$) and spatial false positives (FDR). The result isn't just a pretty chart: it is auditable science."*
