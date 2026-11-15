# Fontes de Dados & Pré-Processamento (`DATA_SOURCES.md`)

> *(Documentação inicial v1 — catálogo público das fontes oficiais da NASA, NOAA e Copernicus/GloFAS, resoluções de grade e regras de tratamento aplicadas pelo **Earth System Trend Detective**).*

---

## 1. Matriz Oficial de APIs e Modelos Integrados

O projeto integra **5 fontes/APIs ambientais** orquestradas por um catálogo central em `data/catalog/environmental_catalog.py`, totalizando **7 Famílias Ambientais (42 códigos operacionais / 39 entradas de interface)**:

| # | Fonte / Provedor | Conjunto / Satélite / Modelo | Resolução Espacial Nativa | Acesso & Autenticação | Papel no Produto |
| :-: | :--- | :--- | :--- | :--- | :--- |
| **1** | **NASA POWER API v2** | **MERRA-2** *(reanalise atmosférica e solo)*, **GPM** *(precipitação)* e **CERES SYN1deg** *(radiação e nuvens)* | `0.5° × 0.625°` (`MERRA-2`) e `1.0° × 1.0°` (`CERES_SYN1deg`) | Aberta *(sem token)* | Motor principal em tempo real para séries mensais regionais e grades globais pré-computadas. |
| **2** | **NASA AppEEARS API** | **MODIS** (`MOD13A3.061` NDVI/EVI, `MOD11C3.061` LST Dia/Noite, `MOD15A2H` LAI) | `500 m` – `0.05°` (`CMG`) / `1 km` | Gratuita (`EARTHDATA_USERNAME` / `EARTHDATA_PASSWORD`) | Vegetação, ilhas de calor urbanas e vigor da biomassa via fila/cache. |
| **3** | **NASA Giovanni / GES DISC & CMR** | **GPM IMERG V07** (`GPM_3IMERGM`), **GLDAS Noah** (`GLDAS_NOAH025_M`) e **MODIS Aerosol** (`MOD08_M3`) | `0.1°` (`IMERG`), `0.25°` (`GLDAS`), `1.0°` (`MOD08_M3`) | Gratuita (`EARTHDATA_TOKEN` / NASA Earthdata Login) | Validação cruzada de precipitação, evapotranspiração, escoamento e aerossóis. |
| **4** | **Open-Meteo Flood API** | **GloFAS** *(Copernicus Emergency Management Service)* | `0.05°` / ponto hidrológico | Aberta *(uso não comercial/científico)* | Vazão média, máxima e mínima crítica de rios e bacias hidrográficas (`m³/s`). |
| **5** | **NOAA Climate Data Online (CDO API v2)** | Estações terrestres **`GSOM`** e **`GHCND`** | Pontual *(estação meteorológica física)* | Gratuita (`NOAA_CDO_TOKEN`) | Confronto direto entre estimativas de satélite e termômetros/pluviômetros em solo. |

---

## 2. As 7 Famílias Ambientais e Cobertura Temporal

| Família Ambiental | Exemplos de Variáveis Principais | Modelos / Fontes | Início típico | Tipos de Escala |
| :--- | :--- | :--- | :---: | :--- |
| **1. Temperatura e Calor** | `T2M`, `T2M_MAX`, `T2M_MIN`, `T2M_RANGE`, `TS`, `T2MDEW`, `LST_Day_CMG`, `LST_Night_CMG` | MERRA-2, MODIS AppEEARS | `1981` (MERRA-2) / `2000` (MODIS) | Intervalar (`°C`) |
| **2. Chuva e Umidade Atmosférica** | `PRECTOTCORR`, `GPM_3IMERGM`, `RH2M`, `QV2M`, `TQV` | MERRA-2, GPM IMERG | `1981` / `2000` | Razão (`mm/mês`, `g/kg`, `kg/m²`) e `%` |
| **3. Solo, Seca Agrícola e Evapotranspiração** | `GWETTOP`, `GWETROOT`, `GWETPROF`, `Evap_tavg`, `Qs_acc` | MERRA-2 Land, GLDAS Noah | `1981` / `2000` | Razão (`fração 0–1`, `mm/dia`, `kg/m²`) |
| **4. Rios, Vazão e Bacias** | `river_discharge`, `river_discharge_mean`, `river_discharge_max`, `river_discharge_min` | GloFAS (Open-Meteo) | `1984` | Razão (`m³/s`) |
| **5. Vegetação e Uso da Terra** | `_1_km_monthly_NDVI`, `_1_km_monthly_EVI`, `Lai_500m`, `ALLSKY_SRF_ALB` | MODIS AppEEARS, CERES | `2000` / `1984` | Intervalar (`NDVI`/`EVI`) e Razão |
| **6. Radiação, Nuvens, Ventos e Pressão** | `ALLSKY_SFC_SW_DWN`, `CLRSKY_SFC_SW_DWN`, `ALLSKY_SFC_LW_DWN`, `CLDTOT`/`CLOUD_AMT`, `WS2M`, `WS10M`, `WS50M`, `PS`, `AOD_550` | CERES SYN1deg, MERRA-2, MODIS | `1981` / `1984` | Razão e Intervalar (`PS` em `kPa`) |
| **7. Estações em Solo** | `PRCP`, `TAVG`, `TMAX`, `TMIN`, `SNOW`, `SNWD`, `AWND` | NOAA CDO v2 | Variável por estação | Intervalar (`°C`) e Razão (`mm`, `m/s`) |

