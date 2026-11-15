# CONTRATO DE DADOS — Earth System Trend Detective (NASA Space Apps 2026)

> **Status:** Versão 1.0 (Marco 0 — Frente de Parceria / Análise de Contrato de Dados `PROD-1`)  
> **Escopo:** Contrato único que desacopla `DADOS-1` (Ingestão NASA POWER), `DADOS-2` (`stats_engine.py`), `PROD-1` (Mapa Leaflet & Geometria $K \le 9$) e `PROD-2` (Bancada de Gráficos & Comparador A/B).  
> **Regras Invioláveis:**
> 1. O frontend **nunca** chama a NASA POWER API / Earthdata diretamente e **nunca** calcula estatísticas no browser.
> 2. Leaflet usa **`[lat, lon]`**; GeoJSON usa **`[lon, lat]`**.
> 3. Todos os payloads devem obedecer aos **7 Invariantes Estatísticos** (proibido $Y_{\text{fim}} - Y_{\text{início}}$ e proibido `%` em variáveis intervalares como $^\circ\text{C}$).

---

## 1. Catálogo Oficial das 12 Variáveis NASA POWER

| `variable_id` | Nome Físico | Fonte / Modelo | Resolução Nativa (`dLat × dLon`) | Ano Inicial | `scale_type` | `unit` | `trend_unit` | `allow_percentage_change` | `land_only_mask` |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `T2M` | Temperatura Média do Ar a 2m | `MERRA-2` | `0.5° × 0.625°` | `1981` | `interval` | `°C` | `°C/década` | `false` | `false` |
| `T2M_MAX` | Temperatura Máxima Diária a 2m | `MERRA-2` | `0.5° × 0.625°` | `1981` | `interval` | `°C` | `°C/década` | `false` | `false` |
| `T2M_MIN` | Temperatura Mínima Diária a 2m | `MERRA-2` | `0.5° × 0.625°` | `1981` | `interval` | `°C` | `°C/década` | `false` | `false` |
| `PRECTOTCORR` | Precipitação Total Corrigida | `MERRA-2` | `0.5° × 0.625°` | `1981` | `ratio` | `mm/mês` | `mm/mês/década` | `true` | `false` |
| `GWETTOP` | Umidade do Solo Superficial (0–5 cm) | `MERRA-2` | `0.5° × 0.625°` | `1981` | `ratio` | `fração (0–1)` | `fração/década` | `false` | `true` |
| `GWETROOT` | Umidade do Solo Radicular (0–100 cm) | `MERRA-2` | `0.5° × 0.625°` | `1981` | `ratio` | `fração (0–1)` | `fração/década` | `false` | `true` |
| `RH2M` | Umidade Relativa do Ar a 2m | `MERRA-2` | `0.5° × 0.625°` | `1981` | `ratio` | `%` | `p.p./década` | `false` | `false` |
| `WS10M` | Velocidade do Vento a 10m | `MERRA-2` | `0.5° × 0.625°` | `1981` | `ratio` | `m/s` | `m/s/década` | `true` | `false` |
| `PS` | Pressão de Superfície | `MERRA-2` | `0.5° × 0.625°` | `1981` | `interval` | `kPa` | `kPa/década` | `false` | `false` |
| `ALLSKY_SFC_SW_DWN` | Irradiância Solar Onda Curta Descendente | `CERES_SYN1deg` | `1.0° × 1.0°` | `1984` | `ratio` | `MJ/m²/dia` | `MJ/m²/dia/década` | `true` | `false` |
| `CLDTOT` | Cobertura Total de Nuvens | `CERES_SYN1deg` | `1.0° × 1.0°` | `1984` | `ratio` | `%` | `p.p./década` | `false` | `false` |
| `ALLSKY_SFC_LW_DWN` | Irradiância Térmica Onda Longa Descendente | `CERES_SYN1deg` | `1.0° × 1.0°` | `1984` | `ratio` | `MJ/m²/dia` | `MJ/m²/dia/década` | `true` | `false` |

> **Regra de Interseção Temporal:** Ao comparar `(variable_a, variable_b)`, a data inicial válida mínima é `max(min_year_a, min_year_b)` (ex.: `T2M` 1981 + `CLDTOT` 1984 $\implies$ início travado em `1984-01`).

---

## 2. Fluxo A — Camada Global Pré-Processada (`public/data/{var_id}_grid.json`)

Renderizada via `Canvas` no Leaflet como panorama global e fallback offline garantido. O frontend **nunca** recalcula esses valores.

