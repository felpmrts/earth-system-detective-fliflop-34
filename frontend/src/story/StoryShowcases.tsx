import { useState } from 'react';
import { MAX_CELLS_PER_REGION } from '../geo/gridGeometry';
import { STORY_PRESETS, type StoryPreset } from './storyPresets';

type BenchLensId = 'timeseries' | 'mahalanobis' | 'zscore';
type MapLayerPreviewId = 'nasa_gibs' | 'srtm_relief' | 'osm_streets' | 'offline_vector';
type MapSelectionDemoId = 'dipole_grid' | 'shift_drag' | 'same_location';

interface StoryShowcasesProps {
  readonly onOpenFreeMap: (options?: { readonly sameLocation?: boolean }) => void;
  readonly onLaunchPreset: (preset: StoryPreset, options: { readonly autoAnalyze: boolean }) => void;
}

export function BenchDeepDiveShowcase({
  onLaunchPreset,
}: Pick<StoryShowcasesProps, 'onLaunchPreset'>) {
  const [activeLens, setActiveLens] = useState<BenchLensId>('timeseries');
  const cerradoPreset = STORY_PRESETS[0]!;
  const couplingPreset = STORY_PRESETS[1]!;

  return (
    <div className="bench-showcase-shell">
      <div className="bench-showcase-topbar">
        <div className="bench-showcase-meta">
          <span className="bench-live-pill">DEMONSTRAÇÃO FIEL DA BANCADA</span>
          <strong>Resumo da descoberta · Umidade Superficial do Solo (GWETTOP)</strong>
          <span>Período: 1981-01 a 2025-12 · 540 meses (N efetivo AR(1): 106.5)</span>
        </div>

        <div className="bench-lens-tabs" role="tablist" aria-label="Visualizações estatísticas da bancada">
          <button
            type="button"
            role="tab"
            aria-selected={activeLens === 'timeseries'}
            className={`bench-lens-tab${activeLens === 'timeseries' ? ' active' : ''}`}
            onClick={() => setActiveLens('timeseries')}
          >
            Anomalia + OLS + Sen + GAM
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeLens === 'mahalanobis'}
            className={`bench-lens-tab${activeLens === 'mahalanobis' ? ' active' : ''}`}
            onClick={() => setActiveLens('mahalanobis')}
          >
            Dispersão &amp; Elipse Mahalanobis
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeLens === 'zscore'}
            className={`bench-lens-tab${activeLens === 'zscore' ? ' active' : ''}`}
            onClick={() => setActiveLens('zscore')}
          >
            Z-Score (σ) Multivariável
          </button>
        </div>
      </div>

      <div className="bench-discovery-grid">
        <article className="bench-mini-card card-slot-a">
          <div className="bench-mini-head">
            <span className="bench-slot-title">
              <b className="slot-badge-a">A</b> Umidade Superficial do Solo (Cerrado · MG)
            </span>
            <span className="bench-conf-pill high">Significativa (alta confiança)</span>
          </div>
          <p className="bench-mini-coords">2 células · centro (-19.00°, -48.44°) · MERRA-2 (0.5° × 0.625°)</p>
          <dl className="bench-mini-metrics">
            <div>
              <dt>Taxa Theil–Sen</dt>
              <dd>-0.050 fração/década</dd>
            </div>
            <div>
              <dt>Taxa OLS</dt>
              <dd>-0.049 fração/década</dd>
            </div>
            <div>
              <dt>Regime GAM</dt>
              <dd>Tendência linear constante</dd>
            </div>
            <div>
              <dt>Significância</dt>
              <dd>q = 0.0e+0 · p_AR(1) = 0.0e+0</dd>
            </div>
          </dl>
          <div className="bench-mini-outlier">
            Extremo (D_M = 3.82): 2018-11 — Anomalia extrema acima da elipse de acoplamento (D_M &gt; 2,5).
          </div>
        </article>

        <article className="bench-mini-card card-slot-b">
          <div className="bench-mini-head">
            <span className="bench-slot-title">
              <b className="slot-badge-b">B</b> Umidade Superficial do Solo (Amazônia · AM)
            </span>
            <span className="bench-conf-pill moderate">Significativa (confiança moderada)</span>
          </div>
          <p className="bench-mini-coords">2 células · centro (-3.00°, -60.31°) · MERRA-2 (0.5° × 0.625°)</p>
          <dl className="bench-mini-metrics">
            <div>
              <dt>Taxa Theil–Sen</dt>
              <dd>-0.023 fração/década</dd>
            </div>
            <div>
              <dt>Taxa OLS</dt>
              <dd>-0.022 fração/década</dd>
            </div>
            <div>
              <dt>Regime GAM</dt>
              <dd>Tendência linear constante</dd>
            </div>
            <div>
              <dt>Significância</dt>
              <dd>q = 0.0572 · p_AR(1) = 0.0497</dd>
            </div>
          </dl>
          <div className="bench-mini-outlier">
            Extremo (D_M = 3.53): 2021-11 — Anomalia extrema acima da elipse de acoplamento (D_M &gt; 2,5).
          </div>
        </article>
      </div>

      <div className="bench-paradox-strip">
        <div>
          <strong>Paradoxo / regime: ALIGNED_OR_WEAK_COUPLING</strong>
          <span>Correlação secular (r_global): +0.24</span>
          <span>Curto prazo sem tendência (r_detrended): -0.01</span>
        </div>
        <small>
          O Cerrado perde umidade a mais que o dobro da velocidade da Amazônia Central (-0.0498 vs -0.0227
          fração/década).
        </small>
      </div>

      <div className="bench-chart-stage" role="tabpanel">
        <div className="bench-chart-controls-preview" aria-hidden="true">
          <span className={activeLens !== 'zscore' ? 'pill-on' : ''}>Anomalia</span>
          <span className={activeLens === 'zscore' ? 'pill-on' : ''}>Z-Score (σ)</span>
          <span className="pill-on">Linear / Symlog</span>
          <span className={activeLens === 'timeseries' || activeLens === 'zscore' ? 'pill-on' : ''}>
            Série Temporal
          </span>
          <span className={activeLens === 'mahalanobis' ? 'pill-on' : ''}>Dispersão X vs Y</span>
          <span className="pill-on">OLS + Sen</span>
          <span className="pill-on">Curva GAM</span>
          <span className="pill-on">Outliers D_M &gt; 2,5</span>
        </div>

        {activeLens === 'timeseries' && (
          <svg
            className="bench-showcase-svg"
            viewBox="0 0 860 230"
            role="img"
            aria-label="Série temporal de anomalias 1981 a 2025 com retas OLS, Theil-Sen, curva GAM e extremos de Mahalanobis"
          >
            {/* Linhas horizontais de grade */}
            <line x1="56" y1="36" x2="830" y2="36" stroke="rgba(148, 163, 184, 0.12)" />
            <line x1="56" y1="88" x2="830" y2="88" stroke="rgba(148, 163, 184, 0.16)" strokeDasharray="4 4" />
            <line x1="56" y1="140" x2="830" y2="140" stroke="rgba(148, 163, 184, 0.22)" />
            <line x1="56" y1="186" x2="830" y2="186" stroke="rgba(148, 163, 184, 0.12)" />

            <text x="46" y="40" textAnchor="end" fill="#8fa0c4" fontSize="10">+0.20</text>
            <text x="46" y="92" textAnchor="end" fill="#8fa0c4" fontSize="10">+0.10</text>
            <text x="46" y="144" textAnchor="end" fill="#8fa0c4" fontSize="10">0.00</text>
            <text x="46" y="190" textAnchor="end" fill="#8fa0c4" fontSize="10">-0.10</text>

            {/* Série B (Amazônia - Laranja tracejado) */}
            <polyline
              points="60,118 92,102 124,132 156,96 188,125 220,110 252,136 284,104 316,128 348,116 380,138 412,114 444,142 476,120 508,144 540,126 572,148 604,118 636,144 668,132 700,150 732,64 764,146 796,138 826,152"
              fill="none"
              stroke="rgba(251, 146, 60, 0.72)"
              strokeWidth="1.6"
              strokeDasharray="5 3"
            />

            {/* Série A (Cerrado - Ciano sólido) */}
            <polyline
              points="60,94 92,76 124,108 156,42 188,96 220,84 252,116 284,92 316,124 348,108 380,136 412,118 444,148 476,128 508,156 540,138 572,164 604,146 636,172 668,98 700,174 732,162 764,182 796,168 826,186"
              fill="none"
              stroke="#22d3ee"
              strokeWidth="1.9"
            />

            {/* Curva GAM Região A (Magenta suave) */}
            <path
              d="M 60 88 C 210 96, 390 126, 580 154 C 680 168, 760 176, 826 182"
              fill="none"
              stroke="#f472b6"
              strokeWidth="2.5"
            />

            {/* Reta Theil-Sen Região A (Verde água tracejada) */}
            <line
              x1="60"
              y1="84"
              x2="826"
              y2="181"
              stroke="#4ade80"
              strokeWidth="2.1"
              strokeDasharray="6 4"
            />

            {/* Reta Theil-Sen Região B (Amarelo quente) */}
            <line
              x1="60"
              y1="112"
              x2="826"
              y2="148"
              stroke="#facc15"
              strokeWidth="1.9"
              strokeDasharray="3 3"
            />

            {/* Outliers Mahalanobis D_M > 2.5 (Losangos vermelhos) */}
            <polygon points="156,35 162,42 156,49 150,42" fill="#fb7185" stroke="#070b1a" strokeWidth="1.2" />
            <polygon points="668,91 674,98 668,105 662,98" fill="#fb7185" stroke="#070b1a" strokeWidth="1.2" />
            <polygon points="732,57 738,64 732,71 726,64" fill="#fb7185" stroke="#070b1a" strokeWidth="1.2" />

            <text x="168" y="45" fill="#fda4af" fontSize="10" fontWeight="600">
              Outlier D_M &gt; 2,5
            </text>
            <text x="690" y="52" fill="#fda4af" fontSize="10" fontWeight="600">
              2021-11 (D_M = 3.53)
            </text>

            {/* Eixo X */}
            <text x="60" y="214" fill="#8fa0c4" fontSize="10.5" fontWeight="600">1981</text>
            <text x="230" y="214" fill="#8fa0c4" fontSize="10.5">1990</text>
            <text x="412" y="214" fill="#8fa0c4" fontSize="10.5">2000</text>
            <text x="595" y="214" fill="#8fa0c4" fontSize="10.5">2010</text>
            <text x="795" y="214" fill="#8fa0c4" fontSize="10.5" fontWeight="600">2025</text>

            {/* Legenda interna */}
            <g transform="translate(450, 18)">
              <line x1="0" y1="6" x2="18" y2="6" stroke="#22d3ee" strokeWidth="2.2" />
              <text x="24" y="10" fill="#dbeafe" fontSize="10">Série A (Cerrado)</text>

              <line x1="120" y1="6" x2="138" y2="6" stroke="#4ade80" strokeWidth="2.2" strokeDasharray="4 3" />
              <text x="144" y="10" fill="#bbf7d0" fontSize="10">Theil–Sen (-0.050/déc)</text>

              <line x1="270" y1="6" x2="288" y2="6" stroke="#f472b6" strokeWidth="2.4" />
              <text x="294" y="10" fill="#fbcfe8" fontSize="10">Curva GAM</text>
            </g>
          </svg>
        )}

        {activeLens === 'mahalanobis' && (
          <svg
            className="bench-showcase-svg"
            viewBox="0 0 860 230"
            role="img"
            aria-label="Dispersão bivariada com elipse de confiança de Mahalanobis D_M = 2.5 e meses extremos"
          >
            <line x1="80" y1="115" x2="540" y2="115" stroke="rgba(148, 163, 184, 0.2)" strokeDasharray="4 4" />
            <line x1="310" y1="22" x2="310" y2="202" stroke="rgba(148, 163, 184, 0.2)" strokeDasharray="4 4" />

            {/* Elipse de Mahalanobis D_M = 2.5 */}
            <g transform="translate(310, 115) rotate(-22)">
              <ellipse
                cx="0"
                cy="0"
                rx="168"
                ry="62"
                fill="rgba(34, 211, 238, 0.08)"
                stroke="#5eead4"
                strokeWidth="2"
                strokeDasharray="6 4"
              />
              <line x1="-155" y1="12" x2="155" y2="-12" stroke="#facc15" strokeWidth="2" />
            </g>

            {/* Nuvem de meses normais dentro da elipse */}
            {[
              [230, 134], [252, 122], [274, 130], [290, 118], [312, 112], [335, 106], [354, 98],
              [265, 142], [285, 102], [322, 126], [344, 114], [372, 94], [218, 146], [392, 88],
              [298, 108], [330, 96], [248, 116], [362, 108], [278, 124], [340, 102],
            ].map(([cx, cy], idx) => (
              <circle key={idx} cx={cx} cy={cy} r="3.6" fill="rgba(199, 210, 254, 0.72)" />
            ))}

            {/* Outliers fora da elipse (D_M > 2.5) */}
            <polygon points="142,52 149,60 142,68 135,60" fill="#fb7185" stroke="#070b1a" strokeWidth="1.3" />
            <text x="155" y="64" fill="#fda4af" fontSize="10.5" fontWeight="600">
              2018-11 · D_M = 3.82 (Fora da elipse)
            </text>

            <polygon points="468,42 475,50 468,58 461,50" fill="#fb7185" stroke="#070b1a" strokeWidth="1.3" />
            <text x="348" y="38" fill="#fda4af" fontSize="10.5" fontWeight="600">
              2021-11 · D_M = 3.53
            </text>

            {/* Painel explicativo lateral no SVG */}
            <rect x="576" y="28" width="256" height="168" rx="14" fill="rgba(7, 11, 26, 0.78)" stroke="rgba(94, 234, 212, 0.28)" />
            <text x="594" y="54" fill="#5eead4" fontSize="11.5" fontWeight="700">
              Fronteira Bivariada (D_M = 2,5)
            </text>
            <text x="594" y="76" fill="#dbeafe" fontSize="10.2">
              • Mede a distância de cada mês considerando
            </text>
            <text x="594" y="92" fill="#dbeafe" fontSize="10.2">
              a covariância entre tempo e anomalia.
            </text>
            <text x="594" y="116" fill="#dbeafe" fontSize="10.2">
              • Razão de aspecto da elipse: 0.675 (A)
            </text>
            <text x="594" y="136" fill="#fde68a" fontSize="10.2" fontWeight="600">
              • Isola choques de El Niño / secas severas
            </text>
            <text x="594" y="152" fill="#fde68a" fontSize="10.2" fontWeight="600">
              sem distorcer a inclinação Theil–Sen.
            </text>
            <text x="594" y="178" fill="#8fa0c4" fontSize="9.8">
              r_global = +0.240 · r_detrended = -0.008
            </text>
          </svg>
        )}

        {activeLens === 'zscore' && (
          <svg
            className="bench-showcase-svg"
            viewBox="0 0 860 230"
            role="img"
            aria-label="Modo Z-Score padronizando Temperatura Máxima em graus Celsius e Umidade do Solo em fração no mesmo eixo sigma"
          >
            <line x1="56" y1="45" x2="830" y2="45" stroke="rgba(148, 163, 184, 0.14)" />
            <line x1="56" y1="115" x2="830" y2="115" stroke="rgba(148, 163, 184, 0.25)" strokeDasharray="4 4" />
            <line x1="56" y1="185" x2="830" y2="185" stroke="rgba(148, 163, 184, 0.14)" />

            <text x="46" y="49" textAnchor="end" fill="#8fa0c4" fontSize="10">+2.0σ</text>
            <text x="46" y="119" textAnchor="end" fill="#8fa0c4" fontSize="10">0.0σ</text>
            <text x="46" y="189" textAnchor="end" fill="#8fa0c4" fontSize="10">-2.0σ</text>

            {/* T2M_MAX em Z-Score (subindo em laranja) */}
            <path
              d="M 60 162 C 210 148, 410 112, 620 76 C 710 62, 775 52, 826 44"
              fill="none"
              stroke="#fb923c"
              strokeWidth="2.6"
            />
            {/* GWETTOP em Z-Score (caindo em ciano espelhado) */}
            <path
              d="M 60 68 C 210 82, 410 118, 620 154 C 710 168, 775 178, 826 186"
              fill="none"
              stroke="#22d3ee"
              strokeWidth="2.6"
            />

            <circle cx="445" cy="115" r="5" fill="#5eead4" />
            <line x1="445" y1="36" x2="445" y2="194" stroke="rgba(94, 234, 212, 0.35)" strokeDasharray="3 3" />

            <text x="74" y="34" fill="#67e8f9" fontSize="10.5" fontWeight="700">
              GWETTOP (fração 0–1 padronizada em σ) ↓
            </text>
            <text x="580" y="34" fill="#fdba74" fontSize="10.5" fontWeight="700">
              ↑ T2M_MAX (°C padronizado em σ) · Acoplamento inverso (r = -0.68)
            </text>
            <text x="445" y="214" textAnchor="middle" fill="#bbf7d0" fontSize="10.5" fontWeight="600">
              Mesmo Local (A = B) · Unidades físicas distintas alinhadas em desvios-padrão (σ)
            </text>
          </svg>
        )}
      </div>

      {/* AS 4 RESPOSTAS DO DETETIVE */}
      <div className="bench-detective-answers" aria-label="Prévia das 4 Respostas do Detetive">
        <article className="detective-answer-card">
          <span className="detective-answer-num">1. O QUE muda &amp; Regime Físico (GAM)</span>
          <div className="detective-answer-body">
            <div>
              <b className="tag-a">Região A</b> <strong>Umidade do Solo (GWETTOP)</strong>
              <small>Regime GAM: Tendência linear constante · Aceleração B₂: -0.00003</small>
            </div>
            <div>
              <b className="tag-b">Região B</b> <strong>Umidade do Solo (GWETTOP)</strong>
              <small>Regime GAM: Tendência linear constante · Aceleração B₂: 0.00000</small>
            </div>
          </div>
        </article>

        <article className="detective-answer-card">
          <span className="detective-answer-num">2. QUANTO muda (Taxa Decadal)</span>
          <div className="detective-answer-body">
            <div>
              <b className="tag-a">Região A</b> <strong>Theil–Sen: -0.0498 fração/déc</strong>
              <small>IC 95%: [-0.0537, -0.0458] · OLS: -0.0489 · Δ Modelo: -0.2197</small>
            </div>
            <p className="detective-invariant-pill">
              Invariante #3: variação em % bloqueada automaticamente para GWETTOP (escala ratio).
            </p>
          </div>
        </article>

        <article className="detective-answer-card">
          <span className="detective-answer-num">3. É SIGNIFICATIVO? (AR(1) + FDR)</span>
          <div className="detective-answer-body">
            <div>
              <b className="tag-a">Região A</b> <strong>N_bruto = 540 → N_efetivo(AR1) = 106.5</strong>
              <small>p_AR1 = 0.0e+0 · q_FDR = 0.0e+0 · r = -0.738 · τ = -0.551 · R² = 0.545</small>
            </div>
            <div>
              <b className="tag-b">Região B</b> <strong>N_bruto = 540 → N_efetivo(AR1) = 33.1</strong>
              <small>p_AR1 = 0.0497 · q_FDR = 0.0572 · Outliers D_M &gt; 2,5: 10 meses</small>
            </div>
          </div>
        </article>

        <article className="detective-answer-card">
          <span className="detective-answer-num">4. ONDE &amp; Paradoxo Multiescala (A × B)</span>
          <div className="detective-answer-body">
            <div>
              <code className="paradox-code">ALIGNED_OR_WEAK_COUPLING</code>
              <small>A: MERRA-2__r-38_c-77+78 (2 cél.) · B: MERRA-2__r-6_c-96+97 (2 cél.)</small>
              <small>r_global (secular) = +0.240 · r_detrended (curto prazo) = -0.008 · Δ Declive = -0.0271</small>
            </div>
          </div>
        </article>
      </div>

      <div className="bench-showcase-footer">
        <div className="bench-provenance-chips">
          <span>Fonte: NASA POWER · MERRA-2 (0.5° × 0.625°)</span>
          <span>Agregação espacial: nanmean</span>
          <span>Exportação científica: CSV &amp; JSON</span>
        </div>
        <div className="bench-showcase-actions">
          <button
            type="button"
            className="story-btn-primary"
            onClick={() =>
              onLaunchPreset(activeLens === 'zscore' ? couplingPreset : cerradoPreset, { autoAnalyze: true })
            }
          >
            <span>Rodar este diagnóstico ao vivo na Bancada</span>
            <span className="btn-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Exact Plate Carrée (equirectangular) projection constants matching
 * <image href="/earth-blue-marble.jpg" x="-120" y="-190" width="1560" height="860" preserveAspectRatio="xMidYMid slice" />
 * where the 2:1 (2048x1024) bitmap scales to 1720x860 centered at (660, 240).
 */
