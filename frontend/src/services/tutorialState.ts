export type TutorialCompletionStatus = 'completed' | 'skipped';

export interface PersistedTutorialState {
  readonly version: 1;
  readonly status: TutorialCompletionStatus;
  readonly updatedAt: string;
  readonly lastStepId: string;
}

export const TUTORIAL_STORAGE_KEY = 'flipflop34:tutorial:v1';

export function loadTutorialState(): PersistedTutorialState | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(TUTORIAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedTutorialState>;
    if (
      parsed.version !== 1 ||
      (parsed.status !== 'completed' && parsed.status !== 'skipped') ||
      typeof parsed.lastStepId !== 'string' ||
      !parsed.lastStepId
    ) {
      return null;
    }
    return {
      version: 1,
      status: parsed.status,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
      lastStepId: parsed.lastStepId,
    };
  } catch {
    return null;
  }
}

export function shouldAutoOpenTutorial(): boolean {
  return loadTutorialState() === null;
}

export function saveTutorialOutcome(status: TutorialCompletionStatus, lastStepId: string): PersistedTutorialState {
  const record: PersistedTutorialState = {
    version: 1,
    status,
    updatedAt: new Date().toISOString(),
    lastStepId,
  };
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify(record));
    }
  } catch {
    // Ignore storage quota or private-mode restrictions
  }
  return record;
}

export function resetTutorialState(): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(TUTORIAL_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota or private-mode restrictions
  }
}
