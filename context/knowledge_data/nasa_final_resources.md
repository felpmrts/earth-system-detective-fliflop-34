---

# Arquitetura de Dados & Análise — Earth System Trend Detective (NASA Space Apps)

> **Objetivo do MVP:** Permitir que o usuário atue como um "detetive de dados" — escolhendo um contexto ambiental, selecionando um **ponto** ou **retângulo (região)** no mapa, visualizando a série temporal histórica e recebendo um veredito estatístico claro sobre **o que mudou, quanto mudou e se a tendência é estatisticamente significativa**.
> 

---

## 1. Matriz de Fontes e Integração (Backend)

Para equilibrar velocidade em tempo real durante a demonstração e rigor científico com dados oficiais da NASA, a ingestão divide-se em **consultas ao vivo**, **processamento em segundo plano** e **validação/demo**:

| Fonte Oficial | O que selecionamos | O que retorna | Papel e Regra de Uso no App |
| --- | --- | --- | --- |
| **NASA POWER API**
*(Modelos MERRA-2 e GPM)* | Variável, período (anos) e **ponto** (`lat/lon`) ou **retângulo** (`bbox`).
*(⚠️ A consulta regional aceita 1 parâmetro por requisição)*. | **JSON** ou CSV.
• **Ponto:** série pronta.
• **Retângulo:** grade de células (o backend calcula a média espacial). | **Motor principal ao vivo (~1–2s):** Temperatura do ar (`T2M`), Chuva (`PRECTOTCORR`), Umidade (`RH2M`), Radiação (`ALLSKY_SFC_SW_DWN`). Validar quantas células da grade entram no retângulo escolhido. |
| **NASA AppEEARS API**
*(Satélite MODIS)* | Produto (ex: `MOD13A3` ou `MOD11C3`), camada (`NDVI` ou Temp. Superfície), datas e geometria. | **CSV** (ponto) ou GeoTIFF/NetCDF (área). A API retorna primeiro um `task_id`. | **Consultas de Vegetação e Superfície:** Disparar a requisição, salvar o `task_id` e acompanhar o processamento em segundo plano (*polling*), além de manter CSVs pré-processados para a demo. |
| **Open-Meteo Flood API**
*(Modelo GloFAS)* | Coordenada de rio/bacia e intervalo de datas. | **JSON** instantâneo (~1s) com vazão do rio (`river_discharge` em m^3/s). | **Hidrologia ao vivo:** Cobre análise de secas, cheias e fluxo hídrico sem precisar baixar e recortar arquivos NetCDF/HDF pesados do GLDAS em tempo real. |
| **NOAA CDO API v2**
*(Estações Terrestres)* | Dataset (`GSOM`/`GHCND`), estação/região e período. *(Exige token gratuito no header)*. | **JSON** (~1–3s) com medições físicas em solo (`PRCP`, `TAVG`, `SNOW`). | **Comparação Satélite vs. Solo:** Permite confrontar a tendência medida por satélite com pluviômetros e termômetros reais. |
| **Giovanni & Hydrology Time Series** | Variável, período e área (Giovanni) ou ponto (Hydrology). | **CSV** da série temporal limpa. | **Validação e Benchmarks:** Usar para conferir se as médias regionais calculadas pelo nosso backend batem com os números oficiais da NASA e alimentar os casos de demonstração. |

> **⚠️ Decisão de Escopo (Performance):** Evitar o download e recorte dinâmico de arquivos brutos `.hdf` e `.nc4` (via `earthaccess` / Harmony) durante a navegação do usuário. Caso precisem de umidade do solo do **GLDAS**, rodem um script offline para extrair o CSV e deixem salvo no cache do projeto.
> 

---

## 2. Camada de Descoberta Guiada ("Data Detective")

Para atender ao público-alvo do desafio (estudantes e público geral), o app traduz variáveis científicas em perguntas investigativas por bioma/contexto:

| Contexto / Região | Variáveis Sugeridas | Pergunta Investigativa | Tradução Simples para o Usuário |
| --- | --- | --- | --- |
| **Área Urbana / Metrópole** | `T2M` (NASA POWER) + `LST` (AppEEARS) | *"O efeito de ilha de calor está intensificando o aquecimento nesta cidade?"* | Mede o aumento gradual da temperatura do ar e da superfície ao longo das décadas, descontando as estações do ano. |
| **Floresta / Cerrado / Agro** | `NDVI` (AppEEARS) + `PRECTOTCORR` (POWER) | *"A vegetação está perdendo vigor ou sofrendo com mudanças no regime de chuvas?"* | O NDVI varia de -1 a +1; quedas contínuas indicam desmatamento, degradação ou estresse hídrico severo. |
| **Bacia Hidrográfica / Rio** | `river_discharge` (GloFAS) + `PRECTOTCORR` (POWER) | *"O volume de água deste rio está caindo mesmo quando chove?"* | Mede o volume de água que passa por segundo (m^3/s), revelando impacto de represas, uso do solo ou secas prolongadas. |
| **Região Árida / Semiárida** | `RH2M` (Umidade) + `ALLSKY_SFC_SW_DWN` (Radiação) | *"A região está ficando mais seca e exposta a maior radiação solar?"* | Indica tend |