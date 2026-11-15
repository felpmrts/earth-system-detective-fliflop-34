import { getIntersectingDateBounds, getVariableMetadata } from '../contracts/catalog';
import type { RegionSelection, VariableId } from '../contracts/types';
import type { TrendMode } from '../bench/benchMeta';
import { buildRegionSelection, snapCoordToCell } from '../geo/gridGeometry';

export type ArchetypeId =
  | 'spatial_dipole'
  | 'local_coupling'
  | 'cross_teleconnection'
  | 'univariate_xray'
  | 'configuring';

export interface ExperimentArchetype {
  readonly id: ArchetypeId;
  readonly formula: string;
  readonly label: string;
  readonly summary: string;
}

export interface StoryTrapItem {
  readonly id: 'noise' | 'nonlinear' | 'multiscale';
  readonly number: string;
  readonly title: string;
  readonly trapSummary: string;
  readonly solutionBadge: string;
  readonly solutionText: string;
}

export interface StatisticalEngineStage {
  readonly id: 'preprocess' | 'trends' | 'audit' | 'multiscale';
  readonly stepNumber: string;
  readonly badge: string;
  readonly title: string;
  readonly tagline: string;
  readonly howItWorks: string;
  readonly benchSpecialty: string;
  readonly outputMetrics: readonly string[];
}

export interface EngineSpecialtyItem {
  readonly id: string;
  readonly kicker: string;
  readonly title: string;
  readonly summary: string;
}

export interface MatrixModeCard {
  readonly id: Exclude<ArchetypeId, 'configuring'>;
  readonly formula: string;
  readonly title: string;
  readonly tagline: string;
  readonly example: string;
  readonly recommendedPresetId: string;
  readonly defaultSameLocation: boolean;
}

export interface StoryPresetSeedCoord {
  readonly lat: number;
  readonly lon: number;
}

export interface StoryPreset {
  readonly id: string;
  readonly archetypeId: Exclude<ArchetypeId, 'configuring'>;
  readonly archetypeLabel: string;
  readonly formula: string;
  readonly title: string;
  readonly subtitle: string;
  readonly question: string;
  readonly highlightBadge: string;
  readonly variableA: VariableId;
  readonly variableB: VariableId;
  readonly regionALabel: string;
  readonly regionBLabel: string;
  readonly coordsA: readonly StoryPresetSeedCoord[];
  readonly coordsB: readonly StoryPresetSeedCoord[];
  readonly sameLocation: boolean;
  readonly startMonth: string;
  readonly endMonth: string;
  readonly recommendedBench: {
    readonly anomaly: boolean;
    readonly separate: boolean;
    readonly dual: boolean;
    readonly trendMode: TrendMode;
  };
}

export const STORY_TRAPS: readonly StoryTrapItem[] = [
  {
    id: 'noise',
    number: '01',
    title: 'Oscilação natural finge ser tendência',
    trapSummary:
      'Ciclos naturais de chuva e temperatura criam subidas aparentes que enganam retas comuns.',
    solutionBadge: 'AR(1) + FDR (q < 0,05)',
    solutionText:
      'Descontamos a memória entre meses seguidos e bloqueamos falsos alarmes antes de confirmar a tendência.',
  },
  {
    id: 'nonlinear',
    number: '02',
    title: 'Uma linha reta esconde viradas de regime',
    trapSummary:
      'O clima pode ficar estável por décadas e acelerar de repente — algo que uma reta simples não enxerga.',
    solutionBadge: 'Theil–Sen + Curva GAM (B₂)',
    solutionText:
      'Combinamos inclinação resistente a anos extremos com curva flexível GAM para revelar acelerações.',
  },
  {
    id: 'multiscale',
    number: '03',
    title: 'Sobem juntos em 40 anos, divergem ano a ano',
    trapSummary:
      'Duas regiões podem aquecer juntas no longo prazo, mas reagir em lados opostos durante o El Niño.',
    solutionBadge: 'r_global × r_detrended + Mahalanobis',
    solutionText:
      'Separamos a tendência de longo prazo dos choques de curto prazo e destacamos meses extremos (D_M > 2,5).',
  },
];

