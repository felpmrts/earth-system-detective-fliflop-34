# Guia Técnico — Seleção em Bloco 3×3 e Navegação por Extremos Globais (`MAPA_BLOCO3X3_E_HOTSPOTS_DEMO.md`)

**Branch de referência:** `mapa`  
**Área:** Mapas & Visualização Geoespacial (`PROD-1`)  
**Arquivos principais:**
- `frontend/src/geo/gridGeometry.ts`
- `frontend/src/map/mapStyles.ts`
- `frontend/src/map/MapWorkspace.tsx`
- `frontend/src/bench.css`
- `frontend/src/__tests__/gridGeometry.test.ts`
- `frontend/src/__tests__/mapStylesAndLegend.test.ts`

---

## 1. Objetivo das Atualizações

Preparar o módulo de mapa interativo para a demonstração ao vivo com duas evoluções de alta produtividade sem alterar o Contrato de Dados nem os 7 Invariantes Estatísticos:

1. **Bloco Conexo 3×3 (`Alt + Clique` e toggle `"Bloco 3×3"`):** selecionar até 9 células nativas contíguas ao redor de um ponto clicado em 1 único clique.
2. **Extremos Globais (`Extremo +` e `Extremo −`):** saltar diretamente para os hotspots globais de maior tendência positiva e negativa da variável ativa com zoom regional (`7`) e alvo visual explícito.

---

## 2. Seleção em Bloco 3×3 (`buildCellBlock3x3`)

### 2.1 Função pura em `frontend/src/geo/gridGeometry.ts`
- **Assinatura:** `buildCellBlock3x3(lat: number, lon: number, variableId: VariableId): GridCell[]`
- **Funcionamento:**
  1. Valida `(lat, lon)` e encaixa a célula central via `snapCoordToCell(lat, lon, variableId)` (respeitando `MERRA-2` `0.5° × 0.625°`, `CERES_SYN1deg` `1.0° × 1.0°` e grades `0.5° × 0.5°`).
  2. Gera os deslocamentos `dr, dc ∈ {-1, 0, 1}` ao redor de `(center.row, center.col)` via `buildCellFromRowCol`.
  3. Descarta células fora dos limites geográficos/regionais do modelo (`candidate.lat ∈ [grid_origin.lat0, 90]`, `candidate.lon ∈ [grid_origin.lon0, 180]`, `bounds_leaflet` contidos em `[-90, 90] × [-180, 180]`, `south < north` e `west < east`).
  4. Deduplica `cell_id` via `deduplicateCells`, garantindo componente 8-conexo com:
     - **9 células** (`3×3`) em pontos interiores;
     - **6 células** (`2×3` ou `3×2`) em bordas polares (`±90°`) ou do antimeridiano (`±180°`);
     - **4 células** (`2×2`) nas quatro quinas extremas do globo.

### 2.2 Integração na UI (`MapWorkspace.tsx` + `bench.css`)
- **Botão `"Bloco 3×3"` na `.map-toolbar`:** alterna `blockSelectMode` de forma **mutuamente exclusiva** com **`"Arrastar Seleção"`** (`dragSelectMode`). Ativar um desativa o outro automaticamente.
- **Atalho `"Alt + Clique"`:** funciona a qualquer momento (`Boolean(event.originalEvent?.altKey)`) mesmo com o botão toggle desligado.
- **Locais suportados:** funciona tanto ao clicar no mapa quanto diretamente sobre um marcador circular da grade global (`L.CircleMarker`, com `L.DomEvent.stopPropagation` evitando disparo duplicado).
- **Preview e slots:** exibe *preview* das células do bloco 3×3 durante o `mousemove`, respeita `activeSlot` (`A` ou `B`), alimenta a pilha de **`Desfazer`** e aciona o espelhamento **`Mesmo Local (A=B)`** (`mirrorRegionSelection`) entre resoluções diferentes (ex.: `MERRA-2` ↔ `CERES_SYN1deg`).

---

## 3. Navegação por Extremos Globais (`findGlobalTrendHotspots`)

### 3.1 Seleção determinística em `frontend/src/map/mapStyles.ts`
- **Assinatura:** `findGlobalTrendHotspots(points: readonly GlobalGridPoint[]): GlobalTrendHotspots`
- **Regra de seleção (`selectExtremeHotspot`):**
  1. Filtra valores finitos com sinal compatível (`slope_sen_decade > 0` para `+`; `slope_sen_decade < 0` para `−`).
  2. **Prioriza pontos com significância FDR (`q_value_fdr < 0.05`)** quando existirem nessa direção — impedindo que ruído com `q ≥ 0.05` mascare um hotspot estatisticamente validado.
  3. Caso não haja nenhum ponto com `q_value_fdr < 0.05` na direção solicitada, faz *fallback* para o ponto de maior magnitude naquela direção (ex.: único ponto negativo não significativo em `T2M_grid.json`).
  4. Se não existir nenhum ponto na direção (ex.: `ALLSKY_SFC_LW_DWN_grid.json`, sem pontos negativos), retorna `null` e mantém o respectivo botão desabilitado.
  5. Em empate exato de `slope_sen_decade`, escolhe o menor `q_value_fdr`.

### 3.2 Feedback visual no mapa (`MapWorkspace.tsx`)
- Botões compactos **`Extremo +`** e **`Extremo −`** na `.map-toolbar`.
- Ao clicar:
  1. Executa `map.flyTo([point.lat, point.lon], 7, { animate: true, duration: 0.65 })` (zoom regional alinhado ao `maxZoom: 7` de `focusRegions` e abaixo de `maxNativeZoom: 8` da camada NASA Blue Marble).
  2. Desenha um alvo visual não-interativo em `hotspotHighlightLayer` (halo tracejado externo laranja/azul + anel interno amarelo) ao redor de `[point.lat, point.lon]`.
  3. Abre o tooltip com inclinação, status FDR e coordenadas assim que a animação `moveend` termina (limpando listeners anteriores se o usuário alternar rapidamente ou mudar de variável).
  4. Atualiza `.map-message` com a variável, magnitude formatada com unidade, `q_value_fdr` e coordenadas `(lat, lon)`.

---

## 4. Verificação e Execução Local

- **Testes unitários:**
  - `frontend/src/__tests__/gridGeometry.test.ts` (bloco 3×3 central, polos, antimeridiano, quinas e re-snap heterogêneo `MERRA-2` ↔ `CERES_SYN1deg`).
  - `frontend/src/__tests__/mapStylesAndLegend.test.ts` (prioridade `q_value_fdr < 0.05`, fallback não significativo, direção ausente e desempate).
- **Comandos validados em `frontend/`:**
  - `npx tsc --noEmit`
  - `npx vitest run` (9 arquivos, 49 testes)
  - `npm run validate:grids -- --strict` (12/12 grades homologadas + alias `CLOUD_AMT -> CLDTOT_grid.json`)
  - `npm run build`
  - `npm run verify:offline`
