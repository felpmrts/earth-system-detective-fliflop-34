# Especificações Técnicas e Regras de Ingestão — NASA POWER API v2 (`DADOS-1`)

> **Resumo Técnico Validado por `DADOS-1` (Kaio e Felipe):** Regras obrigatórias de tratamento de dados, limites de *bounding box*, unidades físicas, *rate limits* e formato de armazenamento para o backend do *Earth System Trend Detective*.

---

## 1. Máscara Oceânica e Valores Faltantes (`GWETTOP` / `GWETROOT`)

- **Valor Sentinela (*Fill Value*):** O valor padrão de dado ausente na NASA POWER API é **`-999`** (ou `-999.0` no JSON/CSV), e **não** `null`.
- **Comportamento no Oceano:** As variáveis de umidade do solo (`GWETTOP` — superficial $0\text{--}5\text{ cm}$, e `GWETROOT` — zona radicular $0\text{--}100\text{ cm}$) vêm do modelo terrestre **MERRA-2 Land**, que só possui dados sobre continentes/ilhas. Se uma coordenada (`/point`) ou célula dentro de um retângulo (`/regional`) cair no oceano, a API retorna **`-999`** para todos os meses daquela célula.
- **Regra Obrigatória no Backend:** Antes de calcular a média espacial de uma composição de células (especialmente em regiões costeiras como Rio de Janeiro ou Santos) ou rodar regressões, substituir `-999` por `np.nan` (`df.replace(-999, np.nan)`) e usar `np.nanmean()` para que o oceano não distorça a média da área terrestre.

---

## 2. Unidade Real de `PRECTOTCORR` (Comunidade `AG`) e Filtro de `YYYY13`

- **Unidade Retornada:** Mesmo no endpoint **mensal** (`/api/temporal/monthly/point` ou `/regional`) na comunidade `AG` (Agroclimatologia), a variável `PRECTOTCORR` (*Precipitation Corrected*) retorna como **taxa média diária (`mm/day`)**, e **não** o acumulado do mês (`mm/month`).
- **Confirmação no Payload:** O bloco `"parameters"` no topo do JSON informa explicitamente `"units": "mm/day"`.
- **Regras Obrigatórias no Backend:**
  1. **Descartar a chave `YYYY13`:** A NASA POWER inclui a chave anual `YYYY13` junto aos 12 meses (`YYYY01..YYYY12`) nas séries mensais. Ela deve ser filtrada antes de qualquer cálculo estatístico.
  2. **Conversão para `mm/mês`:** Para exibir o volume total mensal em `mm/mês`, multiplicar o valor de cada mês pelo número de dias daquele mês (`calendar.monthrange(ano, mes)[1]`), tratando anos bissextos em fevereiro.

---

## 3. `/point` vs. `/regional`: Limites de Bounding Box e Latência

| Característica | `/api/temporal/monthly/point` | `/api/temporal/monthly/regional` |
| :--- | :--- | :--- |
| **Parâmetros por chamada** | Até **20 parâmetros** (`parameters=T2M,PRECTOTCORR,...`) | Apenas **1 parâmetro** por requisição (múltiplos geram erro `422 Unprocessable Entity`) |
| **Tamanho mínimo** | 1 célula nativa (`lat`, `lon`) | **`2° × 2°`** (caixas menores, como `0.5° × 0.5°`, retornam erro `422`) |
| **Tamanho máximo síncrono** | 1 célula nativa | **`10° × 10°`** (acima disso exige processamento assíncrono/lote) |
| **Latência real (20–30 anos)** | **~0,8 s a 1,8 s** | **~1,5 s a 3,5 s** |

- **Atenção à Grade MERRA-2 ($0{,}5^\circ \text{ lat} \times 0{,}625^\circ \text{ lon}$):** Mesmo uma composição $3\times 3$ do MERRA-2 mede $1{,}5^\circ \times 1{,}875^\circ$, que é menor que o mínimo de $2^\circ \times 2^\circ$ do `/regional`. Portanto, para composições pequenas ($K \le 9$ células adjacentes), o uso de `/point` com controle de concorrência e cache por célula é o caminho padrão (ou `/regional` quando a caixa atingir $\ge 2^\circ \times 2^\circ$ para 1 variável).

---

## 4. Rate Limits, Concorrência e Composição de Células Adjacentes

- **Limites Oficiais (NASA POWER API v2):**
  - **Por minuto:** Máximo de **30 requisições/minuto** por IP (consultas síncronas).
  - **Concorrência simultânea:** Tolera rajadas curtas de **3 a 5 chamadas simultâneas** (`asyncio` / `ThreadPoolExecutor`). Disparar 9 chamadas paralelas de uma vez frequentemente gera **`429 Too Many Requests`** ou timeouts.
- **Composição Flexível de Células Adjacentes ($K \le 9$):**
  - O usuário não está restrito a quadrados $1\times 1 \to 2\times 2 \to 3\times 3$; pode montar qualquer formato de células adjacentes que tenham **pelo menos um ponto/vértice em comum** (ex.: $1\times 3$, $2\times 1$, $2\times 2$), permitindo escolher uma geometria para o dado $X$ (ex.: $1\times 3$) e outra para o dado $Y$ (ex.: $2\times 1$).
- **Estratégia no Backend:**
  - Usar semáforo de concorrência **`asyncio.Semaphore(3)`** com *backoff* exponencial.
  - Cachear individualmente cada célula `(lat, lon, var)` para que expansões de área reutilizem células já baixadas sem novas chamadas HTTP.

---

## 5. Decisão Final sobre Formato (Parquet Descartado no Módulo 1)

- **Decisão (`DADOS-1`):** O uso de `.parquet` está **descartado definitivamente** no fluxo principal (Módulo 1).
- **Pipeline Direto:** Mantemos `JSON (NASA POWER) -> JSON (Contrato Frontend)` com armazenamento em cache local (**JSON / SQLite**) indexado por célula individual `(lat, lon, var)` e por consulta agregada de região.

---

## 6. Regra de Snap Geográfico (Lat/Lon)

- **MERRA-2 ($0{,}5^\circ \text{ lat} \times 0{,}625^\circ \text{ lon}$) — Malha única padrão no frontend:**
  - `lat_snap = round(lat / 0.5) * 0.5`
  - `lon_snap = round(lon / 0.625) * 0.625` *(arredondado para 4 casas decimais na chave de cache)*
- **CERES ($1{,}0^\circ \times 1{,}0^\circ$, centros em meio-grau):**
  - `lat_snap = floor(lat) + 0.5`
  - `lon_snap = floor(lon) + 0.5`
  - *(Como `/point` aceita até 20 variáveis misturando MERRA-2 e CERES na mesma chamada, o frontend utiliza apenas a grade fina MERRA-2.)*
