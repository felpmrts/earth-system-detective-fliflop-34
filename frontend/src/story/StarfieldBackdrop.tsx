interface StarPoint {
  readonly id: number;
  readonly xPct: number;
  readonly yPct: number;
  readonly size: number;
  readonly color: string;
  readonly delaySec: number;
  readonly durationSec: number;
  readonly shape: 'sparkle' | 'dot';
}

const STAR_PALETTE = ['#fbbf24', '#8fa0c4', '#e8eefc', '#5eead4', '#c3cde6'] as const;

function seededUnit(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const STAR_POINTS: readonly StarPoint[] = Array.from({ length: 64 }, (_, idx) => {
  const r1 = seededUnit(idx + 1);
  const r2 = seededUnit((idx + 1) * 3.7);
  const r3 = seededUnit((idx + 1) * 7.3);
  const r4 = seededUnit((idx + 1) * 11.9);
  const shape: 'sparkle' | 'dot' = idx % 3 === 0 ? 'sparkle' : 'dot';

  return {
    id: idx,
    xPct: Number((2 + r1 * 96).toFixed(2)),
    yPct: Number((2 + r2 * 92).toFixed(2)),
    size: shape === 'sparkle' ? Math.round(7 + r3 * 6) : Math.round(2 + r3 * 2.5),
    color: STAR_PALETTE[Math.floor(r4 * STAR_PALETTE.length) % STAR_PALETTE.length]!,
    delaySec: Number((r3 * 5.2).toFixed(2)),
    durationSec: Number((2.6 + r4 * 3.2).toFixed(2)),
    shape,
  };
});

/** Campo estelar determinístico em SVG inline para profundidade cósmica 100% offline. */
export function StarfieldBackdrop() {
  return (
    <div className="story-starfield" aria-hidden="true">
      {STAR_POINTS.map(star =>
        star.shape === 'sparkle' ? (
          <svg
            key={star.id}
            viewBox="0 0 10 10"
            width={star.size}
            height={star.size}
            className="story-star-twinkle"
            style={{
              left: `${star.xPct}%`,
              top: `${star.yPct}%`,
              color: star.color,
              animationDelay: `${star.delaySec}s`,
              animationDuration: `${star.durationSec}s`,
            }}
          >
            <path d="M5 0 L5.9 4.1 L10 5 L5.9 5.9 L5 10 L4.1 5.9 L0 5 L4.1 4.1 Z" fill="currentColor" />
          </svg>
        ) : (
          <span
            key={star.id}
            className="story-star-dot"
            style={{
              left: `${star.xPct}%`,
              top: `${star.yPct}%`,
              width: `${star.size}px`,
              height: `${star.size}px`,
              backgroundColor: star.color,
              animationDelay: `${star.delaySec}s`,
              animationDuration: `${star.durationSec}s`,
            }}
          />
        ),
      )}
    </div>
  );
}
