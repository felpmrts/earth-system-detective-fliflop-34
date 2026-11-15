import type { MatrixModeCard, StoryPreset } from './storyPresets';

export type FeatureCardId = 'spatial' | 'catalog' | 'engine' | 'modes';

/** Gráficos vetoriais dedicados para os 4 quadros de destaque logo abaixo do Hero. */
export function FeatureCardGraphic({ featureId }: { readonly featureId: FeatureCardId }) {
  if (featureId === 'spatial') {
    return (
      <svg
        className="feature-svg"
        viewBox="0 0 280 112"
        role="img"
        aria-label="Grade global livre com células conectadas nas áreas A e B"
      >
        <defs>
          <pattern id="featGlobalGrid" width="20" height="16" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 16" fill="none" stroke="rgba(159, 180, 255, 0.14)" strokeWidth="0.9" />
          </pattern>
        </defs>
        <rect x="8" y="8" width="264" height="84" rx="10" fill="rgba(7, 11, 26, 0.55)" />
        <rect x="8" y="8" width="264" height="84" rx="10" fill="url(#featGlobalGrid)" />
        {/* Linha do Equador */}
        <line x1="8" y1="50" x2="272" y2="50" stroke="rgba(94, 234, 212, 0.25)" strokeDasharray="4 4" />
        {/* Silhuetas sutis de continentes */}
        <path
          d="M 48 34 L 78 26 L 86 58 L 62 78 L 46 60 Z M 136 26 L 194 22 L 222 44 L 182 68 L 138 56 Z"
          fill="rgba(143, 160, 196, 0.13)"
        />
        {/* Região A: matriz 2x2 livre */}
        <rect x="52" y="42" width="32" height="24" rx="3" fill="rgba(34, 211, 238, 0.24)" stroke="#22d3ee" strokeWidth="1.6" />
        <line x1="68" y1="42" x2="68" y2="66" stroke="rgba(103, 232, 249, 0.55)" strokeWidth="1" />
        <line x1="52" y1="54" x2="84" y2="54" stroke="rgba(103, 232, 249, 0.55)" strokeWidth="1" />
        <circle cx="68" cy="54" r="2.8" fill="#e0f2fe" />
        {/* Região B: matriz 3x2 em qualquer lugar do globo */}
        <rect x="172" y="28" width="42" height="26" rx="3" fill="rgba(251, 146, 60, 0.24)" stroke="#fb923c" strokeWidth="1.6" />
        <line x1="186" y1="28" x2="186" y2="54" stroke="rgba(253, 186, 116, 0.55)" strokeWidth="1" />
        <line x1="200" y1="28" x2="200" y2="54" stroke="rgba(253, 186, 116, 0.55)" strokeWidth="1" />
        <line x1="172" y1="41" x2="214" y2="41" stroke="rgba(253, 186, 116, 0.55)" strokeWidth="1" />
        <circle cx="193" cy="41" r="2.8" fill="#ffedd5" />
        {/* Arco livre */}
        <path
          className="svg-draw-path"
          d="M 84 48 Q 130 14, 172 38"
          fill="none"
          stroke="#5eead4"
          strokeWidth="1.8"
          strokeDasharray="4 3"
        />
        <text x="12" y="106" fill="#8fa0c4" fontSize="9.5" fontWeight="600">
          −90° / −180° · Seleção livre
        </text>
        <text x="270" y="106" textAnchor="end" fill="#5eead4" fontSize="9.5" fontWeight="700">
          +90° / +180°
        </text>
      </svg>
    );
  }

  if (featureId === 'catalog') {
    const layers = [
      { label: 'CERES · Radiação & Albedo', color: '#fbbf24', y: 14, w: 204 },
      { label: 'MERRA-2 · Clima & Aerossóis', color: '#22d3ee', y: 34, w: 236 },
      { label: 'MODIS · Vegetação (500 m)', color: '#34d399', y: 54, w: 186 },
      { label: 'GloFAS + NOAA · Rios & Solo', color: '#fb923c', y: 74, w: 220 },
    ] as const;

    return (
      <svg
        className="feature-svg"
        viewBox="0 0 280 112"
        role="img"
        aria-label="Camadas multi-fonte de dados ambientais da NASA e NOAA"
      >
        {layers.map((layer, idx) => (
          <g key={layer.label}>
            <rect
              x="10"
              y={layer.y}
              width="260"
              height="16"
              rx="5"
              fill="rgba(7, 11, 26, 0.55)"
              stroke="rgba(159, 180, 255, 0.14)"
            />
            <rect
              x="14"
              y={layer.y + 4}
              width={layer.w * 0.28}
              height="8"
              rx="4"
              fill={layer.color}
              fillOpacity={0.85 - idx * 0.08}
            />
            <text x="86" y={layer.y + 11.5} fill="#c3cde6" fontSize="9.2" fontWeight="600">
              {layer.label}
            </text>
          </g>
        ))}
        <text x="12" y="106" fill="#8fa0c4" fontSize="9.5" fontWeight="600">
          7 famílias físicas
        </text>
        <text x="268" y="106" textAnchor="end" fill="#38bdf8" fontSize="9.5" fontWeight="700">
          Alinhamento nativo
        </text>
      </svg>
    );
  }

  if (featureId === 'engine') {
    return (
      <svg
        className="feature-svg"
        viewBox="0 0 280 112"
        role="img"
        aria-label="Série temporal com tendência Theil-Sen, curva GAM não-linear e intervalo AR(1)"
      >
        <defs>
          <linearGradient id="featArBand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.03" />
          </linearGradient>
        </defs>
        {/* Banda AR(1) */}
        <path
          d="M 12 68 C 72 64, 136 52, 266 16 L 266 44 C 136 74, 72 82, 12 84 Z"
          fill="url(#featArBand)"
        />
        {/* Série anual */}
        <polyline
          className="svg-draw-series"
          points="12,74 26,64 40,78 54,60 68,69 82,58 96,71 110,55 124,62 138,49 152,58 166,42 180,48 194,34 208,43 222,29 236,36 250,21 266,27"
          fill="none"
          stroke="#c7d2fe"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Reta Theil-Sen */}
        <line
          className="svg-draw-path"
          x1="12"
          y1="74"
          x2="266"
          y2="29"
          stroke="#f97316"
          strokeWidth="2.3"
          strokeLinecap="round"
        />
        {/* Curva suave GAM */}
        <path
          className="svg-draw-path"
          d="M 12 73 C 88 68, 152 57, 266 23"
          fill="none"
          stroke="#5eead4"
          strokeWidth="2.1"
          strokeDasharray="4 3"
        />
        <circle cx="250" cy="21" r="3.8" fill="#fbbf24" stroke="#070b1a" strokeWidth="1.2" />
        <text x="12" y="106" fill="#8fa0c4" fontSize="9.5" fontWeight="600">
          1980
        </text>
        <text x="140" y="106" textAnchor="middle" fill="#fbbf24" fontSize="9.5" fontWeight="700">
          p_FDR · GAM · AR(1)
        </text>
        <text x="268" y="106" textAnchor="end" fill="#8fa0c4" fontSize="9.5" fontWeight="600">
          2025
        </text>
      </svg>
    );
  }

  // Feature 04: 4 modos combinatórios
  return (
    <svg
      className="feature-svg"
      viewBox="0 0 280 112"
      role="img"
      aria-label="Matriz de quatro arquiteturas combinatórias entre regiões A e B e variáveis X e Y"
    >
      <rect x="14" y="12" width="116" height="36" rx="8" fill="rgba(34, 211, 238, 0.14)" stroke="#22d3ee" strokeWidth="1.2" />
      <text x="24" y="28" fill="#67e8f9" fontSize="10" fontWeight="700">A ≠ B · X = Y</text>
      <text x="24" y="41" fill="#9fb4d3" fontSize="8.8">Teleconexões espaciais</text>

      <rect x="150" y="12" width="116" height="36" rx="8" fill="rgba(94, 234, 212, 0.14)" stroke="#5eead4" strokeWidth="1.2" />
      <text x="160" y="28" fill="#5eead4" fontSize="10" fontWeight="700">A = B · X ≠ Y</text>
      <text x="160" y="41" fill="#9fb4d3" fontSize="8.8">Causa física local</text>

      <rect x="14" y="56" width="116" height="36" rx="8" fill="rgba(251, 146, 60, 0.14)" stroke="#fb923c" strokeWidth="1.2" />
      <text x="24" y="72" fill="#fdba74" fontSize="10" fontWeight="700">A ≠ B · X ≠ Y</text>
      <text x="24" y="85" fill="#9fb4d3" fontSize="8.8">Defasagem cruzada</text>

      <rect x="150" y="56" width="116" height="36" rx="8" fill="rgba(167, 139, 250, 0.14)" stroke="#a78bfa" strokeWidth="1.2" />
      <text x="160" y="72" fill="#c4b5fd" fontSize="10" fontWeight="700">A = B · X = Y</text>
      <text x="160" y="85" fill="#9fb4d3" fontSize="8.8">Diagnóstico de ponto</text>

      <circle cx="140" cy="52" r="5" fill="#5eead4" />
      <text x="12" y="106" fill="#8fa0c4" fontSize="9.5" fontWeight="600">
        Troca instantânea entre local e variável
      </text>
    </svg>
  );
}

