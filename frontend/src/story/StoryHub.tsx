import { useEffect, useRef, useState, type ReactNode } from 'react';
import { getVariableMetadata, VARIABLE_LIST } from '../contracts/catalog';
import { MAX_CELLS_PER_REGION } from '../geo/gridGeometry';
import type { InfoDisplayMode } from '../services/sessionState';
import { GLOBE_TELEMETRY_FOCUSES, Globe3D } from './Globe3D';
import { StarfieldBackdrop } from './StarfieldBackdrop';
import {
  CaseChartGraphic,
  FeatureCardGraphic,
  type FeatureCardId,
} from './StoryDiagrams';
import {
  STAT_ENGINE_SPECIALTIES,
  STAT_ENGINE_STAGES,
  type StatisticalEngineStage,
  STORY_PRESETS,
  type StoryPreset,
  STORY_TRAPS,
  type StoryTrapItem,
} from './storyPresets';
import { BenchDeepDiveShowcase, MapEngineeringShowcase } from './StoryShowcases';
import './story.css';

interface StoryHubProps {
  readonly page?: 'hero' | 'info';
  readonly infoMode?: InfoDisplayMode;
  readonly tourStep?: number;
  readonly hasExistingAnalysis: boolean;
  readonly onOpenFreeMap: (options?: { readonly sameLocation?: boolean }) => void;
  readonly onOpenMoreInfo?: () => void;
  readonly onTourStepChange?: (step: number) => void;
  readonly onOpenBench: () => void;
  readonly onLaunchPreset: (preset: StoryPreset, options: { readonly autoAnalyze: boolean }) => void;
}

interface StoryFeatureCard {
  readonly id: FeatureCardId;
  readonly title: string;
  readonly description: string;
  readonly ctaLabel: string;
  readonly actionType: 'open_map' | 'scroll_engine' | 'scroll_cases' | 'scroll_bench_showcase' | 'scroll_map_showcase';
}

