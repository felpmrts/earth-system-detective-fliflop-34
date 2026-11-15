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
    phaseTag: 'INITIAL BRIEFING',
    rankTitle: 'Orbital Recruit',
    badgeIcon: 'radar',
    title: 'Welcome to Earth System Trend Detective',
    summary:
      'Your mission is to investigate how pairs of environmental variables from NASA, Copernicus, and NOAA evolve across space and time — answering the 4 Detective Questions without mistaking seasonal noise for secular trends.',
    fieldTip:
      'In each mission below, only the explained control will be highlighted and unlocked for testing. You can restart this guide anytime via the "?" button at the top.',
    shortcuts: [
      { keys: '→ / ←', label: 'Next or previous step' },
      { keys: 'Esc', label: 'Close or skip training' },
    ],
    resolveTarget: () => ({
      selectors: [],
      placement: 'center',
    }),
  },
  {
    id: 'variables-and-period',
    phaseTag: 'MISSION 1 / 7',
    rankTitle: 'Cataloger',
    badgeIcon: 'variables',
    title: 'Choose X/Y Variables and Period',
    summary:
      'Set Variable X (cyan) and Variable Y (orange) across the 7 environmental families (e.g., T2M, GWETTOP, ALLSKY_SFC_SW_DWN) and adjust the start and end months within the automatically computed common window.',
    fieldTip:
      'Only the sidebar catalog and period selectors are unlocked right now so you can try switching variables or dates.',
    interactiveHint: 'Only X/Y Variables and Period unlocked for editing',
    resolveMissionStatus: ctx => {
      const varsOk = Boolean(ctx.variableA && ctx.variableB);
      const ready = varsOk && ctx.periodReady;
      const periodText = ctx.periodReady ? `${ctx.startMonth} → ${ctx.endMonth}` : 'period pending';
      return {
        complete: ready,
        label: `X: ${ctx.variableA || '—'} · Y: ${ctx.variableB || '—'} · ${periodText}`,
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
    phaseTag: 'MISSION 2 / 7',
    rankTitle: 'FDR Analyst',
    badgeIcon: 'trends',
    title: 'Read Global Trends and Significance',
    summary:
      'The legend and trend filters explain the global map: color shows direction (+ / -), radius represents decadal magnitude, and a solid border indicates significance after AR(1) + FDR correction (q < 0.05).',
    fieldTip:
      'Try only the highlighted buttons ("Hide trends" and "Only q < 0.05") and observe the "Global trend" block and "Proxy" badge in the legend.',
    interactiveHint: 'Only legend and trend filters (Hide / Only q < 0.05) in focus',
    resolveTarget: () => ({
      selectors: ['[data-tour="map-trend-tools"]', '[data-tour="map-legend"]'],
      requiredTab: 'map',
      requiresSidebar: false,
      placement: 'top',
    }),
  },
  {
    id: 'hotspot-shortcuts',
    phaseTag: 'MISSION 3 / 7',
    rankTitle: 'Extremes Hunter',
    badgeIcon: 'hotspot',
    title: 'Jump Straight to Global Hotspots',
    summary:
      'Use "Extreme +" and "Extreme −" to fly automatically to the point with the strongest positive or negative trend in the active grid (prioritizing significant anomalies with q < 0.05).',
    fieldTip:
      'Click "Extreme +" or "Extreme −" in the highlight to watch the globe automatically center on the hotspot with zoomed-in detail.',
    interactiveHint: 'Only Extreme + and Extreme − shortcuts unlocked',
    resolveTarget: () => ({
      selectors: ['[data-tour="hotspot-actions"]'],
      requiredTab: 'map',
      requiresSidebar: true,
      placement: 'bottom',
    }),
  },
  {
    id: 'spatial-selection',
    phaseTag: 'MISSION 4 / 7',
    rankTitle: 'Grid Mapper',
    badgeIcon: 'grid',
    title: 'Mark Regions A and B on the Map',
    summary:
      'Switch between Select A and B or enable "Same Location (A=B)" (auto re-snap between MERRA-2 and CERES). Click map cells, drag boxes, or apply 3×3 blocks.',
    fieldTip:
      'Use "Go to A/B", "Fit A + B", "Undo", and "Clear all" below the map, or "−" at the top of this card to collapse it.',
    interactiveHint: 'A/B selection, spatial tools, and map grid unlocked',
    shortcuts: [
      { keys: 'Shift + Drag', label: 'Box (up to 25 cells)' },
      { keys: 'Alt + Click', label: 'Connected 3×3 block' },
    ],
    resolveMissionStatus: ctx => ({
      complete: ctx.regionACells > 0 && ctx.regionBCells > 0,
      label: `Region A: ${ctx.regionACells} cells · Region B: ${ctx.regionBCells} cells`,
    }),
    resolveTarget: () => ({
      selectors: ['[data-tour="map-selection-tools"]', '[data-tour="map-nav-tools"]', '[data-tour="map-stage"]', '[data-tour="close-variables"]', '[data-tour="open-variables"] button'],
      requiredTab: 'map',
      requiresSidebar: true,
      placement: 'bottom',
    }),
  },
  {
    id: 'cartography-layers',
    phaseTag: 'MISSION 5 / 7',
    rankTitle: 'Offline Navigator',
    badgeIcon: 'layers',
    title: 'Switch Satellite and Local Cartography Layers',
    summary:
      'In the highlighted layer control at the top-right of the map, switch between NASA Satellite, Street Map, Terrain, and the "Local Cartography (Offline)" layer — ensuring continuous reading even without internet.',
    fieldTip:
      'Hover or tap the highlighted layers icon to open the list and test "Local Cartography (Offline)".',
    interactiveHint: 'Only the map layer control is unlocked',
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
    phaseTag: 'MISSION 6 / 7',
    rankTitle: 'Field Investigator',
    badgeIcon: 'analyze',
    title: 'Review the Summary and Run Analysis',
    summary:
      'Review variables, cell count, model, and period in the highlighted summary. Once A, B, and period are complete, click "Analyze selection".',
    fieldTip:
      'If you trigger a valid query in this step, the tutorial advances directly to the Workbench upon completion.',
    interactiveHint: 'Only Query Summary and Analyze selection button unlocked',
    resolveMissionStatus: ctx => {
      if (ctx.isAnalyzing) {
        return { complete: false, label: 'Querying backend in progress…' };
      }
      return {
        complete: ctx.readyToAnalyze,
        label: ctx.readyToAnalyze
          ? 'Selection complete — click "Analyze selection" or Next'
          : 'Return to previous steps if variables, period, or cells are still missing',
      };
    },
    resolveTarget: () => ({
      selectors: ['[data-tour="map-actions"]', '[data-tour="query-summary"]'],
      fallbackSelectors: ['[data-tour="analyze-button"]'],
      requiredTab: 'map',
      requiresSidebar: true,
      placement: 'bottom',
    }),
  },
  {
    id: 'scientific-bench',
    phaseTag: 'MISSION 7 / 7',
    rankTitle: 'Senior Detective',
    badgeIcon: 'bench',
    title: 'Explore the Scientific Workbench and Export Evidence',
    summary:
      'After running an analysis, the Scientific Workbench opens Raw / Anomaly / Z-Score (σ) series, Linear or Symlog scales, OLS / Theil–Sen slopes, GAM curve, Scatter X vs Y with Mahalanobis outliers (D_M > 2.5), the "4 Detective Answers" panel, the ANALYTICAL PANELS toolbar, AI Statistical Co-Pilot, 7/7 Audited Invariants, and CSV/JSON reproducibility export.',
    fieldTip:
      'Use "Scientific help (?)" at the top of the Workbench to consult the glossary for OLS, Theil–Sen, GAM, AR(1), and Mahalanobis.',
    interactiveHint: 'Only the Scientific Workbench is unlocked in this step',
    resolveMissionStatus: ctx => ({
      complete: ctx.hasAnalysis,
      label: ctx.hasAnalysis
        ? 'Analysis loaded — try Z-Score, Symlog, GAM, and Export CSV/JSON'
        : 'Run "Analyze selection" to unlock live charts',
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