export const STAT_ENGINE_STAGES: readonly StatisticalEngineStage[] = [
  {
    id: 'preprocess',
    stepNumber: 'ETAPA 01',
    badge: 'ANOMALIA · Z-SCORE (σ) · SYMLOG',
    title: 'Limpeza Sazonal e Padronização',
    tagline: 'Remove verão/inverno para isolar desvios reais',
    howItWorks:
      'Para cada célula e mês selecionado, o motor calcula a anomalia climatológica subtraindo a média histórica daquele mesmo mês do ano. Assim, chuva e calor podem ser comparados em unidade física, em desvio-padrão (Z-Score σ) ou em escala simétrica Symlog.',
    benchSpecialty:
      'Na Bancada Científica você alterna instantaneamente entre Valor Bruto, Anomalia, Z-Score (σ) e escala Linear/Symlog — alinhando variáveis de unidades distintas no mesmo gráfico sem distorcer o zero.',
    outputMetrics: ['Anomalia Mensal', 'Z-Score (σ)', 'Escala Symlog', 'Eixo Y Duplo / Único'],
  },
  {
    id: 'trends',
    stepNumber: 'ETAPA 02',
    badge: 'OLS · THEIL–SEN · CURVA GAM (B₂)',
    title: 'Dupla Regressão e Aceleração Não-Linear',
    tagline: 'Mede velocidade por década e viradas de regime',
    howItWorks:
      'O motor ajusta três leituras complementares ao mesmo tempo: a reta média OLS, a inclinação mediana Theil–Sen com Intervalo de Confiança 95% (imune a anos extremos como El Niño) e a curva suave GAM com termo quadrático B₂.',
    benchSpecialty:
      'Classifica automaticamente o regime físico em 5 estados: Tendência linear constante, Alta em aceleração, Queda em aceleração, Desaceleração/saturação ou Comportamento não monotônico.',
    outputMetrics: ['Taxa Theil–Sen + IC 95%', 'Taxa OLS', 'Curvatura B₂ (GAM)', 'Regime Físico'],
  },
  {
    id: 'audit',
    stepNumber: 'ETAPA 03',
    badge: 'AR(1) · N EFETIVO · FDR (q < 0,05)',
    title: 'Auditoria contra Memória e Falsos Alarmes',
    tagline: 'Só confirma tendência após corrigir dependência temporal',
    howItWorks:
      'Meses consecutivos de seca ou calor guardam memória climática (autocorrelação). O motor desconta essa dependência via modelo AR(1) reduzindo N bruto para N efetivo, recalcula p_AR(1) e aplica controle Benjamini–Hochberg (FDR).',
    benchSpecialty:
      'Emite o selo final de confiança auditável: Significativa (alta confiança), Significativa (confiança moderada), Sinal insuficiente ou Sem tendência detectada — bloqueando falsos positivos.',
    outputMetrics: ['N bruto → N efetivo', 'p_naive vs p_AR(1)', 'q_FDR (< 0,05)', 'Selo de Confiança'],
  },
  {
    id: 'multiscale',
    stepNumber: 'ETAPA 04',
    badge: 'MAHALANOBIS · r_global × r_detrended · INVARIANTE #3',
    title: 'Extremos, Acoplamento e Paradoxo Multiescala',
    tagline: 'Detecta meses atípicos e inversões entre décadas e anos',
    howItWorks:
      'Calcula a elipse de covariância e a Distância de Mahalanobis (D_M > 2,5) para marcar eventos extremos sem apagar a tendência. Ao comparar Região A × Região B, confronta a correlação secular (r_global) contra a de curto prazo (r_detrended).',
    benchSpecialty:
      'Aplica a trava física Invariante #3 (bloqueando % indevido em escalas intervalares como °C), alterna para Dispersão X vs Y com razão de elipse e exporta séries e diagnóstico completo em CSV e JSON.',
    outputMetrics: ['Outliers D_M > 2,5', 'Pearson r · Kendall τ · R²', 'Δ Declive (A − B)', 'CSV / JSON Científico'],
  },
];

