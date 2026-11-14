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

* **Stack Oficial:** `Leaflet (Canvas) + React + TypeScript + Vite` (com deploy estático na Vercel e TypeScript em modo estrito).
* **Biblioteca de Mapas:** `Leaflet` (`L.map`, `L.tileLayer`, `L.circleMarker`, `L.geoJSON`, `L.layerGroup`, `L.polyline`, eventos de clique, controle de camadas) com renderer `Canvas` mandatório para manter alta performance com milhares de pontos/células da grade global.
* **Proibido adicionar:** Deck.gl, Mapbox, mapas 3D, animações complexas, interpolação espacial no browser ou bibliotecas sem problema real no MVP.
* **⚠️ Regra Crítica de Coordenadas:**
  * **Leaflet & Payload do Mapa (`cells_a`, `cells_b`):** `[latitude, longitude]` *(ordem obrigatória)*
  * **GeoJSON:** `[longitude, latitude]` *(Nunca inverter caso haja conversão para GeoJSON!)*

  

---

  

## 2. Arquitetura de Dados (2 Fluxos Distintos)

  

### Fluxo A: Mapa Global (Estático / Pré-processado)

Carregamento rápido a partir de arquivos pré-computados no formato `{var_id}_grid.json`. **O mapa nunca recalcula esses valores.**

* **Schema esperado:** `lat`, `lon`, `slope_sen_decade` (tendência/década), `q_value_fdr` (significância corrigida por FDR) e `is_sig` (booleano/indicador).

  

### Fluxo B: Regiões Selecionadas (Dinâmico sob demanda)

> **🔄 Atualização Arquitetural:** A abordagem antiga de 20–30 "regiões sentinelas" fixas (`regions.json`) foi substituída por consultas dinâmicas via API/serviço para qualquer região escolhida pelo usuário com composição flexível de células adjacentes.

```text
[Usuário seleciona Área A/B no MapView] ──▶ [MapView emite MapSelectionPayload] ──▶ [Frontend: getRegionData(payload)]
                                                                                             │
[PROD-2 recebe séries e estatísticas] ◀── [Camada Científica / Backend API] ◀── [NASA POWER / Subsetting]
```

### Especificação do Payload de Saída do Mapa (`MapSelectionPayload`)

Ao interagir com o mapa, o usuário seleciona e compõe as áreas A e B clicando em células da grade nativa. O mapa opera com **composição flexível de células adjacentes** (que compartilhem pelo menos um vértice ou aresta na grade discreta, ex.: $1\times 1$, $1\times 3$, $2\times 1$, $2\times 2$, até o teto de 9 células por área).

O componente `MapView` emite para o estado global da aplicação o seguinte payload padronizado em TypeScript:

```typescript
export interface MapSelectionPayload {
  variable_x: string;               // Variável primária (Área A)
  variable_y?: string;              // Variável secundária (Área B) - opcional para comparação univariada ou bivariada
  grid_resolution: {
    dLat: number;                   // Passo de latitude da grade nativa (ex: 0.5)
    dLon: number;                   // Passo de longitude da grade nativa (ex: 0.625)
  };
  cells_a: [number, number][];      // Células da Área A: 1 <= cells_a.length <= 9, coordenadas em [lat, lon]
  cells_b?: [number, number][];     // Células da Área B: 1 <= cells_b.length <= 9, coordenadas em [lat, lon] (opcional)
  start_year: number;               // Ano inicial comum da série temporal (ex: 1981)
  end_year: number;                 // Ano final comum da série temporal (ex: 2023)
}
```

Exemplo real de JSON emitido pelo mapa:

```json
{
  "variable_x": "T2M",
  "variable_y": "PRECTOTCORR",
  "grid_resolution": {
    "dLat": 0.5,
    "dLon": 0.625
  },
  "cells_a": [
    [-3.0, -60.0],
    [-3.0, -59.375],
    [-3.5, -60.0]
  ],
  "cells_b": [
    [14.0, 30.0],
    [14.0, 30.625]
  ],
  "start_year": 1981,
  "end_year": 2023
}
```

#### Regras Inegociáveis do Payload:
1. **Coordenadas `[lat, lon]`:** Toda célula é um par `[latitude, longitude]`, exatamente como exigido pela API Leaflet. Proibido inverter para `[lon, lat]` no payload.
2. **Restrição de Células ($1 \le \text{cells.length} \le 9$):** Cada área (`cells_a` e `cells_b`) suporta de 1 até 9 células adjacentes. Células isoladas ou desconectadas dentro da mesma área são inválidas.
3. **Escopo MVP de Variáveis:** O MVP inicia com 1 variável por área (`variable_x` para Área A e `variable_y` opcional para Área B, viabilizando comparação da mesma variável entre duas regiões ou correlação bivariada entre variáveis distintas), preparando o terreno para futuras famílias ambientais com múltiplas variáveis simultâneas.
4. **Resolução de Grade Explícita:** `grid_resolution: { dLat, dLon }` vincula a seleção à geometria nativa da fonte (ex.: MERRA-2 $0{,}5^\circ \times 0{,}625^\circ$), permitindo ao backend compor a requisição via `/point` ou `/regional`.

### ⚠️ Regra de Ouro sobre a NASA Earthdata

**API da NASA ≠ Estatísticas Prontas.** A NASA fornece dados brutos/recortados, não `slope_sen_decade` ou `q_value_fdr`.

1. **Camada de Aquisição:** Obtém variável, valores temporais e subconjunto espacial/temporal da NASA a partir do `MapSelectionPayload`.

2. **Camada Científica (Backend/Dados):** Agrega as células selecionadas (média espacial ponderada), calcula série temporal, anomalias, tendência ($B_{\text{Sen}}, B_{\text{OLS}}$), significância ($\text{AR}(1)$ + FDR) e correlação multiescala ($r_{\text{global}}, r_{\text{local}}$).