> **Camadas globais pré-computadas no frontend (`frontend/public/data/*_grid.json`):** 12 grades globais homologadas de 144 pontos cada (`T2M`, `T2M_MAX`, `T2M_MIN`, `PRECTOTCORR`, `RH2M`, `GWETTOP`, `GWETROOT`, `PS`, `WS10M`, `ALLSKY_SFC_SW_DWN`, `ALLSKY_SFC_LW_DWN`, `CLDTOT`), permitindo exploração instantânea da camada de tendências e operação 100% offline.

---

## 3. Regras de Higienização e Pré-Processamento Físico

- **Sentinela de ausência (`-999`) e máscara oceânica:** Valores `-999` / `-999.0` (comuns sobre oceanos em variáveis terrestres `GWETTOP`, `GWETROOT` e `GWETPROF` do MERRA-2 Land) são convertidos em `NaN`, nunca em zero. A agregação espacial das células selecionadas (até `25` células conectadas por região, configurável via `MAX_CELLS_PER_REGION` / `VITE_MAX_CELLS_PER_REGION`) usa média ignorando `NaN` (`nanmean`). Se toda a região cair sobre máscara oceânica sem dados, o backend retorna o erro semântico `OCEAN_MASK_NO_DATA`.
- **Remoção do resumo anual `YYYY13`:** As chaves anuais `YYYY13` retornadas pela NASA POWER nas séries mensais são descartadas antes de qualquer cálculo.
- **Unidade mensal de precipitação (`PRECTOTCORR`):** A taxa média diária (`mm/dia`) é multiplicada pelo número real de dias de cada mês (`calendar.monthrange(ano, mes)[1]`, considerando anos bissextos) para expressar o acumulado mensal em `mm/mês`.
- **Re-snap e alinhamento entre grades (`A=B` multi-modelo):** Quando uma mesma área física combina um produto `MERRA-2` (`0.5° × 0.625°`) e um produto `CERES_SYN1deg` (`1.0° × 1.0°`), o frontend reprojeta os centroides e preserva a conexidade até o limite de células configurado, enquanto o backend alinha estritamente a interseção temporal mensal $[t_0, t_f]$ antes de computar métricas comparativas.
- **Controle de escala (Invariante #3):** Variáveis intervalares (como `°C`, `kPa`, `NDVI`, `EVI`) têm `allow_percentage_change = false` e nunca têm tendências exibidas em `%`.

---

## 4. Limitações Conhecidas

- **Descontinuidades e janelas temporais entre sensores:** Produtos MODIS iniciam em `2000`, enquanto reanálises MERRA-2 iniciam em `1981` e séries CERES SYN1deg iniciam em `1984`; consultas combinadas são automaticamente limitadas à interseção comum entre `A` e `B`.
- **Estações NOAA CDO e AppEEARS:** Podem apresentar falhas históricas pontuais ou latência de fila assíncrona em janelas longas (a NOAA CDO é consultada em blocos de 10 anos com paginação e cache local em `data/cache/storage/`).
- **Contingência Offline:** O pacote estático (`VITE_DATA_MODE=offline`) garante 100% de funcionamento sem internet utilizando `public/data/mock_analysis.json` e as 12 grades globais embarcadas, sem disparar chamadas a CDNs externos.

---

## 5. Referências Oficiais

- **NASA POWER Project:** Prediction Of Worldwide Energy Resources (POWER) API v2 — NASA Langley Research Center (`power.larc.nasa.gov`). Inclui saídas de **MERRA-2** (GMAO, DOI: `10.5067/VJAFPLI1CSIV` / série mensal GMAO) e **CERES SYN1deg** (`ceres.larc.nasa.gov`).
- **NASA Earthdata AppEEARS & MODIS:** LP DAAC — `MOD13A3.061` (NDVI/EVI), `MOD11C3.061` (LST) e `MOD15A2H.061` (LAI) (`appeears.earthdatacloud.nasa.gov`).
- **NASA GES DISC / Giovanni:** `GPM_3IMERGM` V07 (`DOI: 10.5067/GPM/IMERG/3B-MONTH/07`), `GLDAS_NOAH025_M` (`DOI: 10.5067/SXAVCZFAQLNO`) e `MOD08_M3` (`giovanni.gsfc.nasa.gov`).
- **Copernicus / GloFAS via Open-Meteo Flood API:** Global Flood Awareness System (`open-meteo.com/en/docs/flood-api`).
- **NOAA National Centers for Environmental Information (NCEI):** Climate Data Online API v2 — `GSOM` & `GHCND` (`ncdc.noaa.gov/cdo-web`).
