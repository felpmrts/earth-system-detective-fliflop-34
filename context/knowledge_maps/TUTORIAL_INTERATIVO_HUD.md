# Guia Técnico — Tutorial Interativo Passo a Passo (HUD Tático/Científico 2D) (`TUTORIAL_INTERATIVO_HUD.md`)

**Branch de referência:** `mapa`  
**Área:** Onboarding, Sincronização de UI & UX (`PROD-1` + `PROD-2`)  
**Arquivos principais:**
- `frontend/src/services/tutorialState.ts`
- `frontend/src/tutorial/tutorialSteps.ts`
- `frontend/src/tutorial/TutorialOverlay.tsx`
- `frontend/src/App.tsx`
- `frontend/src/map/MapWorkspace.tsx`
- `frontend/src/bench/ScientificBench.tsx`
- `frontend/src/bench.css`
- `frontend/src/__tests__/tutorialWalkthrough.test.tsx`
- `frontend/e2e/trendDetective.spec.ts`
- `frontend/playwright.config.ts`

---

## 1. Objetivo e Comportamento Geral

Implementar um tutorial guiado nativo em React/CSS (100% offline, sem bibliotecas externas) no formato de missões tático-científicas de jogo 2D, cobrindo o fluxo completo da aplicação em **8 etapas** (`BRIEFING INICIAL` + `MISSÃO 1 / 7` a `MISSÃO 7 / 7`):

1. **Recepção única na primeira entrada:** abre automaticamente apenas quando `shouldAutoOpenTutorial()` retorna `true` (nenhum registro válido em `localStorage`).
2. **Reabertura sob demanda (`?`):** botão permanente **`Tutorial interativo (?)`** (`.tutorial-trigger`) no cabeçalho `.brand-header`, separado do botão contextual `Ajuda científica (?)` interno da Bancada Científica.
3. **Foco e edição estritos por etapa:** em cada missão, apenas os seletores explicados naquela etapa recebem recorte iluminado e interação/edição ao vivo; controles ainda não explicados permanecem escurecidos e bloqueados atrás do scrim SVG.

---

## 2. Persistência Local (`frontend/src/services/tutorialState.ts`)

- **Chave:** `TUTORIAL_STORAGE_KEY = 'flipflop34:tutorial:v1'`.
- **Schema (`PersistedTutorialState`):**
  - `version: 1`
  - `status: 'completed' | 'skipped'`
  - `updatedAt: string` (ISO 8601)
  - `lastStepId: string`
- **API:**
  - `loadTutorialState()` — valida o JSON e retorna `null` caso esteja ausente, corrompido ou bloqueado por privacidade/quota.
  - `shouldAutoOpenTutorial()` — retorna `loadTutorialState() === null`.
  - `saveTutorialOutcome(status, lastStepId)` — grava conclusão ou skip no `localStorage`.
  - `resetTutorialState()` — remove a chave armazenada.

---

## 3. Roteiro das 8 Etapas (`frontend/src/tutorial/tutorialSteps.ts`)

Cada item de `TUTORIAL_STEPS` define metadados visuais (`phaseTag`, `rankTitle`, `badgeIcon`), resumo, `fieldTip`, `interactiveHint`, `shortcuts` opcionais, `resolveMissionStatus` (leitura ao vivo via `TutorialLiveContext`) e `resolveTarget({ hasAnalysis })`:

| Ordem | `id` | Título | `selectors` estritos (`fallbackSelectors`) | Aba / Painel |
| :---: | :--- | :--- | :--- | :--- |
| `1 / 8` | `briefing` | `Bem-vindo ao Earth System Trend Detective` | `[]` (`placement: 'center'`) | Mapa |
| `2 / 8` | `variables-and-period` | `Escolha as Variáveis A/B e o Período` | `['[data-tour="sidebar-controls"]']` (`['[data-tour="workflow-progress"]']`) | Mapa + Sidebar aberta |
| `3 / 8` | `global-trends-fdr` | `Leia Tendências Globais e Significância` | `['[data-tour="map-trend-tools"]', '[data-tour="map-legend"]']` | Mapa |
| `4 / 8` | `hotspot-shortcuts` | `Salte Direto para Hotspots Globais` | `['[data-tour="hotspot-actions"]']` | Mapa |
| `5 / 8` | `spatial-selection` | `Marque Regiões A e B no Mapa` | `['[data-tour="map-selection-tools"]', '[data-tour="map-nav-tools"]', '[data-tour="map-stage"]']` | Mapa |
| `6 / 8` | `cartography-layers` | `Alterne Camadas de Satélite e Cartografia Local` | `['.map-container .leaflet-control-layers']` (`['[data-tour="map-stage"]']`) | Mapa |
| `7 / 8` | `run-analysis` | `Confira o Resumo e Dispare a Análise` | `['[data-tour="map-actions"]', '[data-tour="query-summary"]']` (`['[data-tour="analyze-button"]']`) | Mapa |
| `8 / 8` | `scientific-bench` | `Explore a Bancada Científica e Exporte Provas` | Sem análise: `['[data-tour="tab-bench"]']` (`showBenchPreview: true`)<br>Com análise: `['[data-tour="bench-panel"]']` | Mapa (prévia) ou Bancada |

---

## 4. Motor de Overlay, Recorte SVG e Anti-Sobreposição (`TutorialOverlay.tsx` + `bench.css`)

