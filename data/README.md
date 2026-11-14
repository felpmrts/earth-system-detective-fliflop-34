# Arquitetura Modular do Backend de Dados (`data/`)

Este diretório implementa o backend modular de ingestão multi-API, cache em disco, estatística climática e API REST do **Earth System Trend Detective**, dirigido pelo catálogo oficial das **7 Famílias Ambientais** ([`environmental_family.md`](file:///home/felipe-martins/dev/repository/earth-system-detective-fliflop-34/context/knowledge_data/environmental_family.md)).

> **Filosofia do fluxo de dados:**
> 1. **MVP atual (1 variável por local):** o usuário escolhe **Local A** + **1 variável** (`var_a`) e **Local B** + **1 variável** (`var_b`). O backend identifica automaticamente o conector correto no catálogo, baixa os dados (ou lê do cache local), alinha os meses comuns `[t_0, t_f]` e entrega os blocos estatísticos completos (`location_a`, `location_b`, `comparison_pair`).
> 2. **Extensão futura (N variáveis por local):** os contratos (`LocationQuery`) e serviços (`fetch_location_multiple_variables`, `compare_locations_multi_variable`) já aceitam múltiplas variáveis por local (`variables=[...]`), agrupando chamadas em lote por conector e devolvendo a matriz cruzada `N × M` (`cross_comparison_matrix`) sem refatorar conectores nem o motor estatístico.

---

## 1. Estrutura em Camadas (`data/`)

| Camada / Pasta | Responsabilidade Didática | Principais Arquivos |
| :--- | :--- | :--- |
| **`catalog/`** | Fonte única de verdade mapeando as **7 Famílias Ambientais** e os **42 códigos de variáveis** para seus conectores, modos (`realtime`, `queue_cache`, `validation_demo`), unidades, grades e escalas (`interval` vs. `ratio`). | [`environmental_catalog.py`](file:///home/felipe-martins/dev/repository/earth-system-detective-fliflop-34/data/catalog/environmental_catalog.py) |
| **`models/`** | Contratos de entrada/validação: `CellCoord` (`lat`, `lon`) e `LocationQuery` (valida `1` a `9` células adjacentes e normaliza `variable` ou `variables`). | [`contracts.py`](file:///home/felipe-martins/dev/repository/earth-system-detective-fliflop-34/data/models/contracts.py) |
| **`cache/`** | Cache JSON persistido em disco (`data/cache/storage/`, ignorado pelo Git) indexado por conector, variável, coordenada snapped, janela temporal e parâmetros extras. | [`store.py`](file:///home/felipe-martins/dev/repository/earth-system-detective-fliflop-34/data/cache/store.py) |
| **`connectors/`** | Adaptadores isolados para as 5 APIs externas, compartilhando leitura de [`data/.env`](file:///home/felipe-martins/dev/repository/earth-system-detective-fliflop-34/data/.env.example), snapping de grade (MERRA-2 `0.5°×0.625°` e CERES `1.0°×1.0°`), limpeza de `-999`, loop automático de 10 em 10 anos com paginação na NOAA CDO (`split_into_10_year_chunks` + `datacoverage`) e logging explícito da API puxada. | [`base.py`](file:///home/felipe-martins/dev/repository/earth-system-detective-fliflop-34/data/connectors/base.py), [`nasa_power.py`](file:///home/felipe-martins/dev/repository/earth-system-detective-fliflop-34/data/connectors/nasa_power.py), [`open_meteo_flood.py`](file:///home/felipe-martins/dev/repository/earth-system-detective-fliflop-34/data/connectors/open_meteo_flood.py), [`noaa_cdo.py`](file:///home/felipe-martins/dev/repository/earth-system-detective-fliflop-34/data/connectors/noaa_cdo.py), [`nasa_appeears.py`](file:///home/felipe-martins/dev/repository/earth-system-detective-fliflop-34/data/connectors/nasa_appeears.py), [`nasa_giovanni.py`](file:///home/felipe-martins/dev/repository/earth-system-detective-fliflop-34/data/connectors/nasa_giovanni.py) |
| **`services/`** | **Orquestração e Matemática:** roteia variáveis para conectores (`ingestion_service.py` com batching em `_BATCH_CONNECTORS`) e executa todos os invariantes estatísticos (`comparison_service.py`: anomalias mensais, OLS + Theil-Sen IC 95%, curva Gaussiana, `AR(1)` `N_eff` + FDR, Mahalanobis `D_M > 2.5` + `diagnostic_hint`, correlação `r_global` vs. `r_detrended` e adaptador `analyze_regions_contract` 100% compatível com [`CONTRATO_DE_DADOS.md`](file:///home/felipe-martins/dev/repository/earth-system-detective-fliflop-34/CONTRATO_DE_DADOS.md)). | [`ingestion_service.py`](file:///home/felipe-martins/dev/repository/earth-system-detective-fliflop-34/data/services/ingestion_service.py), [`comparison_service.py`](file:///home/felipe-martins/dev/repository/earth-system-detective-fliflop-34/data/services/comparison_service.py) |
| **`api/`** | Servidor HTTP REST em stdlib (`ThreadingHTTPServer` + `BackendRouter`) com headers CORS pronto para o `regionDataAdapter.ts` da branch `frontend` (`POST /api/analyze`, `POST /api/compare`, `POST /api/location/fetch`, `GET /api/catalog`, `GET /api/health`). | [`server.py`](file:///home/felipe-martins/dev/repository/earth-system-detective-fliflop-34/data/api/server.py) |
| **Scripts e Referências** | Demonstração end-to-end da arquitetura, saída de contrato JSON real, protótipo anterior das 5 APIs e guia de tokens em `data/.env`. | [`run_backend_demo.py`](file:///home/felipe-martins/dev/repository/earth-system-detective-fliflop-34/data/run_backend_demo.py), [`sample_backend_contract_output.json`](file:///home/felipe-martins/dev/repository/earth-system-detective-fliflop-34/data/sample_backend_contract_output.json), [`README_TESTE_APIS.md`](file:///home/felipe-martins/dev/repository/earth-system-detective-fliflop-34/data/README_TESTE_APIS.md) |

---

## 2. Roteamento pelo Catálogo das 7 Famílias Ambientais

Ao consultar `get_variable_spec(code)` em [`environmental_catalog.py`](file:///home/felipe-martins/dev/repository/earth-system-detective-fliflop-34/data/catalog/environmental_catalog.py), cada código define automaticamente:

- **Qual conector acionar** (`nasa_power`, `open_meteo_flood`, `noaa_cdo`, `nasa_appeears` ou `nasa_giovanni`);
- **Qual grade usar** (ex.: `merra2` -> `snap_merra2`, `ceres` -> `snap_ceres`);
- **Qual escala estatística aplicar** (`allow_percentage_change=False` para variáveis intervalares como `°C`, `NDVI`, `EVI`; `True` para variáveis de razão como `PRECTOTCORR` ou `river_discharge`).

---

## 3. Como Funciona a Extensão de `1 Variável` -> `N Variáveis`

O segredo de extensibilidade está em [`LocationQuery`](file:///home/felipe-martins/dev/repository/earth-system-detective-fliflop-34/data/models/contracts.py#L20-L73) e em [`ingestion_service.py`](file:///home/felipe-martins/dev/repository/earth-system-detective-fliflop-34/data/services/ingestion_service.py#L72-L152):

### Fluxo Atual (MVP: 1 variável por local)

```json
{
  "start_year": 2001,
  "end_year": 2023,
  "location_a": {
    "name": "Amazônia Central (Manaus)",
    "variable": "PRECTOTCORR",
    "cells": [{ "lat": -3.12, "lon": -60.02 }]
  },
  "location_b": {
    "name": "Rio Negro / Amazonas (Manaus)",
    "variable": "river_discharge",
    "cells": [{ "lat": -3.13, "lon": -60.02 }]
  }
}
```

### Fluxo Futuro (Extensão: múltiplas variáveis por local)

Basta trocar `"variable"` por `"variables": [...]` no mesmo contrato JSON:

```json
{
  "start_year": 2001,
  "end_year": 2023,
  "location_a": {
    "name": "Amazônia Central (Manaus)",
    "variables": ["T2M", "PRECTOTCORR", "RH2M"],
    "cells": [{ "lat": -3.12, "lon": -60.02 }]
  },
  "location_b": {
    "name": "Semiárido (Petrolina)",
    "variables": ["T2M", "PRECTOTCORR"],
    "cells": [{ "lat": -9.39, "lon": -40.50 }]
  }
}
```

Quando `POST /api/compare` (ou `BackendRouter.handle_post`) detecta mais de 1 variável:
1. [`ingestion_service.py`](file:///home/felipe-martins/dev/repository/earth-system-detective-fliflop-34/data/services/ingestion_service.py#L98-L152) agrupa variáveis do mesmo conector via `_BATCH_CONNECTORS` (ex.: até 20 variáveis por requisição no `/point` da NASA POWER, 4 no GloFAS e 7 no NOAA CDO com loop automático de 10 em 10 anos), consultando apenas o que ainda não está no [`CellCacheStore`](file:///home/felipe-martins/dev/repository/earth-system-detective-fliflop-34/data/cache/store.py#L11-L70).
2. [`comparison_service.py`](file:///home/felipe-martins/dev/repository/earth-system-detective-fliflop-34/data/services/comparison_service.py#L526-L591) calcula os blocos estatísticos na janela mensal comum global e gera `cross_comparison_matrix` com todos os pares `Local A[i] × Local B[j]`. No fluxo do frontend (`POST /api/analyze`), [`analyze_regions_contract`](file:///home/felipe-martins/dev/repository/earth-system-detective-fliflop-34/data/services/comparison_service.py#L699-L825) converte `RegionAnalysisRequest -> RegionAnalysisResponse` com suporte a região A isolada, mesma região A com 2 variáveis (`region_b: null`), par A vs. B e códigos de erro semânticos (`OCEAN_MASK_NO_DATA`, `MAX_CELLS_EXCEEDED`, `INVALID_DATE_INTERSECTION`).

---

## 4. Cache em Disco (`CellCacheStore`)

- Diretório padrão: `data/cache/storage/` (ignorado pelo [`.gitignore`](file:///home/felipe-martins/dev/repository/earth-system-detective-fliflop-34/.gitignore)).
- Cada entrada grava um arquivo JSON por `(connector_id, variable, snapped_lat, snapped_lon, start_year, end_year, extra)` com hash SHA-256 curto no nome.
- Consultas repetidas ou multi-variável que reaproveitam variáveis já baixadas retornam com `http_calls = 0` e `cache_hits >= 1`.

---

## 5. Como Executar a Demonstração e o Servidor REST

Pré-requisito de credenciais para APIs autenticadas (`NOAA_CDO_TOKEN`, `EARTHDATA_USERNAME`, `EARTHDATA_PASSWORD`, `EARTHDATA_TOKEN`): consulte [`README_TESTE_APIS.md`](file:///home/felipe-martins/dev/repository/earth-system-detective-fliflop-34/data/README_TESTE_APIS.md) e preencha `data/.env` a partir de [`data/.env.example`](file:///home/felipe-martins/dev/repository/earth-system-detective-fliflop-34/data/.env.example). **Nenhuma dependência externa é necessária** (100% Python 3 stdlib).

### Rodar validação completa de ponta a ponta

```bash
python3 data/run_backend_demo.py
```

Gera e valida o contrato completo em [`sample_backend_contract_output.json`](file:///home/felipe-martins/dev/repository/earth-system-detective-fliflop-34/data/sample_backend_contract_output.json).

### Subir o Servidor HTTP REST local

```bash
python3 -m data.api.server --port 8000
```

Endpoints expostos por [`server.py`](file:///home/felipe-martins/dev/repository/earth-system-detective-fliflop-34/data/api/server.py#L37-L134):

| Método e Rota | Descrição | Payload / Retorno |
| :--- | :--- | :--- |
| `GET /api/health` | Healthcheck do serviço | `{"status": "OK", "service": "earth-system-detective-data-backend"}` |
| `GET /api/catalog` | Árvore das 7 Famílias e 42 variáveis | Catálogo estruturado pronto para menus da UI |
| `POST /api/analyze` | **Endpoint oficial do frontend (`regionDataAdapter.ts`)** — aceita `RegionAnalysisRequest` (região A isolada, 2 variáveis em A ou par A vs. B; inclui mapeamento `CLDTOT -> CLOUD_AMT`, `PS` intervalar e detecção oceânica `OCEAN_MASK_NO_DATA`) | `RegionAnalysisResponse` ([`CONTRATO_DE_DADOS.md`](file:///home/felipe-martins/dev/repository/earth-system-detective-fliflop-34/CONTRATO_DE_DADOS.md)) |
| `POST /api/location/fetch` | Busca série(s) de 1 local (`1` ou `N` variáveis) | JSON `LocationQuery` (+ `start_year`, `end_year`) |
| `POST /api/compare` | Compara Local A vs. Local B (`1` vs `1`, `N` vs `M`, ou `region_a`/`region_b` do contrato) | JSON `{location_a, location_b, start_year, end_year}` ou `RegionAnalysisRequest` |