export const STAT_ENGINE_SPECIALTIES: readonly EngineSpecialtyItem[] = [
  {
    id: 'robust-dual',
    kicker: 'ROBUSTEZ',
    title: 'Dupla tendência OLS + Theil–Sen (IC 95%)',
    summary: 'Compara a média global com a mediana resistente a extremos para evitar distorção por um único ano atípico.',
  },
  {
    id: 'regime-gam',
    kicker: 'NÃO-LINEARIDADE',
    title: 'Curva GAM & Aceleração Quadrática (B₂)',
    summary: 'Identifica se a mudança está acelerando, saturando ou oscilando quando uma linha reta não basta.',
  },
  {
    id: 'scatter-mahalanobis',
    kicker: 'ACOPLAMENTO',
    title: 'Dispersão X × Y & Elipse de Mahalanobis',
    summary: 'Cruza duas variáveis ou regiões com Pearson r, Kendall τ, R² e detecção automática de extremos D_M > 2,5.',
  },
  {
    id: 'safeguards',
    kicker: 'BLINDAGEM & SAÍDA',
    title: 'Invariante #3 + Exportação CSV / JSON',
    summary: 'Bloqueia variação % inválida em variáveis intervalares como °C e exporta toda a série e metadados auditáveis.',
  },
];

export const MATRIX_MODES: readonly MatrixModeCard[] = [
  {
    id: 'spatial_dipole',
    formula: 'A ≠ B · X = Y',
    title: 'Contraste Espacial (Dipolo)',
    tagline: 'Mesma variável em dois lugares do globo',
    example: 'Ex.: Umidade do solo no Cerrado vs. Amazônia Central',
    recommendedPresetId: 'cerrado-vs-amazonia',
    defaultSameLocation: false,
  },
  {
    id: 'local_coupling',
    formula: 'A = B · X ≠ Y',
    title: 'Causa e Efeito Local',
    tagline: 'Duas forças físicas sobre as mesmas células',
    example: 'Ex.: Temperatura máxima drenando umidade do solo',
    recommendedPresetId: 'heatwaves-soil-mg',
    defaultSameLocation: true,
  },
  {
    id: 'cross_teleconnection',
    formula: 'A ≠ B · X ≠ Y',
    title: 'Teleconexão Cruzada',
    tagline: 'Fenômeno em A conectado a resposta distante em B',
    example: 'Ex.: Radiação na Amazônia (CERES) × chuva no Sul (MERRA-2)',
    recommendedPresetId: 'ceres-amazon-parana',
    defaultSameLocation: false,
  },
  {
    id: 'univariate_xray',
    formula: 'A = B · X = Y',
    title: 'Raio-X Univariado',
    tagline: 'Tendência secular, aceleração e extremos em 1 região',
    example: 'Ex.: Diagnóstico completo de qualquer célula da Terra',
    recommendedPresetId: 'arctic-vs-tropics',
    defaultSameLocation: true,
  },
];

