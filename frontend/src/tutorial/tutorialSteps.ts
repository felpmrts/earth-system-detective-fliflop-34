export type TutorialPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center';
export type TutorialBadgeIcon =
  | 'radar'
  | 'variables'
  | 'trends'
  | 'hotspot'
  | 'grid'
  | 'layers'
  | 'analyze'
  | 'bench';

export interface TutorialShortcutHint {
  readonly keys: string;
  readonly label: string;
}

export interface TutorialLiveContext {
  readonly hasAnalysis: boolean;
  readonly variableA: string;
  readonly variableB: string;
  readonly startMonth: string;
  readonly endMonth: string;
  readonly periodReady: boolean;
  readonly regionACells: number;
  readonly regionBCells: number;
  readonly readyToAnalyze: boolean;
  readonly isAnalyzing: boolean;
}

export interface TutorialMissionStatus {
  readonly label: string;
  readonly complete: boolean;
}

export interface TutorialResolvedTarget {
  readonly selectors: readonly string[];
  readonly fallbackSelectors?: readonly string[];
  readonly requiredTab?: 'map' | 'bench';
  readonly requiresSidebar?: boolean;
  readonly placement: TutorialPlacement;
  readonly showBenchPreview?: boolean;
}

export interface TutorialStep {
  readonly id: string;
  readonly phaseTag: string;
  readonly rankTitle: string;
  readonly badgeIcon: TutorialBadgeIcon;
  readonly title: string;
  readonly summary: string;
  readonly fieldTip: string;
  readonly interactiveHint?: string;
  readonly shortcuts?: readonly TutorialShortcutHint[];
  readonly resolveMissionStatus?: (context: TutorialLiveContext) => TutorialMissionStatus | null;
  readonly resolveTarget: (context: { readonly hasAnalysis: boolean }) => TutorialResolvedTarget;
}

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'briefing',
    phaseTag: 'BRIEFING INICIAL',
    rankTitle: 'Recruta Orbital',
    badgeIcon: 'radar',
    title: 'Bem-vindo ao Earth System Trend Detective',
    summary:
      'Sua missão é investigar como pares de variáveis ambientais da NASA, Copernicus e NOAA evoluem no espaço e no tempo — respondendo às 4 Perguntas do Detetive sem confundir tendência secular com ruído sazonal.',
    fieldTip:
      'Em cada missão seguinte, apenas o controle explicado ficará iluminado e liberado para teste. Você pode reiniciar este guia pelo botão "?" no topo.',
    shortcuts: [
      { keys: '→ / ←', label: 'Avançar ou voltar etapas' },
      { keys: 'Esc', label: 'Fechar ou pular treinamento' },
    ],
    resolveTarget: () => ({
      selectors: [],
      placement: 'center',
    }),
  },
  {
    id: 'variables-and-period',
    phaseTag: 'MISSÃO 1 / 7',
    rankTitle: 'Catalogador',
    badgeIcon: 'variables',
    title: 'Escolha as Variáveis A/B e o Período',
    summary:
      'Defina a Variável A (ciano) e a Variável B (laranja) entre as 7 famílias ambientais (ex.: T2M, GWETTOP, ALLSKY_SFC_SW_DWN) e ajuste o mês inicial e final dentro da janela comum calculada automaticamente.',
    fieldTip:
      'Somente o catálogo lateral e os seletores de período estão liberados agora para você experimentar trocar variáveis ou datas.',
    interactiveHint: 'Apenas Variáveis A/B e Período liberados para edição',
    resolveMissionStatus: ctx => {
      const varsOk = Boolean(ctx.variableA && ctx.variableB);
      const ready = varsOk && ctx.periodReady;
      const periodText = ctx.periodReady ? `${ctx.startMonth} → ${ctx.endMonth}` : 'período pendente';
      return {
        complete: ready,
        label: `A: ${ctx.variableA || '—'} · B: ${ctx.variableB || '—'} · ${periodText}`,
      };
    },
    resolveTarget: () => ({
      selectors: ['[data-tour="sidebar-controls"]'],
      fallbackSelectors: ['[data-tour="workflow-progress"]'],
      requiredTab: 'map',
      requiresSidebar: true,
      placement: 'right',
    }),
  },
  {
    id: 'global-trends-fdr',
    phaseTag: 'MISSÃO 2 / 7',
    rankTitle: 'Analista FDR',
    badgeIcon: 'trends',
    title: 'Leia Tendências Globais e Significância',
    summary:
      'A legenda e os filtros de tendência explicam o mapa global: a cor mostra direção (+ / -), o raio representa a magnitude decadal e a borda sólida indica significância após correção AR(1) + FDR (q < 0,05).',
    fieldTip:
      'Teste apenas os botões destacados ("Ocultar tendências" e "Só q < 0,05") e observe o bloco "Tendência global" e o selo "Proxy" na legenda.',
    interactiveHint: 'Apenas legenda e filtros de tendência (Ocultar / Só q < 0,05) em foco',
    resolveTarget: () => ({
      selectors: ['[data-tour="map-trend-tools"]', '[data-tour="map-legend"]'],
      requiredTab: 'map',
      requiresSidebar: false,
      placement: 'top',
    }),
  },
  {
    id: 'hotspot-shortcuts',
    phaseTag: 'MISSÃO 3 / 7',
    rankTitle: 'Caçador de Extremos',
    badgeIcon: 'hotspot',
    title: 'Salte Direto para Hotspots Globais',
    summary:
      'Use "Extremo +" e "Extremo −" para voar automaticamente até o ponto com maior tendência positiva ou negativa da grade ativa (priorizando anomalias significativas com q < 0,05).',
    fieldTip:
      'Clique em "Extremo +" ou "Extremo −" no destaque para ver o globo centralizar automaticamente no hotspot com zoom ampliado.',
    interactiveHint: 'Apenas atalhos Extremo + e Extremo − liberados',
    resolveTarget: () => ({
      selectors: ['[data-tour="hotspot-actions"]'],
      requiredTab: 'map',
      requiresSidebar: false,
      placement: 'bottom',
    }),
  },
  {
    id: 'spatial-selection',
    phaseTag: 'MISSÃO 4 / 7',
    rankTitle: 'Mapeador de Grade',
    badgeIcon: 'grid',
    title: 'Marque Regiões A e B no Mapa',
    summary:
      'Alterne entre Selecionar A e B ou ative "Mesmo Local (A=B)" (re-snap automático entre MERRA-2 e CERES). Clique nas células do mapa, arraste caixas ou aplique blocos 3×3.',
    fieldTip:
      'Use "Ir para A/B", "Enquadrar A + B", "Desfazer" e "Limpar tudo" abaixo do mapa, ou "−" no topo deste card para recolhê-lo.',
    interactiveHint: 'Seleção A/B, ferramentas espaciais e grade do mapa liberados',
    shortcuts: [
      { keys: 'Shift + Arrastar', label: 'Caixa (até 25 cél.)' },
      { keys: 'Alt + Clique', label: 'Bloco conexo 3×3' },
    ],
    resolveMissionStatus: ctx => ({
      complete: ctx.regionACells > 0 && ctx.regionBCells > 0,
      label: `Região A: ${ctx.regionACells} cél. · Região B: ${ctx.regionBCells} cél.`,
    }),
    resolveTarget: () => ({
      selectors: ['[data-tour="map-selection-tools"]', '[data-tour="map-nav-tools"]', '[data-tour="map-stage"]'],
      requiredTab: 'map',
      requiresSidebar: false,
      placement: 'bottom',
    }),
  },
  {
    id: 'cartography-layers',
    phaseTag: 'MISSÃO 5 / 7',
    rankTitle: 'Navegador Offline',
    badgeIcon: 'layers',
    title: 'Alterne Camadas de Satélite e Cartografia Local',
    summary:
      'No controle de camadas destacado no canto superior direito do mapa, alterne entre Satélite NASA, Mapa de ruas, Relevo e a camada "Cartografia Local (Offline)" — garantindo leitura contínua mesmo sem internet.',
    fieldTip:
      'Passe o mouse ou toque no ícone de camadas destacado para abrir a lista e testar "Cartografia Local (Offline)".',
    interactiveHint: 'Apenas o controle de camadas do mapa liberado',
    resolveTarget: () => ({
      selectors: ['.map-container .leaflet-control-layers'],
      fallbackSelectors: ['[data-tour="map-stage"]'],
      requiredTab: 'map',
      requiresSidebar: false,
      placement: 'left',
    }),
  },
  {
    id: 'run-analysis',
    phaseTag: 'MISSÃO 6 / 7',
    rankTitle: 'Investigador de Campo',
    badgeIcon: 'analyze',
    title: 'Confira o Resumo e Dispare a Análise',
    summary:
      'Revise variáveis, quantidade de células, modelo e período no resumo destacado. Quando A, B e período estiverem completos, clique em "Analisar seleção".',
    fieldTip:
      'Se disparar uma consulta válida nesta etapa, o tutorial avança direto para a Bancada ao concluir.',
    interactiveHint: 'Apenas Resumo da consulta e botão Analisar seleção liberados',
    resolveMissionStatus: ctx => {
      if (ctx.isAnalyzing) {
        return { complete: false, label: 'Consultando backend em andamento…' };
      }
      return {
        complete: ctx.readyToAnalyze,
        label: ctx.readyToAnalyze
          ? 'Seleção completa — clique em "Analisar seleção" ou em Próximo'
          : 'Volte às etapas anteriores se ainda faltar variáveis, período ou células',
      };
    },
    resolveTarget: () => ({
      selectors: ['[data-tour="map-actions"]', '[data-tour="query-summary"]'],
      fallbackSelectors: ['[data-tour="analyze-button"]'],
      requiredTab: 'map',
      requiresSidebar: false,
      placement: 'bottom',
    }),
  },
  {
    id: 'scientific-bench',
    phaseTag: 'MISSÃO 7 / 7',
    rankTitle: 'Detetive Sênior',
    badgeIcon: 'bench',
    title: 'Explore a Bancada Científica e Exporte Provas',
    summary:
      'Após analisar, a Bancada abre séries Bruto / Anomalia / Z-Score (σ), escala Linear ou Symlog, retas OLS / Theil–Sen, curva GAM, Dispersão X vs Y com outliers (D_M > 2,5), os 4 cards de diagnóstico e exportação CSV/JSON.',
    fieldTip:
      'Use "Ajuda científica (?)" no topo da Bancada para consultar o glossário de OLS, Theil–Sen, GAM, AR(1) e Mahalanobis.',
    interactiveHint: 'Apenas a Bancada científica está liberada nesta etapa',
    resolveMissionStatus: ctx => ({
      complete: ctx.hasAnalysis,
      label: ctx.hasAnalysis
        ? 'Análise carregada — experimente Z-Score, Symlog, GAM e Exportar CSV/JSON'
        : 'Execute "Analisar seleção" para desbloquear os gráficos ao vivo',
    }),
    resolveTarget: ({ hasAnalysis }) =>
      hasAnalysis
        ? {
            selectors: ['[data-tour="bench-panel"]'],
            requiredTab: 'bench',
            requiresSidebar: false,
            placement: 'bottom',
            showBenchPreview: false,
          }
        : {
            selectors: ['[data-tour="tab-bench"]'],
            requiredTab: 'map',
            requiresSidebar: false,
            placement: 'bottom',
            showBenchPreview: true,
          },
  },
];
