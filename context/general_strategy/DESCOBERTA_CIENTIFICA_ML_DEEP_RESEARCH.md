# Descoberta Científica, Hipóteses & Pipeline ML (`earth_system_ml_discovery_v2` — `2.1_post_audit_passo0`)

**Papel Responsável:** `NARR` (Narrativa Científica & Síntese) em alinhamento com `DADOS-2` (Motor Estatístico & Camada Dinâmica) e `DADOS-1` (Ingestão Multi-Grade).
**Fontes de Verdade Observadas:**
- Deep Research base: [`Tendências Globais do Sistema Terrestre.md`](file:///home/zrhyan/Principal/Computation/Space%20Apps/Tend%C3%AAncias%20Globais%20do%20Sistema%20Terrestre.md)
- Camada 1 — Auditoria offline / benchmark científico: [`backend/ml_discovery.py`](file:///home/zrhyan/Principal/Computation/Space%20Apps/earth-system-detective-fliflop-34/backend/ml_discovery.py) (`schema_revision: 2.1_post_audit_passo0`)
- Evidências empíricas (`2001-01..2025-12`, $N = 300$ meses): [`backend/ml_discovery_results.json`](file:///home/zrhyan/Principal/Computation/Space%20Apps/earth-system-detective-fliflop-34/backend/ml_discovery_results.json)
- Camada 2 — Descoberta dinâmica sob demanda (`POST /api/discover`): [`backend/discovery_engine.py`](file:///home/zrhyan/Principal/Computation/Space%20Apps/earth-system-detective-fliflop-34/backend/discovery_engine.py) e roteador HTTP [`data/api/server.py`](file:///home/zrhyan/Principal/Computation/Space%20Apps/earth-system-detective-fliflop-34/data/api/server.py)
- Referências técnicas do motor e catálogo: [`backend/stats_engine.py`](file:///home/zrhyan/Principal/Computation/Space%20Apps/earth-system-detective-fliflop-34/backend/stats_engine.py) e [`data/catalog/environmental_catalog.py`](file:///home/zrhyan/Principal/Computation/Space%20Apps/earth-system-detective-fliflop-34/data/catalog/environmental_catalog.py)

---

## 1. Síntese Crítica do Deep Research & Janela Observacional Unificada

O levantamento [`Tendências Globais do Sistema Terrestre.md`](file:///home/zrhyan/Principal/Computation/Space%20Apps/Tend%C3%AAncias%20Globais%20do%20Sistema%20Terrestre.md) mapeou **15 fenômenos globais** distribuídos em **5 eixos físicos** que conectam aquecimento oceânico, circulação atmosférica, extremos hidrológicos e balanço radiativo em superfície:

1. **Eixo 1 — Forçamento Radiativo & Aerossóis (CERES / NASA POWER):** Declínio secular de cobertura de nuvens e *brightening* superficial em regiões de perda florestal ou deslocamento de bandas nubladas, contrastado por quedas agudas de irradiância em céu limpo (`CLRSKY_SFC_SW_DWN`) durante plumas intensas de fumaça/aerossóis.
2. **Eixo 2 — Hidrosfera & Extremos Hidrológicos (GloFAS):** Intensificação de cheias compostas e secas plurianuais em megabacias sul-americanas, exigindo separação física entre vazão mínima (`river_discharge_min`), média (`river_discharge`) e máxima (`river_discharge_max`) mensais reais, além de isolamento entre **sinais seculares** e **choques episódicos** de cauda pesada (*El Niño* 2015–2016, *La Niña* 2020–2023, cheias RS 2023–2024 e fumaça/seca 2023–2024).
3. **Eixo 3 — Criosfera & Albedo:** Alterações sutis de albedo superficial (`ALLSKY_SRF_ALB`) em bacias tropicais/subtropicais durante secas severas e plumas atmosféricas.
4. **Eixo 4 — Biosfera & Secas Compostas Solo–Atmosfera:** Acoplamento não linear entre precipitação (`PRECTOTCORR`), déficit de pressão de vapor convexo FAO-56 (`VPD_t2m_kpa`) e memória de umidade na zona radicular (`GWETROOT`).
5. **Eixo 5 — Termodinâmica Oceânica & Teleconexões:** Assimetrias entre Pacífico Equatorial (`pac_nino34`), Atlântico Tropical Norte/Sul (`atl_tn`, `atl_s`, gradiente meridional `atl_meridional_grad`) e Atlântico Extratropical (`atl_ne`), gerando teleconexões defasadas e gangorras continentais de precipitação e radiação.

### Restrição Metodológica Crítica (Janela 2001–2025)
Embora reanálises atmosféricas (`MERRA-2`) e hidrológicas (`GloFAS`) recuem à década de 1980, as observações radiativas **CERES SYN1deg (`ALLSKY_SFC_SW_DWN`, `CLRSKY_SFC_SW_DWN`, `CLOUD_AMT`, `ALLSKY_SRF_ALB`) iniciam em 2000–2001**. Para eliminar viés de composição amostral entre variáveis, o pipeline `earth_system_ml_discovery_v2` fixa a **janela estrita de interseção `2001-01` a `2025-12` ($N = 300$ meses)** nas 5 bacias sul-americanas validadas por GloFAS ao vivo e nas 4 caixas oceânicas (matriz *lagged* de $N = 294$ meses após defasagens de até 6 meses: `2001-07..2025-12`).

---

## 2. As 2 Hipóteses Científicas Refinadas (Pós-Auditoria v2.1)

Formulamos duas hipóteses falsificáveis sob correção conservadora de autocorrelação `AR(1)` (`max(p_naive, p_santer, p_hamed_rao)` em [`backend/stats_engine.py`](file:///home/zrhyan/Principal/Computation/Space%20Apps/earth-system-detective-fliflop-34/backend/stats_engine.py)) e controle múltiplo *Benjamini-Hochberg FDR* ($q < 0.05$):

### Hipótese 1 — Separação Radiativa Nuvem vs. Fumaça & Acoplamento Solo–VPD–Vazão
- **Enunciado:** O aumento secular da radiação solar incidente (`ALLSKY_SFC_SW_DWN`) nas bacias tropicais brasileiras entre 2001 e 2025 **não decorre de clareamento do céu sem nuvens (`CLRSKY_SFC_SW_DWN`)**, mas sim de um **recuo significativo da cobertura de nuvens (`CLOUD_AMT`) e do efeito radiativo de nuvens em ondas curtas (`sw_cloud_radiative_effect = CLRSKY - ALLSKY`)**. Em paralelo, eventos extremos de seca/queimadas geram **choques negativos episódicos em `CLRSKY_SFC_SW_DWN`** (`diagnose_smoke_cloud_decoupling`), detectáveis fora da elipse de Mahalanobis ($D_M > 2{,}5$), enquanto a adição de preditores hidrometeorológicos e radiativos agrega ganho de RMSE (*Out-of-Fold* `skill_rmse_vs_ar1 > 0`) sobre persistência `AR(1–3)`.
- **Predições Mensuráveis:**
  1. `ALLSKY_SFC_SW_DWN` sobe significativamente em Madeira (`+0.2927`) e Tapajós (`+0.3090 MJ/m²/dia/déc`) com `CLOUD_AMT` em queda (`-3.08` e `-2.82 p.p./déc`) e `CLRSKY_SFC_SW_DWN` estatisticamente estacionário (`q > 0.55`).
  2. Picos negativos de `CLRSKY_SFC_SW_DWN` em setembro de 2024 emergem como *outliers* extremos de Mahalanobis nas quatro bacias afetadas pela pluma continental (`D_M = 19.69` no Madeira; `9.96` no Guaíba; `9.88` no Tapajós; `8.33` no Paraná).
  3. O cálculo convexo **FAO-56** de `VPD_t2m_kpa` (via `T2M_MAX`, `T_min = 2·T2M - T2M_MAX` e `T2MDEW`) corrige o viés da Desigualdade de Jensen presente na aproximação por `T2M` médio.

### Hipótese 2 — Teleconexões Oceânicas Parciais (`Conditioned AR(1) + BH-FDR`) & Dipolos Sul-Americanos
- **Enunciado:** Após remoção simultânea da climatologia mensal, da tendência secular e do condicionamento ortogonal sobre memória local e ENSO ($\mathbf{Z}_{\text{total}}(\tau, k) = \{t, Y_{t-\tau}, \text{Niño3.4}_{t-\tau}\}$), teleconexões oceano–bacia fisicamente genuínas preservam significância dupla (`partial_fdr_q < 0.05` e `detrended_fdr_q < 0.05`), expondo:
  1. O acoplamento radiativo do **Atlântico Tropical Sul (`atl_s.CLRSKY_SFC_SW_DWN`, `atl_s.ALLSKY_SFC_SW_DWN`)** sobre vazão mínima no *Tapajós* (positivo, lag 3–4m) e *Paraná* (negativo, lag 1–3m);
  2. O **dipolo meridional atlântico** (`atl_meridional_grad.TS`, lag 1–2m) e **`atl_ne.TS` (`lag=2–4m`)** modulando vazão mínima e umidade do solo no *São Francisco*;
  3. O forçamento direto do **Pacífico Equatorial (`pac_nino34.TS` e `CLRSKY_SFC_SW_DWN`, lag 1–2m)** sobre o *Sul/Guaíba*, em oposição radiativa continental contra *São Francisco* (`r_detrended = -0.5288`) e *Tapajós* (`-0.2872`).

---

## 3. Auditoria Científica & Correções Implementadas (`v1 → v2.0 → v2.1_post_audit_passo0`)

| Vulnerabilidade Detectada | Correção Estado-da-Arte Implementada (`v2.1`) | Impacto Observado nos Dados |
| :--- | :--- | :--- |
| **1. Passo 0 — Achatamento de extremos GloFAS (`mean=min=max`) e fallback sintético em cache (`murray_darling`).** | [`open_meteo_flood.py`](file:///home/zrhyan/Principal/Computation/Space%20Apps/earth-system-detective-fliflop-34/data/connectors/open_meteo_flood.py) (`GLOFAS_AGGREGATION_VERSION = 2`): agregação diária física real `min`/`fmean`/`max`, recusa explícita de cache sem `agg_v == 2` e **proibição de gravar ou aceitar `glofas_calibrated_fallback` como válido**. | Razão física $\overline{Q}_{\max} / \overline{Q}_{\min}$ restaurada (**`7.11×`** no Guaíba vs `1.28×` no Paraná); **`murray_darling` reprovado (`valid=False`, `glofas_calibrated_fallback`)**, restando 5 bacias sul-americanas genuínas. |
| **2. Desigualdade de Jensen no `VPD_t2m_kpa` (aproximação linear por `T2M`).** | Formulação convexa **FAO-56**: $e_s = 0.5[e_s(T_{\max}) + e_s(T_{\min})]$ com $T_{\min} = \min(T_{\max}, 2\cdot\text{T2M} - T_{\max})$. | Inclinações de VPD corrigidas para cima: Madeira `+0.095 → +0.1340`, Paraná `+0.144 → +0.1880 kPa/déc` (`q=0.01233`), Tapajós `+0.138 → +0.1841`, São Francisco `+0.075 → +0.0953 kPa/déc`. |
| **3. Sub-estimativa de `p`-valor com `N ≥ 60` & correlação secular `OLS` enviesada.** | [`backend/stats_engine.py`](file:///home/zrhyan/Principal/Computation/Space%20Apps/earth-system-detective-fliflop-34/backend/stats_engine.py) adota envelope conservador `max(p_naive, p_santer, hr_p_out)` para `N ≥ 60`; `ml_discovery.py` computa **`secular_gam_r`** sobre curvas GAM suavizadas em vez de comparar retas. | Inferência múltipla resistente à variância finita de Santer e Hamed–Rao; acoplamento de longo prazo respeita geometria não linear. |
| **4. Vazamento sutil em CV & seleção oceânica fora dos folds.** | 5 blocos cronológicos com `purge_gap = 6` meses, dessazonalização *in-fold*, **detrending *in-fold*** no Modo B detrended e **seleção top-K de features oceânicas estritamente *in-fold***. | Elimina vazamento de seleção e garante avaliação out-of-sample com métrica **`skill_rmse_vs_ar1`**. |
| **5. Alvos ortogonais + parcialização em ENSO no scan oceânico.** | `TARGETS_TELECONNECTION = ("river_discharge_min", "GWETROOT")`, total de **850 testes** (`5 bacias × 2 alvos × 17 vars × 5 lags`), adicionando `partial_r` condicionado em $\mathbf{Z}_{\text{total}} = \{t, Y_{t-\tau}, \text{Niño3.4}_{t-\tau}\}$. | Filtra redundância ENSO/persistência: **96** passam *detrended FDR*, **53** estritos (`anom + detrend`), e **19** sobrevivem ao controle parcial rígido (`partial_fdr_q < 0.05`). |
| **6. Artefato de borda do Fold 0 no CUSUM do Modo B (`2006-11 / 2007-01 / 2007-11`).** | Em `evaluate_models_for_watershed`, o viés unilateral do Fold 0 (treinado apenas no futuro `2006-12..2025-12` e extrapolado para trás em `2001-07..2006-05`) é alinhado aos blocos interiores bilaterais (`folds[1:-1]`) antes de `detect_physical_coupling_break` (sem alterar `cv_oof_r2` nem `fold_metrics`). | Zera os falsos positivos de borda em `GWETROOT` (`2006-11 / 2007-01 / 2007-11`) e expõe quebras físicas reais no interior: **`2017-11`** (Paraná), **`2020-01/02`** (Madeira `q_min`), **`2020-11/12`** (Tapajós `q_min`) e **`2014-09`** (São Francisco `q_min`). |

---

## 4. Resultados Empíricos Verificados (`2001-01..2025-12`, $N = 300$)

### 4.1 Validação Hidrológica GloFAS (Snapping `9×9` `0.05°`, `agg_v = 2`)

| Bacia | Ponto Snapped (Calha) | Vazão Mínima Média (`q_min`) | Vazão Média (`river_discharge`) | Vazão Máxima Média (`q_max`) | Razão $\overline{Q}_{\max}/\overline{Q}_{\min}$ | Pico Máximo (`qmax_abs`) | Status |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`amazonia_madeira`** | `(-8.575, -63.725)` | `16.420,83 m³/s` | `20.223,24 m³/s` | `25.098,16 m³/s` | `1.53×` | `72.276,02 m³/s` | **VALID (`cache_hit` ao vivo)** |
| **`amazonia_tapajos`** | `(-4.125, -55.775)` | `10.573,83 m³/s` | `12.682,55 m³/s` | `14.945,38 m³/s` | `1.41×` | `36.896,76 m³/s` | **VALID (`cache_hit` ao vivo)** |
| **`parana_foz_iguacu`** | `(-25.725, -54.675)` | `10.019,05 m³/s` | `11.122,47 m³/s` | `12.787,97 m³/s` | `1.28×` | `36.056,88 m³/s` | **VALID (`cache_hit` ao vivo)** |
| **`sul_guaiba`** | `(-29.925, -51.525)` | `508,10 m³/s` | `1.594,06 m³/s` | `3.611,82 m³/s` | **`7.11×`** | `15.847,93 m³/s` | **VALID (`cache_hit` ao vivo)** |
| **`sao_francisco_sobradinho`** | `(-9.425, -40.525)` | `1.975,61 m³/s` | `2.345,54 m³/s` | `2.810,11 m³/s` | `1.42×` | `17.059,82 m³/s` | **VALID (`cache_hit` ao vivo)** |
| **`murray_darling`** | `(-34.125, 141.875)` | `202,04 m³/s` | `358,20 m³/s` | `539,10 m³/s` | `2.67×` | `938,95 m³/s` | **REPROVADA (`glofas_calibrated_fallback`)** |

---

### 4.2 Tendências Seculares (`Theil-Sen` por década + `AR(1)` Conservador + `BH-FDR`) e Choques ($D_M$)

#### A. Bacias Hidrográficas (Sinais Confirmados e Extremos de Mahalanobis)

| Bacia | Hidrologia & Seca Atmosférica (`VPD` FAO-56) | Balanço Radiativo & Desacoplamento Nuvem–Fumaça | Principais Extremos de Mahalanobis ($D_M$) |
| :--- | :--- | :--- | :--- |
| **`amazonia_madeira`** | `PRECTOTCORR`: **`-15,313 mm/mês/déc`** (`q=0.00003`)<br>`T2M`: **`+0,520 °C/déc`** (`q=0.00594`)<br>`VPD_t2m_kpa`: **`+0,1340 kPa/déc`** (`q=0.00685`)<br>`GWETROOT`: `-0,0217/déc` (`p_ar1=0.0585`, `q=0.111`)<br>`river_discharge_min`: `-364,04 m³/s/déc` (`q=0.809`, *NO_TREND*) | `ALLSKY`: **`+0,2927 MJ/m²/dia/déc`** (`q=0.02475`)<br>`CLOUD_AMT`: **`-3,0788 p.p./déc`** (`q=0.01319`)<br>`sw_cloud_rad_eff`: **`-0,2655 MJ/m²/dia/déc`** (`q=0.00043`)<br>`CLRSKY`: `+0,0120` (`q=0.990`, *estacionário*) | **Fumaça `CLRSKY` 2024-09:** `-8,171 MJ/m²/dia` (**$D_M = 19{,}69$**, `clrsky_z=-9.76`, `aerosol_masking=True`)<br>**`CLRSKY` 2007-09:** `-4,747` (**$D_M = 11{,}43$**)<br>**Albedo `2024-09`:** `+0,0445` (**$D_M = 10{,}36$**)<br>**Cheia `q_min` 2014-02:** `+26.385,7 m³/s` (**$D_M = 9{,}23$**)<br>**VPD 2023-11:** `+1,4437 kPa` ($D_M = 4{,}95$) |
| **`amazonia_tapajos`** | `PRECTOTCORR`: **`-20,834 mm/mês/déc`** (`q < 1e-5`)<br>`GWETROOT`: **`-0,0436/déc`** (`q=0.03524`)<br>`T2M`: **`+0,649 °C/déc`** (`q=0.00474`)<br>`VPD_t2m_kpa`: **`+0,1841 kPa/déc`** (`q=0.00685`)<br>`river_discharge_min`: `-602,59 m³/s/déc` (`q=0.309`, *NO_TREND*) | `ALLSKY`: **`+0,3090 MJ/m²/dia/déc`** (`q=0.00223`)<br>`CLOUD_AMT`: **`-2,8194 p.p./déc`** (`q=0.03524`)<br>`sw_cloud_rad_eff`: **`-0,2316 MJ/m²/dia/déc`** (`q=0.00305`)<br>`CLRSKY`: `+0,0386` (`q=0.554`, *NO_TREND*) | **Fumaça `CLRSKY` 2024-09:** `-3,503 MJ/m²/dia` (**$D_M = 9{,}88$**)<br>**Estiagem `q_min` 2024-03:** `-10.983,6 m³/s` (**$D_M = 7{,}09$**)<br>**Albedo 2023-08:** `+0,0224` ($D_M = 6{,}51$)<br>**VPD 2015-09:** `+1,3587 kPa` ($D_M = 5{,}12$) |
| **`parana_foz_iguacu`** | `river_discharge_min`: **`-2.470,84 m³/s/déc`** (`q=0.01039`)<br>`river_discharge`: **`-2.594,17 m³/s/déc`** (`q=0.01175`)<br>`PRECTOTCORR`: **`-10,526 mm/mês/déc`** (`q=0.01009`)<br>`GWETROOT`: **`-0,0257/déc`** (`q=0.01136`)<br>`T2M`: **`+0,590 °C/déc`** (`q=0.00223`)<br>`VPD_t2m_kpa`: **`+0,1880 kPa/déc`** (`q=0.01233`) | `CLOUD_AMT`: **`-2,4033 p.p./déc`** (`q=0.00613`)<br>`sw_cloud_rad_eff`: **`-0,2200 MJ/m²/dia/déc`** (`q=0.02475`)<br>`ALLSKY_SRF_ALB`: **`+0,0017/déc`** (`q=0.00594`)<br>`CLRSKY`: `-0,0758` (`p_ar1=0.07115`, `q=0.129`) | **Fumaça `CLRSKY` 2024-09:** `-2,545 MJ/m²/dia` (**$D_M = 8{,}33$**)<br>**`CLRSKY` 2005-09:** `-1,933` ($D_M = 6{,}84$)<br>**Cheia 2011-03:** `+17.724,2 m³/s` ($D_M = 7{,}35$)<br>**Cheia `q_min` 2010-02:** `+11.826,3 m³/s` ($D_M = 5{,}82$) |
| **`sul_guaiba`** | `T2M`: **`+0,354 °C/déc`** (`q=0.01825`)<br>`T2M_MAX`: **`+0,765 °C/déc`** (`q=0.01039`)<br>`VPD_t2m_kpa`: `+0,0804 kPa/déc` (`p_ar1=0.0483`, `q=0.0936`, *CONFIRMED_MODERATE*)<br>`river_discharge_min`: `-62,69 m³/s/déc` (`q=0.544`, *NO_TREND*) | `CLRSKY`: `-0,1109 MJ/m²/dia/déc` (`p_ar1=0.0356`, `q=0.0736`, *CONFIRMED_MODERATE*)<br>`ALLSKY_SRF_ALB`: `+0,0012/déc` (`p_ar1=0.0371`, `q=0.0750`)<br>`ALLSKY`: `+0,0225` (`q=0.944`, *NO_TREND*) | **Enchente RS 2024-05:** `q_min` `+3.621,95 m³/s` (**$D_M = 15{,}01$**), `q_mean` `+6.524,74 m³/s` (**$D_M = 8{,}80$**), `PRECTOTCORR` `+276,56 mm/mês` ($D_M = 5{,}25$)<br>**Fumaça `CLRSKY` 2024-09:** `-3,470` (**$D_M = 9{,}96$**)<br>**VPD 2020-03:** `+1,0265 kPa` ($D_M = 4{,}49$) |
| **`sao_francisco_sobradinho`** | `river_discharge_min`: **`-256,56 m³/s/déc`** (`q=0.01825`)<br>`river_discharge`: **`-331,59 m³/s/déc`** (`q=0.04609`)<br>`T2M`: **`+0,413 °C/déc`** (`q=0.00335`)<br>`VPD_t2m_kpa`: **`+0,0953 kPa/déc`** (`q=0.03660`)<br>`PRECTOTCORR`: `-2,053 mm/mês/déc` (`q=0.180`) | `sw_cloud_rad_eff`: **`-0,2100 MJ/m²/dia/déc`** (`q=0.03660`, *CONFIRMED_MODERATE*)<br>`ALLSKY`: `+0,1834` (`q=0.140`)<br>`CLOUD_AMT`: `-1,1460 p.p./déc` (`q=0.166`) | **Cheia La Niña 2022-02:** `q_min` `+6.442,35 m³/s` (**$D_M = 17{,}41$**), `q_mean` `+7.522,6 m³/s` (**$D_M = 14{,}25$**)<br>**Chuva 2016-01:** `+259,7 mm/mês` (**$D_M = 11{,}58$**)<br>**`GWETROOT` 2004-02:** `+0,1384` ($D_M = 8{,}66$) |

#### B. Caixas Oceânicas (`2001–2025`)

| Caixa Oceânica | Temperatura Superficial (`TS`) | Cobertura de Nuvens (`CLOUD_AMT`) |
| :--- | :--- | :--- |
| **`atl_ne`** (Atl. NE Subtropical) | **`+0,1802 °C/déc`** (`p_ar1=0.02037`, **`q=0.04629`**, *CONFIRMED_MODERATE*) | **`-4,3330 p.p./déc`** (`p_ar1=0.00001`, **`q=0.00036`**, *CONFIRMED_HIGH*) |
| **`atl_s`** (Atl. Tropical Sul) | `+0,0346 °C/déc` (`q=0.775`, *NO_TREND*) | **`-2,0478 p.p./déc`** (`p_ar1=0.00065`, **`q=0.00493`**, *CONFIRMED_HIGH*) |
| **`atl_tn`** (Atl. Tropical Norte) | `+0,0132 °C/déc` (`q=0.944`, *NO_TREND*) | `-2,0899 p.p./déc` (`p_ar1=0.03378`, `q=0.07149`, *CONFIRMED_MODERATE*) |
| **`pac_nino34`** (Niño 3.4) | `-0,0299 °C/déc` (`q=0.986`, *INSUFFICIENT_SIGNAL*) | `-0,5462 p.p./déc` (`q=0.776`, *NO_TREND*) |

---

### 4.3 Acoplamentos Locais, Dipolos Continentais & Teleconexões Parciais

#### A. Acoplamentos Locais Contemporâneos (*Detrended* `AR(1) + BH-FDR`)
- **`sul_guaiba`:** Controle pluvio-radiativo imediato: `PRECTOTCORR vs river_discharge` (**`det_r = +0.6872`**, `sec_r = +0.7837`) e `vs river_discharge_min` (**`det_r = +0.5134`**), `ALLSKY vs river_discharge_min` (**`det_r = -0.5292`**), `sw_cloud_radiative_effect vs q_min` (**`det_r = +0.4876`**), `CLOUD_AMT` (**`det_r = +0.4460`**), `CLRSKY` (`-0.3970`), `VPD_t2m_kpa` (`-0.3719`), todos com `q_d < 1e-5`.
- **`parana_foz_iguacu`:** `VPD_t2m_kpa vs river_discharge_min` (**`det_r = -0.4698`**, `sec_r = -0.9523`, `q_d < 1e-5`), `ALLSKY vs GWETROOT` (**`det_r = -0.4313`**, `q_d < 1e-5`), `PRECTOTCORR vs q` (`+0.2579`, `q_d = 0.00018`) e `vs q_min` (`+0.2164`, `q_d = 0.00222`).
- **`amazonia_tapajos`:** `PRECTOTCORR vs river_discharge` (`det_r = +0.3148`, `q_d < 1e-5`) e `vs q_min` (`+0.2066`, `q_d = 0.00426`), `ALLSKY_SRF_ALB vs GWETROOT` (`+0.1741`, `q_d = 0.01142`), `ALLSKY vs GWETROOT` (`-0.1611`, `q_d = 0.02916`).
- **`sao_francisco_sobradinho`:** `ALLSKY vs GWETROOT` (**`det_r = -0.5229`**, `q_d < 1e-5`), `VPD_t2m_kpa vs q_min` (**`det_r = -0.2907`**, `q_d = 0.00006`) e `CLRSKY vs q_min` (`-0.1603`, `q_d = 0.01824`).

#### B. Scan Ortogonal de 850 Teleconexões Oceânicas (`lag = 1, 2, 3, 4, 6 meses`)
- Total: **`850`** testes → **`67`** passam *anomaly FDR*, **`96`** passam *detrended FDR*, **`53`** satisfazem ambos estritos, e **`19` sobrevivem à correlação parcial condicionada em $\{t, Y_{t-\tau}, \text{Niño3.4}_{t-\tau}\}$ (`partial_fdr_q < 0.05`)**:

| Bacia Alvo (`variável`) | Caixa Oceânica & Variável | Lag | `partial_r` (`q_part`) | `detrended_r` (`q_det`) | $n_\text{eff}$ (`AR(1)`) | Interpretação Física |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| `amazonia_tapajos` (`q_min`) | `atl_s.CLRSKY_SFC_SW_DWN` | `4m` | **`+0.3522`** (`0.00015`) | `+0.3815` (`0.00005`) | `201.3` | Principal teleconexão radiativa independente de ENSO (tb `lag=3m`, `part_r=+0.2405`) |
| `parana_foz_iguacu` (`q_min`) | `atl_s.ALLSKY_SFC_SW_DWN` | `1m` | **`-0.3064`** (`0.00006`) | `-0.2477` (`0.00724`) | `299.0` | Sinal inverso via radiação/`CLOUD_AMT` (`+0.2470`, `q_part=0.00486`) no Atlântico Sul |
| `sao_francisco_sobradinho` (`GWETROOT`) | `atl_ne.TS` | `3m` | **`+0.2839`** (`0.03946`) | `+0.2572` (`0.02995`) | `152.1` | Modulação térmica extratropical do Atlântico NE (tb `lag=2m`, `part_r=+0.2665`) |
| `sul_guaiba` (`q_min`) | `pac_nino34.TS` | `2m` | **`+0.2596`** (`0.04090`) | `+0.3145` (`0.00942`) | `172.2` | Forçamento direto de *El Niño* após remover persistência de vazão (`lag=1m` `part_r=+0.2382`) |
| `sao_francisco_sobradinho` (`q_min`) | `atl_meridional_grad.TS` | `2m` | **`+0.2576`** (`0.03946`) | `+0.2965` (`0.00780`) | `179.0` | Dipolo meridional atlântico positivo (complementado por `atl_s.TS` `-0.2469`) |
| `sul_guaiba` (`q_min`) | `pac_nino34.CLRSKY_SFC_SW_DWN` | `2m` | **`-0.2447`** (`0.03352`) | `-0.3004` (`0.00724`) | `214.6` | Aumento de umidade/aerossóis sobre Niño 3.4 precede cheias no Sul |

#### C. Dipolos Espaciais entre Bacias (`compare_regions`, Mesma Variável)
- **Coerência Amazônia (`madeira` vs `tapajos`):** Forte sincronia *detrended* em `ALLSKY_SFC_SW_DWN` (`det_r = +0.6591`, `sec_r = +0.7813`, `p = 0.0`), `river_discharge` (`det_r = +0.5878`), `river_discharge_min` (`+0.5610`) e `GWETROOT` (`+0.5103`).
- **Gangorra Radiativa Sul vs. Centro-Norte (`ALLSKY_SFC_SW_DWN`):** `sul_guaiba` vs `sao_francisco_sobradinho` exibem forte anticorrelação (`det_r = -0.5288`, `sec_r = -0.4768`, `p = 0.0`); `amazonia_tapajos` vs `sul_guaiba` também opõem sinais (`det_r = -0.2872`, `p = 7.5e-7`), enquanto `parana_foz_iguacu` vs `sul_guaiba` co-variam (`det_r = +0.2904`, `p = 5.2e-7`).

---

### 4.4 Machine Learning: Modo A (`skill_rmse_vs_ar1`) vs. Modo B & Quebras CUSUM Limpas

Em todas as 5 bacias sob **5 blocos cronológicos purgados (`purge_gap = 6` meses)** com dessazonalização/detrending/seleção oceânica estritamente *in-fold*, modelos lineares/aditivos suaves (`RidgeCV`, `SplineGAM_Ridge`) dominam árvores sob extremos *out-of-range*:

| Bacia | Modo A `AR(1)` (`q_min`, `fold_R²` / `oof_R²`) | Melhor Modo A `q_min` (`skill_rmse_vs_ar1` / `fold_R²` / `oof_R²`) | Melhor Modo A `river_discharge` (`skill_rmse_vs_ar1` / `fold_R²`) | Modo B `GWETROOT` (`fold_R²` / `oof_R²`) | Quebra CUSUM Limpa (`RidgeCV` Modo B, sem artefato Fold 0) |
| :--- | :---: | :--- | :--- | :---: | :--- |
| **`parana_foz_iguacu`** | `0.4148` / `0.7584` (`SplineGAM`) | **`lagged_radiative` (`SplineGAM`)**: **`+0.0924`** (`0.3736` / **`0.8010`**) | **`lagged_radiative` (`SplineGAM`)**: **`+0.1516`** (`0.4874` / `0.7793`) | **`0.8467`** / **`0.9022`** (`SplineGAM`) | `q_min`: **`2017-11`** (`2.279` nível / `2.056` *detrended*) — megaseca<br>`GWETROOT`: **sem quebra espúria** (`stat=1.190`) |
| **`amazonia_tapajos`** | `0.3451` / `0.5471` (`RidgeCV`) | **`lagged_radiative` (`RidgeCV`)**: **`+0.1034`** (**`0.4438` / `0.6359`**) | **`lagged_radiative` (`RidgeCV`)**: `+0.0285` (`0.5350` / `0.6894`) | **`0.8983`** / **`0.9512`** (`RidgeCV`) | `q_min`: **`2020-11/12`** (`1.464` nível / `1.649` *detrended*)<br>`GWETROOT` *detrended*: **`2016-02`** (`1.534`, pós-El Niño; nível sem quebra `1.185`) |
| **`amazonia_madeira`** | `0.2615` / `0.4965` (`RidgeCV`) | **`lagged_radiative` (`RidgeCV`)**: **`+0.0757`** (**`0.3632` / `0.5698`**) | **`lagged_hydro_met` (`RidgeCV`)**: **`+0.0724`** (`0.4988` / `0.6574`) | **`0.8280`** / **`0.9050`** (`RidgeCV`) | `q_min`: **`2020-01/02`** (`1.692` nível / `1.757` *detrended*) — viés pós-2020 `-3.606 m³/s`<br>`GWETROOT` *detrended*: **`2016-02`** (`1.936`; nível sem quebra `0.928`) |
| **`sul_guaiba`** | `0.0704` / `0.1264` (`RidgeCV`) | **`lagged_hydro_met` (`RidgeCV`)**: **`+0.0434`** (`0.1425` / `0.2006`) | **`lagged_hydro_met` (`RidgeCV`)**: `+0.0373` (`0.1894` / `0.2430`) | **`0.9072`** / **`0.9212`** (`RidgeCV`) | **Zero quebras** em `q_min` (`1.028`), `q_mean` (`1.092`) e `GWETROOT` (`0.661`) — acoplamento estacionário; Modo B `q_mean = 0.4776` (`POST 2020 q_min = 0.397`) |
| **`sao_francisco_sobradinho`** | `0.0431` / `0.2500` (`HGBR`) | **`lagged_radiative` (`RF`)**: **`+0.0532`** (`0.1649` / `0.3276`) | **`lagged_radiative` (`RidgeCV`)**: **`+0.1277`** (**`0.4268` / `0.5693`**) | **`0.8544`** / **`0.8686`** (`RidgeCV`) | `q_min` nível: **`2014-09`** (`1.775`, seca de Sobradinho; *detrended* sem quebra `2020-03`, `stat=1.262`)<br>`GWETROOT`: sem quebra (`1.062` / `1.349`) |

---

## 5. Camada 2 — Motor Dinâmico Sob Demanda (`POST /api/discover` & `backend/discovery_engine.py`)

Para levar essas descobertas a qualquer ponto clicado pelo usuário no mapa (sem pré-computar um único local fixo), a **Camada 2** foi implementada em [`backend/discovery_engine.py`](file:///home/zrhyan/Principal/Computation/Space%20Apps/earth-system-detective-fliflop-34/backend/discovery_engine.py) e integrada ao roteador [`data/api/server.py`](file:///home/zrhyan/Principal/Computation/Space%20Apps/earth-system-detective-fliflop-34/data/api/server.py) no endpoint **`POST /api/discover`**:

1. **`detect_regime_and_gam_geometry`**: Calcula CUSUM sobre resíduos de Theil–Sen com correção `AR(1)` + derivadas de 1ª e 2ª ordem da curva GAM penalizada para classificar geometricamente o regime (`PHASE_REVERSAL_OR_HUMP_REGIME`, `PERSISTENT_ACCELERATING_REGIME_RAMP`, `STRUCTURAL_MEAN_SHIFT`, `SATURATING_DISSIPATIVE_TRAJECTORY`, `QUASI_LINEAR_SECULAR_REGIME`).
2. **`scan_dynamic_partial_teleconnections`**: Projeta ortogonalmente X e Y sobre $\mathbf{Z}_{\text{total}}(\tau, k) = \{t, Y_{t-\tau}, \text{Niño3.4}_{t-\tau}\}$ via matrizes cacheadas em RAM (`load_cached_ocean_anomalies`, leitura offline `allow_network=False` sobre `data/cache/storage/`), avalia distribuição Student-$t$ vetorizada com $df_{\text{eff}} = N_{\text{eff}}(e_X, e_Y) - 2 - |Z|$ e aplica *BH-FDR* em `< 50 ms` no subconjunto sintético e `~93 ms` nos 85 testes oceânicos reais em memória.
3. **`compute_fast_gcv_physical_attribution`**: Quando preditores locais secundários estão disponíveis, executa decomposição SVD fechada de Ridge com seleção analítica de $\lambda$ por **GCV (Generalized Cross-Validation)** em $O(n \cdot p^2)$, gerando resíduos LOO $(I - H)_{\text{diag}}^{-1}$ livres de viés de borda entre blocos e ranqueando drivers por `standardized_beta` e $\Delta R^2$.
4. **`attribute_mahalanobis_outliers`**: Cruza os picos detectados fora da elipse de Mahalanobis ($D_M > 2.5$) contra desvios extremos ($|z| \ge 1.5$) do Pacífico (`pac_nino34`) e do gradiente meridional atlântico (`atl_meridional_grad`) em defasagens `0..3` meses.

---

## 6. Rastreabilidade para o Pitch & Reprodutibilidade

- **Diferencial Científico para a Banca:** Em vez de correlações espúrias ou *overfitting* sazonal, entregamos **dois níveis complementares**: (i) validação rigorosa anti-vazamento em 5 bacias reais (`ml_discovery_results.json`, incluindo rejeição automática de fallback sintético em `murray_darling`, Jensen VPD FAO-56, quebra limpa pós-2017/2020 e teleconexões parciais ortogonais); e (ii) um motor algébrico dinâmico em tempo real (`POST /api/discover`) que replica a mesma assinatura forense para qualquer coordenada explorada na interface.
- **Reprodutibilidade:**
  - Invariantes sintéticos (Camada 1): `.venv/bin/python backend/ml_discovery.py --self-test`
  - Geração completa de evidências (`v2.1_post_audit_passo0`): `.venv/bin/python backend/ml_discovery.py`
  - Suítes unitárias de backend (`31` testes, incluindo `backend/test_discovery_engine.py`) e contratos de dados (`9` testes): `unittest discover` em `backend/` e `data/tests/`.