```json
{
  "variable_id": "T2M",
  "unit": "°C",
  "trend_unit": "°C/década",
  "period": { "start": "1981-01", "end": "2025-12" },
  "points": [
    {
      "lat": -18.75,
      "lon": -48.125,
      "slope_sen_decade": 0.34,
      "q_value_fdr": 0.0041,
      "is_sig": true
    }
  ]
}
```

- **Invariantes Visuais (3 Dimensões Independentes):**
  1. **Direção:** sinal de `slope_sen_decade` (`> 0` vs `< 0`).
  2. **Magnitude:** proporcional a `Math.abs(slope_sen_decade)`.
  3. **Significância:** controlada exclusivamente por `is_sig` / `q_value_fdr < 0.05`. Nunca misturar magnitude com significância.
- **Alias e Homologação em `frontend/`:** `CLOUD_AMT` resolve via `is_alias_of: 'CLDTOT'` para `CLDTOT_grid.json` sem disparar fallback falso. Os 12 arquivos `{var_id}_grid.json` reais são homologados antes do deploy com `npm run validate:grids -- --strict` em `frontend/` (checando schema em `validateGlobalGrid`, alinhamento de `variable_id`/`trend_unit`, `points >= 100` e resolução do alias).

---

## 3. Fluxo B — Seleção Dinâmica de Grade Nativa ($K \le 9$, Conectividade 8-Vizinhos)

Ao clicar no mapa, o frontend faz o *snapping* para a célula nativa da variável selecionada e permite compor livremente até **$K \le 9$ células adjacentes** (conectividade de 8 vizinhos — aresta ou vértice em comum, permitindo `1x1`, `1x3`, `2x1`, `2x2`, `3x3`, formato em `L`, etc.) para **Local A** e **Local B**.

### 3.1 Regras de Validação no Cliente (`gridGeometry.ts`)
1. `1 <= cells.length <= 9` (teto $K \le 9$).
2. Ao adicionar célula (quando `cells.length >= 1`), a nova célula deve ser 8-vizinha de pelo menos uma célula já selecionada (`|row_a - row_b| <= 1 && |col_a - col_b| <= 1`).
3. Ao remover célula, o conjunto restante deve permanecer um único componente conexo em 8-vizinhos (impedindo "ilhas" desconexas).
4. `region_id` é determinístico: células ordenadas lexicograficamente por `cell_id`, garantindo mesma chave de cache em IndexedDB independentemente da ordem dos cliques.
5. **Espelhamento `"Mesmo Local (A=B)"` entre grades distintas (`mirrorRegionSelection`):** quando `variable_a` e `variable_b` pertencem ao mesmo `source_model`, `region_b` espelha exatamente `region_a.cells`; quando cruzam modelos nativos distintos (`MERRA-2` `0.5°×0.625°` $\leftrightarrow$ `CERES_SYN1deg` `1.0°×1.0°`), os centroides de `region_a.cells` passam por *re-snap* automático na grade nativa de `variable_b` com deduplicação por `cell_id`, preenchimento de pontos médios se houver lacuna de passo e seleção de núcleo conexo em 8-vizinhos até $K \le 9$, mantendo conformidade integral com a validação de grade do backend.

### 3.2 Request do Frontend (`POST /api/analyze`)

```json
{
  "variable_a": "GWETTOP",
  "variable_b": "T2M_MAX",
  "region_a": {
    "slot": "A",
    "region_id": "MERRA-2__r142_c210+r142_c211",
    "source_model": "MERRA-2",
    "grid_resolution": { "dLat": 0.5, "dLon": 0.625 },
    "cells": [
      { "cell_id": "r142_c210", "row": 142, "col": 210, "lat": -18.75, "lon": -48.4375 },
      { "cell_id": "r142_c211", "row": 142, "col": 211, "lat": -18.75, "lon": -47.8125 }
    ]
  },
  "region_b": null,
  "start_date": "1981-01",
  "end_date": "2025-12"
}
```

- O backend Python (`stats_engine.py`) busca/lê em cache cada `(cell.lat, cell.lon)`, calcula a média espacial $\bar{Y}(t) = \text{nanmean}(Y_i(t))$ sobre as $K$ células enviadas e executa o motor estatístico completo.

---

## 4. Fluxo B — Response do Backend (`RegionAnalysisResponse`)