### 4.1 Scrim SVG multi-furo com `fillRule="evenodd"`
- `buildEvenOddScrimPath(rects, vw, vh)` cria o retângulo externo da viewport combinado aos subcaminhos arredondados (`roundedRectSubpath`) de cada retângulo de destaque em `<svg className="tutorial-scrim-svg"><path className="tutorial-scrim-path" fillRule="evenodd" clipRule="evenodd" ... /></svg>`.
- Em `bench.css`, `.tutorial-scrim-path` usa `fill: rgba(4, 10, 18, .76)` e `pointer-events: visiblePainted`: os "furos" ficam transparentes aos cliques do usuário direto nos controles destacados, enquanto cliques fora dos alvos disparam o ping visual (`.tutorial-spotlight.is-pinged`).
- Um `.tutorial-spotlight` com cantoneiras HUD (`.spotlight-corner`) envolve cada elemento resolvido por `resolveStepElements`.

### 4.2 Posicionamento inteligente (`computeCardLayout`)
- Classifica os retângulos focados entre **controles/painéis** e **palcos amplos** (`r.width > vw * 0.65 && r.height > vh * 0.4`).
- Avalia múltiplos candidatos ao redor de `primaryRect`, da união dos controles (`computeBoundingUnion`), dos alvos individuais, dos cantos/bordas da viewport e de **bolsos de altura adaptativa** (`MIN_POCKET_CARD_HEIGHT = 210` após medir a altura natural sem `maxHeight` via `measureNaturalCardSize`).
- Penaliza interseção com controles usando `CONTROL_OVERLAP_WEIGHT = 1000` (vs. `STAGE_OVERLAP_WEIGHT = 1` e `STAGE_CENTER_OVERLAP_WEIGHT = 8` para o miolo do mapa), impedindo que o card cubra botões de seleção, filtros ou `[data-tour="query-summary"]`.
- Quando o único alvo é o painel completo da Bancada (`hasAnalysis === true` na etapa `8/8`), o card ancora no **canto inferior direito** (sem `.is-centered`) para não obstruir os gráficos Plotly e os botões do cabeçalho (`Ajuda científica (?)`, `Exportar CSV/JSON`).
- Em `.tutorial-hud-card` (`bench.css`), o layout em coluna flex fixa cabeçalho, barra de progresso e rodapé de navegação (`Pular tutorial`, `Anterior`, `Próximo`), restringindo rolagem apenas a `.tutorial-hud-body` em telas baixas.
- Permite **Minimizar (`−`) / Expandir** o card para liberar 100% da tela ao marcar células no mapa.

### 4.3 Sincronização reativa de estado e teclado (`App.tsx` + `TutorialOverlay.tsx`)
- **Observadores de layout:** `ResizeObserver`, `MutationObserver` nos alvos (ex.: expansão de `.leaflet-control-layers`) e `mountObserver` temporário no `<main>`/`document.body` quando um alvo ainda vai montar após troca de aba.
- **Popovers Mantine acima do overlay:** `Select` e `MonthPickerInput` em `App.tsx` usam `zIndex: tutorialOpen ? 1325 : 1100` (entre o scrim e o card).
- **Teclado seguro durante edição:** `ArrowRight` / `ArrowLeft` são ignorados quando o foco está dentro de controles editáveis (`isEditingControlOrPopup`), e `Escape` respeita menus/popovers Mantine efetivamente visíveis (`hasOpenMantinePopup`) antes de fechar o tutorial.
- **Sidebar / Drawer:** `effectiveSidebarOpen` expande temporariamente `#variables-sidebar` no desktop ou abre o drawer mobile (`.drawer-open`) durante a etapa `2/8`, restaurando o estado anterior ao avançar.
- **Transição `7/8 -> 8/8` apenas em nova análise:** `prevAnalysisForTutorialRef` em `App.tsx` compara o resultado anterior de `analysis` com o atual, evitando pular o passo `7/8` caso o usuário reabra o tutorial com uma análise prévia já carregada, e avançando para `8/8` (`scientific-bench`) assim que uma nova consulta conclui em `run-analysis`.

---

## 5. Cobertura de Testes e Configuração Playwright

- **Testes unitários (`frontend/src/__tests__/tutorialWalkthrough.test.tsx`):** 5 testes cobrindo persistência/fallback de `tutorialState`, 8 etapas e modo adaptativo da Bancada, ciclo de 1ª visita (`localStorage`), foco/teclado/dropdown Mantine/`fill-rule="evenodd"`/ancoragem de `bench-panel` e sincronização da barra lateral.
- **Testes E2E (`frontend/e2e/trendDetective.spec.ts`):**
  - Desktop `1366×768`: 1ª visita automática, edição ao vivo da Variável A, alternância de `Só q < 0,05`, bloqueio de controles fora do foco verificado via `document.elementFromPoint`, zero sobreposição em `5/8` e `7/8`, visibilidade do botão `Próximo`, minimizar/expandir ao selecionar célula, persistência pós-reload e reabertura pelo `?`.
  - Mobile `375×812`: abertura pelo `?`, sincronização automática do drawer `#variables-sidebar.drawer-open` sem overflow horizontal, enquadramento do card e fechamento por `Escape`.
  - Transição `7/8 -> 8/8` com análise prévia carregada (`mockAnalyzeOffline: true`): garante permanência no passo `7/8`, avanço automático para `8/8` após nova consulta e ancoragem no canto inferior direito sem `.is-centered`.
- **Canal local do Playwright (`frontend/playwright.config.ts`):** `resolveLocalBrowserChannel()` mantém `undefined` no CI (`process.env.CI`) e detecta localmente Chrome ou Edge no Windows.
