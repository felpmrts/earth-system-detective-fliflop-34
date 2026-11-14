# 🗺️ PROD-1_CONTEXT.md — Engenharia de Mapas & Geo

**Projeto:** NASA Space Apps Challenge — *Be An Earth System Trend Detective!*  

**Hierarquia:** Contexto operacional específico da **PROD-1**. Complementa (e não substitui) a janela de contexto principal do projeto.

  

> **🎯 Norte de Decisão (Ordem de Prioridade):**  

> `MVP Funcional` > `Dados Cientificamente Defensáveis` > `Integração Confiável` > `Performance Suficiente` > `Polimento` > `Sofisticação`

  

---

  

## 1. Escopo, Fronteiras e Stack

  

A PROD-1 responde visualmente: **Onde está mudando?**, **Em qual direção/intensidade?** e **É estatisticamente significativo?**, além de permitir a seleção de regiões.

  

| ✅ O que a PROD-1 FAZ                                   | ❌ O que a PROD-1 NÃO FAZ                                     |
| ------------------------------------------------------ | ------------------------------------------------------------ |
| Renderizar mapa global (`Leaflet`) e legenda           | Calcular Sen slope, FDR ou testes estatísticos               |
| Distinguir direção, magnitude e significância          | Processar arquivos NetCDF pesados no browser                 |
| Permitir seleção e destaque de até 2 regiões (A/B)     | Construir gráficos temporais ou textos analíticos (`PROD-2`) |
| Comunicar IDs/geometrias selecionadas ao estado global | Chamar APIs da NASA diretamente do componente de mapa        |
| Garantir performance (Canvas) e fallback local         | Fazer redesign completo do frontend                          |
  

### Stack & Regras de Implementação

* **Biblioteca:** `Leaflet` (`L.map`, `L.tileLayer`, `L.circleMarker`, `L.geoJSON`, `L.layerGroup`, `L.polyline`, eventos de clique, controle básico de camadas e renderer `Canvas` se necessário).

* **Proibido adicionar:** Deck.gl, Mapbox, mapas 3D, animações complexas, interpolação espacial no browser ou bibliotecas sem problema real no MVP.

* **⚠️ Regra Crítica de Coordenadas:**

  * **Leaflet:** `[latitude, longitude]`

  * **GeoJSON:** `[longitude, latitude]` *(Nunca inverter!)*

  

---

  

## 2. Arquitetura de Dados (2 Fluxos Distintos)

  

### Fluxo A: Mapa Global (Estático / Pré-processado)

Carregamento rápido a partir de arquivos pré-computados no formato `{var_id}_grid.json`. **O mapa nunca recalcula esses valores.**

* **Schema esperado:** `lat`, `lon`, `slope_sen_decade` (tendência/década), `q_value_fdr` (significância corrigida por FDR) e `is_sig` (booleano/indicador).

  

### Fluxo B: Regiões Selecionadas (Dinâmico sob demanda)

> **🔄 Atualização Arquitetural:** A abordagem antiga de 20–30 "regiões sentinelas" fixas (`regions.json`) foi substituída por consultas dinâmicas via API/serviço para qualquer região escolhida pelo usuário.

  

```text

[Usuário seleciona Região A/B] ──▶ [MapView emite ID/geometria] ──▶ [Frontend: getRegionData()]

                                                                           │

[PROD-2 recebe dados temporais] ◀── [Camada Científica/Backend] ◀── [NASA Earthdata (Subsetting)]

```

  

### ⚠️ Regra de Ouro sobre a NASA Earthdata

**API da NASA ≠ Estatísticas Prontas.** A NASA fornece dados brutos/recortados, não `slope_sen_decade` ou `q_value_fdr`.

1. **Camada de Aquisição:** Obtém variável, valores temporais e subconjunto espacial/temporal da NASA.

2. **Camada Científica (Backend/Dados):** Calcula série temporal, tendência, magnitude, significância e FDR.

3. **Abstração no Frontend:** O Leaflet apenas emite a seleção. A busca usa uma interface desacoplada (permite trocar mock por NASA sem mexer no mapa):

   ```javascript

   getRegionData({ variable, region, startDate, endDate })

   ```

  

---

  

## 3. Regras Visuais, Científicas e de Performance

  

* **Visualização em 3 Dimensões:**

  1. **Direção:** Positiva vs. Negativa.

  2. **Magnitude:** Proporcional a `abs(slope)`, respeitando a unidade da variável.

  3. **Significância:** Baseada em `is_sig` / `q_value_fdr`. **Nunca misturar com magnitude** ("mais forte ≠ mais significativo").

* **Rigor Científico:** Diferenciar `TREND` de `STATISTICAL SIGNIFICANCE`. Nunca sugerir causalidade a partir de correlação, nem tratar tendência histórica como previsão futura.

* **Integridade da Seleção:** Não inventar `region_id` no frontend. Se usar geometria, definir claramente *bounding box*, polígono, centro, resolução e método de agregação.

* **Contrato `PROD-1` ↔ `PROD-2`:**

  ```jsx

  <MapView

      gridData={gridData}

      selectedRegionIds={selectedRegionIds}

      onSelectionChange={setSelectedRegionIds}

  />

  ```

* **Performance & Cache:** Usar `Canvas` para muitos pontos. Disparar requisições apenas após seleção explícita (com debounce/confirmação) e cachear pela chave: `variable + region_id + startDate + endDate`.