export const SHOWCASE_MAP_FRAME = {
  imageX: -120,
  imageY: -190,
  imageWidth: 1560,
  imageHeight: 860,
  originX: 660,
  originY: 240,
  pxPerDeg: 1720 / 360,
  cellLonDeg: 4.5,
  cellLatDeg: 4.0,
} as const;

export function projectShowcaseLonLat(
  lon: number,
  lat: number,
): { readonly x: number; readonly y: number } {
  return {
    x: Number((SHOWCASE_MAP_FRAME.originX + lon * SHOWCASE_MAP_FRAME.pxPerDeg).toFixed(2)),
    y: Number((SHOWCASE_MAP_FRAME.originY - lat * SHOWCASE_MAP_FRAME.pxPerDeg).toFixed(2)),
  };
}

function projectShowcaseBounds(
  westLon: number,
  eastLon: number,
  northLat: number,
  southLat: number,
): {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly cx: number;
  readonly cy: number;
} {
  const nw = projectShowcaseLonLat(westLon, northLat);
  const se = projectShowcaseLonLat(eastLon, southLat);
  const width = Number((se.x - nw.x).toFixed(2));
  const height = Number((se.y - nw.y).toFixed(2));
  return {
    x: nw.x,
    y: nw.y,
    width,
    height,
    cx: Number((nw.x + width / 2).toFixed(2)),
    cy: Number((nw.y + height / 2).toFixed(2)),
  };
}