3. **Abstração no Frontend:** O componente `MapView` apenas emite a seleção através do `MapSelectionPayload`. A busca usa uma interface desacoplada tipada:

   ```typescript
   getRegionData(payload: MapSelectionPayload): Promise<AnalysisResponse>;
   ```

  

---

  

## 3. Regras Visuais, Científicas e de Performance

  

* **Visualização em 3 Dimensões:**

  1. **Direção:** Positiva vs. Negativa.

  2. **Magnitude:** Proporcional a `abs(slope)`, respeitando a unidade da variável.

  3. **Significância:** Baseada em `is_sig` / `q_value_fdr`. **Nunca misturar com magnitude** ("mais forte ≠ mais significativo").

* **Rigor Científico:** Diferenciar `TREND` de `STATISTICAL SIGNIFICANCE`. Nunca sugerir causalidade a partir de correlação, nem tratar tendência histórica como previsão futura.

* **Integridade da Seleção:** Não inventar `region_id` no frontend. Se usar geometria, definir claramente *bounding box*, polígono, centro, resolução e método de agregação.

* **Contrato `PROD-1` ↔ `PROD-2` (Componente React + TypeScript):**

  ```tsx
  export interface MapViewProps {
    gridData?: GlobalGridData;
    selection: MapSelectionPayload;
    onSelectionChange: (payload: MapSelectionPayload) => void;
    activeTarget?: 'A' | 'B';
  }

  export const MapView: React.FC<MapViewProps> = ({
    gridData,
    selection,
    onSelectionChange,
    activeTarget = 'A'
  }) => {
    // Renderiza Leaflet com renderer Canvas
    // Gerencia clique na grade nativa [lat, lon] e composição de até 9 células adjacentes (1 <= cells.length <= 9)
    // Emite MapSelectionPayload estruturado para o estado global
  };
  ```

* **Performance & Cache:** Usar `Canvas` para muitos pontos. Disparar requisições apenas após seleção explícita (com debounce/confirmação) e cachear pela chave: `variable + region_id + startDate + endDate`.

* **Fallback Obrigatório:** Não assumir que a API da NASA funcionará perfeitamente antes de testar (CORS, auth, latência, limites de recorte). Manter fallback local/pré-processado pronto para demonstração.

  

---

  

## 4. Plano de Execução e Divisão de Equipe

  

### Divisão de Tarefas (Sem Duplicação)

* **Dev Núcleo do Mapa:** `MapView`, setup `Leaflet`, renderização do grid, camadas, eventos de clique/seleção e comunicação com estado principal.

* **Dev Parceiro(a):** Validação do contrato de dados e coordenadas, helpers de estilo, legenda, associação `região ↔ dados`, adapter de API (`getRegionData`), fallback/mock e testes de performance/edge cases.

  

### Roteiro de Implementação (Ordem Estrita)

1. **Mapa Mínimo:** Stack `Leaflet (Canvas) + React + TypeScript + Vite` com `tileLayer` e pontos mockados renderizando no frontend.

2. **Dados Globais Reais:** Substituir mock por `{var_id}_grid.json` + estilização de tendência e significância via Canvas.

3. **Seleção A/B com Composição:** Clique destaca Área A e Área B com composição de até 9 células adjacentes ($1 \le \text{cells.length} \le 9$, coordenadas `[lat, lon]`) e emite o payload `{ variable_x, variable_y?, grid_resolution: { dLat, dLon }, cells_a, cells_b?, start_year, end_year }` para o estado global.

4. **Dados Dinâmicos:** Conectar `getRegionData(payload)` à API científica/backend com fallback local em IndexedDB *(apenas após validar viabilidade da API)*.

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

* **Geográfico:** Pontos e polígonos das células caem nas coordenadas exatas em `[lat, lon]` (ordem do Leaflet, sem inversão).

* **Payload:** O payload emitido pelo mapa valida a interface `MapSelectionPayload` com $1 \le \text{cells.length} \le 9$, `{ dLat, dLon }` e anos inicial/final.

* **Visual:** Direção, magnitude e significância são claramente distintas e batem com a legenda sobre Canvas.

* **Seleção & Integração:** Selecionar/trocar/remover células de A e B atualiza o `MapSelectionPayload` no estado global e alimenta a `PROD-2`.

* **Falha:** Simular API fora do ar, lentidão, erro de rede e região sem dados (deve acionar fallback/aviso limpo via cache IndexedDB).

  

### Checklist Final (MVP Pronto)

- [ ] **Stack Validada:** `Leaflet (Canvas) + React + TypeScript + Vite` rodando com build limpo e tipagem estrita.

- [ ] **Mapa & Dados:** Leaflet integrado com renderer Canvas, carrega `{var_id}_grid.json` real e coordenadas validadas em `[lat, lon]`.

- [ ] **Payload de Seleção:** Emissão funcional de `{ variable_x, variable_y?, grid_resolution: { dLat, dLon }, cells_a, cells_b?, start_year, end_year }` respeitando $1 \le \text{cells.length} \le 9$.

- [ ] **Visualização:** Direção, magnitude (`abs(slope)`) e significância (`is_sig`/`q_value_fdr`) distinguíveis + legenda coerente.

- [ ] **Interação:** Seleção flexível de até 2 áreas (A/B) com até 9 células adjacentes alimentando o comparador da `PROD-2`.

- [ ] **Arquitetura:** Zero cálculo estatístico no mapa; API desacoplada recebendo `MapSelectionPayload`.

- [ ] **Resiliência:** Controle de chamadas (cache/debounce), fallback local funcional em IndexedDB e zero dependências desnecessárias.