```json
{
  "request_meta": {
    "variable_a": "GWETTOP",
    "variable_b": "T2M_MAX",
    "region_a_id": "MERRA-2__r142_c210+r142_c211",
    "region_b_id": null,
    "cells_count_a": 2,
    "cells_count_b": 0,
    "spatial_aggregation": "nanmean",
    "source": "backend_api"
  },
  "region_a_analysis": {
    "variable_id": "GWETTOP",
    "variable_name": "Umidade do Solo Superficial (0–5 cm)",
    "scale_type": "ratio",
    "unit": "fração (0–1)",
    "trend_unit": "fração/década",
    "allow_percentage_change": false,
    "period": {
      "start": "1981-01",
      "end": "2025-12",
      "n_observations": 540,
      "n_effective_ar1": 118.4
    },
    "regression": {
      "intercept_at_start_A0": 0.642,
      "slope_per_decade_ols": -0.028,
      "slope_per_decade_sen": -0.026,
      "slope_ci95_low": -0.035,
      "slope_ci95_high": -0.017,
      "cumulative_model_change": -0.117,
      "quadratic_acceleration_B2": -0.0014,
      "regime_shape": "accelerating_decline"
    },
    "correlation_and_coupling": {
      "pearson_r": -0.68,
      "kendall_tau": -0.51,
      "r_squared": 0.46,
      "ellipse_aspect_ratio": 0.44
    },
    "significance": {
      "p_value_naive": 1.1e-18,
      "p_value_ar1_corrected": 0.00042,
      "fdr_q_value": 0.0012,
      "is_significant_fdr05": true,
      "confidence_tier": "CONFIRMED_HIGH"
    },
    "outliers_mahalanobis": [
      {
        "date": "2015-11",
        "observed_anomaly": -0.145,
        "expected_regression": -0.062,
        "mahalanobis_d": 3.08,
        "direction": "below_ellipse",
        "diagnostic_hint": "Estresse hídrico extremo (El Niño 2015-2016)"
      }
    ],
    "series": {
      "dates": ["1981-01", "1981-02"],
      "raw_values": [0.65, 0.67],
      "anomaly_values": [0.01, 0.02],
      "linear_fit": [0.0, -0.0002],
      "gam_smooth_fit": [0.005, 0.003]
    }
  },
  "region_b_analysis": null,
  "comparison_pair": {
    "region_a_id": "MERRA-2__r142_c210+r142_c211",
    "region_b_id": "MERRA-2__r142_c210+r142_c211",
    "spatial_divergence_detected": false,
    "slope_difference_per_decade": null,
    "multiscale_correlation": {
      "long_term_secular_r": -0.74,
      "short_term_detrended_r": -0.61,
      "paradox_type": "LOCAL_PHYSICAL_COUPLING",
      "interpretation": "Aumento de T2M_MAX está associado a queda da umidade superficial (GWETTOP) tanto na tendência secular quanto na variabilidade interanual."
    }
  }
}
```

> **Nota sobre `comparison_pair`:** Quando houver 2 séries ativas (seja $A \neq B$ ou $A = B$ com $X \neq Y$), `region_b_analysis` traz a segunda série (do Local B ou da Variável Y no mesmo Local A) e `comparison_pair` traz a correlação multiescala ($r_{\text{global}}$ vs. $r_{\text{detrended}}$).

---

## 5. Erros Semânticos Padronizados e Modos do Adapter

O adapter `getRegionData()` opera em dois modos chaveáveis por `VITE_DATA_MODE`:
- `api`: consulta `POST ${VITE_API_BASE_URL}/api/analyze` usando `AbortController` e armazena resultado no **IndexedDB**. Em falha de rede/timeout (`> 5000 ms`), aciona fallback para `public/data/`.
- `offline`: lê diretamente os pacotes pré-computados de `public/data/`.

| Código de Erro | Quando Ocorre | Ação Esperada na UI |
| :--- | :--- | :--- |
| `OCEAN_MASK_NO_DATA` | Todas as células selecionadas caíram no oceano para `GWETTOP`/`GWETROOT` | Exibir aviso limpo orientando clicar em área continental |
| `MAX_CELLS_EXCEEDED` | Usuário tenta selecionar a 10ª célula ($K > 9$) | Bloquear seleção e informar limite máximo de 9 células |
| `NOT_ADJACENT` | Célula clicada não é 8-vizinha do bloco atual | Informar ou iniciar nova seleção limpa (conforme UX do `MapView`) |
| `WOULD_DISCONNECT` | Remoção de célula quebraria o bloco em 2 ilhas | Impedir remoção da célula ponte |
| `INVALID_DATE_INTERSECTION` | `start_date > end_date` ou fora da interseção válida | Ajustar automaticamente para interseção válida |
| `BACKEND_UNAVAILABLE` | Falha HTTP/timeout sem preset correspondente | Exibir estado de erro recuperável com botão de tentar novamente |