export function MapEngineeringShowcase({
  onOpenFreeMap,
}: Pick<StoryShowcasesProps, 'onOpenFreeMap'>) {
  const [activeLayer, setActiveLayer] = useState<MapLayerPreviewId>('nasa_gibs');
  const [selectionDemo, setSelectionDemo] = useState<MapSelectionDemoId>('dipole_grid');

  const cellW = Number((SHOWCASE_MAP_FRAME.cellLonDeg * SHOWCASE_MAP_FRAME.pxPerDeg).toFixed(2));
  const cellH = Number((SHOWCASE_MAP_FRAME.cellLatDeg * SHOWCASE_MAP_FRAME.pxPerDeg).toFixed(2));
  const equatorY = projectShowcaseLonLat(0, 0).y;

  // Região B · Amazônia Central (~ -4°, -60°) e Região A · Cerrado Triângulo Mineiro (-19.00°, -48.13°)
  const amazoniaBox = projectShowcaseBounds(-64.5, -55.5, 0, -8);
  const cerradoBox = projectShowcaseBounds(-52.625, -43.625, -15.0, -23.0);
  const shiftDragBox = projectShowcaseBounds(-56.5, -43.0, -13.0, -21.0);
  const sameLocationBox = projectShowcaseBounds(-52.0, -43.0, -14.5, -22.5);

  const andesRidge = [
    projectShowcaseLonLat(-77, 8),
    projectShowcaseLonLat(-71, -14),
    projectShowcaseLonLat(-70, -35),
  ];
  const brazilPlanalto = [
    projectShowcaseLonLat(-50, -11),
    projectShowcaseLonLat(-46, -17),
    projectShowcaseLonLat(-43, -23),
  ];
  const belemSpAxis = [
    projectShowcaseLonLat(-48.5, -1.4),
    projectShowcaseLonLat(-47.9, -15.8),
    projectShowcaseLonLat(-46.6, -23.5),
  ];
  const amazonCerradoAxis = [
    projectShowcaseLonLat(-60.0, -3.1),
    projectShowcaseLonLat(-52.0, -10.5),
    projectShowcaseLonLat(-48.13, -19.0),
  ];

  const layerLabels: Record<MapLayerPreviewId, { readonly title: string; readonly subtitle: string }> = {
    nasa_gibs: {
      title: 'Satélite NASA GIBS',
      subtitle: 'Blue Marble Shaded Relief & Bathymetry (Level 8)',
    },
    srtm_relief: {
      title: 'Relevo Topográfico (SRTM)',
      subtitle: 'Curvas de nível e sombreamento altimétrico OpenTopoMap',
    },
    osm_streets: {
      title: 'Mapa de Ruas (OSM)',
      subtitle: 'Malha urbana, bacias hidrográficas e limites estaduais',
    },
    offline_vector: {
      title: 'Cartografia Vetorial (Offline)',
      subtitle: 'Contornos continentais e retículo 100% locais sem internet',
    },
  };

  return (
    <div className="map-showcase-shell map-hero-spotlight">
      {/* Barra de janela estilo aplicação principal */}
      <div className="map-showcase-header">
        <div className="map-window-brand">
          <span className="map-window-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="map-hero-badge">PRINCIPAL FERRAMENTA · MAPA INTERATIVO</span>
        </div>

        <div className="map-mode-pills" role="tablist" aria-label="Ferramentas de seleção espacial do mapa">
          <button
            type="button"
            role="tab"
            aria-selected={selectionDemo === 'dipole_grid'}
            className={`map-demo-pill${selectionDemo === 'dipole_grid' ? ' active' : ''}`}
            onClick={() => setSelectionDemo('dipole_grid')}
          >
            1 Clique: 2 Regiões (A ≠ B)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={selectionDemo === 'shift_drag'}
            className={`map-demo-pill${selectionDemo === 'shift_drag' ? ' active' : ''}`}
            onClick={() => setSelectionDemo('shift_drag')}
          >
            Caixa Shift + Arrastar (até {MAX_CELLS_PER_REGION} cél.)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={selectionDemo === 'same_location'}
            className={`map-demo-pill${selectionDemo === 'same_location' ? ' active' : ''}`}
            onClick={() => setSelectionDemo('same_location')}
          >
            Mesmo Local (A = B)
          </button>
        </div>

        <div className="map-layer-switcher" role="group" aria-label="Camadas cartográficas do mapa">
          {(Object.keys(layerLabels) as MapLayerPreviewId[]).map(layerKey => (
            <button
              key={layerKey}
              type="button"
              className={`map-layer-chip${activeLayer === layerKey ? ' active' : ''}`}
              onClick={() => setActiveLayer(layerKey)}
            >
              {layerLabels[layerKey].title}
            </button>
          ))}
        </div>
      </div>

      {/* HERO VISUAL PANORÂMICO DO MAPA EM TELA CHEIA */}
      <div className={`map-canvas-preview map-hero-viewport layer-${activeLayer}`}>
        <svg
          className="map-preview-svg"
          viewBox="0 0 1120 470"
          role="img"
          aria-label={`Prévia interativa do mapa científico na camada ${layerLabels[activeLayer].title}`}
        >
          <defs>
            <pattern
              id="mapNativeGrid"
              x={SHOWCASE_MAP_FRAME.originX}
              y={SHOWCASE_MAP_FRAME.originY}
              width={cellW}
              height={cellH}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M ${cellW} 0 L 0 0 0 ${cellH}`}
                fill="none"
                stroke={
                  activeLayer === 'offline_vector'
                    ? 'rgba(94, 234, 212, 0.28)'
                    : 'rgba(226, 232, 240, 0.18)'
                }
                strokeWidth="1"
              />
            </pattern>
            <linearGradient id="mapVignette" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#040917" stopOpacity="0.48" />
              <stop offset="25%" stopColor="#040917" stopOpacity="0.08" />
              <stop offset="78%" stopColor="#040917" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#040917" stopOpacity="0.72" />
            </linearGradient>
          </defs>

          {/* Imagem orbital real NASA Blue Marble de fundo */}
          <rect x="0" y="0" width="1120" height="470" fill="#061226" />
          <image
            href="/earth-blue-marble.jpg"
            x={SHOWCASE_MAP_FRAME.imageX}
            y={SHOWCASE_MAP_FRAME.imageY}
            width={SHOWCASE_MAP_FRAME.imageWidth}
            height={SHOWCASE_MAP_FRAME.imageHeight}
            preserveAspectRatio="xMidYMid slice"
            opacity={
              activeLayer === 'nasa_gibs'
                ? '0.92'
                : activeLayer === 'srtm_relief'
                  ? '0.68'
                  : activeLayer === 'osm_streets'
                    ? '0.45'
                    : '0.22'
            }
          />

          {/* Filtros de cor por camada */}
          {activeLayer === 'srtm_relief' && (
            <g>
              <rect x="0" y="0" width="1120" height="470" fill="rgba(120, 78, 28, 0.22)" />
              <g stroke="rgba(251, 191, 36, 0.35)" fill="none" strokeWidth="1.2">
                <path
                  d={`M ${andesRidge[0]!.x} ${andesRidge[0]!.y} Q ${andesRidge[1]!.x} ${andesRidge[1]!.y}, ${andesRidge[2]!.x} ${andesRidge[2]!.y}`}
                />
                <path
                  d={`M ${andesRidge[0]!.x + 12} ${andesRidge[0]!.y + 6} Q ${andesRidge[1]!.x + 12} ${andesRidge[1]!.y}, ${andesRidge[2]!.x + 12} ${andesRidge[2]!.y - 8}`}
                />
                <path
                  d={`M ${brazilPlanalto[0]!.x} ${brazilPlanalto[0]!.y} Q ${brazilPlanalto[1]!.x} ${brazilPlanalto[1]!.y}, ${brazilPlanalto[2]!.x} ${brazilPlanalto[2]!.y}`}
                />
              </g>
            </g>
          )}
          {activeLayer === 'osm_streets' && (
            <g>
              <rect x="0" y="0" width="1120" height="470" fill="rgba(15, 23, 42, 0.48)" />
              <g stroke="rgba(125, 211, 252, 0.34)" fill="none" strokeWidth="1.2" strokeDasharray="4 3">
                <path
                  d={`M ${belemSpAxis[0]!.x} ${belemSpAxis[0]!.y} L ${belemSpAxis[1]!.x} ${belemSpAxis[1]!.y} L ${belemSpAxis[2]!.x} ${belemSpAxis[2]!.y}`}
                />
                <path
                  d={`M ${amazonCerradoAxis[0]!.x} ${amazonCerradoAxis[0]!.y} L ${amazonCerradoAxis[1]!.x} ${amazonCerradoAxis[1]!.y} L ${amazonCerradoAxis[2]!.x} ${amazonCerradoAxis[2]!.y}`}
                />
              </g>
            </g>
          )}

          {/* Malha das células de satélite NASA */}
          <rect x="0" y="0" width="1120" height="470" fill="url(#mapNativeGrid)" />
          <rect x="0" y="0" width="1120" height="470" fill="url(#mapVignette)" />

          {/* Linha do Equador (lat = 0°) */}
          <line
            data-testid="showcase-equator-line"
            x1="250"
            y1={equatorY}
            x2="1120"
            y2={equatorY}
            stroke="rgba(94, 234, 212, 0.42)"
            strokeDasharray="6 5"
          />
          <text x="488" y={equatorY + 15} fill="#5eead4" fontSize="11" fontWeight="700">
            0° Equador · Grade Orbital NASA (0.5° × 0.625°)
          </text>

          {/* Painel lateral simulando o controle real do Mapa à esquerda */}
          <g transform="translate(18, 18)">
            <rect
              x="0"
              y="0"
              width="224"
              height="386"
              rx="16"
              fill="rgba(7, 12, 28, 0.90)"
              stroke="rgba(148, 163, 184, 0.26)"
            />
            <text x="16" y="28" fill="#5eead4" fontSize="10" fontWeight="800" letterSpacing="0.08em">
              PAINEL DO MAPA
            </text>
            <text x="16" y="48" fill="#ffffff" fontSize="13.5" fontWeight="700">
              1. Escolha no Mapa
            </text>

            {/* Slot A */}
            <rect x="14" y="64" width="196" height="58" rx="10" fill="rgba(15, 23, 48, 0.95)" stroke="#22d3ee" strokeWidth="1.4" />
            <circle cx="30" cy="83" r="8" fill="#22d3ee" />
            <text x="30" y="87" textAnchor="middle" fill="#04131d" fontSize="10" fontWeight="800">A</text>
            <text x="45" y="86" fill="#e2e8f0" fontSize="11" fontWeight="700">Cerrado · Minas Gerais</text>
            <text x="24" y="107" fill="#67e8f9" fontSize="10">Umidade do Solo (GWETTOP)</text>

            {/* Slot B */}
            <rect x="14" y="132" width="196" height="58" rx="10" fill="rgba(15, 23, 48, 0.95)" stroke="#fb923c" strokeWidth="1.4" />
            <circle cx="30" cy="151" r="8" fill="#fb923c" />
            <text x="30" y="155" textAnchor="middle" fill="#270e04" fontSize="10" fontWeight="800">B</text>
            <text x="45" y="154" fill="#e2e8f0" fontSize="11" fontWeight="700">
              {selectionDemo === 'same_location' ? 'Mesma área (A = B)' : 'Amazônia Central'}
            </text>
            <text x="24" y="175" fill="#fdba74" fontSize="10">
              {selectionDemo === 'same_location' ? 'Temperatura Máx. (T2M_MAX)' : 'Umidade do Solo (GWETTOP)'}
            </text>

            {/* Período */}
            <rect x="14" y="202" width="196" height="44" rx="10" fill="rgba(15, 23, 48, 0.85)" stroke="rgba(148, 163, 184, 0.22)" />
            <text x="24" y="220" fill="#94a3b8" fontSize="9.5" fontWeight="600">PERÍODO DE ANÁLISE</text>
            <text x="24" y="236" fill="#f8fafc" fontSize="11" fontWeight="700">1981-01 até 2025-12 (540 meses)</text>

            {/* Botão Analisar simulado */}
            <rect x="14" y="262" width="196" height="42" rx="21" fill="#5eead4" />
            <text x="112" y="287" textAnchor="middle" fill="#04211d" fontSize="11.5" fontWeight="800">
              Rodar Diagnóstico →
            </text>

            <text x="16" y="330" fill="#94a3b8" fontSize="10">
              • Clique para marcar células
            </text>
            <text x="16" y="348" fill="#94a3b8" fontSize="10">
              • Shift + Arrastar até {MAX_CELLS_PER_REGION} cél.
            </text>
            <text x="16" y="366" fill="#94a3b8" fontSize="10">
              • Troque camadas no topo
            </text>
          </g>

          {/* MODO 1: Dipolo A != B com arco de conexão */}
          {selectionDemo === 'dipole_grid' && (
            <g>
              {/* Região B na Amazônia Central (-4°, -60°) */}
              <rect
                data-testid="showcase-grid-amazonia"
                x={amazoniaBox.x}
                y={amazoniaBox.y}
                width={amazoniaBox.width}
                height={amazoniaBox.height}
                fill="rgba(251, 146, 60, 0.30)"
                stroke="#fb923c"
                strokeWidth="2.6"
                strokeDasharray="6 4"
              />
              <line
                x1={amazoniaBox.cx}
                y1={amazoniaBox.y}
                x2={amazoniaBox.cx}
                y2={amazoniaBox.y + amazoniaBox.height}
                stroke="rgba(251, 146, 60, 0.65)"
              />
              <line
                x1={amazoniaBox.x}
                y1={amazoniaBox.cy}
                x2={amazoniaBox.x + amazoniaBox.width}
                y2={amazoniaBox.cy}
                stroke="rgba(251, 146, 60, 0.65)"
              />
              <line
                x1={amazoniaBox.x + amazoniaBox.width}
                y1={amazoniaBox.y + 8}
                x2={416}
                y2={204}
                stroke="#fb923c"
                strokeWidth="1.4"
                strokeDasharray="3 2"
              />
              <rect x="416" y="186" width="174" height="26" rx="8" fill="rgba(7, 11, 26, 0.90)" stroke="#fb923c" />
              <text x="503" y="203" textAnchor="middle" fill="#fdba74" fontSize="11" fontWeight="700">
                Região B · Amazônia (4 cél.)
              </text>

              {/* Arco conectando B (Amazônia) e A (Cerrado) */}
              <path
                d={`M ${amazoniaBox.x + amazoniaBox.width} ${amazoniaBox.cy + 4} Q ${cerradoBox.cx + 20} ${(amazoniaBox.cy + cerradoBox.y) / 2}, ${cerradoBox.cx} ${cerradoBox.y}`}
                fill="none"
                stroke="#5eead4"
                strokeWidth="2.4"
                strokeDasharray="6 5"
              />

              {/* Região A no Cerrado / Triângulo Mineiro (-19.00°, -48.13°) */}
              <rect
                data-testid="showcase-grid-cerrado"
                x={cerradoBox.x}
                y={cerradoBox.y}
                width={cerradoBox.width}
                height={cerradoBox.height}
                fill="rgba(34, 211, 238, 0.32)"
                stroke="#22d3ee"
                strokeWidth="2.8"
              />
              <line
                x1={cerradoBox.cx}
                y1={cerradoBox.y}
                x2={cerradoBox.cx}
                y2={cerradoBox.y + cerradoBox.height}
                stroke="rgba(34, 211, 238, 0.65)"
              />
              <line
                x1={cerradoBox.x}
                y1={cerradoBox.cy}
                x2={cerradoBox.x + cerradoBox.width}
                y2={cerradoBox.cy}
                stroke="rgba(34, 211, 238, 0.65)"
              />
              <line
                x1={cerradoBox.x + cerradoBox.width}
                y1={cerradoBox.cy}
                x2={492}
                y2={cerradoBox.y + 23}
                stroke="#22d3ee"
                strokeWidth="1.4"
                strokeDasharray="3 2"
              />

              {/* HUD de célula */}
              <rect
                x="492"
                y={cerradoBox.y - 6}
                width="268"
                height="58"
                rx="12"
                fill="rgba(7, 11, 26, 0.92)"
                stroke="#22d3ee"
                strokeWidth="1.5"
              />
              <text x="508" y={cerradoBox.y + 17} fill="#67e8f9" fontSize="11.5" fontWeight="700">
                Região A · Cerrado (-19.00°, -48.13°)
              </text>
              <text x="508" y={cerradoBox.y + 37} fill="#cbd5e1" fontSize="10.5">
                4 células selecionadas · Clique para expandir
              </text>
            </g>
          )}

          {/* MODO 2: Shift + Arrastar selecionando múltiplas células no Cerrado */}
          {selectionDemo === 'shift_drag' && (
            <g>
              <rect
                data-testid="showcase-grid-shift-drag"
                x={shiftDragBox.x}
                y={shiftDragBox.y}
                width={shiftDragBox.width}
                height={shiftDragBox.height}
                fill="rgba(34, 211, 238, 0.28)"
                stroke="#22d3ee"
                strokeWidth="2.8"
                strokeDasharray="7 4"
              />
              <line
                x1={shiftDragBox.x + cellW}
                y1={shiftDragBox.y}
                x2={shiftDragBox.x + cellW}
                y2={shiftDragBox.y + shiftDragBox.height}
                stroke="rgba(34, 211, 238, 0.6)"
              />
              <line
                x1={shiftDragBox.x + cellW * 2}
                y1={shiftDragBox.y}
                x2={shiftDragBox.x + cellW * 2}
                y2={shiftDragBox.y + shiftDragBox.height}
                stroke="rgba(34, 211, 238, 0.6)"
              />
              <line
                x1={shiftDragBox.x}
                y1={shiftDragBox.y + cellH}
                x2={shiftDragBox.x + shiftDragBox.width}
                y2={shiftDragBox.y + cellH}
                stroke="rgba(34, 211, 238, 0.6)"
              />
              <line
                x1={shiftDragBox.x + shiftDragBox.width}
                y1={shiftDragBox.cy}
                x2={492}
                y2={shiftDragBox.cy}
                stroke="#22d3ee"
                strokeWidth="1.4"
                strokeDasharray="3 2"
              />

              <rect
                x="492"
                y={shiftDragBox.cy - 17}
                width="264"
                height="34"
                rx="17"
                fill="rgba(7, 11, 26, 0.94)"
                stroke="#22d3ee"
                strokeWidth="1.6"
              />
              <text x="624" y={shiftDragBox.cy + 4} textAnchor="middle" fill="#67e8f9" fontSize="11.5" fontWeight="700">
                Shift + Arrastar · Local A: 6/{MAX_CELLS_PER_REGION} células
              </text>
            </g>
          )}

          {/* MODO 3: Mesmo Local (A = B) no Cerrado / Minas Gerais */}
          {selectionDemo === 'same_location' && (
            <g>
              <rect
                data-testid="showcase-grid-same-location"
                x={sameLocationBox.x}
                y={sameLocationBox.y}
                width={sameLocationBox.width}
                height={sameLocationBox.height}
                fill="rgba(94, 234, 212, 0.28)"
                stroke="#22d3ee"
                strokeWidth="3"
              />
              <rect
                x={sameLocationBox.x}
                y={sameLocationBox.y}
                width={sameLocationBox.width}
                height={sameLocationBox.height}
                fill="none"
                stroke="#fb923c"
                strokeWidth="2.6"
                strokeDasharray="6 4"
              />
              <line
                x1={sameLocationBox.cx}
                y1={sameLocationBox.y}
                x2={sameLocationBox.cx}
                y2={sameLocationBox.y + sameLocationBox.height}
                stroke="rgba(255, 255, 255, 0.45)"
              />
              <line
                x1={sameLocationBox.x}
                y1={sameLocationBox.cy}
                x2={sameLocationBox.x + sameLocationBox.width}
                y2={sameLocationBox.cy}
                stroke="rgba(255, 255, 255, 0.45)"
              />
              <line
                x1={sameLocationBox.x + sameLocationBox.width}
                y1={sameLocationBox.cy}
                x2={492}
                y2={sameLocationBox.cy}
                stroke="#5eead4"
                strokeWidth="1.4"
                strokeDasharray="3 2"
              />

              <rect
                x="492"
                y={sameLocationBox.cy - 19}
                width="322"
                height="38"
                rx="12"
                fill="rgba(7, 11, 26, 0.94)"
                stroke="rgba(94, 234, 212, 0.7)"
              />
              <text x="653" y={sameLocationBox.cy + 4} textAnchor="middle" fill="#5eead4" fontSize="11.5" fontWeight="700">
                Modo Mesmo Local (A = B) · 2 Variáveis na mesma área
              </text>
            </g>
          )}

          {/* Barra inferior de status da camada */}
          <rect x="18" y="420" width="1084" height="34" rx="10" fill="rgba(7, 11, 26, 0.88)" stroke="rgba(148, 163, 184, 0.2)" />
          <text x="34" y="441" fill="#bae6fd" fontSize="11" fontWeight="600">
            Camada ativa: {layerLabels[activeLayer].title} — {layerLabels[activeLayer].subtitle}
          </text>
        </svg>

        {/* Overlay CTA no canto inferior direito do mapa */}
        <div className="map-hero-floating-cta">
          <button type="button" className="story-btn-primary map-hero-big-btn" onClick={() => onOpenFreeMap()}>
            <span>Abrir o Mapa Interativo Agora</span>
            <span className="btn-arrow" aria-hidden="true">→</span>
          </button>
          <button
            type="button"
            className="story-btn-secondary"
            onClick={() => onOpenFreeMap({ sameLocation: true })}
          >
            Abrir em Mesmo Local (A = B)
          </button>
        </div>
      </div>

      {/* 3 pílulas curtas e diretas resumindo como usar o mapa */}
      <div className="map-engineering-specs map-hero-steps">
        <div className="map-spec-item">
          <strong>1. Clique em qualquer ponto</strong>
          <p>O mapa alinha automaticamente seu clique à célula de satélite da NASA.</p>
        </div>

        <div className="map-spec-item">
          <strong>2. Marque até {MAX_CELLS_PER_REGION} células</strong>
          <p>Segure Shift + Arrastar para cobrir uma bacia, estado ou região inteira.</p>
        </div>

        <div className="map-spec-item">
          <strong>3. Compare lugares ou variáveis</strong>
          <p>Compare duas regiões distantes (A ≠ B) ou duas variáveis no mesmo lugar (A = B).</p>
        </div>
      </div>
    </div>
  );
}
