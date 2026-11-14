# Casos Clássicos de Demonstração (*Story Presets*) & Temas do Sistema de Descoberta (`NARR` — Fase 2)

> **Status:** Entregável Oficial da Fase 2 (`NARR` — Rhyan & Felipe)  
> **Alinhamento Contratual:** Coordenadas *snapped* exatamente para os centros e índices nativos (`cell_id = "r{row}_c{col}"`) das grades **MERRA-2 ($0{,}5^\circ \times 0{,}625^\circ$, início `1981-01`)** e **CERES SYN1deg ($1{,}0^\circ \times 1{,}0^\circ$, início `1984-01`)** definidos em [`CONTRATO_DE_DADOS.md`](file:///home/zrhyan/Principal/Computation/Space%20Apps/earth-system-detective-fliflop-34/CONTRATO_DE_DADOS.md).

---

## 1. Os 3 Casos Clássicos de Demonstração (*Story Presets*)

### Caso Clássico 1 — Divergência Espacial ("Sobe Aqui, Cai Ali" / Dipolo Climático: $A \neq B$)
- **Título na Interface:** *Dessecação Acelerada do Cerrado (Triângulo Mineiro) vs. Amazônia Central / Sahel*
- **Pergunta Científica:** Como o mesmo forçamento climático global produz perda acelerada de umidade superficial no Cerrado agrícola enquanto outras bacias tropicais divergem em direção ou fase?
- **Configuração no Contrato (`POST /api/analyze`):**
  - **Modo Univariado ($X = Y, A \neq B$):** `variable_a = "GWETTOP"`, `variable_b = "GWETTOP"` (ou `PRECTOTCORR`)
  - **Modo Bivariado Cruzado (`mock_analysis.json`):** `variable_a = "GWETTOP"`, `variable_b = "T2M_MAX"`
  - **Janela Temporal:** `1981-01` a `2025-12` ($N = 540$ meses)
- **Coordenadas Exatas na Grade Nativa MERRA-2 ($0{,}5^\circ \times 0{,}625^\circ$):**
  - **Região A — Cerrado / Uberlândia, MG (`region_id: "MERRA-2__r142_c210+r142_c211"`, $K = 2$):**
    - `r142_c210`: `lat: -18.75`, `lon: -48.4375` (`row: 142`, `col: 210`)
    - `r142_c211`: `lat: -18.75`, `lon: -47.8125` (`row: 142`, `col: 211`)
  - **Região B1 — Amazônia Central / Manaus, AM (`region_id: "MERRA-2__r173_c191+r173_c192"`, $K = 2$):**
    - `r173_c191`: `lat: -3.25`, `lon: -60.3125` (`row: 173`, `col: 191`)
    - `r173_c192`: `lat: -3.25`, `lon: -59.6875` (`row: 173`, `col: 192`)
  - **Região B2 (Alternativa Transcontinental) — Transição Saara / Sahel Oriental (`region_id: "MERRA-2__r208_c336+r208_c337"`, $K = 2$):**
    - `r208_c336`: `lat: 14.25`, `lon: 30.3125` (`row: 208`, `col: 336`)
    - `r208_c337`: `lat: 14.25`, `lon: 30.9375` (`row: 208`, `col: 337`)
- **Assinatura Estatística Esperada (`stats_engine.py`):**
  - `spatial_divergence_detected: true` (`paradox_type: "OPPOSING_SECULAR_AND_COUPLED_DIPOLE"`).
  - Região A com `regime_shape: "accelerating_decline"` ($B_{\text{Sen}} < 0, B_2 < 0$), `confidence_tier: "CONFIRMED_HIGH"` ($p_{\text{AR1}} < 0{,}001$, $q_{\text{FDR}} < 0{,}05$).
  - Outliers de Mahalanobis ($D_M > 2{,}5$) cravados no Super El Niño `2015-11` e na seca extrema `2023-2024`.

---

### Caso Clássico 2 — Acoplamento Físico Local Termo-Hídrico ($A = B, X \neq Y$)
- **Título na Interface:** *Ondas de Calor e Secamento do Solo em Minas Gerais (Triângulo Mineiro & Norte de MG)*
- **Pergunta Científica:** O aumento das temperaturas máximas diárias (`T2M_MAX`) está drenando a umidade superficial do solo (`GWETTOP`) por aceleração da demanda evaporativa?
- **Configuração no Contrato (`POST /api/analyze`):**
  - `variable_a = "GWETTOP"` (`scale_type: "ratio"`, `fração (0–1)`, eixo Y1)
  - `variable_b = "T2M_MAX"` (`scale_type: "interval"`, `°C`, `allow_percentage_change: false`, eixo Y2)
  - `region_b = null` (mesma região avaliada para duas variáveis físicas acopladas)
  - **Janela Temporal:** `1981-01` a `2025-12` ($N = 540$ meses)
- **Coordenadas Exatas na Grade Nativa MERRA-2 ($0{,}5^\circ \times 0{,}625^\circ$):**
  - **Preset 2A — Triângulo Mineiro / Uberlândia (`region_id: "MERRA-2__r142_c210+r142_c211"`):**
    - `r142_c210` (`lat: -18.75`, `lon: -48.4375`) + `r142_c211` (`lat: -18.75`, `lon: -47.8125`)
  - **Preset 2B — Norte de Minas Gerais / Montes Claros (`region_id: "MERRA-2__r146_c217+r146_c218"`):**
    - `r146_c217`: `lat: -16.75`, `lon: -44.0625` (`row: 146`, `col: 217`)
    - `r146_c218`: `lat: -16.75`, `lon: -43.4375` (`row: 146`, `col: 218`)
- **Assinatura Estatística Esperada (`stats_engine.py`):**
  - `paradox_type: "LOCAL_PHYSICAL_COUPLING"`, `long_term_secular_r < -0.65` e `short_term_detrended_r < -0.55`.
  - Demonstra na Bancada Científica a **Tripla Normalização** ($Z\text{-Score}$ em unidades de $\sigma$ + Eixo Y Duplo): picos térmicos de $+2{,}5\sigma$ em `T2M_MAX` espelhados por quedas de $-2{,}8\sigma$ em `GWETTOP`.

---

### Caso Clássico 3 — Teleconexão Cruzada & Paradoxo Multiescala ($A \neq B, X \neq Y$)
- **Título na Interface:** *Forçante Radiativo/Térmico Equatorial vs. Regime Hidrológico Continental (Gangorra de El Niño)*
- **Pergunta Científica:** Duas regiões/variáveis podem subir juntas no longo prazo secular de 40 anos ($r_{\text{global}} > 0$), mas operar como uma gangorra em oposição sistemática nos ciclos interanuais de 6 a 24 meses ($r_{\text{detrended}} < 0$)?
- **Configuração no Contrato (`POST /api/analyze`):**
  - **Variante Inter-Satélite (CERES + MERRA-2):** `variable_a = "ALLSKY_SFC_SW_DWN"` (CERES `1.0° × 1.0°`, início `1984`) vs. `variable_b = "PRECTOTCORR"` ou `"GWETROOT"` (MERRA-2 `0.5° × 0.625°`, início `1981`).
    - *Destaque de Demo:* Aciona automaticamente a **Interseção Temporal** (`get_intersecting_date_bounds`), travando a janela em **`1984-01` a `2025-12`** ($N = 504$ meses) conforme o Princípio de Henrietta Leavitt!
  - **Variante Dipolo Norte-Sul (MERRA-2):** `variable_a = "PRECTOTCORR"` ou `"T2M"` (Amazônia/Atlântico Equatorial) vs. `variable_b = "PRECTOTCORR"` ou `"T2M"` (Bacia do Paraná / Sul do Brasil).
- **Coordenadas Exatas na Grade Nativa:**
  - **Região A (Geradora Equatorial):**
    - Em CERES (`1.0° × 1.0°`): `r86_c119` (`lat: -3.5`, `lon: -60.5`) e `r86_c120` (`lat: -3.5`, `lon: -59.5`) — Amazônia; ou `r90_c150` (`lat: 0.5`, `lon: -29.5`) — Atlântico Equatorial.
    - Em MERRA-2 (`0.5° × 0.625°`): `r173_c191` (`lat: -3.25`, `lon: -60.3125`) + `r173_c192` (`lat: -3.25`, `lon: -59.6875`).
  - **Região B (Receptora Continental — Cerrado ou Bacia do Paraná):**
    - Cerrado (`MERRA-2`): `r142_c210` (`lat: -18.75`, `lon: -48.4375`) + `r142_c211` (`lat: -18.75`, `lon: -47.8125`).
    - Sul / Bacia do Paraná (`MERRA-2`): `r120_c199` (`lat: -29.75`, `lon: -55.3125`) + `r120_c200` (`lat: -29.75`, `lon: -54.6875`).
- **Assinatura Estatística Esperada (`stats_engine.py`):**
  - `paradox_type: "MULTISCALE_PARADOX_POS_GLOBAL_NEG_LOCAL"` ($r_{\text{global}} > +0{,}25$ e $r_{\text{detrended}} < -0{,}20$).

---

## 2. Seleção de Temas para o Sistema de Descoberta Guiada por Bioma

Para o módulo de **Descoberta Científica Guiada** (`NARR` + `DADOS-2` + `PROD-2`), ficam selecionados 4 temas investigativos operando 100% sobre o catálogo validado da NASA POWER:

| Tema Investigativo | Bioma / Alvo | Par de Variáveis Recomendado (MVP 12 Vars) | Pergunta do Detetive na Interface |
| :--- | :--- | :--- | :--- |
| **1. Ilhas de Calor & Retenção Noturna** | Áreas Urbanas / Metrópoles | `T2M_MIN` $\times$ `ALLSKY_SFC_LW_DWN` (ou `T2M_MAX`) | *"As noites estão esquentando mais rápido que os dias por retenção de radiação térmica de onda longa?"* |
| **2. Seca Agrícola & Estresse Radicular** *(Tema Principal de Fallback)* | Cerrado / Fronteira Agrícola / Amazônia | `GWETTOP` (ou `GWETROOT`) $\times$ `T2M_MAX` | *"O aquecimento extremo está acelerando a perda de água no solo agrícola mesmo em décadas com chuva regular?"* |
| **3. Balanço Hídrico de Bacias** | Bacias Hidrográficas (São Francisco, Paraná, Amazonas) | `PRECTOTCORR` $\times$ `GWETROOT` | *"A recarga profunda da bacia (`0–100 cm`) acompanha a precipitação mensal ou há déficit estrutural crescente?"* |
| **4. Aridificação & Insolação Superficial** | Semiárido / Nordeste / Sahel | `RH2M` $\times$ `ALLSKY_SFC_SW_DWN` (ou `CLDTOT`) | *"A redução de cobertura de nuvens e umidade relativa está expondo a superfície a uma sobrecarga de radiação solar?"* |
