import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type {
  TutorialBadgeIcon,
  TutorialLiveContext,
  TutorialPlacement,
  TutorialStep,
} from './tutorialSteps';

interface TutorialOverlayProps {
  readonly open: boolean;
  readonly steps: readonly TutorialStep[];
  readonly stepIndex: number;
  readonly liveContext: TutorialLiveContext;
  readonly onStepChange: (nextIndex: number) => void;
  readonly onComplete: (lastStepId: string) => void;
  readonly onSkip: (lastStepId: string) => void;
}

interface MeasuredRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly right: number;
  readonly bottom: number;
}

interface CardPositionStyle {
  readonly top?: number | string;
  readonly bottom?: number | string;
  readonly left?: number | string;
  readonly right?: number | string;
  readonly transform?: string;
  readonly maxHeight?: number;
}

const SPOTLIGHT_PADDING = 5;
const VIEWPORT_MARGIN = 12;
const CARD_GAP = 14;

function TutorialMissionBadge({ icon }: { readonly icon: TutorialBadgeIcon }) {
  const commonProps = {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (icon) {
    case 'radar':
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="4.5" strokeOpacity="0.65" />
          <path d="M12 12L18.2 7.2" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'variables':
      return (
        <svg {...commonProps}>
          <rect x="3" y="4" width="18" height="6" rx="2" />
          <rect x="3" y="14" width="18" height="6" rx="2" />
          <circle cx="7" cy="7" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="7" cy="17" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'trends':
      return (
        <svg {...commonProps}>
          <path d="M4 17l5-5 4 3 7-8" />
          <path d="M16 7h4v4" />
          <circle cx="6" cy="7" r="2" strokeOpacity="0.6" />
        </svg>
      );
    case 'hotspot':
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="7" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'grid':
      return (
        <svg {...commonProps}>
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M9.5 4v16M14.5 4v16M4 9.5h16M4 14.5h16" />
        </svg>
      );
    case 'layers':
      return (
        <svg {...commonProps}>
          <polygon points="12 3 21 8 12 13 3 8 12 3" />
          <polyline points="3 12.5 12 17.5 21 12.5" />
          <polyline points="3 16.5 12 21.5 21 16.5" />
        </svg>
      );
    case 'analyze':
      return (
        <svg {...commonProps}>
          <polygon points="6 4 20 12 6 20 6 4" />
        </svg>
      );
    case 'bench':
      return (
        <svg {...commonProps}>
          <path d="M4 19h16" />
          <rect x="6" y="11" width="3" height="5" rx="1" />
          <rect x="10.5" y="7" width="3" height="9" rx="1" />
          <rect x="15" y="4" width="3" height="12" rx="1" />
        </svg>
      );
  }
}

function resolveAllVisibleElements(selectors: readonly string[]): HTMLElement[] {
  const results: HTMLElement[] = [];
  for (const selector of selectors) {
    const candidate = document.querySelector(selector);
    if (!(candidate instanceof HTMLElement)) continue;
    const rect = candidate.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && !results.includes(candidate)) {
      results.push(candidate);
    }
  }
  return results;
}

function resolveStepElements(
  selectors: readonly string[],
  fallbackSelectors: readonly string[] = [],
): HTMLElement[] {
  const primary = resolveAllVisibleElements(selectors);
  if (primary.length > 0) return primary;
  return resolveAllVisibleElements(fallbackSelectors);
}

function getScrollableAncestors(el: HTMLElement): HTMLElement[] {
  const ancestors: HTMLElement[] = [];
  let cursor = el.parentElement;
  while (cursor && cursor !== document.body && cursor !== document.documentElement) {
    const style = window.getComputedStyle(cursor);
    const overflowY = style.overflowY;
    const overflowX = style.overflowX;
    const isScrollY = (overflowY === 'auto' || overflowY === 'scroll') && cursor.scrollHeight > cursor.clientHeight;
    const isScrollX = (overflowX === 'auto' || overflowX === 'scroll') && cursor.scrollWidth > cursor.clientWidth;
    if (isScrollY || isScrollX) {
      ancestors.push(cursor);
    }
    cursor = cursor.parentElement;
  }
  return ancestors;
}

function isTargetClippedOrOutside(el: HTMLElement, vw: number, vh: number): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;

  const fitsVertically = rect.height >= vh - VIEWPORT_MARGIN * 2;
  const outsideViewportY = fitsVertically
    ? rect.bottom <= VIEWPORT_MARGIN || rect.top >= vh - VIEWPORT_MARGIN
    : rect.top < VIEWPORT_MARGIN || rect.bottom > vh - VIEWPORT_MARGIN;
  const outsideViewportX = rect.left < VIEWPORT_MARGIN || rect.right > vw - VIEWPORT_MARGIN;
  if (outsideViewportY || outsideViewportX) return true;

  for (const container of getScrollableAncestors(el)) {
    const cRect = container.getBoundingClientRect();
    if (cRect.width <= 0 || cRect.height <= 0) continue;
    const containerTall = rect.height >= cRect.height - 8;
    const clippedY = containerTall
      ? rect.bottom <= cRect.top + 4 || rect.top >= cRect.bottom - 4
      : rect.top < cRect.top + 4 || rect.bottom > cRect.bottom - 4;
    if (clippedY) return true;
  }
  return false;
}