/** Gráficos de série/tendência no estilo visual Trend Detective para os 4 Casos Reais. */
export function CaseChartGraphic({ preset }: { readonly preset: StoryPreset }) {
  const startYear = preset.startMonth.slice(0, 4);
  const endYear = preset.endMonth.slice(0, 4);

  if (preset.id === 'cerrado-vs-amazonia') {
    return (
      <svg className="case-chart-svg" viewBox="0 0 280 96" role="img" aria-label="Comparação Cerrado e Amazônia 1981 a 2025">
        <polyline
          className="svg-draw-series"
          points="10,30 25,35 40,28 55,38 70,32 85,40 100,35 115,43 130,39 145,48 160,44 175,54 190,48 205,59 220,54 235,65 250,60 268,69"
          fill="none"
          stroke="#f97316"
          strokeWidth="1.9"
          strokeLinejoin="round"
        />
        <polyline
          className="svg-draw-series"
          points="10,34 25,32 40,39 55,31 70,38 85,34 100,41 115,35 130,42 145,38 160,44 175,39 190,45 205,40 220,46 235,43 250,48 268,45"
          fill="none"
          stroke="#c7d2fe"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <line className="svg-draw-path" x1="10" y1="30" x2="268" y2="67" stroke="#22d3ee" strokeWidth="2.1" strokeLinecap="round" />
        <text x="10" y="90" fill="#8fa0c4" fontSize="9.5">{startYear}</text>
        <text x="96" y="90" fill="#22d3ee" fontSize="9.5" fontWeight="700">Cerrado (Δ) vs Amazônia (B)</text>
        <text x="246" y="90" fill="#8fa0c4" fontSize="9.5">{endYear}</text>
      </svg>
    );
  }

  if (preset.id === 'heatwaves-soil-mg') {
    return (
      <svg className="case-chart-svg" viewBox="0 0 280 96" role="img" aria-label="Calor máximo T2M_MAX versus umidade superficial do solo GWETTOP">
        <polyline
          className="svg-draw-series"
          points="10,64 25,60 40,63 55,56 70,58 85,51 100,55 115,47 130,52 145,42 160,46 175,38 190,41 205,32 220,35 235,24 250,27 268,20"
          fill="none"
          stroke="#f97316"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <polyline
          className="svg-draw-series"
          points="10,32 25,38 40,29 55,40 70,34 85,43 100,37 115,48 130,41 145,52 160,46 175,58 190,51 205,63 220,56 235,68 250,60 268,69"
          fill="none"
          stroke="#c7d2fe"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <line x1="168" y1="16" x2="168" y2="74" stroke="rgba(94, 234, 212, 0.45)" strokeDasharray="3 3" />
        <circle cx="168" cy="48" r="3.5" fill="#5eead4" />
        <text x="10" y="90" fill="#8fa0c4" fontSize="9.5">{startYear}</text>
        <text x="92" y="90" fill="#5eead4" fontSize="9.5" fontWeight="700">Acoplamento T2M_MAX ↔ GWETTOP</text>
        <text x="246" y="90" fill="#8fa0c4" fontSize="9.5">{endYear}</text>
      </svg>
    );
  }

  if (preset.id === 'ceres-amazon-parana') {
    return (
      <svg className="case-chart-svg" viewBox="0 0 280 96" role="img" aria-label="Radiação na Amazônia versus precipitação na Bacia do Paraná">
        <polyline
          className="svg-draw-series"
          points="10,48 25,66 40,34 55,58 70,28 85,62 100,40 115,66 130,22 145,56 160,36 175,64 190,18 205,54 220,38 235,66 250,26 268,48"
          fill="none"
          stroke="#fb923c"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <polyline
          className="svg-draw-series"
          points="10,46 25,30 40,62 55,36 70,66 85,34 100,56 115,28 130,72 145,38 160,58 175,30 190,74 205,36 220,56 235,28 250,68 268,44"
          fill="none"
          stroke="#c7d2fe"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <circle cx="190" cy="18" r="3.6" fill="#fbbf24" />
        <circle cx="190" cy="74" r="3.6" fill="#22d3ee" />
        <text x="10" y="90" fill="#8fa0c4" fontSize="9.5">{startYear}</text>
        <text x="98" y="90" fill="#fbbf24" fontSize="9.5" fontWeight="700">Gangorra multiescala (El Niño)</text>
        <text x="246" y="90" fill="#8fa0c4" fontSize="9.5">{endYear}</text>
      </svg>
    );
  }

  // Case 04: arctic-vs-tropics
  return (
    <svg className="case-chart-svg" viewBox="0 0 280 96" role="img" aria-label="Amplificação polar no Ártico versus Atlântico Tropical">
      <polyline
        className="svg-draw-series"
        points="10,66 25,62 40,69 55,60 70,65 85,57 100,63 115,52 130,56 145,45 160,48 175,36 190,41 205,27 220,31 235,19 250,24 268,14"
        fill="none"
        stroke="#c7d2fe"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        className="svg-draw-path"
        d="M 10 66 C 85 64, 150 56, 268 17"
        fill="none"
        stroke="#f97316"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        className="svg-draw-path"
        d="M 10 68 C 95 66, 165 59, 268 46"
        fill="none"
        stroke="#22d3ee"
        strokeWidth="1.8"
        strokeDasharray="4 3"
      />
      <text x="10" y="90" fill="#8fa0c4" fontSize="9.5">{startYear}</text>
      <text x="96" y="90" fill="#22d3ee" fontSize="9.5" fontWeight="700">Amplificação Ártico × Trópicos</text>
      <text x="246" y="90" fill="#8fa0c4" fontSize="9.5">{endYear}</text>
    </svg>
  );
}

