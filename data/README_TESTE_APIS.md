# Protótipo de Teste das 5 APIs & Fluxo Local A vs. Local B (`data/`)

Este diretório contém o protótipo executável ([`api_prototype_test.py`](file:///home/felipe-martins/dev/repository/earth-system-detective-fliflop-34/data/api_prototype_test.py)) e o resultado real capturado ([`sample_comparison_output.json`](file:///home/felipe-martins/dev/repository/earth-system-detective-fliflop-34/data/sample_comparison_output.json)) para validar as 5 APIs do projeto e o fluxo:

> **Regra de Produto Validada:** O usuário seleciona o **Local A** (puxando **1 única variável**) e o **Local B** (puxando **1 única variável**) — podendo ser na mesma API ou em APIs diferentes — para então calcular as tendências individuais e a comparação multiescala entre A e B.

---

## 1. Matriz das 5 APIs: Quais Precisam de Cadastro?

| # | API / Fonte | Precisa de Cadastro? | Como Obter Acesso / Credencial | Variável de Ambiente (Protótipo) | Resultado do Teste ao Vivo (`14/11/2026`) |
| :---: | :--- | :---: | :--- | :--- | :--- |
| **1** | **NASA POWER API v2** *(MERRA-2 / GPM / CERES)* | **Não** *(100% aberta)* | Sem token nem login. Respeitar *rate limit* de `30 req/min` e `Semaphore(3)`. | *(Nenhuma)* | ✅ **`OK`** (`HTTP 200`, 48 meses em ~0,7s; 276 meses de `2001–2023` validados) |
| **2** | **Open-Meteo Flood API** *(Modelo GloFAS)* | **Não** *(aberta p/ uso não-comercial)* | Sem token nem login para uso não-comercial/acadêmico. | *(Nenhuma)* | ✅ **`OK`** (`HTTP 200`, `river_discharge` em `m³/s`, 48 meses em ~1,2s; 276 meses validados) |
| **3** | **NOAA CDO API v2** *(Estações em solo `GSOM`/`GHCND`)* | **Sim** *(Token gratuito)* | Solicitar token gratuito por e-mail em [ncdc.noaa.gov/cdo-web/token](https://www.ncdc.noaa.gov/cdo-web/token) e enviar no header `token: <SEU_TOKEN>`. | `NOAA_CDO_TOKEN` | ✅ **`OK`** (Estação `GHCND:BLM00085154` retornou registro real `TAVG: 27.9` em ~1,6s) |
| **4** | **NASA AppEEARS API** *(Satélite MODIS: NDVI, EVI, LST)* | **Sim** *(Earthdata Login)* | Catálogo `/api/product/*` é aberto, mas criar e baixar tarefas (`/api/login`, `/api/task`) exige conta gratuita em [urs.earthdata.nasa.gov/users/new](https://urs.earthdata.nasa.gov/users/new). | `EARTHDATA_USERNAME` e `EARTHDATA_PASSWORD` | ✅ **`OK`** (Catálogo `MOD13A3.061` HTTP `200` + `OK_AUTENTICADO` via `/api/login` e `/api/task` HTTP `200` em ~2,0s) |
| **5** | **NASA Giovanni / GES DISC** *(Validação / GLDAS)* | **Sim** *(Earthdata Login)* | Criar conta gratuita em [urs.earthdata.nasa.gov/users/new](https://urs.earthdata.nasa.gov/users/new), autorizar o app **"NASA GESDISC DATA ARCHIVE"** no perfil e exportar CSVs em [giovanni.gsfc.nasa.gov/giovanni/](https://giovanni.gsfc.nasa.gov/giovanni/) ou usar Bearer token no GES DISC / CMR. | `EARTHDATA_TOKEN` | ✅ **`OK`** (Portal `giovanni` HTTP `200` + CMR autenticado `GLDAS_NOAH025_M` coleção/granules HTTP `200` em ~2,6s; endpoint legado Data Rods `timeseries.cgi` redireciona `301` para transição pós-31/10/2025) |

---

## 2. Como Funciona o Fluxo `Local A (1 variável) vs. Local B (1 variável)`

No protótipo ([`api_prototype_test.py`](file:///home/felipe-martins/dev/repository/earth-system-detective-fliflop-34/data/api_prototype_test.py)), a função `compare_location_a_and_b(location_a, location_b, start_year, end_year)` executa:

1. **Coleta desacoplada de 1 variável por local (com indicação da API puxada):**
   - Cada execução imprime no terminal `>>> PUXANDO API [...]: <Nome da API> | Endpoint: <URL> | Variável: <var>` e grava `"api_puxada"` e `"endpoint_consultado"` no JSON de saída.
   - `fetch_location_single_variable(location_a, ...)` puxa apenas `variable` de `location_a` (aplicando `snap_merra2` para NASA POWER, removendo `-999` e `YYYY13`, e convertendo `PRECTOTCORR` de `mm/day` para `mm/mês`).
   - `fetch_location_single_variable(location_b, ...)` puxa apenas `variable` de `location_b` (podendo ser da mesma API ou de outra, como Open-Meteo GloFAS).
2. **Alinhamento temporal estrito:** Intersecta apenas os meses comuns `[t_0, t_f]` entre A e B (276 meses de `2001-01` a `2023-12` no teste salvo).
3. **Anomalias + Regressão + Correlação Multiescala:**
   - Extrai anomalias mensais dessazonalizadas ($Y'_{a,m} = Y_{a,m} - \bar{Y}_m$) para A e B.
   - Calcula inclinação decadal por **OLS** e **Theil-Sen** ($10 \times B_{\text{ano}}$) respeitando escala (`ratio` vs. `interval` para `allow_percentage_change`).
   - Calcula **$r_{\text{global}}$** (correlação secular das anomalias) e **$r_{\text{detrended}}$** (correlação residual de curto prazo após remover a tendência linear de A e B).

---

## 3. Como Executar o Protótipo

### Execução padrão (testa as 2 APIs abertas ao vivo + faz *probe* das 3 APIs com cadastro)
```bash
python3 data/api_prototype_test.py
```

### Execução autenticada (recomendada após criar os tokens gratuitos)
1. Preencha suas credenciais no arquivo local [`data/.env`](file:///home/felipe-martins/dev/repository/earth-system-detective-fliflop-34/data/.env) (baseado em [`data/.env.example`](file:///home/felipe-martins/dev/repository/earth-system-detective-fliflop-34/data/.env.example) e já protegido no `.gitignore` para nunca subir segredos ao Git):
   - `NOAA_CDO_TOKEN`
   - `EARTHDATA_USERNAME` e `EARTHDATA_PASSWORD`
   - `EARTHDATA_TOKEN`
2. Rode diretamente (o script lê `data/.env` automaticamente):
```bash
python3 data/api_prototype_test.py
```

O script grava a saída consolidada em [`data/sample_comparison_output.json`](file:///home/felipe-martins/dev/repository/earth-system-detective-fliflop-34/data/sample_comparison_output.json).