function toPaddedViewportRect(
  el: HTMLElement,
  padding: number,
  vw: number,
  vh: number,
): MeasuredRect | null {
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  let minLeft = 2;
  let minTop = 2;
  let maxRight = vw - 2;
  let maxBottom = vh - 2;

  for (const container of getScrollableAncestors(el)) {
    const cRect = container.getBoundingClientRect();
    if (cRect.width <= 0 || cRect.height <= 0) continue;
    minLeft = Math.max(minLeft, Math.round(cRect.left));
    minTop = Math.max(minTop, Math.round(cRect.top));
    maxRight = Math.min(maxRight, Math.round(cRect.right));
    maxBottom = Math.min(maxBottom, Math.round(cRect.bottom));
  }

  const left = Math.max(minLeft, Math.round(rect.left - padding));
  const top = Math.max(minTop, Math.round(rect.top - padding));
  const right = Math.min(maxRight, Math.round(rect.right + padding));
  const bottom = Math.min(maxBottom, Math.round(rect.bottom + padding));
  if (right <= left || bottom <= top) return null;

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

function roundedRectSubpath(x: number, y: number, w: number, h: number, radius: number): string {
  const r = Math.min(radius, Math.floor(w / 2), Math.floor(h / 2));
  if (r <= 0) {
    return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
  }
  return [
    `M ${x + r} ${y}`,
    `H ${x + w - r}`,
    `A ${r} ${r} 0 0 1 ${x + w} ${y + r}`,
    `V ${y + h - r}`,
    `A ${r} ${r} 0 0 1 ${x + w - r} ${y + h}`,
    `H ${x + r}`,
    `A ${r} ${r} 0 0 1 ${x} ${y + h - r}`,
    `V ${y + r}`,
    `A ${r} ${r} 0 0 1 ${x + r} ${y}`,
    'Z',
  ].join(' ');
}

function buildEvenOddScrimPath(rects: readonly MeasuredRect[], vw: number, vh: number): string {
  const outer = `M 0 0 H ${vw} V ${vh} H 0 Z`;
  const holes = rects.map(rect => roundedRectSubpath(rect.left, rect.top, rect.width, rect.height, 10));
  return [outer, ...holes].join(' ');
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function rectIntersectionArea(
  a: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number },
  b: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number },
): number {
  const overlapW = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const overlapH = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return overlapW * overlapH;
}

const CONTROL_OVERLAP_WEIGHT = 1000;
const STAGE_OVERLAP_WEIGHT = 1;
const STAGE_CENTER_OVERLAP_WEIGHT = 8;
const MIN_POCKET_CARD_HEIGHT = 210;

interface CardCandidateInput {
  readonly dir: Exclude<TutorialPlacement, 'center'>;
  readonly rawLeft: number;
  readonly rawTop: number;
  readonly height: number;
  readonly maxHeight?: number;
}

function measureNaturalCardSize(
  cardEl: HTMLElement | null,
  vw: number,
  vh: number,
): { readonly width: number; readonly height: number } {
  const maxAllowedH = Math.max(MIN_POCKET_CARD_HEIGHT, vh - VIEWPORT_MARGIN * 2);
  if (!cardEl) {
    return {
      width: Math.min(415, vw - VIEWPORT_MARGIN * 2),
      height: Math.min(300, maxAllowedH),
    };
  }

  const prevMaxHeight = cardEl.style.maxHeight;
  if (prevMaxHeight) cardEl.style.maxHeight = 'none';
  const rect = cardEl.getBoundingClientRect();
  if (prevMaxHeight) cardEl.style.maxHeight = prevMaxHeight;

  return {
    width: rect.width > 0 ? rect.width : Math.min(415, vw - VIEWPORT_MARGIN * 2),
    height: rect.height > 0 ? Math.min(rect.height, maxAllowedH) : Math.min(300, maxAllowedH),
  };
}