function useRevealVisible(settleMs = 4600) {
  const ref = useRef<HTMLElement | null>(null);
  const [revealed, setRevealed] = useState<boolean>(
    () => typeof IntersectionObserver !== 'function',
  );
  const [settled, setSettled] = useState<boolean>(
    () => typeof IntersectionObserver !== 'function',
  );

  useEffect(() => {
    if (revealed || typeof IntersectionObserver !== 'function') return;
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { threshold: 0.14, rootMargin: '0px 0px -64px 0px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [revealed]);

  useEffect(() => {
    if (!revealed || settled) return;
    const timer = window.setTimeout(() => setSettled(true), settleMs);
    return () => window.clearTimeout(timer);
  }, [revealed, settled, settleMs]);

  return { ref, revealed, settled };
}

function RevealSection({
  id,
  className,
  animCategory,
  labelledBy,
  children,
}: {
  readonly id?: string;
  readonly className: string;
  readonly animCategory:
    | 'cat-top-down'
    | 'cat-converge'
    | 'cat-orbital-split'
    | 'cat-fan-scale'
    | 'cat-alternating-sides'
    | 'cat-bottom-tilt';
  readonly labelledBy: string;
  readonly children: ReactNode;
}) {
  const { ref, revealed, settled } = useRevealVisible();
  return (
    <section
      id={id}
      ref={ref}
      aria-labelledby={labelledBy}
      className={`${className} story-reveal ${animCategory}${revealed ? ' is-revealed' : ''}${settled ? ' is-settled' : ''}`}
    >
      {children}
    </section>
  );
}

function TrapDiagram({ trapId }: { readonly trapId: StoryTrapItem['id'] }) {
  if (trapId === 'noise') {
    return (
      <svg className="trap-svg" viewBox="0 0 260 88" role="img" aria-label="Illustration of random noise causing a false alarm">
        <defs>
          <linearGradient id="trapNoiseBand" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.18" />
          </linearGradient>
        </defs>
        <path d="M10 46 Q 70 28, 130 44 T 250 38 L 250 62 Q 190 70, 130 62 T 10 66 Z" fill="url(#trapNoiseBand)" />
        <polyline
          className="svg-draw-series"
          points="10,56 32,38 54,60 76,34 98,52 120,66 142,36 164,58 186,30 208,52 230,26 250,42"
          fill="none"
          stroke="#c7d2fe"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line x1="10" y1="56" x2="250" y2="38" stroke="#fbbf24" strokeWidth="1.8" strokeDasharray="5 4" />
        <circle cx="230" cy="26" r="4" fill="#f87171" />
        <text x="14" y="17" fill="#8fa0c4" fontSize="9.8" fontWeight="600">
          Plain line overestimates · AR(1)+FDR filters luck
        </text>
      </svg>
    );
  }

  if (trapId === 'nonlinear') {
    return (
      <svg className="trap-svg" viewBox="0 0 260 88" role="img" aria-label="Illustration of nonlinear curve versus straight line">
        <line x1="12" y1="62" x2="248" y2="28" stroke="#64748b" strokeWidth="1.8" strokeDasharray="4 4" />
        <path
          className="svg-draw-path"
          d="M12 64 C 62 64, 96 60, 136 52 C 176 44, 212 22, 248 16"
          fill="none"
          stroke="#5eead4"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx="152" cy="48" r="4.2" fill="#fbbf24" />
        <line x1="152" y1="22" x2="152" y2="74" stroke="rgba(251, 191, 36, 0.45)" strokeDasharray="3 3" />
        <text x="14" y="17" fill="#8fa0c4" fontSize="9.8" fontWeight="600">
          Flat line vs. acceleration detected by GAM (B₂)
        </text>
      </svg>
    );
  }

  return (
    <svg className="trap-svg" viewBox="0 0 260 88" role="img" aria-label="Illustration of multiscale paradox and extremes">
      <path
        className="svg-draw-series"
        d="M12 64 L 38 42 L 64 58 L 90 36 L 116 52 L 142 28 L 168 46 L 194 22 L 220 38 L 248 18"
        fill="none"
        stroke="#c7d2fe"
        strokeWidth="1.9"
      />
      <path
        className="svg-draw-series"
        d="M12 52 L 38 66 L 64 42 L 90 58 L 116 34 L 142 50 L 168 24 L 194 42 L 220 18 L 248 34"
        fill="none"
        stroke="#f97316"
        strokeWidth="2.1"
        strokeDasharray="6 3"
      />
      <circle cx="194" cy="22" r="4" fill="#f87171" />
      <text x="14" y="17" fill="#8fa0c4" fontSize="9.8" fontWeight="600">
        Same secular direction · opposite peaks (El Niño)
      </text>
    </svg>
  );
}

const TOUR_STEP_LABELS = [
  'Overview',
  'Interactive Map',
  'Automated Diagnostic',
  'Statistical Engine',
  'Ready-Made Cases',
  'Scientific Rigor',
] as const;

export function StoryHub({
  page = 'hero',
  infoMode = 'tour',
  tourStep,
  hasExistingAnalysis,
  onOpenFreeMap,
  onOpenMoreInfo,
  onTourStepChange,
  onOpenBench,
  onLaunchPreset,
}: StoryHubProps) {
  const [selectedEngineStage, setSelectedEngineStage] = useState<StatisticalEngineStage>(STAT_ENGINE_STAGES[0]!);
  const [selectedGlobeFocusId, setSelectedGlobeFocusId] = useState<string>(GLOBE_TELEMETRY_FOCUSES[0]!.id);
  const [focusNonce, setFocusNonce] = useState(0);

  const activeGlobeFocus =
    GLOBE_TELEMETRY_FOCUSES.find(f => f.id === selectedGlobeFocusId) ?? GLOBE_TELEMETRY_FOCUSES[0]!;

  function handleSelectGlobeFocus(focusId: string) {
    const focus = GLOBE_TELEMETRY_FOCUSES.find(f => f.id === focusId);
    if (!focus) return;
    setSelectedGlobeFocusId(focus.id);
    setFocusNonce(n => n + 1);
  }

  const featureCards: readonly StoryFeatureCard[] = [
    {
      id: 'spatial',
      title: '100% Global Spatial Coverage',
      description: `Click any point on the planet or select up to ${MAX_CELLS_PER_REGION} neighboring cells directly on the map.`,
      ctaLabel: 'See Map Spotlight ↓',
      actionType: 'scroll_map_showcase',
    },
    {
      id: 'catalog',
      title: `${VARIABLE_LIST.length} Real Environmental Variables`,
      description: 'Cross-analyze rain, temperature, soil moisture, solar radiation, vegetation, and rivers (1981–2025).',
      ctaLabel: 'See Ready-Made Cases →',
      actionType: 'scroll_cases',
    },
    {
      id: 'engine',
      title: 'True Trends Without False Alarms',
      description: 'Filters out extreme years, false alarms, and climatic memory to confirm whether a trend is real.',
      ctaLabel: 'Explore Statistical Engine →',
      actionType: 'scroll_engine',
    },
    {
      id: 'modes',
      title: 'Compare Places and Variables',
      description: 'Compare two different places (A ≠ B) or two variables in the exact same area (A = B).',
      ctaLabel: 'Try Freely on the Map →',
      actionType: 'open_map',
    },
  ];

  const [internalTourStep, setInternalTourStep] = useState(0);
  const rawStep = tourStep ?? internalTourStep;
  const activeTourStep = Math.max(0, Math.min(TOUR_STEP_LABELS.length - 1, rawStep));
  const showAllInfo = infoMode === 'full';

  function updateTourStep(nextStep: number) {
    const clamped = Math.max(0, Math.min(TOUR_STEP_LABELS.length - 1, nextStep));
    if (tourStep === undefined) {
      setInternalTourStep(clamped);
    }
    onTourStepChange?.(clamped);
  }

  function handleFeatureAction(actionType: StoryFeatureCard['actionType']) {
    if (actionType === 'open_map') {
      onOpenFreeMap();
      return;
    }
    if (!showAllInfo) {
      if (actionType === 'scroll_map_showcase') {
        updateTourStep(1);
        return;
      }
      if (actionType === 'scroll_bench_showcase') {
        updateTourStep(2);
        return;
      }
      if (actionType === 'scroll_engine') {
        updateTourStep(3);
        return;
      }
      updateTourStep(4);
      return;
    }
    const targetId =
      actionType === 'scroll_map_showcase'
        ? 'story-map-showcase-section'
        : actionType === 'scroll_bench_showcase'
          ? 'story-bench-showcase-section'
          : actionType === 'scroll_engine'
            ? 'story-engine-section'
            : 'story-cases-section';
    document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const [tourStarting, setTourStarting] = useState(false);
  const tourTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (tourTimerRef.current !== null) window.clearTimeout(tourTimerRef.current);
  }, []);

  function handleStartTour() {
    if (tourStarting) return;
    setTourStarting(true);
    tourTimerRef.current = window.setTimeout(() => {
      tourTimerRef.current = null;
      setTourStarting(false);
      onOpenMoreInfo?.();
    }, 2000);
  }

  useEffect(() => {
    if (window.scrollY > 0) {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [page, infoMode]);

  useEffect(() => {
    if (page === 'info' && !showAllInfo && window.scrollY > 0) {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [activeTourStep, page, showAllInfo]);

  const bottomDockRef = useRef<HTMLDivElement | null>(null);

  function handleGlobeZoomProgress(dockAlpha: number) {
    const node = bottomDockRef.current;
    if (!node) return;
    node.style.opacity = dockAlpha.toFixed(3);
    node.style.transform = `translateY(${((1 - dockAlpha) * 28).toFixed(1)}px)`;
    node.style.pointerEvents = dockAlpha > 0.35 ? 'auto' : 'none';
  }

  const keyPrefix = showAllInfo ? 'full' : 'tour';
  const infoSections = page === 'info' ? (
    <>
      {(showAllInfo || activeTourStep === 0) && (
        <RevealSection
          key={`${keyPrefix}-step-0`}
          id="story-features-section"
                className="story-section"
                animCategory="cat-top-down"
                labelledBy="story-features-title"
              >
                <header className="story-section-head">
                  <span className="story-kicker">OVERVIEW</span>
                  <h3 id="story-features-title">Four pillars to investigate any corner of Earth</h3>
                  <p>
                    Pick where to look on the map, combine NASA variables, and let the statistical engine separate
                    true trends from noise.
                  </p>
                </header>

                <div className="story-features-grid">
                  {featureCards.map(feat => (
                    <article key={feat.id} className="story-feature-card">
                      <h4 className="feature-title">{feat.title}</h4>
                      <FeatureCardGraphic featureId={feat.id} />
                      <p className="feature-description">{feat.description}</p>

                      <button
                        type="button"
                        className="feature-link-btn"
                        onClick={() => handleFeatureAction(feat.actionType)}
                      >
                        <span>{feat.ctaLabel.replace(' →', '').replace(' ↓', '')}</span>
                        <span className="link-arrow" aria-hidden="true">
                          {feat.ctaLabel.endsWith('↓') ? '↓' : '→'}
                        </span>
                      </button>
                    </article>
                  ))}
                </div>
              </RevealSection>
            )}

            {(showAllInfo || activeTourStep === 1) && (
              <RevealSection
                key={`${keyPrefix}-step-1`}
                id="story-map-showcase-section"
                className="story-section"
                animCategory="cat-orbital-split"
                labelledBy="story-map-showcase-title"
              >
                <header className="story-section-head">
                  <span className="story-kicker">THE HEART OF THE APP · INTERACTIVE MAP</span>
                  <h3 id="story-map-showcase-title">Everything starts on the Map: click anywhere on Earth and investigate live</h3>
                  <p>
                    Select satellite cells with 1 click or Shift+Drag, switch between orbital imagery and terrain, and launch your analysis in seconds.
                  </p>
                </header>

                <MapEngineeringShowcase onOpenFreeMap={onOpenFreeMap} />
              </RevealSection>
            )}

            {(showAllInfo || activeTourStep === 2) && (
              <RevealSection
                key={`${keyPrefix}-step-2`}
                id="story-bench-showcase-section"
                className="story-section"
                animCategory="cat-converge"
                labelledBy="story-bench-showcase-title"
              >
                <header className="story-section-head">
                  <span className="story-kicker">AUTOMATED DIAGNOSTIC</span>
                  <h3 id="story-bench-showcase-title">After picking on the Map, the Workbench answers whether it is a real trend or luck</h3>
                  <p>
                    Switch the tabs below to inspect a real 45-year result (1981–2025) with trend lines, curves, and extreme months.
                  </p>
                </header>

                <BenchDeepDiveShowcase onLaunchPreset={onLaunchPreset} />
              </RevealSection>
            )}

            {(showAllInfo || activeTourStep === 3) && (
              <RevealSection
                key={`${keyPrefix}-step-3`}
                id="story-engine-section"
                className="story-section"
                animCategory="cat-fan-scale"
                labelledBy="story-engine-title"
              >
                <header className="story-section-head">
                  <span className="story-kicker">STATISTICAL ENGINE · INSIDE THE SCIENTIFIC WORKBENCH</span>
                  <h3 id="story-engine-title">How the Scientific Workbench statistical engine works</h3>
                  <p>
                    When analyzing any region, the engine runs a 4-stage pipeline and unlocks advanced capabilities
                    in the Workbench to verify whether the trend is physical or pure chance.
                  </p>
                </header>

                <div className="engine-pipeline-grid" role="tablist" aria-label="Statistical engine stages">
                  {STAT_ENGINE_STAGES.map(stage => {
                    const active = stage.id === selectedEngineStage.id;
                    return (
                      <button
                        key={stage.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        className={`engine-stage-card${active ? ' active' : ''}`}
                        onClick={() => setSelectedEngineStage(stage)}
                      >
                        <span className="engine-stage-num">{stage.stepNumber}</span>
                        <strong>{stage.title}</strong>
                        <span>{stage.tagline}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="engine-spotlight" role="tabpanel">
                  <div key={selectedEngineStage.id} className="engine-spotlight-inner">
                    <div className="engine-spotlight-copy">
                      <span className="engine-spotlight-tag">{selectedEngineStage.badge}</span>
                      <h4>{selectedEngineStage.title}</h4>
                      <p>{selectedEngineStage.howItWorks}</p>
                      <p className="engine-bench-note">
                        <strong>In the Scientific Workbench:</strong> {selectedEngineStage.benchSpecialty}
                      </p>
                      <div className="engine-metric-chips">
                        {selectedEngineStage.outputMetrics.map(metric => (
                          <span key={metric}>{metric}</span>
                        ))}
                      </div>
                    </div>

                    <div className="engine-spotlight-actions">
                      <button
                        type="button"
                        className="story-btn-primary"
                        onClick={() => onOpenFreeMap()}
                      >
                        Select areas on the Map →
                      </button>
                      {hasExistingAnalysis && (
                        <button
                          type="button"
                          className="story-btn-secondary"
                          onClick={onOpenBench}
                        >
                          Open Scientific Workbench
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="engine-specialties-grid" aria-label="Engine specialties in the Scientific Workbench">
                  {STAT_ENGINE_SPECIALTIES.map(item => (
                    <article key={item.id} className="engine-specialty-card">
                      <span className="engine-specialty-kicker">{item.kicker}</span>
                      <h4>{item.title}</h4>
                      <p>{item.summary}</p>
                    </article>
                  ))}
                </div>
              </RevealSection>
            )}

            {(showAllInfo || activeTourStep === 4) && (
              <RevealSection
                key={`${keyPrefix}-step-4`}
                id="story-cases-section"
                className="story-section"
                animCategory="cat-alternating-sides"
                labelledBy="story-cases-title"
              >
                <header className="story-section-head">
                  <span className="story-kicker">1-CLICK READY-MADE CASES</span>
                  <h3 id="story-cases-title">Four real investigations ready to open on the Map</h3>
                  <p>
                    Open any case directly on the Map or click Analyze now to view the complete diagnostic.
                  </p>
                </header>

                <div className="story-cases-grid">
                  {STORY_PRESETS.map((preset, idx) => {
                    const metaA = getVariableMetadata(preset.variableA);
                    const metaB = getVariableMetadata(preset.variableB);
                    return (
                      <article key={preset.id} className="story-case-card">
                        <div className="case-card-top">
                          <span className="case-archetype">{`CASE 0${idx + 1} · ${preset.archetypeLabel}`}</span>
                          <span className="case-formula">{preset.formula}</span>
                        </div>

                        <h4>{preset.title}</h4>
                        <p className="case-subtitle">{preset.subtitle}</p>

                        <CaseChartGraphic preset={preset} />

                        <p className="case-question">{preset.question}</p>

                        <div className="case-chips">
                          <span className="case-chip chip-a">
                            <b>A</b> {preset.regionALabel} · {metaA.variable_id}
                          </span>
                          <span className="case-chip chip-b">
                            <b>B</b> {preset.regionBLabel} · {metaB.variable_id}
                          </span>
                        </div>

                        <div className="case-footer">
                          <small>{preset.highlightBadge}</small>
                          <div className="case-actions">
                            <button
                              type="button"
                              className="case-btn-map"
                              onClick={() => onLaunchPreset(preset, { autoAnalyze: false })}
                            >
                              Open on Map →
                            </button>
                            <button
                              type="button"
                              className="case-btn-run"
                              onClick={() => onLaunchPreset(preset, { autoAnalyze: true })}
                            >
                              Analyze now
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </RevealSection>
            )}

            {(showAllInfo || activeTourStep === 5) && (
              <RevealSection
                key={`${keyPrefix}-step-5`}
                id="story-traps-section"
                className="story-section"
                animCategory="cat-bottom-tilt"
                labelledBy="story-traps-title"
              >
                <header className="story-section-head">
                  <span className="story-kicker">SCIENTIFIC RIGOR</span>
                  <h3 id="story-traps-title">Three statistical traps the system blocks for you</h3>
                  <p>
                    Every click on the Map automatically runs through these three checks before confirming a trend.
                  </p>
                </header>

                <div className="story-traps-grid">
                  {STORY_TRAPS.map(trap => (
                    <article key={trap.id} className="story-trap-card">
                      <div className="trap-top-row">
                        <span className="trap-num">{trap.number}</span>
                        <span className="trap-solution-badge">{trap.solutionBadge}</span>
                      </div>
                      <h4>{trap.title}</h4>
                      <p className="trap-problem">{trap.trapSummary}</p>
                      <TrapDiagram trapId={trap.id} />
                      <p className="trap-defense">
                        <strong>Our defense:</strong> {trap.solutionText}
                      </p>
                    </article>
                  ))}
                </div>

                <aside className="story-freedom-banner">
                  <div>
                    <strong>Ready to explore the planet on your own?</strong>
                    <p>
                      Open the Interactive Map, click anywhere on Earth, and discover whether the climate is truly changing.
                    </p>
                  </div>
                  <button type="button" className="story-btn-primary" onClick={() => onOpenFreeMap()}>
                    <span>Open Interactive Map Now</span>
                    <span className="btn-arrow" aria-hidden="true">→</span>
                  </button>
                </aside>

                <footer className="story-sources-footer" aria-label="Integrated scientific sources">
                  <span>Integrated scientific sources and native grids:</span>
                  <ul>
                    <li>NASA POWER · MERRA-2 (0.5° × 0.625°)</li>
                    <li>NASA CERES SYN1deg (1.0° × 1.0°)</li>
                    <li>MODIS AppEEARS &amp; NASA Giovanni / GPM</li>
                    <li>Open-Meteo GloFAS (Basins &amp; Discharge)</li>
                    <li>NOAA CDO (Ground Stations)</li>
                  </ul>
                </footer>
              </RevealSection>
            )}
    </>
  ) : null;

  return (
    <div className="story-hub">
      <StarfieldBackdrop />

      {page === 'hero' ? (
        <div className="story-hero-scroll-track">
          <section className="story-hero story-hero-showcase" aria-labelledby="story-hero-title">
            <header className="story-hero-top hero-entrance">
              <h2 id="story-hero-title" className="story-hero-title">
                The entire planet is your laboratory. Real trend or luck?
              </h2>
            </header>

            <div className="story-hero-stage-area">
              <div className="story-hero-globe-stage hero-globe-entrance">
                <Globe3D
                  activeFocus={activeGlobeFocus}
                  focusNonce={focusNonce}
                  onZoomProgress={handleGlobeZoomProgress}
                />
              </div>

              <div ref={bottomDockRef} className="story-hero-bottom">
                <div className="globe-telemetry-bar" aria-label="Orbital previews on the 3D globe">
                  <div className="globe-focus-chips">
                    {GLOBE_TELEMETRY_FOCUSES.map(focus => {
                      const selected = focus.id === activeGlobeFocus.id;
                      return (
                        <button
                          key={focus.id}
                          type="button"
                          className={`globe-focus-chip${selected ? ' active' : ''}`}
                          aria-pressed={selected}
                          onClick={() => handleSelectGlobeFocus(focus.id)}
                        >
                          <strong>{focus.chipLabel}</strong>
                          <span>{focus.regionShort}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <p className="story-hero-subtitle">
                  Click any point on the <strong>Interactive Map</strong>, cross-analyze{' '}
                  <strong>{VARIABLE_LIST.length} NASA variables (1981–2025)</strong>, and discover in seconds whether
                  climate change is real or just chance.
                </p>

                <div className="story-hero-ctas">
                  <button
                    type="button"
                    className={`story-btn-primary story-tour-btn${tourStarting ? ' is-starting' : ''}`}
                    onClick={handleStartTour}
                    disabled={tourStarting}
                    aria-live="polite"
                  >
                    {tourStarting ? (
                      <>
                        <span className="story-tour-spinner" aria-hidden="true" />
                        <span>Starting...</span>
                        <span className="story-tour-progress" aria-hidden="true" />
                      </>
                    ) : (
                      <>
                        <span>Start Tour</span>
                        <span className="btn-arrow" aria-hidden="true">→</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    className="story-btn-outline"
                    onClick={() => onOpenFreeMap()}
                    disabled={tourStarting}
                  >
                    Open Map
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : showAllInfo ? (
        <div className="story-info-full">{infoSections}</div>
      ) : (
        <div className="story-tour-stage">
          <div className="story-tour-content">{infoSections}</div>

          <div className="story-tour-footer" aria-label="Guided tour navigation">
            <div className="story-tour-meta">
              {activeTourStep > 0 && (
                <button
                  type="button"
                  className="story-tour-back-btn"
                  onClick={() => updateTourStep(activeTourStep - 1)}
                >
                  ← Back
                </button>
              )}
              <span className="story-tour-step-indicator">
                Step {activeTourStep + 1} of {TOUR_STEP_LABELS.length} · {TOUR_STEP_LABELS[activeTourStep]}
              </span>
            </div>

            {activeTourStep < TOUR_STEP_LABELS.length - 1 && (
              <button
                type="button"
                className="story-btn-primary story-tour-next-btn"
                onClick={() => updateTourStep(activeTourStep + 1)}
              >
                <span>Got it</span>
                <span className="btn-arrow" aria-hidden="true">→</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
