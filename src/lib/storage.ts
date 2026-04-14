export type ThemeMode = 'dark' | 'light';

export type SessionRecord = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  breakCount: number;
  idleEvents: number;
};

export type DailyHistoryEntry = {
  dayStamp: string;
  studySeconds: number;
  totalBreaks: number;
  sessions: SessionRecord[];
  productivityScore: number;
};

export type PersistedState = {
  version: number;
  dayStamp: string;
  sessions: SessionRecord[];
  dailyStudySeconds: number;
  totalBreaks: number;
  history: DailyHistoryEntry[];
  settings: {
    theme: ThemeMode;
    notificationsEnabled: boolean;
    soundEnabled: boolean;
  };
  activeSession: {
    id: string;
    startedAt: string;
    runStartedAt: string | null;
    elapsedBeforePause: number;
    paused: boolean;
    pauseStartedAt: string | null;
    breakCount: number;
    idleEvents: number;
    lastBreakReminderAt: number;
    currentSuggestion: string;
    inactivityAlertOpen: boolean;
  } | null;
};

const STORAGE_KEY = 'movesense-state-v2';

export function getDayStamp(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function getDefaultState(): PersistedState {
  return {
    version: 2,
    dayStamp: getDayStamp(),
    sessions: [],
    dailyStudySeconds: 0,
    totalBreaks: 0,
    history: [],
    settings: {
      theme: 'dark',
      notificationsEnabled: true,
      soundEnabled: true
    },
    activeSession: null
  };
}

export function loadState(): PersistedState {
  if (typeof window === 'undefined') {
    return getDefaultState();
  }

  try {
    const raw =
      window.localStorage.getItem(STORAGE_KEY) ??
      window.localStorage.getItem('movesense-state-v1');

    if (!raw) {
      return getDefaultState();
    }

    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    const defaults = getDefaultState();

    return {
      ...defaults,
      ...parsed,
      history: parsed.history ?? defaults.history,
      settings: {
        ...defaults.settings,
        ...(parsed.settings ?? {})
      },
      activeSession: parsed.activeSession
        ? {
            ...parsed.activeSession
          }
        : null
    };
  } catch {
    return getDefaultState();
  }
}

export function saveState(state: PersistedState) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