function computeBoundingUnion(rects: readonly MeasuredRect[]): MeasuredRect | null {
  if (rects.length === 0) return null;
  let left = rects[0]!.left;
  let top = rects[0]!.top;
  let right = rects[0]!.right;
  let bottom = rects[0]!.bottom;
  for (let i = 1; i < rects.length; i += 1) {
    const r = rects[i]!;
    left = Math.min(left, r.left);
    top = Math.min(top, r.top);
    right = Math.max(right, r.right);
    bottom = Math.max(bottom, r.bottom);
  }
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function computeCardLayout(
  spotlightRects: readonly MeasuredRect[],
  preferred: TutorialPlacement,
  cardEl: HTMLElement | null,
  isMinimized: boolean,
): { style: CardPositionStyle; isCentered: boolean; effectivePlacement: TutorialPlacement } {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1366;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;

  if (isMinimized) {
    return {
      isCentered: false,
      effectivePlacement: 'bottom',
      style: { bottom: 12, right: 12 },
    };
  }

  const primaryRect = spotlightRects[0] ?? null;

  if (vw <= 700) {
    const dockAtTop = Boolean(primaryRect && primaryRect.top > vh * 0.45);
    return {
      isCentered: false,
      effectivePlacement: dockAtTop ? 'top' : 'bottom',
      style: dockAtTop ? { top: 8, left: 8, right: 8 } : { bottom: 8, left: 8, right: 8 },
    };
  }

  const stageRects: MeasuredRect[] = [];
  const controlRects: MeasuredRect[] = [];
  for (const r of spotlightRects) {
    if (r.width > vw * 0.65 && r.height > vh * 0.4) {
      stageRects.push(r);
    } else {
      controlRects.push(r);
    }
  }

  if (!primaryRect || preferred === 'center') {
    return {
      isCentered: true,
      effectivePlacement: 'center',
      style: {
        top: Math.round(vh / 2),
        left: Math.round(vw / 2),
        transform: 'translate(-50%, -50%)',
      },
    };
  }

  const { width: cardWidth, height: naturalHeight } = measureNaturalCardSize(cardEl, vw, vh);

  // Full-panel stage targets (e.g., live Bancada Científica) dock at bottom-right instead of covering charts mid-screen
  if (controlRects.length === 0 && primaryRect.width > vw * 0.72 && primaryRect.height > vh * 0.65) {
    return {
      isCentered: false,
      effectivePlacement: 'bottom',
      style: {
        left: Math.round(Math.max(VIEWPORT_MARGIN, vw - cardWidth - VIEWPORT_MARGIN)),
        top: Math.round(Math.max(VIEWPORT_MARGIN, vh - naturalHeight - VIEWPORT_MARGIN)),
      },
    };
  }
  const controlsUnion = computeBoundingUnion(controlRects);
  const stageUnion = computeBoundingUnion(stageRects);

  const anchors: MeasuredRect[] = [primaryRect];
  if (controlsUnion) anchors.push(controlsUnion);
  anchors.push(...controlRects, ...stageRects);

  const rawCandidates: CardCandidateInput[] = [];
  const rightEdgeX = vw - cardWidth - VIEWPORT_MARGIN;
  const bottomEdgeY = vh - naturalHeight - VIEWPORT_MARGIN;
  const centerEdgeX = (vw - cardWidth) / 2;

  for (const r of anchors) {
    rawCandidates.push(
      { dir: 'bottom', rawLeft: r.left, rawTop: r.bottom + CARD_GAP, height: naturalHeight },
      { dir: 'bottom', rawLeft: r.right - cardWidth, rawTop: r.bottom + CARD_GAP, height: naturalHeight },
      { dir: 'bottom', rawLeft: rightEdgeX, rawTop: r.bottom + CARD_GAP, height: naturalHeight },
      { dir: 'bottom', rawLeft: VIEWPORT_MARGIN, rawTop: r.bottom + CARD_GAP, height: naturalHeight },
      { dir: 'top', rawLeft: r.left, rawTop: r.top - CARD_GAP - naturalHeight, height: naturalHeight },
      { dir: 'top', rawLeft: r.right - cardWidth, rawTop: r.top - CARD_GAP - naturalHeight, height: naturalHeight },
      { dir: 'top', rawLeft: rightEdgeX, rawTop: r.top - CARD_GAP - naturalHeight, height: naturalHeight },
      { dir: 'top', rawLeft: VIEWPORT_MARGIN, rawTop: r.top - CARD_GAP - naturalHeight, height: naturalHeight },
      { dir: 'right', rawLeft: r.right + CARD_GAP, rawTop: r.top, height: naturalHeight },
      { dir: 'right', rawLeft: r.right + CARD_GAP, rawTop: VIEWPORT_MARGIN, height: naturalHeight },
      { dir: 'right', rawLeft: r.right + CARD_GAP, rawTop: bottomEdgeY, height: naturalHeight },
      { dir: 'left', rawLeft: r.left - CARD_GAP - cardWidth, rawTop: r.top, height: naturalHeight },
      { dir: 'left', rawLeft: r.left - CARD_GAP - cardWidth, rawTop: VIEWPORT_MARGIN, height: naturalHeight },
      { dir: 'left', rawLeft: r.left - CARD_GAP - cardWidth, rawTop: bottomEdgeY, height: naturalHeight },
    );
  }

  rawCandidates.push(
    { dir: 'right', rawLeft: rightEdgeX, rawTop: VIEWPORT_MARGIN, height: naturalHeight },
    { dir: 'top', rawLeft: VIEWPORT_MARGIN, rawTop: VIEWPORT_MARGIN, height: naturalHeight },
    { dir: 'bottom', rawLeft: rightEdgeX, rawTop: bottomEdgeY, height: naturalHeight },
    { dir: 'bottom', rawLeft: VIEWPORT_MARGIN, rawTop: bottomEdgeY, height: naturalHeight },
    { dir: 'top', rawLeft: centerEdgeX, rawTop: VIEWPORT_MARGIN, height: naturalHeight },
    { dir: 'bottom', rawLeft: centerEdgeX, rawTop: bottomEdgeY, height: naturalHeight },
  );

  // If vertical room around controls/stage is tight on shorter screens, try bounded-height pockets
  if (controlsUnion) {
    const belowTop = controlsUnion.bottom + CARD_GAP;
    const belowBandH = Math.floor(vh - VIEWPORT_MARGIN - belowTop);
    if (belowBandH >= MIN_POCKET_CARD_HEIGHT && belowBandH < naturalHeight) {
      for (const x of [primaryRect.left, controlsUnion.left, VIEWPORT_MARGIN, rightEdgeX, centerEdgeX]) {
        rawCandidates.push({
          dir: 'bottom',
          rawLeft: x,
          rawTop: belowTop,
          height: belowBandH,
          maxHeight: belowBandH,
        });
      }
    }

    const aboveBandH = Math.floor(controlsUnion.top - CARD_GAP - VIEWPORT_MARGIN);
    if (aboveBandH >= MIN_POCKET_CARD_HEIGHT && aboveBandH < naturalHeight) {
      for (const x of [primaryRect.left, controlsUnion.left, VIEWPORT_MARGIN, rightEdgeX, centerEdgeX]) {
        rawCandidates.push({
          dir: 'top',
          rawLeft: x,
          rawTop: VIEWPORT_MARGIN,
          height: aboveBandH,
          maxHeight: aboveBandH,
        });
      }
    }
  }

  if (stageUnion) {
    const aboveStageBandH = Math.floor(stageUnion.top - CARD_GAP - VIEWPORT_MARGIN);
    if (aboveStageBandH >= MIN_POCKET_CARD_HEIGHT && aboveStageBandH < naturalHeight) {
      for (const x of [primaryRect.right + CARD_GAP, rightEdgeX, VIEWPORT_MARGIN]) {
        rawCandidates.push({
          dir: 'top',
          rawLeft: x,
          rawTop: VIEWPORT_MARGIN,
          height: aboveStageBandH,
          maxHeight: aboveStageBandH,
        });
      }
    }
  }

  const seen = new Set<string>();
  let bestCandidate: {
    readonly dir: Exclude<TutorialPlacement, 'center'>;
    readonly left: number;
    readonly top: number;
    readonly maxHeight?: number;
    readonly score: number;
  } | null = null;

  for (const cand of rawCandidates) {
    const left = Math.round(clamp(cand.rawLeft, VIEWPORT_MARGIN, rightEdgeX));
    const top = Math.round(clamp(cand.rawTop, VIEWPORT_MARGIN, vh - cand.height - VIEWPORT_MARGIN));
    const key = `${left}:${top}:${cand.height}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const cardBox = {
      left,
      top,
      right: left + cardWidth,
      bottom: top + cand.height,
    };

    const controlOverlap = controlRects.reduce((acc, r) => acc + rectIntersectionArea(cardBox, r), 0);
    let stageOverlap = 0;
    let stageCenterOverlap = 0;
    for (const s of stageRects) {
      stageOverlap += rectIntersectionArea(cardBox, s);
      const centerCore = {
        left: s.left + s.width * 0.25,
        right: s.right - s.width * 0.25,
        top: s.top + s.height * 0.25,
        bottom: s.bottom - s.height * 0.25,
      };
      stageCenterOverlap += rectIntersectionArea(cardBox, centerCore);
    }

    const clampPenalty = (Math.abs(left - cand.rawLeft) + Math.abs(top - cand.rawTop)) * 0.25;
    const shrinkPenalty = cand.height < naturalHeight ? (naturalHeight - cand.height) * 6 : 0;
    const dirPenalty = cand.dir === preferred ? 0 : 12;

    const score =
      controlOverlap * CONTROL_OVERLAP_WEIGHT +
      stageOverlap * STAGE_OVERLAP_WEIGHT +
      stageCenterOverlap * STAGE_CENTER_OVERLAP_WEIGHT +
      shrinkPenalty +
      clampPenalty +
      dirPenalty;

    if (!bestCandidate || score < bestCandidate.score) {
      bestCandidate = {
        dir: cand.dir,
        left,
        top,
        maxHeight: cand.maxHeight,
        score,
      };
    }
  }

  const chosen: {
    readonly dir: Exclude<TutorialPlacement, 'center'>;
    readonly left: number;
    readonly top: number;
    readonly maxHeight?: number;
  } = bestCandidate ?? {
    dir: 'bottom',
    left: VIEWPORT_MARGIN,
    top: VIEWPORT_MARGIN,
  };

  return {
    isCentered: false,
    effectivePlacement: chosen.dir,
    style: {
      left: chosen.left,
      top: chosen.top,
      ...(chosen.maxHeight !== undefined ? { maxHeight: chosen.maxHeight } : {}),
    },
  };
}

function isEditingControlOrPopup(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.isContentEditable ||
      target.closest(
        'input, textarea, select, [role="combobox"], [role="listbox"], .mantine-Combobox-dropdown, .mantine-Popover-dropdown',
      ),
  );
}

const OPEN_MANTINE_TRIGGER_SELECTOR =
  '[role="combobox"][aria-expanded="true"], [aria-expanded="true"][aria-haspopup="dialog"], [data-dates-input][aria-expanded="true"]';

/** Checks if any Mantine menu/calendar is open so Esc closes the popup before panels/modals. */
export function hasOpenMantinePopup(target?: EventTarget | null): boolean {
  if (
    (target instanceof HTMLElement && target.closest(OPEN_MANTINE_TRIGGER_SELECTOR)) ||
    document.querySelector(OPEN_MANTINE_TRIGGER_SELECTOR)
  ) {
    return true;
  }
  const candidates = document.querySelectorAll('.mantine-Combobox-dropdown, .mantine-Popover-dropdown');
  for (const el of candidates) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.getAttribute('aria-hidden') === 'true') continue;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return true;
  }
  return false;
}

export function TutorialOverlay({
  open,
  steps,
  stepIndex,
  liveContext,
  onStepChange,
  onComplete,
  onSkip,
}: TutorialOverlayProps) {
  const safeIndex = Math.min(Math.max(stepIndex, 0), Math.max(steps.length - 1, 0));
  const currentStep = steps[safeIndex];
  const resolved = useMemo(
    () =>
      currentStep?.resolveTarget({ hasAnalysis: liveContext.hasAnalysis }) ?? {
        selectors: [],
        placement: 'center' as const,
      },
    [currentStep, liveContext.hasAnalysis],
  );
  const missionStatus = useMemo(
    () => currentStep?.resolveMissionStatus?.(liveContext) ?? null,
    [currentStep, liveContext],
  );

  const [isMinimized, setIsMinimized] = useState(false);
  const [attentionPulse, setAttentionPulse] = useState(false);
  const [spotlightRects, setSpotlightRects] = useState<readonly MeasuredRect[]>([]);
  const [viewportSize, setViewportSize] = useState<{ readonly vw: number; readonly vh: number }>({
    vw: typeof window !== 'undefined' ? window.innerWidth : 1366,
    vh: typeof window !== 'undefined' ? window.innerHeight : 768,
  });
  const [cardLayout, setCardLayout] = useState<{
    style: CardPositionStyle;
    isCentered: boolean;
    effectivePlacement: TutorialPlacement;
  }>({
    style: { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
    isCentered: true,
    effectivePlacement: 'center',
  });

  const cardRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const primaryActionRef = useRef<HTMLButtonElement | null>(null);
  const pulseTimerRef = useRef<number | null>(null);
  const scrolledStepKeyRef = useRef<string>('');

  const triggerAttentionPulse = useCallback(() => {
    setAttentionPulse(true);
    if (pulseTimerRef.current !== null) {
      window.clearTimeout(pulseTimerRef.current);
    }
    pulseTimerRef.current = window.setTimeout(() => {
      setAttentionPulse(false);
      pulseTimerRef.current = null;
    }, 650);
  }, []);

  useEffect(() => {
    return () => {
      if (pulseTimerRef.current !== null) window.clearTimeout(pulseTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setIsMinimized(false);
      setAttentionPulse(false);
    }
  }, [open, safeIndex]);

  const measureAndPosition = useCallback(() => {
    if (!open || !currentStep) return;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1366;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
    const targets = resolveStepElements(resolved.selectors, resolved.fallbackSelectors);
    const rects = targets
      .map(el => toPaddedViewportRect(el, SPOTLIGHT_PADDING, vw, vh))
      .filter((rect): rect is MeasuredRect => rect !== null);

    setViewportSize({ vw, vh });
    setSpotlightRects(rects);
    setCardLayout(computeCardLayout(rects, resolved.placement, cardRef.current, isMinimized));
  }, [open, currentStep, resolved, isMinimized]);

  useEffect(() => {
    if (!open || isMinimized) return;
    if (bodyRef.current) {
      bodyRef.current.scrollTop = 0;
    }
  }, [open, safeIndex, isMinimized]);

  useEffect(() => {
    if (!open || !currentStep) {
      scrolledStepKeyRef.current = '';
      return;
    }
    const stepKey = `${safeIndex}:${currentStep.id}:${resolved.selectors.join(',')}`;
    if (scrolledStepKeyRef.current === stepKey) return;

    const tryScrollTargetIntoView = (): boolean => {
      if (scrolledStepKeyRef.current === stepKey) return true;
      const targets = resolveStepElements(resolved.selectors, resolved.fallbackSelectors);
      const primaryTarget = targets[0];
      if (!primaryTarget) return false;
      scrolledStepKeyRef.current = stepKey;
      if (typeof primaryTarget.scrollIntoView !== 'function') return true;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (isTargetClippedOrOutside(primaryTarget, vw, vh)) {
        const rect = primaryTarget.getBoundingClientRect();
        primaryTarget.scrollIntoView({
          behavior: 'smooth',
          block: rect.height > vh * 0.65 ? 'nearest' : 'center',
          inline: 'nearest',
        });
      }
      return true;
    };

    if (tryScrollTargetIntoView()) return;

    const rafId = requestAnimationFrame(() => {
      tryScrollTargetIntoView();
    });
    const retryTimer = window.setTimeout(() => {
      tryScrollTargetIntoView();
    }, 90);
    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(retryTimer);
    };
  }, [open, safeIndex, currentStep, resolved.selectors, resolved.fallbackSelectors]);

  useLayoutEffect(() => {
    if (!open || !currentStep) return;
    measureAndPosition();

    const observedElements = resolveStepElements(resolved.selectors, resolved.fallbackSelectors);
    let rafId = 0;
    const scheduleMeasure = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(measureAndPosition);
    };

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleMeasure) : null;
    const mutationObserver =
      typeof MutationObserver !== 'undefined' ? new MutationObserver(scheduleMeasure) : null;

    for (const el of observedElements) {
      resizeObserver?.observe(el);
      mutationObserver?.observe(el, {
        attributes: true,
        attributeFilter: ['class', 'style'],
        subtree: true,
        childList: true,
      });
    }
    if (cardRef.current) resizeObserver?.observe(cardRef.current);

    let mountObserver: MutationObserver | null = null;
    if (
      resolved.selectors.length > 0 &&
      observedElements.length < resolved.selectors.length &&
      typeof MutationObserver !== 'undefined'
    ) {
      const rootTarget = document.querySelector('main') ?? document.body;
      mountObserver = new MutationObserver(() => {
        if (
          resolveStepElements(resolved.selectors, resolved.fallbackSelectors).length > observedElements.length
        ) {
          mountObserver?.disconnect();
          scheduleMeasure();
        }
      });
      mountObserver.observe(rootTarget, { childList: true, subtree: true });
    }

    const visualViewport = typeof window !== 'undefined' ? window.visualViewport : null;
    window.addEventListener('resize', scheduleMeasure);
    window.addEventListener('scroll', scheduleMeasure, { capture: true, passive: true });
    window.addEventListener('scrollend', scheduleMeasure, true);
    window.addEventListener('transitionend', scheduleMeasure, true);
    visualViewport?.addEventListener('resize', scheduleMeasure);
    visualViewport?.addEventListener('scroll', scheduleMeasure);

    const settleTimerA = window.setTimeout(scheduleMeasure, 65);
    const settleTimerB = window.setTimeout(scheduleMeasure, 240);
    const settleTimerC = window.setTimeout(scheduleMeasure, 480);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(settleTimerA);
      clearTimeout(settleTimerB);
      clearTimeout(settleTimerC);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      mountObserver?.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
      window.removeEventListener('scroll', scheduleMeasure, true);
      window.removeEventListener('scrollend', scheduleMeasure, true);
      window.removeEventListener('transitionend', scheduleMeasure, true);
      visualViewport?.removeEventListener('resize', scheduleMeasure);
      visualViewport?.removeEventListener('scroll', scheduleMeasure);
    };
  }, [open, currentStep, resolved, isMinimized, measureAndPosition]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      primaryActionRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, safeIndex]);

  useEffect(() => {
    if (!open || !currentStep) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const editingOrPopup = isEditingControlOrPopup(event.target);

      if (event.key === 'Escape') {
        if (hasOpenMantinePopup(event.target)) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onSkip(currentStep.id);
        return;
      }

      if (editingOrPopup) return;

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        if (safeIndex < steps.length - 1) {
          onStepChange(safeIndex + 1);
        } else {
          onComplete(currentStep.id);
        }
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        if (safeIndex > 0) {
          onStepChange(Math.max(safeIndex - 1, 0));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [open, currentStep, safeIndex, steps.length, onStepChange, onComplete, onSkip]);

  if (!open || !currentStep) return null;

  const isFirst = safeIndex === 0;
  const isLast = safeIndex === steps.length - 1;
  const hasSpotlightCutouts = spotlightRects.length > 0;
  const scrimPath = hasSpotlightCutouts
    ? buildEvenOddScrimPath(spotlightRects, viewportSize.vw, viewportSize.vh)
    : '';

  return (
    <div className="tutorial-overlay-root" role="presentation">
      {hasSpotlightCutouts ? (
        <svg
          className="tutorial-scrim-svg"
          width={viewportSize.vw}
          height={viewportSize.vh}
          viewBox={`0 0 ${viewportSize.vw} ${viewportSize.vh}`}
          aria-hidden="true"
        >
          <path
            className="tutorial-scrim-path"
            fillRule="evenodd"
            clipRule="evenodd"
            d={scrimPath}
            onClick={triggerAttentionPulse}
          />
        </svg>
      ) : (
        <div
          className="tutorial-backdrop-dim"
          aria-hidden="true"
          onClick={resolved.selectors.length > 0 ? triggerAttentionPulse : undefined}
        />
      )}

      {spotlightRects.map((rect, index) => (
        <div
          key={`${currentStep.id}-spot-${index}`}
          className={`tutorial-spotlight${attentionPulse ? ' is-pinged' : ''}`}
          style={{
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          }}
          aria-hidden="true"
        >
          <span className="spotlight-corner corner-tl" />
          <span className="spotlight-corner corner-tr" />
          <span className="spotlight-corner corner-bl" />
          <span className="spotlight-corner corner-br" />
        </div>
      ))}

      {isMinimized ? (
        <section
          ref={cardRef}
          className="tutorial-hud-card is-minimized"
          style={cardLayout.style}
          role="dialog"
          aria-modal={false}
          aria-labelledby="tutorial-minimized-title"
        >
          <div className="tutorial-hud-scanline" aria-hidden="true" />
          <div className="tutorial-minimized-bar">
            <div className="tutorial-minimized-info">
              <span className="tutorial-phase-tag">{currentStep.phaseTag}</span>
              <strong id="tutorial-minimized-title">{currentStep.title}</strong>
            </div>
            <div className="tutorial-minimized-actions">
              <button
                type="button"
                className="tutorial-btn-secondary"
                disabled={isFirst}
                onClick={() => onStepChange(Math.max(safeIndex - 1, 0))}
              >
                ←
              </button>
              <button
                type="button"
                className="tutorial-btn-primary"
                onClick={() => setIsMinimized(false)}
              >
                Expand
              </button>
              <button
                type="button"
                className="tutorial-close-btn"
                aria-label="Close tutorial"
                onClick={() => onSkip(currentStep.id)}
              >
                ×
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section
          ref={cardRef}
          className={`tutorial-hud-card${cardLayout.isCentered ? ' is-centered' : ''} placement-${cardLayout.effectivePlacement}`}
          style={cardLayout.style}
          role="dialog"
          aria-modal={!hasSpotlightCutouts}
          aria-labelledby="tutorial-step-title"
          aria-describedby="tutorial-step-summary"
        >
          <div className="tutorial-hud-scanline" aria-hidden="true" />

          <header className="tutorial-hud-head">
            <div className="tutorial-rank-chip">
              <span className="tutorial-badge-icon">
                <TutorialMissionBadge icon={currentStep.badgeIcon} />
              </span>
              <div>
                <span className="tutorial-phase-tag">{currentStep.phaseTag}</span>
                <strong className="tutorial-rank-title">{currentStep.rankTitle}</strong>
              </div>
            </div>
            <div className="tutorial-head-right">
              <span className="tutorial-step-counter" aria-live="polite">
                {safeIndex + 1} / {steps.length}
              </span>
              {hasSpotlightCutouts && (
                <button
                  type="button"
                  className="tutorial-minimize-btn"
                  aria-label="Minimize tutorial card"
                  title="Minimize to interact without obstacles"
                  onClick={() => setIsMinimized(true)}
                >
                  −
                </button>
              )}
              <button
                type="button"
                className="tutorial-close-btn"
                aria-label="Close tutorial"
                onClick={() => onSkip(currentStep.id)}
              >
                ×
              </button>
            </div>
          </header>

          <ol className="tutorial-progress-track" aria-label="Training progress">
            {steps.map((step, index) => (
              <li key={step.id}>
                <button
                  type="button"
                  className={`tutorial-progress-segment${index === safeIndex ? ' is-active' : index < safeIndex ? ' is-done' : ''}`}
                  aria-label={`Go to step ${index + 1}: ${step.title}`}
                  aria-current={index === safeIndex ? 'step' : undefined}
                  onClick={() => onStepChange(index)}
                />
              </li>
            ))}
          </ol>

          <div ref={bodyRef} className="tutorial-hud-body">
            <h2 id="tutorial-step-title">{currentStep.title}</h2>
            <p id="tutorial-step-summary">{currentStep.summary}</p>

            {(currentStep.interactiveHint || missionStatus) && (
              <div
                className={`tutorial-live-status${missionStatus?.complete ? ' is-complete' : ''}`}
                aria-live="polite"
              >
                {currentStep.interactiveHint && (
                  <span className="tutorial-live-pill">
                    <i aria-hidden="true" /> {currentStep.interactiveHint}
                  </span>
                )}
                {missionStatus && (
                  <small className="tutorial-mission-readout">
                    {missionStatus.complete ? '✓ ' : ''}
                    {missionStatus.label}
                  </small>
                )}
              </div>
            )}

            {currentStep.shortcuts && currentStep.shortcuts.length > 0 && (
              <ul className="tutorial-shortcuts" aria-label="Shortcuts for this step">
                {currentStep.shortcuts.map(shortcut => (
                  <li key={shortcut.keys}>
                    <kbd>{shortcut.keys}</kbd>
                    <span>{shortcut.label}</span>
                  </li>
                ))}
              </ul>
            )}

            {resolved.showBenchPreview && (
              <div className="tutorial-bench-preview" aria-label="Preview of what unlocks in the Scientific Workbench">
                <span className="preview-label">Unlocked after clicking &ldquo;Analyze selection&rdquo;:</span>
                <div className="preview-modules">
                  <div className="preview-module">
                    <strong>Normalization &amp; Axes</strong>
                    <small>Raw · Anomaly · Z-Score (σ) · Symlog · X vs Y Scatter</small>
                  </div>
                  <div className="preview-module">
                    <strong>4 Detective Answers</strong>
                    <small>Accelerated? · AR(1) Correlation · Outliers D_M &gt; 2.5 · Multiscale</small>
                  </div>
                  <div className="preview-module">
                    <strong>Evidence &amp; Glossary</strong>
                    <small>Full CSV / JSON Export · Scientific help (?)</small>
                  </div>
                </div>
              </div>
            )}

            <aside className="tutorial-field-tip">
              <strong>Field Tip:</strong> <span>{currentStep.fieldTip}</span>
            </aside>
          </div>

          <footer className="tutorial-hud-actions">
            <button
              type="button"
              className="tutorial-btn-ghost"
              onClick={() => onSkip(currentStep.id)}
            >
              Skip tutorial
            </button>
            <div className="tutorial-nav-buttons">
              <button
                type="button"
                className="tutorial-btn-secondary"
                disabled={isFirst}
                onClick={() => onStepChange(Math.max(safeIndex - 1, 0))}
              >
                Previous
              </button>
              {isLast ? (
                <button
                  ref={primaryActionRef}
                  type="button"
                  className="tutorial-btn-primary"
                  onClick={() => onComplete(currentStep.id)}
                >
                  Finish training
                </button>
              ) : (
                <button
                  ref={primaryActionRef}
                  type="button"
                  className="tutorial-btn-primary"
                  onClick={() => onStepChange(Math.min(safeIndex + 1, steps.length - 1))}
                >
                  Next
                </button>
              )}
            </div>
          </footer>
        </section>
      )}
    </div>
  );
}