export const STORY_PRESETS: readonly StoryPreset[] = [
  {
    id: 'cerrado-vs-amazonia',
    archetypeId: 'spatial_dipole',
    archetypeLabel: 'Dipolo Espacial',
    formula: 'A ≠ B · X = Y',
    title: 'Por que o Cerrado seca mais rápido que a Amazônia?',
    subtitle: 'Triângulo Mineiro (MG) × Amazônia Central (AM) · Umidade do Solo',
    question:
      'Compare a perda de água no solo do Cerrado agrícola com a floresta amazônica desde 1981.',
    highlightBadge: '45 anos · Satélite NASA',
    variableA: 'GWETTOP',
    variableB: 'GWETTOP',
    regionALabel: 'Triângulo Mineiro (MG)',
    regionBLabel: 'Amazônia Central (AM)',
    coordsA: [
      { lat: -19.0, lon: -48.125 },
      { lat: -19.0, lon: -48.75 },
    ],
    coordsB: [
      { lat: -3.0, lon: -60.0 },
      { lat: -3.0, lon: -60.625 },
    ],
    sameLocation: false,
    startMonth: '1981-01',
    endMonth: '2025-12',
    recommendedBench: {
      anomaly: true,
      separate: false,
      dual: false,
      trendMode: 'both',
    },
  },
  {
    id: 'heatwaves-soil-mg',
    archetypeId: 'local_coupling',
    archetypeLabel: 'Causa e Efeito Local',
    formula: 'A = B · X ≠ Y',
    title: 'Ondas de calor estão secando o solo no mesmo lugar?',
    subtitle: 'Norte de Minas Gerais (Mesmo Local A=B) · Umidade × Calor Máximo',
    question:
      'Veja como o avanço do calor extremo drena a umidade do solo exatamente nas mesmas células.',
    highlightBadge: 'Mesmo Local (A=B)',
    variableA: 'GWETTOP',
    variableB: 'T2M_MAX',
    regionALabel: 'Norte de Minas (MG)',
    regionBLabel: 'Norte de Minas (MG)',
    coordsA: [
      { lat: -16.5, lon: -43.75 },
      { lat: -16.5, lon: -44.375 },
    ],
    coordsB: [
      { lat: -16.5, lon: -43.75 },
      { lat: -16.5, lon: -44.375 },
    ],
    sameLocation: true,
    startMonth: '1981-01',
    endMonth: '2025-12',
    recommendedBench: {
      anomaly: true,
      separate: false,
      dual: true,
      trendMode: 'both',
    },
  },
  {
    id: 'ceres-amazon-parana',
    archetypeId: 'cross_teleconnection',
    archetypeLabel: 'Teleconexão Cruzada',
    formula: 'A ≠ B · X ≠ Y',
    title: 'Sol na Amazônia × Chuva no Sul do Brasil',
    subtitle: 'Amazônia Equatorial × Bacia do Paraná · Radiação Solar × Precipitação',
    question:
      'Descubra como a energia solar na Amazônia se conecta ao regime de chuvas no Sul em anos de El Niño.',
    highlightBadge: '1984–2025 · 2 Satélites',
    variableA: 'ALLSKY_SFC_SW_DWN',
    variableB: 'PRECTOTCORR',
    regionALabel: 'Amazônia Equatorial',
    regionBLabel: 'Bacia do Paraná (PR/MS)',
    coordsA: [
      { lat: -3.5, lon: -60.5 },
      { lat: -3.5, lon: -59.5 },
    ],
    coordsB: [
      { lat: -25.5, lon: -54.375 },
      { lat: -25.5, lon: -53.75 },
    ],
    sameLocation: false,
    startMonth: '1984-01',
    endMonth: '2025-12',
    recommendedBench: {
      anomaly: true,
      separate: true,
      dual: true,
      trendMode: 'both',
    },
  },
  {
    id: 'arctic-vs-tropics',
    archetypeId: 'spatial_dipole',
    archetypeLabel: 'Escala Planetária',
    formula: 'A ≠ B · X = Y',
    title: 'O Ártico esquenta muito mais rápido que os Trópicos?',
    subtitle: 'Svalbard (78°N) × Atlântico Tropical · Temperatura (T2M)',
    question:
      'Compare a velocidade real do aquecimento no Polo Norte com a costa tropical brasileira.',
    highlightBadge: 'Polo Norte × Trópicos',
    variableA: 'T2M',
    variableB: 'T2M',
    regionALabel: 'Svalbard (Ártico, 78°N)',
    regionBLabel: 'Costa Nordeste / Atlântico',
    coordsA: [
      { lat: 78.0, lon: 15.625 },
      { lat: 78.0, lon: 16.25 },
    ],
    coordsB: [
      { lat: -5.5, lon: -35.625 },
      { lat: -5.5, lon: -36.25 },
    ],
    sameLocation: false,
    startMonth: '1981-01',
    endMonth: '2025-12',
    recommendedBench: {
      anomaly: true,
      separate: false,
      dual: false,
      trendMode: 'both',
    },
  },
];