/** Esquema visual animado dentro do spotlight quando o usuário alterna entre os 4 modos combinatórios. */
export function MatrixModeDiagram({ mode }: { readonly mode: MatrixModeCard }) {
  const isSamePlace = mode.defaultSameLocation;
  const isCrossVar = mode.id === 'local_coupling' || mode.id === 'cross_teleconnection';

  return (
    <svg
      key={mode.id}
      className="matrix-diagram-svg"
      viewBox="0 0 220 92"
      role="img"
      aria-label={`Diagrama do modo ${mode.formula}`}
    >
      <rect x="4" y="4" width="212" height="84" rx="14" fill="rgba(7, 11, 26, 0.56)" stroke="rgba(159, 180, 255, 0.16)" />
      {isSamePlace ? (
        <g>
          <circle cx="110" cy="46" r="24" fill="rgba(34, 211, 238, 0.12)" stroke="#22d3ee" strokeWidth="1.6" />
          <circle cx="110" cy="46" r="14" fill="rgba(94, 234, 212, 0.18)" stroke={isCrossVar ? '#fb923c' : '#5eead4'} strokeWidth="1.6" strokeDasharray="4 3" />
          <text x="110" y="49" textAnchor="middle" fill="#e8eefc" fontSize="10.5" fontWeight="700">
            A = B
          </text>
          <text x="38" y="28" fill="#67e8f9" fontSize="9.5" fontWeight="700">Var X</text>
          <text x="150" y="68" fill={isCrossVar ? '#fb923c' : '#67e8f9'} fontSize="9.5" fontWeight="700">
            {isCrossVar ? 'Var Y' : 'Var X'}
          </text>
          <path d="M 66 26 Q 82 26, 92 36" fill="none" stroke="#67e8f9" strokeWidth="1.5" />
          <path d="M 146 64 Q 132 62, 124 52" fill="none" stroke={isCrossVar ? '#fb923c' : '#5eead4'} strokeWidth="1.5" />
        </g>
      ) : (
        <g>
          <circle cx="52" cy="46" r="19" fill="rgba(34, 211, 238, 0.16)" stroke="#22d3ee" strokeWidth="1.7" />
          <text x="52" y="44" textAnchor="middle" fill="#e8eefc" fontSize="10" fontWeight="700">Local A</text>
          <text x="52" y="56" textAnchor="middle" fill="#67e8f9" fontSize="8.8" fontWeight="600">Var X</text>

          <circle cx="168" cy="46" r="19" fill="rgba(251, 146, 60, 0.16)" stroke="#fb923c" strokeWidth="1.7" />
          <text x="168" y="44" textAnchor="middle" fill="#e8eefc" fontSize="10" fontWeight="700">Local B</text>
          <text x="168" y="56" textAnchor="middle" fill="#fdba74" fontSize="8.8" fontWeight="600">
            {isCrossVar ? 'Var Y' : 'Var X'}
          </text>

          <path className="svg-draw-path" d="M 74 38 Q 110 14, 146 38" fill="none" stroke="#5eead4" strokeWidth="2" strokeDasharray="4 3" />
          <path className="svg-draw-path" d="M 146 54 Q 110 74, 74 54" fill="none" stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="3 3" />
          <circle cx="110" cy="26" r="3" fill="#5eead4" />
        </g>
      )}
    </svg>
  );
}
