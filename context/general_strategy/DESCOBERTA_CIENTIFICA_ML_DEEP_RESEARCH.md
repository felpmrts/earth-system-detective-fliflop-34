# Descoberta Científica, Hipóteses & Pipeline ML (`earth_system_ml_discovery_v2`)

**Papel Responsável:** `NARR` (Narrativa Científica & Síntese) em alinhamento com `DADOS-2` (Motor Estatístico) e `DADOS-1` (Ingestão Multi-Grade).
**Fontes de Verdade Observadas:**
- Deep Research base: [`Tendências Globais do Sistema Terrestre.md`](file:///home/zrhyan/Principal/Computation/Space%20Apps/Tend%C3%AAncias%20Globais%20do%20Sistema%20Terrestre.md)
- Pipeline executável: [`backend/ml_discovery.py`](file:///home/zrhyan/Principal/Computation/Space%20Apps/earth-system-detective-fliflop-34/backend/ml_discovery.py) (`earth_system_ml_discovery_v2`)
- Evidências empíricas (`2001-01..2025-12`, $N = 300$ meses): [`backend/ml_discovery_results.json`](file:///home/zrhyan/Principal/Computation/Space%20Apps/earth-system-detective-fliflop-34/backend/ml_discovery_results.json)
- Referências técnicas do motor: [`backend/stats_engine.py`](file:///home/zrhyan/Principal/Computation/Space%20Apps/earth-system-detective-fliflop-34/backend/stats_engine.py) e [`data/catalog/environmental_catalog.py`](file:///home/zrhyan/Principal/Computation/Space%20Apps/earth-system-detective-fliflop-34/data/catalog/environmental_catalog.py)

---

## 1. Síntese Crítica do Deep Research & Janela Observacional Unificada

O levantamento [`Tendências Globais do Sistema Terrestre.md`](file:///home/zrhyan/Principal/Computation/Space%20Apps/Tend%C3%AAncias%20Globais%20do%20Sistema%20Terrestre.md) mapeou **15 fenômenos globais** distribuídos em **5 eixos físicos** que conectam aquecimento oceânico, circulação atmosférica, extremos hidrológicos e balanço radiativo em superfície:

1. **Eixo 1 — Forçamento Radiativo & Aerossóis (CERES / NASA POWER):** Declínio secular de cobertura de nuvens e *brightening* superficial em regiões de perda florestal ou deslocamento de bandas nubladas, contrastado por quedas agudas de irradiância em céu limpo (`CLRSKY_SFC_SW_DWN`) durante plumas intensas de fumaça/aerossóis.
2. **Eixo 2 — Hidrosfera & Extremos Hidrológicos (GloFAS):** Intensificação de cheias compostas e secas plurianuais em megabacias sul-americanas e semiáridos regulados, exigindo separação clara entre **sinais de baixa frequência** e **choques episódicos** de cauda pesada (*El Niño* 2015–2016, *La Niña* 2020–2023, Super *El Niño* / anômalo 2023–2024).
3. **Eixo 3 — Criosfera & Albedo:** Redução de refletividade em altas latitudes/montanhas e alterações sutis de albedo superficial (`ALLSKY_SRF_ALB`) em bacias tropicais/subtropicais durante secas e deposição/plumas atmosféricas.
4. **Eixo 4 — Biosfera & Secas Compostas Solo–Atmosfera:** Acoplamento não linear entre precipitação (`PRECTOTCORR`), déficit de pressão de vapor (`VPD`) e memória de umidade na zona radicular (`GWETROOT`).
5. **Eixo 5 — Termodinâmica Oceânica & Teleconexões:** Assimetrias entre Pacífico Equatorial (*Niño 3.4*), Atlântico Tropical Norte/Sul (`atl_tn`, `atl_s`) e Atlântico Extratropical (`atl_ne`), gerando gradientes meridionais e gangorras continentais de precipitação e radiação.

### Restrição Metodológica Crítica (Janela 2001–2025)
Embora séries de reanálise atmosférica (`MERRA-2`) e hidrológica (`GloFAS`) recuem até a década de 1980, as observações radiativas **CERES SYN1deg (`ALLSKY_SFC_SW_DWN`, `CLRSKY_SFC_SW_DWN`, `CLOUD_AMT`, `ALLSKY_SRF_ALB`) iniciam em 2000–2001**. Para eliminar viés de composição amostral entre variáveis, o pipeline `earth_system_ml_discovery_v2` fixa a **janela estrita de interseção `2001-01` a `2025-12` ($N = 300$ meses)** em todas as 6 bacias e 4 caixas oceânicas (com matriz de treinamento e validação *lagged* de $N = 294$ meses após defasagens de até 6 meses: `2001-07..2025-12`).

---

## 2. As 2 Hipóteses Científicas Refinadas (Pós-Auditoria)

Para evitar correlações espúrias e *overfitting* comuns em séries geofísicas mensais ($N \approx 300$), formulamos duas hipóteses falsificáveis e quantificadas sob correção de autocorrelação `AR(1)` ($n_\text{eff}$ de Santer) e controle múltiplo *Benjamini-Hochberg FDR* ($q < 0.05$):

### Hipótese 1 — Separação Radiativa Nuvem vs. Fumaça & Acoplamento Solo–VPD–Vazão
- **Enunciado:** O aumento secular da radiação solar incidente (`ALLSKY_SFC_SW_DWN`) nas bacias tropicais/subtropicais brasileiras observadas entre 2001 e 2025 **não decorre de clareamento do céu sem nuvens (`CLRSKY_SFC_SW_DWN`)**, mas sim de um **recuo estatisticamente significativo da cobertura de nuvens (`CLOUD_AMT`) e do efeito radiativo de nuvens em ondas curtas (`sw_cloud_radiative_effect = CLRSKY - ALLSKY`)**. Em paralelo, eventos extremos de seca/queimadas geram **choques negativos agudos e episódicos em `CLRSKY_SFC_SW_DWN`** detectáveis fora da elipse de Mahalanobis ($D_M > 2{,}5$), enquanto a adição de preditores meteorológicos e radiativos em ML agrega poder preditivo além da persistência autorregressiva `AR(1–3)` principalmente em bacias com resposta de bacia ou balanço energético acoplado (*São Francisco, Paraná, Madeira, Guaíba, Tapajós*), mas falha frente à regulação artificial/armazenamento em bacias semiáridas fortemente manejadas (*Murray–Darling*).
- **Predições Mensuráveis:**
  1. `ALLSKY_SFC_SW_DWN` sobe significativamente em Madeira/Tapajós com `CLOUD_AMT` em queda e `CLRSKY_SFC_SW_DWN` estatisticamente estacionário (`NO_TREND`).
  2. Picos negativos de `CLRSKY_SFC_SW_DWN` em setembro de 2007 e 2024 emergem como *outliers* extremos de Mahalanobis ($D_M > 8$) mesmo sem tendência linear secular em `CLRSKY`.
  3. Modelos lineares/suaves regularizados (`RidgeCV`, `SplineGAM_Ridge`) superam ensembles baseados em árvore (`RandomForestRegressor`, `HistGradientBoostingRegressor`) fora da amostra em validação cruzada purgada quando $N \approx 240$ meses por dobra.

### Hipótese 2 — Teleconexões Oceânicas Descontadas de Tendência (`Detrended FDR`) e Dipolos Sul-Americanos
- **Enunciado:** Após remoção simultânea da climatologia mensal, da tendência linear secular de cada série e da redução de graus de liberdade via `AR(1)`, acoplamentos oceano–bacia fisicamente genuínos (`lag = 1..6 meses`) preservam significância dupla (`anomaly FDR q < 0.05` **e** `detrended FDR q < 0.05`), expondo:
  1. Um **dipolo meridional atlântico** (`atl_meridional_grad.TS`, Norte menos Sul) com sinais **opostos** sobre vazão mínima no *São Francisco* (positivo) e na *Amazônia/Madeira* (negativo);
  2. Um acoplamento robusto do **Pacífico Equatorial (`pac_nino34.TS` / `CLOUD_AMT`)** elevando descarga e umidade no *Sul/Guaíba* (1–4 meses) e reduzindo radiação incidente no *Paraná* em oposição ao clareamento no *Tapajós* (*gangorra ENSO tropical–subtropical*);
  3. Uma **gangorra radiativa continental sul-americana** (`ALLSKY_SFC_SW_DWN`) com correlação *detrended* negativa entre *Sul/Guaíba* e *São Francisco* / *Tapajós*, contrastando com independência dinâmica (*divergência espacial*) em relação à bacia controle australiana *Murray–Darling*.

---

## 3. Auditoria Científica & Correções Implementadas (`v1 → v2`)

Antes de gerar os números finais, o pipeline [`backend/ml_discovery.py`](file:///home/zrhyan/Principal/Computation/Space%20Apps/earth-system-detective-fliflop-34/backend/ml_discovery.py) passou por revisão científica e estatística rigorosa, eliminando 6 vulnerabilidades metodológicas da versão inicial (`v1`):

| Vulnerabilidade Detectada na v1 | Correção Estado-da-Arte Implementada na v2 | Impacto Observado nos Dados |
| :--- | :--- | :--- |
| **1. Célula fora da calha principal no GloFAS** (ex.: `sul_guaiba` em ponto seco/afluente com média ~2 m³/s e correlação negativa espúria com chuva). | **Snapping hidrológico em grade `9×9` (`0.05°`)** (`snap_glofas_main_channel`) com *backoff* exponencial e cache persistente em `glofas_snapping_v2.json`. | `sul_guaiba` capturou o eixo Jacuí–Taquari (`-29.925, -51.525`): média saltou para **`1.594,06 m³/s`** (`max = 7.896,96 m³/s`), `PRECTOTCORR vs q_min` mudou para **`det_r = +0.6881`** e teleconexões estritas dobraram (**30 → 75**). |
| **2. Mistura de grades MERRA-2 (`0.5°×0.625°`) e CERES (`1.0°×1.0°`)** na mesma chamada de ingestão. | **Consultas separadas por grade nativa** (`5` células distribuídas por bacia; `4` células por caixa oceânica) antes da agregação espacial. | Preservação integral da resolução nativa de `PRECTOTCORR`/`T2M`/`GWETROOT` (MERRA-2) e `ALLSKY`/`CLRSKY`/`CLOUD_AMT`/`ALB` (CERES). |
| **3. Vazamento de dados em CV & features triviais:** dessazonalização pré-split usando todo 2001–2025, `sin_month`/`cos_month`, `ar1_24m` e `GWETTOP_t` para prever `GWETROOT`. | **5 blocos cronológicos com `purge_gap = 6` meses** + dessazonalização **estritamente *in-fold***; remoção de termos harmônicos, `ar1_24m` e `GWETTOP_t` contemporâneo em alvos de umidade do solo. | Separação limpa entre **Modo A (previsão causal `t-k → t`)** e **Modo B (atribuição física contemporânea sem `discharge_lag1`)** comparados contra `ar1_persistence`. |
| **4. Unidades e proxies imprecisos:** `ALLSKY`/`CLRSKY` com `%` em `W/m²`, nome `aerosol_cloud_gap` para efeito de nuvem, VPD via `T2M_MAX` e `%` em razões limitadas. | Correção oficial em [`environmental_catalog.py`](file:///home/zrhyan/Principal/Computation/Space%20Apps/earth-system-detective-fliflop-34/data/catalog/environmental_catalog.py) (`MJ/m²/dia`), `VPD_t2m_kpa` calculado com `T2M` + `T2MDEW`, renomeação para `sw_cloud_radiative_effect`, e `allow_percentage_change = False` em frações/percentuais/diferenças. | Conformidade completa com os **7 Invariantes Estatísticos** (Invariante #3 validado em `--self-test`). |
| **5. Uso indevido de `compare_regions` em pares cross-variável locais & falta de *detrending* em teleconexões.** | Reserva `compare_regions` apenas para **dipolos espaciais mesma-variável entre bacias**; cria `_compute_local_multiscale_coupling` e aplica **AR(1) + BH-FDR em anomalias E resíduos *detrended***. | Distingue tendência secular compartilhada de acoplamento dinâmico mês a mês (`75` pares estritos de `1.530` testes). |
| **6. Extrapolação de slope em 6 anos (2020–2025) & bootstrap `freq > 1.0`.** | Remoção de tendências pós-2020 substituídas por `_regime_shift_error_diagnostics` (R², MAE, viés e `% resid > 2σ` pré vs. pós-2020); deduplicação por árvore (`seen_in_tree`) em `_bootstrap_regime_thresholds`. | Viés de seca extrema pós-2020 exposto quantitativamente; `bootstrap_selection_freq` garantido em `[0.0, 1.0]`. |

---

## 4. Resultados Empíricos Verificados (`2001-01..2025-12`, $N = 300$)

### 4.1 Validação Hidrológica GloFAS (Snapping `9×9` `0.05°`)

| Bacia | Coordenada Nominal | Ponto Snapped (Calha Principal) | Vazão Média (`river_discharge`) | Mínimo / Máximo Mensal | Pico Máximo (`qmax_max`) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **`amazonia_madeira`** | `[-8.76, -63.91]` | `(-8.575, -63.725)` | `20.223,24 m³/s` | `3.010,98` / `66.389,95 m³/s` | `66.389,95 m³/s` |
| **`amazonia_tapajos`** | `[-4.28, -55.98]` | `(-4.125, -55.775)` | `12.682,55 m³/s` | `2.288,04` / `35.247,49 m³/s` | `35.247,49 m³/s` |
| **`parana_foz_iguacu`** | `[-25.50, -54.60]` | `(-25.725, -54.675)` | `11.122,47 m³/s` | `4.406,88` / `29.808,60 m³/s` | `29.808,60 m³/s` |
| **`sao_francisco_sobradinho`** | `[-9.42, -40.60]` | `(-9.425, -40.525)` | `2.345,54 m³/s` | `907,61` / `10.799,10 m³/s` | `10.799,10 m³/s` |
| **`sul_guaiba`** | `[-29.925, -51.725]` | `(-29.925, -51.525)` | `1.594,06 m³/s` | `128,79` / `7.896,96 m³/s` | `8.162,85 m³/s` |
| **`murray_darling`** | `[-34.12, 141.92]` | `(-34.125, 141.875)` | `358,20 m³/s` | `78,94` / `597,34 m³/s` | `938,95 m³/s` |

---

### 4.2 Tendências Seculares (`Theil-Sen` por década + `AR(1)` + `BH-FDR`) e Choques de Mahalanobis ($D_M$)

#### A. Bacias Hidrográficas (Sinais Confirmados e Extremos Históricos)

| Bacia | Hidrologia & Seca Atmosférica (`q_FDR < 0.05` salvo indicação) | Balanço Radiativo (`ALLSKY` vs `CLRSKY` vs `CLOUD_AMT`) | Principais Extremos de Mahalanobis ($D_M$) |
| :--- | :--- | :--- | :--- |
| **`amazonia_madeira`** | `PRECTOTCORR`: **`-15,31 mm/mês/déc`** (`q=0.000016`)<br>`T2M`: **`+0,520 °C/déc`** (`q=0.00354`)<br>`VPD_t2m_kpa`: **`+0,0952 kPa/déc`** (`q=0.01180`)<br>`GWETROOT`: `-0,0217/déc` (`p_ar1=0.0296`, `q=0.0607`, *moderado*)<br>`river_discharge`: `-354,44 m³/s/déc` (`q=0.776`, *NO_TREND*) | `ALLSKY`: **`+0,2927 MJ/m²/dia/déc`** (`q=0.01730`)<br>`CLOUD_AMT`: **`-3,079 p.p./déc`** (`q=0.00831`)<br>`sw_cloud_rad_eff`: **`-0,2655 MJ/m²/dia/déc`** (`q=0.00025`)<br>`CLRSKY`: `+0,0120` (`q=0.973`, *estacionário*) | **Fumaça `CLRSKY` 2024-09:** `-8,171 MJ/m²/dia` (**$D_M = 19{,}69$**)<br>**`CLRSKY` 2007-09:** `-4,747` (**$D_M = 11{,}43$**)<br>**Albedo `2024-09`:** `+0,0445` (**$D_M = 10{,}36$**)<br>**Cheia 2014-02:** `+27.071,6 m³/s` ($D_M = 7{,}42$)<br>**Calor/VPD 2023-11:** `+4,04 °C` ($D_M = 4{,}60$), `+1,18 kPa` ($D_M = 5{,}22$) |
| **`amazonia_tapajos`** | `PRECTOTCORR`: **`-20,83 mm/mês/déc`** (`q < 1e-6`)<br>`GWETROOT`: **`-0,0436/déc`** (`q=0.01895`)<br>`T2M`: **`+0,649 °C/déc`** (`q=0.00251`)<br>`VPD_t2m_kpa`: **`+0,1381 kPa/déc`** (`q=0.00400`)<br>`river_discharge`: `-700,02 m³/s/déc` (`q=0.306`, *NO_TREND*) | `ALLSKY`: **`+0,3090 MJ/m²/dia/déc`** (`q=0.00153`)<br>`CLOUD_AMT`: **`-2,819 p.p./déc`** (`q=0.01895`)<br>`sw_cloud_rad_eff`: **`-0,2316 MJ/m²/dia/déc`** (`q=0.00162`)<br>`CLRSKY`: `+0,0386` (`q=0.531`, *estacionário*) | **Fumaça `CLRSKY` 2024-09:** `-3,503 MJ/m²/dia` (**$D_M = 9{,}88$**)<br>**Estiagem 2024-03:** `-12.197,8 m³/s` (**$D_M = 6{,}36$**)<br>**Albedo 2023-08:** `+0,0224` ($D_M = 6{,}51$)<br>**VPD 2015-09:** `+1,38 kPa` ($D_M = 6{,}15$) |
| **`parana_foz_iguacu`** | `river_discharge_min`: **`-2.595,86 m³/s/déc`** (`q=0.00831`)<br>`PRECTOTCORR`: **`-10,53 mm/mês/déc`** (`q=0.00732`)<br>`GWETROOT`: **`-0,0257/déc`** (`q=0.00970`)<br>`T2M`: **`+0,590 °C/déc`** (`q=0.00131`)<br>`VPD_t2m_kpa`: **`+0,1440 kPa/déc`** (`q=0.00727`) | `CLOUD_AMT`: **`-2,403 p.p./déc`** (`q=0.00400`)<br>`sw_cloud_rad_eff`: **`-0,2200 MJ/m²/dia/déc`** (`q=0.01730`)<br>`ALLSKY_SRF_ALB`: **`+0,0017/déc`** (`q=0.00354`)<br>`CLRSKY`: `-0,0758` (`p_ar1=0.0382`, `q=0.0751`, *moderado*) | **Fumaça `CLRSKY` 2024-09:** `-2,545 MJ/m²/dia` (**$D_M = 8{,}33$**)<br>**`CLRSKY` 2005-09:** `-1,933` ($D_M = 6{,}84$)<br>**Cheia 2011-03:** `+17.724,4 m³/s` ($D_M = 7{,}38$)<br>**Cheia 2016-01:** `+13.739,7 m³/s` ($D_M = 6{,}23$) |
| **`sul_guaiba`** | `T2M`: **`+0,354 °C/déc`** (`q=0.01548`)<br>`T2M_MAX`: **`+0,765 °C/déc`** (`q=0.00921`)<br>`VPD_t2m_kpa`: `+0,0389 kPa/déc` (`p_ar1=0.0447`, `q=0.0862`, *moderado*)<br>`river_discharge`: `-181,69 m³/s/déc` (`q=0.369`, *NO_TREND*)<br>`PRECTOTCORR`: `-11,50 mm/mês/déc` (`q=0.126`) | `CLRSKY`: **`-0,1109 MJ/m²/dia/déc`** (`p_ar1=0.0203`, `q=0.04486`, *CONFIRMED_MODERATE*)<br>`ALLSKY`: `+0,0225` (`q=0.884`, *NO_TREND*)<br>`CLOUD_AMT`: `-1,033 p.p./déc` (`q=0.273`, *NO_TREND*) | **Enchente RS 2024-05:** `qmax` `+6.788,6 m³/s` (**$D_M = 9{,}07$**), `q_mean` `+6.524,7 m³/s` (**$D_M = 8{,}80$**), `PRECTOTCORR` `+276,6 mm/mês` ($D_M = 5{,}25$)<br>**Cheia 2023-11:** `q_mean` `+5.596,8 m³/s` ($D_M = 7{,}62$)<br>**Fumaça `CLRSKY` 2024-09:** `-3,470` (**$D_M = 9{,}96$**)<br>**VPD 2022-01:** `+0,612 kPa` ($D_M = 6{,}29$) |
| **`sao_francisco_sobradinho`** | `river_discharge`: **`-331,59 m³/s/déc`** (`p_ar1=0.0104`, `q=0.02576`, *CONFIRMED_MODERATE*)<br>`T2M`: **`+0,413 °C/déc`** (`q=0.00251`)<br>`VPD_t2m_kpa`: **`+0,0754 kPa/déc`** (`q=0.01895`)<br>`PRECTOTCORR`: `-2,05 mm/mês/déc` (`q=0.183`) | `sw_cloud_rad_eff`: **`-0,2100 MJ/m²/dia/déc`** (`p_ar1=0.0151`, `q=0.03505`, *CONFIRMED_MODERATE*)<br>`ALLSKY`: `+0,1834` (`q=0.143`)<br>`CLOUD_AMT`: `-1,146 p.p./déc` (`q=0.152`) | **Cheia La Niña 2022-02:** `+7.522,6 m³/s` (**$D_M = 14{,}25$**)<br>**Chuva 2016-01:** `+259,7 mm/mês` (**$D_M = 11{,}58$**)<br>**`GWETROOT` 2004-02:** `+0,1384` ($D_M = 8{,}66$) |
| **`murray_darling`** *(Controle)* | `river_discharge`: **`+18,84 m³/s/déc`** (`q=0.01640`, recuperação pós-*Millennium Drought*)<br>`river_discharge_min`: `+5,07 m³/s/déc` (`q=0.291`)<br>`PRECTOTCORR`: `+1,66` (`q=0.464`), `T2M`: `+0,123` (`q=0.471`) | `CLRSKY`: **`-0,1163 MJ/m²/dia/déc`** (`q=0.00025`)<br>`ALLSKY_SRF_ALB`: `-0,0050/déc` (`p_ar1=0.0260`, `q=0.0562`, *moderado*)<br>`ALLSKY` & `CLOUD_AMT`: *NO_TREND* | **La Niña 2022-10 / 2022-11:** `PRECTOTCORR` `+152,9 mm/mês` (**$D_M = 7{,}83$**), `GWETROOT` `+0,1826` (**$D_M = 6{,}27$**), `ALLSKY` `-4,78` ($D_M = 5{,}59$)<br>**Calor/VPD 2019-01:** `VPD +1,00 kPa` ($D_M = 5{,}35$) |

**Corroboração Direta da Hipótese 1:** Em `amazonia_madeira` e `amazonia_tapajos`, `ALLSKY_SFC_SW_DWN` sobe `+0,29` a `+0,31 MJ/m²/dia/déc` enquanto `CLOUD_AMT` recua `-2,82` a `-3,08 p.p./déc` e `CLRSKY_SFC_SW_DWN` permanece sem tendência (`q > 0.53`), mas registra os maiores *outliers* absolutos de Mahalanobis de todo o estudo em **setembro de 2024** (`D_M = 19,69` no Madeira; `9,96` no Guaíba; `9,88` no Tapajós; `8,33` no Paraná) — assinatura limpa das plumas continentais de fumaça da Amazônia e do Pantanal/Cerrado.

#### B. Caixas Oceânicas (`2001–2025`)

| Caixa Oceânica | Temperatura Superficial (`TS`) | Cobertura de Nuvens (`CLOUD_AMT`) | Radiação (`ALLSKY` / `CLRSKY`) |
| :--- | :--- | :--- | :--- |
| **`atl_ne`** (Atl. NE Subtropical) | **`+0,1802 °C/déc`** (`p_ar1=0.0103`, `q=0.0258`, *CONFIRMED_MODERATE*) | **`-4,333 p.p./déc`** (`p_ar1=6.1e-6`, `q=0.00022`, *CONFIRMED_HIGH*) | Sem tendência (`q > 0.19`) |
| **`atl_s`** (Atl. Tropical Sul) | `+0,0346 °C/déc` (`q=0.697`, *NO_TREND*) | **`-2,048 p.p./déc`** (`p_ar1=0.00033`, `q=0.00287`, *CONFIRMED_HIGH*) | Sem tendência (`q > 0.16`) |
| **`atl_tn`** (Atl. Tropical Norte) | `+0,0132 °C/déc` (`q=0.892`, *NO_TREND*) | `-2,090 p.p./déc` (`p_ar1=0.0298`, `q=0.0607`, *CONFIRMED_MODERATE*, não passa FDR) | Sem tendência (`q > 0.37`) |
| **`pac_nino34`** (Niño 3.4) | `-0,0299 °C/déc` (`q=0.906`, *INSUFFICIENT_SIGNAL*) | `-0,546 p.p./déc` (`q=0.465`, *NO_TREND*) | Sem tendência (`q > 0.67`) |

---

### 4.3 Acoplamentos Locais, Dipolos Continentais & Teleconexões Oceânicas

#### A. Acoplamentos Locais Contemporâneos (*Detrended* `AR(1) + BH-FDR`)
- **`sul_guaiba`:** Forte controle pluviométrico-radiativo local: `PRECTOTCORR vs river_discharge_min` (**`det_r = +0.6881`**, `q_d < 1e-5`), `ALLSKY vs river_discharge_min` (**`det_r = -0.5719`**), `sw_cloud_radiative_effect vs river_discharge_min` (**`det_r = +0.5595`**), `CLOUD_AMT` (**`det_r = +0.4814`**) e `VPD_t2m_kpa` (**`det_r = -0.4774`**).
- **`parana_foz_iguacu`:** `VPD_t2m_kpa vs river_discharge_min` (**`det_r = -0.4667`**, `q_d < 1e-5`), `ALLSKY vs GWETROOT` (**`det_r = -0.4313`**), `PRECTOTCORR vs q_min` (`det_r = +0.2577`, `q_d = 0.00017`) e `sw_cloud_radiative_effect vs q_min` (`det_r = +0.2384`).
- **`amazonia_tapajos`:** `PRECTOTCORR vs river_discharge_min` (`det_r = +0.3148`, `q_d < 1e-5`), `sw_cloud_radiative_effect vs q_min` (`det_r = +0.2458`, `q_d = 0.00052`), `ALLSKY vs q_min` (`det_r = -0.1884`) e `ALLSKY_SRF_ALB vs GWETROOT` (`det_r = +0.1741`, `q_d = 0.0113`).
- **`amazonia_madeira`:** Em vazão mensal média/mínima, o atraso hidrodinâmico de grande bacia dilui a correlação contemporânea (`PRECTOTCORR vs q_min`: `anom_r = +0.1635 q = 0.044`, `det_r = +0.1514 q_d = 0.05095`; `sw_cloud_radiative_effect`: **`det_r = +0.1532 q_d = 0.02963`**, único par local significante após *detrending* e FDR!).
- **`sao_francisco_sobradinho`:** `ALLSKY vs GWETROOT` (**`det_r = -0.5229`**, `q_d < 1e-5`) e `VPD_t2m_kpa vs q_min` (**`det_r = -0.3672`**, `q_d < 1e-5`), além de fraca associação negativa `CLRSKY vs q_min` (`det_r = -0.1679`, `q_d = 0.0155`).
- **`murray_darling`:** **Desacoplamento total entre clima contemporâneo e vazão** (`|det_r| <= 0.048`, todos `q_d >= 0.66` contra `river_discharge`/`q_min`), enquanto o **solo (`GWETROOT`) responde fortemente à energia superficial** (`ALLSKY vs GWETROOT det_r = -0.5025`, `ALLSKY_SRF_ALB vs GWETROOT det_r = -0.4850`, ambos `q_d < 0.0001`).

#### B. Scan de 1.530 Teleconexões Oceânicas (`lag = 1, 2, 3, 4, 6 meses`)
- Total de testes: **`1.530`** → **`90`** passam *BH-FDR* em anomalias (`q < 0.05`), **`110`** passam *BH-FDR* em séries ***detrended*** (`q_det < 0.05`), e **`75`** satisfazem **ambos os critérios simultaneamente (`significant_strict_both_fdr05_count = 75`)**.

| Bacia Alvo (`variável`) | Caixa Oceânica & Variável | Lag | `anom_r` (`q_FDR`) | `detrended_r` (`q_det_FDR`) | $n_\text{eff}$ (`AR(1)`) | Interpretação Física |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| `sul_guaiba` (`river_discharge`) | `pac_nino34.TS` | `1m` | `+0.3669` (`0.00454`) | **`+0.3694`** (`0.00609`) | `120.4` | Aquecimento Niño 3.4 fortalece jato de baixos níveis e ciclogênese sobre RS |
| `sul_guaiba` (`GWETROOT`) | `pac_nino34.CLOUD_AMT` | `4m` | `+0.3583` (`0.02322`) | **`+0.3589`** (`0.02349`) | `84.6` | Convecção equatorial prolongada mantém recarga de solo no Sul (tb `lag=6m`, `det_r=+0.3389`) |
| `sul_guaiba` (`river_discharge_min`) | `pac_nino34.CLRSKY_SFC_SW_DWN` | `2m` | `-0.3222` (`0.00295`) | **`-0.3240`** (`0.00452`) | `170.6` | Aumento de umidade/aerossóis no Pacífico central precede maiores vazões mínimas |
| `sao_francisco_sobradinho` (`q_min`) | `atl_meridional_grad.TS` | `1m` | `+0.3324` (`0.01794`) | **`+0.3435`** (`0.01039`) | `109.7` | **Dipolo Atlântico positivo:** `atl_s.TS` frio (`det_r=-0.3375`, `q_det=0.00733`) eleva vazão no São Francisco |
| `amazonia_madeira` (`q_min`) | `atl_meridional_grad.TS` | `2m` | `-0.3337` (`0.04885`) | **`-0.3357`** (`0.04499`) | `78.3` | **Sinal oposto:** Atlântico Norte mais quente que o Sul desloca a ZCIT para norte e seca o Madeira |
| `amazonia_tapajos` (`q_min`) | `atl_s.CLRSKY_SFC_SW_DWN` | `4m` | `+0.3718` (`0.00037`) | **`+0.3444`** (`0.00161`) | `180.7` | Precursor radiativo do Atlântico Sul ligado ao ciclo de estacionalidade/seca do Tapajós (`lag=3–4m`) |
| `parana_foz_iguacu` *(detrended only)* | `pac_nino34.ALLSKY_SFC_SW_DWN` | `1m` | `-0.3199` (`0.07060`) | **`-0.4008`** (`0.00818`) | — | Redução de radiação sobre Niño 3.4 precede queda em `q`/radiação no Paraná (via anomalia convectiva) |
| `amazonia_tapajos` *(detrended only)* | `pac_nino34.ALLSKY_SFC_SW_DWN` | `2m` | `+0.3592` (`0.07685`) | **`+0.3992`** (`0.03296`) | — | **Oposto ao Paraná:** convecção no Pacífico central reduz nuvens e eleva `ALLSKY` no Tapajós (`CLOUD_AMT det_r=-0.3566`) |

#### C. Dipolos Espaciais entre Bacias (`compare_regions`, Mesma Variável)
- **Coerência Intra-Amazônica e Amazônia–Cerrado:** `amazonia_madeira` vs `amazonia_tapajos` exibem forte sincronia *detrended* em `ALLSKY_SFC_SW_DWN` (`det_r = +0.6591`, `p = 0.0`), `river_discharge_min` (`+0.5879`, `p = 2e-8`) e `GWETROOT` (`+0.5103`). `amazonia_tapajos` vs `sao_francisco_sobradinho` também co-variam positivamente em `ALLSKY` (`det_r = +0.4422`), `PRECTOTCORR` (`+0.3381`) e `GWETROOT` (`+0.3015`).
- **Gangorra Radiativa Continental (Sul vs. Centro-Norte):** `sul_guaiba` vs `sao_francisco_sobradinho` apresentam forte **anticorrelação em `ALLSKY_SFC_SW_DWN` (`det_r = -0.5288`, `p = 0.0`, secular `r = -0.4768`)**, e `amazonia_tapajos` vs `sul_guaiba` também opõem sinais (`det_r = -0.2872`, `p = 7.5e-7`), enquanto `parana_foz_iguacu` vs `sul_guaiba` co-variam (`+0.2904`). Já os 25 pares contra `murray_darling` exibem `spatial_divergence_detected = True` com fraco vínculo dinâmico (`|det_r| <= 0.192`).

---

### 4.4 Descoberta de Machine Learning: Modo A (Previsão) vs. Modo B (Atribuição Física)

#### Descoberta Central 1 — `RidgeCV` e `SplineGAM_Ridge` Superam Árvores (`RF` e `HistGradientBoosting`)
Em todas as 6 bacias sob **validação cruzada cronológica purgada (5 blocos, `purge_gap = 6` meses, dessazonalização estrita *in-fold*, ~217–235 amostras de treino por dobra)**, os modelos **lineares L2 (`RidgeCV`) e aditivos suaves (`SplineGAM_Ridge`) venceram sistematicamente os algoritmos baseados em árvore** em quase todos os alvos de `river_discharge_min` e `GWETROOT`:
- Exemplo emblemático (`parana_foz_iguacu`, `GWETROOT` Modo B): `SplineGAM_Ridge` = **`0.8424`**, `RidgeCV` = `0.8299`, contra `HGBR` = `0.7756` (`Δ = -0.0543`) e `RF` = `0.6854`.
- Exemplo em previsão causal (`parana_foz_iguacu`, `river_discharge_min` Modo A `lagged_radiative`): `SplineGAM_Ridge` alcança **`fold_mean_r2 = 0.4821` (`cv_oof_r2 = 0.7776`)**, superando `AR(1)` em **`+0.1204`**.
- **Por que isso é ouro científico?** Em séries mensais de ~240 observações com extremos históricos inéditos (*out-of-range*), árvores de decisão particionam ruído em *splits* discretos e **saturam/achatam fora do intervalo de treino**, enquanto `RidgeCV` e `SplineGAM_Ridge` extrapolam de forma contínua e regularizada. A única exceção pontual onde `RandomForest` liderou dentro de um sub-regime ocorreu nos regimes `lagged_ocean_only` e `lagged_full_teleconnection` do *Guaíba* (ainda assim abaixo de `lagged_hydro_met` `RidgeCV`).

#### Descoberta Central 2 — Tabela Comparativa Completa: Modo A (`river_discharge_min`) e Modo B (`river_discharge_min` & `GWETROOT`)

| Bacia | Modo A `AR(1)` (`fold_R²` / `oof_R²`) | Melhor Modo A & Ganho (`skill_vs_ar1`) | Modo B `river_discharge_min` (sem `q_lag1`, `fold_R²`) | Modo B `GWETROOT` (`fold_R²` & `Δ_rad`) | Diagnóstico Pós-2020 (Melhor Modo B) |
| :--- | :---: | :--- | :---: | :---: | :--- |
| **`sao_francisco_sobradinho`** | `0.2656` / `0.4339` (`HGBR`) | **`lagged_radiative` (`RidgeCV`)**: **`0.4267` / `0.5689`** (**`+0.1611`**) | **`0.2096`** (`RidgeCV`, `Δ_rad=+0.0021`)<br>`POST 2020 = 0.4429` | **`0.8411`** (`RidgeCV`, **`Δ_rad=+0.0115`**)<br>Top imp: `VPD 0.399`, `PREC 0.331` | `GWETROOT`: **`PRE 0.842 → POST 0.901`** (alta previsibilidade contínua) |
| **`parana_foz_iguacu`** | `0.3617` / `0.6881` (`SplineGAM`) | **`lagged_radiative` (`SplineGAM`)**: **`0.4821` / `0.7776`** (**`+0.1204`**) | `-0.0591` (`RidgeCV`) — requer `q_lag1` para roteamento | **`0.8424`** (**`SplineGAM`**, `Δ_rad=+0.0010`) | `q_min`: **`PRE 0.394 → POST -1.050`** (viés **`-2.148,3 m³/s`** por secas severas) |
| **`amazonia_madeira`** | `0.4217` / `0.6019` (`RidgeCV`) | **`lagged_hydro_met` (`RidgeCV`)**: **`0.4942` / `0.6542`** (**`+0.0725`**)<br>(`lagged_radiative = 0.4883`, `+0.0666`) | `-0.3151` (`RF`, `Δ_rad=+0.0476`) — forte inércia de calha | **`0.8269`** (`RidgeCV`, `Δ_rad=-0.0155`) | `q_min`: **`PRE -0.003 → POST -0.663`** (viés **`-3.851,5 m³/s`**; `11,1%` resid > 2σ) |
| **`sul_guaiba`** | `0.1286` / `0.1823` (`RidgeCV`) | **`lagged_hydro_met` (`RidgeCV`)**: **`0.1945` / `0.2452`** (**`+0.0659`**)<br>(`lagged_radiative = 0.1917`, `+0.0631`) | **`0.4915`** (`met`) / **`0.4866`** (`rad`, `RidgeCV`)<br>Top imp: `PREC_roll3 0.291`, `PREC_t 0.224` | **`0.9068`** (`RidgeCV`, `Δ_rad=-0.0008`) | `q_min`: **`PRE 0.477 → POST 0.677`** (resposta rápida à chuva extrema) |
| **`amazonia_tapajos`** | `0.4985` / `0.6711` (`RidgeCV`) | **`lagged_radiative` (`RidgeCV`)**: **`0.5338` / `0.6882`** (**`+0.0353`**; 3× maior que `+0.0123` só hydro-met) | `-0.2228` (`RF`, `Δ_rad=+0.0149`) — inércia de calha | **`0.9011`** (`RidgeCV`, `Δ_rad=-0.0003`) | `q_min`: `POST -0.164` (`11,1%` resid > 2σ); `GWETROOT`: `POST 0.944` |
| **`murray_darling`** *(Controle)* | `0.1385` / `0.1763` (`RidgeCV`) | **Sem ganho vs AR(1)** (`-0.0363` a `-0.0870` em `q_min`); `GWETROOT` ganha `+0.0653` (`0.5790 → 0.6443`) | `-0.0621` (`RidgeCV`) — fluxo regulado desacoplado | **`0.8133`** (`RidgeCV`, `Δ_rad=-0.0007`) | Confirma contraste físico entre bacias livres e bacias sob barragem/irrigação |

> **Leitura Física Imediata:**
> 1. **Guaíba vs. Megabacias:** O *Guaíba* é a única bacia onde o **Modo B sem `discharge_lag1`** atinge **`R² = 0.4915` (`POST 2020 = 0.6774`)**, provando hidrograma rápido controlado diretamente pela chuva em 1–3 meses (`PRECTOTCORR_t` + `PRECTOTCORR_roll3_incl`). Já *Madeira, Tapajós e Paraná* possuem tempo de trânsito de onda de cheia de 1–3 meses, exigindo `discharge_lag1` no Modo A (`oof_R2 = 0.65–0.78`).
> 2. **Valor Preditivo da Radiação e Oceanos:** No *Tapajós* (`+0.0123 → +0.0353`) e no *São Francisco* (`+0.1504 → +0.1611`), variáveis radiativas/de nuvem defasadas **elevam o skill causal sobre o benchmark puramente hidrometeorológico**; já índices oceânicos isolados (`lagged_ocean_only`) nunca superam `AR(1)` sozinhos, atuando como moduladores de fundo via chuva/radiação local.
> 3. **Limiares Críticos de Regime (`bootstrap_selection_freq ∈ [0, 1]`):**
>    - **`sao_francisco_sobradinho` (`GWETROOT`):** `VPD_t2m_t` selecionado em **`97,5%`** das árvores bootstrap no limiar mediano **`-0,3007 kPa`** (`IQR [-0,3196, -0,2377]`, salto `-0,0541`), com quartis monotônicos de `+0,0338` (`Q1`) a `-0,0278` (`Q4`). Em `river_discharge_min` (Modo A `lagged_radiative`), `ALLSKY_SFC_SW_DWN_roll3_lag1` aparece em **`55,0%`** dos bootstraps (`-0,9795 MJ/m²/dia`, salto **`-2.245,1 m³/s`**).
>    - **`sul_guaiba` (`river_discharge_min`):** `PRECTOTCORR_roll3_incl` (`freq = 0,900`, salto `+1.180,0 m³/s`) e `PRECTOTCORR_t` (`freq = 0,825`, limiar `+58,16 mm/mês`, salto **`+1.609,2 m³/s`**) separam secas/normais (`Q1 = -832,1 m³/s`) de enxurradas catastróficas (`Q4 = +957,8 m³/s`).
>    - **`parana_foz_iguacu` (`GWETROOT` / `q_min`):** `VPD_t2m_t` (`freq = 1,000`, `-0,0658 kPa`) e `GWETROOT_lag1` (`freq = 1,000`, `-0,0077`, salto **`+4.422,6 m³/s`**, `Q1 -3.278,5` → `Q4 +3.524,2 m³/s`).
>    - **`amazonia_madeira` & `amazonia_tapajos`:** `VPD_t2m_t` (`freq = 0,725`, salto `-4.049,6 m³/s`) e `PRECTOTCORR_roll3_incl` (`freq = 0,700`, `+4.386,1 m³/s`) no Madeira; `PRECTOTCORR_roll3_incl` (`freq = 0,850`, `-44,35 mm/mês`, `+4.516,4 m³/s`) no Tapajós.

---

## 5. Rastreabilidade para o Pitch & Bancada Interativa (NASA Space Apps)

- **Diferencial Metodológico para a Banca:** Em vez de um modelo de "caixa-preta" inflado por vazamento sazonal ou correlações sem remoção de tendência, demonstramos **como e quando** a IA falha (*Madeira/Paraná* pós-2020 e *Murray–Darling* regulado) e **quando** modelos lineares/GAM regularizados superam florestas aleatórias sob amostras mensais reais da NASA + GloFAS.
- **Uso Direto na Bancada (4 Perguntas / UI):**
  1. Abrir **`amazonia_madeira`** em `CLRSKY_SFC_SW_DWN` vs `CLOUD_AMT` para mostrar *brightening* por perda de nuvens contrastado ao choque de fumaça de **`2024-09` ($D_M = 19{,}69$)**;
  2. Abrir **`sul_guaiba` vs `sao_francisco_sobradinho`** em `ALLSKY_SFC_SW_DWN` para exibir o dipolo radiativo continental (**$r_\text{detrended} = -0{,}5288$**), seguido do outlier histórico de **`2024-05` ($D_M = 8{,}80$ / $9{,}07$)** no Guaíba;
  3. Usar o slide de **Modo A (`skill_vs_ar1` + `+0.161` no São Francisco e `+0.120` no Paraná)** para comprovar ganho real sobre persistência sem vazamento de dados.
- **Reprodutibilidade:** Execute `.venv/bin/python backend/ml_discovery.py --self-test` para validar os invariantes em dados sintéticos e `.venv/bin/python backend/ml_discovery.py` para regenerar [`backend/ml_discovery_results.json`](file:///home/zrhyan/Principal/Computation/Space%20Apps/earth-system-detective-fliflop-34/backend/ml_discovery_results.json) com dados em cache ou APIs ao vivo.