export function materializeStoryPreset(
  preset: StoryPreset,
  maximumMonth: string,
): {
  readonly variableA: VariableId;
  readonly variableB: VariableId;
  readonly regionA: RegionSelection;
  readonly regionB: RegionSelection;
  readonly startMonth: string;
  readonly endMonth: string;
  readonly sameLocation: boolean;
} {
  const cellsA = preset.coordsA.map(coord => snapCoordToCell(coord.lat, coord.lon, preset.variableA));
  const cellsB = preset.coordsB.map(coord => snapCoordToCell(coord.lat, coord.lon, preset.variableB));

  const regionA = buildRegionSelection('A', preset.variableA, cellsA);
  const regionB = buildRegionSelection('B', preset.variableB, cellsB);

  const bounds = getIntersectingDateBounds(preset.variableA, preset.variableB);
  const clampedStart = preset.startMonth >= bounds.startDate ? preset.startMonth : bounds.startDate;
  const maxAllowed = maximumMonth <= bounds.endDate ? maximumMonth : bounds.endDate;
  const clampedEnd = preset.endMonth <= maxAllowed ? preset.endMonth : maxAllowed;

  return {
    variableA: preset.variableA,
    variableB: preset.variableB,
    regionA,
    regionB,
    startMonth: clampedStart,
    endMonth: clampedEnd >= clampedStart ? clampedEnd : clampedStart,
    sameLocation: preset.sameLocation,
  };
}

function areRegionsEquivalent(regionA: RegionSelection | null, regionB: RegionSelection | null): boolean {
  if (!regionA || !regionB) return false;
  if (regionA.region_id === regionB.region_id) return true;
  if (regionA.cells.length !== regionB.cells.length) return false;
  return regionA.cells.every((cellA, index) => {
    const cellB = regionB.cells[index];
    return Boolean(cellB && Math.abs(cellA.lat - cellB.lat) < 0.01 && Math.abs(cellA.lon - cellB.lon) < 0.01);
  });
}

export function classifyExperimentArchetype(params: {
  readonly variableA: string;
  readonly variableB: string;
  readonly regionA: RegionSelection | null;
  readonly regionB: RegionSelection | null;
  readonly sameLocation: boolean;
}): ExperimentArchetype {
  const { variableA, variableB, regionA, regionB, sameLocation } = params;

  if (!variableA || !variableB || !regionA || !regionB) {
    return {
      id: 'configuring',
      formula: '(A, X) × (B, Y)',
      label: 'Experimento Aberto em Construção',
      summary: 'Escolha quaisquer duas variáveis e marque duas áreas (ou A=B) em qualquer ponto da Terra.',
    };
  }

  const sameLoc = sameLocation || areRegionsEquivalent(regionA, regionB);
  const sameVar = variableA === variableB;
  const nameA = getVariableMetadata(variableA as VariableId)?.variable_name ?? variableA;
  const nameB = getVariableMetadata(variableB as VariableId)?.variable_name ?? variableB;

  if (!sameLoc && sameVar) {
    return {
      id: 'spatial_dipole',
      formula: 'A ≠ B · X = Y',
      label: 'Contraste Espacial (Dipolo)',
      summary: `Comparando ${nameA} entre duas regiões distintas para detectar divergência espacial.`,
    };
  }

  if (sameLoc && !sameVar) {
    return {
      id: 'local_coupling',
      formula: 'A = B · X ≠ Y',
      label: 'Causa e Efeito Local',
      summary: `Cruzando ${nameA} × ${nameB} sobre o mesmo território para testar acoplamento físico.`,
    };
  }

  if (!sameLoc && !sameVar) {
    return {
      id: 'cross_teleconnection',
      formula: 'A ≠ B · X ≠ Y',
      label: 'Teleconexão Cruzada',
      summary: `Relacionando ${nameA} em A com ${nameB} em B através de escalas e regiões distantes.`,
    };
  }

  return {
    id: 'univariate_xray',
    formula: 'A = B · X = Y',
    label: 'Raio-X Univariado Profundo',
    summary: `Avaliando tendência secular, aceleração GAM e extremos de ${nameA} no local selecionado.`,
  };
}