* **Fallback Obrigatório:** Não assumir que a API da NASA funcionará perfeitamente antes de testar (CORS, auth, latência, limites de recorte). Manter fallback local/pré-processado pronto para demonstração.

  

---

  

## 4. Plano de Execução e Divisão de Equipe

  

### Divisão de Tarefas (Sem Duplicação)

* **Dev Núcleo do Mapa:** `MapView`, setup `Leaflet`, renderização do grid, camadas, eventos de clique/seleção e comunicação com estado principal.

* **Dev Parceiro(a):** Validação do contrato de dados e coordenadas, helpers de estilo, legenda, associação `região ↔ dados`, adapter de API (`getRegionData`), fallback/mock e testes de performance/edge cases.

  

### Roteiro de Implementação (Ordem Estrita)

1. **Mapa Mínimo:** `Leaflet` + `tileLayer` + pontos mockados renderizando no frontend.

2. **Dados Globais Reais:** Substituir mock por `{var_id}_grid.json` + estilização de tendência e significância.

3. **Seleção A/B:** Clique destaca até 2 regiões e envia IDs/geometrias para o estado global.

4. **Dados Dinâmicos:** Conectar `getRegionData(...)` à NASA/backend *(apenas após validar viabilidade da API)*.

5. **Performance & Fallback:** Testar volume de pontos, cache de requisições e comportamento offline/erro.

6. **Polimento:** Legenda final, estados de loading, mensagens de erro e acessibilidade.

  

### Checklist Pré-Implementação da API NASA (Investigar antes de codar)

Antes de gastar tempo integrando um dataset, responda:

1. Qual é o dataset e a variável exatos?

2. Qual API/serviço permite acessá-la?

3. É possível recortar espacialmente e temporalmente?

4. É necessária autenticação ou há bloqueio de CORS?

5. Formato, volume e tempo de resposta são viáveis para demo web?

6. Os dados retornados bastam para calcular série/tendência/significância no backend?

7. Existe um fallback simples?

  

---

  

## 5. Prompts Prontos para IA (Economia de Tokens)

  

Use a IA como **implementadora/revisora** enviando este arquivo + um dos prompts abaixo:

  

<details>

<summary><b>🔍 1. Prompt de Inspeção Inicial (Antes de codar)</b></summary>

  

```text

Leia o PROD1_CONTEXT.md e inspecione o repositório. Não implemente nada.

Identifique apenas: (1) estrutura atual do frontend; (2) onde o MapView deve ficar; (3) como os dados são carregados; (4) formato real dos dados geográficos; (5) dependências existentes; (6) como o estado de seleção chega ao restante da aplicação; (7) arquivos que precisam ser alterados.

Não crie arquivos, não instale dependências e não proponha arquitetura nova.

```

</details>

  

<details>

<summary><b>🗺️ 2. Prompt de Implementação do Mapa</b></summary>

  

```text

Use o PROD1_CONTEXT.md como regra. Implemente apenas o mapa Leaflet mínimo no frontend existente.

Objetivo: renderizar o grid, distinguir tendência positiva/negativa, representar significância e manter a interface compatível com o projeto.

Não implemente estatística, processamento NASA ou alterações na PROD-2. Não crie nova aplicação nem adicione dependências sem justificar.

```

</details>

  

<details>

<summary><b>📍 3. Prompt de Seleção de Regiões</b></summary>

  

```text

Use o PROD1_CONTEXT.md. Implemente apenas a seleção de até duas regiões no MapView.

A seleção deve: destacar Região A/B, preservar os dados geográficos existentes e emitir os identificadores/geometrias para o estado principal.

Não invente associação entre região e série temporal. Não implemente gráficos nem chamadas NASA ainda.

```

</details>

  

<details>

<summary><b>🛡️ 4. Prompt de Auditoria de Código</b></summary>

  

```text

Audite a implementação da PROD-1 contra o PROD1_CONTEXT.md. Não faça alterações.

Liste somente: (1) bugs; (2) violações de arquitetura; (3) problemas de coordenadas; (4) problemas de performance; (5) problemas de integração; (6) riscos científicos; (7) complexidade desnecessária.

Para cada problema, indique arquivo e trecho/causa.

```

</details>

  

---

  

## 6. Validação & Definição de Pronto (DoD)

  

### Testes Mínimos Obrigatórios

* **Geográfico:** Pontos caem nas coordenadas exatas (sem inversão `lat/lon`).

* **Visual:** Direção, magnitude e significância são claramente distintas e batem com a legenda.

* **Seleção & Integração:** Selecionar/trocar/remover A e B atualiza o estado global e alimenta a `PROD-2`.

* **Falha:** Simular API fora do ar, lentidão, erro de rede e região sem dados (deve acionar fallback/aviso limpo).

  

### Checklist Final (MVP Pronto)

- [ ] **Mapa & Dados:** Leaflet integrado, mapa global carrega `{var_id}_grid.json` real e coordenadas foram validadas.

- [ ] **Visualização:** Direção, magnitude (`abs(slope)`) e significância (`is_sig`/`q_value_fdr`) distinguíveis + legenda coerente.

- [ ] **Interação:** Seleção e destaque de até 2 regiões (A/B) enviando IDs/geometria ao estado principal (`PROD-2`).

- [ ] **Arquitetura:** Zero cálculo estatístico no mapa; API NASA desacoplada e não tratada como fonte de estatísticas prontas.

- [ ] **Resiliência:** Controle de chamadas (cache/debounce), fallback local funcional e zero dependências desnecessárias.