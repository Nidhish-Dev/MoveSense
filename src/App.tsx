import { CSSProperties, useEffect, useMemo, useState } from 'react';
import { OverlayModal } from './components/OverlayModal';
import { SessionTimeline } from './components/SessionTimeline';
import { StatCard } from './components/StatCard';
import { SuggestionBoard } from './components/SuggestionBoard';
import { useInterval } from './hooks/useInterval';
import {
  DailyHistoryEntry,
  PersistedState,
  SessionRecord,
  ThemeMode,
  getDayStamp,
  loadState,
  saveState
} from './lib/storage';
import { clampScore, formatDuration } from './lib/time';

const INACTIVITY_THRESHOLD_SECONDS = 60;
const BREAK_THRESHOLD_SECONDS = 45 * 60;
const suggestionRotation = ['stretching', 'walking', 'standing'] as const;

function createSessionRecord(
  session: NonNullable<PersistedState['activeSession']>,
  durationSeconds: number,
  endedAt = new Date().toISOString()
): SessionRecord {
  return {
    id: session.id,
    startedAt: session.startedAt,
    endedAt,
    durationSeconds,
    breakCount: session.breakCount,
    idleEvents: session.idleEvents
  };
}

function getCurrentElapsedSeconds(state: PersistedState['activeSession'], now: number) {
  if (!state) {
    return 0;
  }

  if (state.paused) {
    return state.elapsedBeforePause;
  }

  const runStartedAt = state.runStartedAt ? new Date(state.runStartedAt).getTime() : now;
  return state.elapsedBeforePause + Math.max(0, Math.floor((now - runStartedAt) / 1000));
}

function getProductivityScore(dailyStudySeconds: number, totalBreaks: number) {
  const studyComponent = Math.min(dailyStudySeconds / (4 * 3600), 1) * 70;
  const expectedBreaks = Math.max(1, Math.floor(dailyStudySeconds / BREAK_THRESHOLD_SECONDS));
  const breakComponent = Math.min(totalBreaks / expectedBreaks, 1) * 30;
  return clampScore(studyComponent + breakComponent);
}

function getYesterdayStamp(dayStamp: string) {
  const date = new Date(`${dayStamp}T00:00:00`);
  date.setDate(date.getDate() - 1);
  return getDayStamp(date);
}

function upsertHistory(history: DailyHistoryEntry[], entry: DailyHistoryEntry) {
  return [entry, ...history.filter((item) => item.dayStamp !== entry.dayStamp)].slice(0, 14);
}

function archiveCurrentDay(state: PersistedState, liveElapsedSeconds = 0): PersistedState {
  const hasActiveSession = Boolean(state.activeSession && liveElapsedSeconds > 0);
  const sessions = hasActiveSession
    ? [...state.sessions, createSessionRecord(state.activeSession!, liveElapsedSeconds)]
    : state.sessions;
  const studySeconds = state.dailyStudySeconds + liveElapsedSeconds;

  if (studySeconds === 0 && sessions.length === 0 && state.totalBreaks === 0) {
    return state;
  }

  const entry: DailyHistoryEntry = {
    dayStamp: state.dayStamp,
    studySeconds,
    totalBreaks: state.totalBreaks,
    sessions,
    productivityScore: getProductivityScore(studySeconds, state.totalBreaks)
  };

  return {
    ...state,
    history: upsertHistory(state.history, entry)
  };
}

function playAlertTone() {
  const AudioCtx =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioCtx) {
    return;
  }

  const ctx = new AudioCtx();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(740, ctx.currentTime);
  oscillator.frequency.linearRampToValueAtTime(520, ctx.currentTime + 0.22);
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);

  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.onended = () => {
    void ctx.close();
  };
  oscillator.start();
  oscillator.stop(ctx.currentTime + 0.35);
}

export default function App() {
  const [appState, setAppState] = useState<PersistedState>(() => loadState());
  const [now, setNow] = useState(Date.now());
  const [lastInteractionAt, setLastInteractionAt] = useState(Date.now());
  const [breakReminderOpen, setBreakReminderOpen] = useState(false);

  useEffect(() => {
    const today = getDayStamp();
    setAppState((current) => {
      if (current.dayStamp === today) {
        return current;
      }

      const liveElapsedSeconds = getCurrentElapsedSeconds(current.activeSession, Date.now());
      const archived = archiveCurrentDay(current, liveElapsedSeconds);

      return {
        ...archived,
        dayStamp: today,
        sessions: [],
        dailyStudySeconds: 0,
        totalBreaks: 0,
        activeSession: null
      };
    });
  }, []);

  useEffect(() => {
    saveState(appState);
  }, [appState]);

  useEffect(() => {
    document.documentElement.dataset.theme = appState.settings.theme;
    window.moveSenseDesktop?.setTheme(appState.settings.theme);
  }, [appState.settings.theme]);

  useEffect(() => {
    const markInteraction = () => {
      setLastInteractionAt(Date.now());
    };

    const events: Array<keyof WindowEventMap> = [
      'mousemove',
      'keydown',
      'mousedown',
      'scroll',
      'touchstart'
    ];

    events.forEach((eventName) => window.addEventListener(eventName, markInteraction));
    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, markInteraction));
    };
  }, []);

  useEffect(() => {
    const offBreak = window.moveSenseDesktop?.onBreakAlert(() => {
      setAppState((current) => {
        const session = current.activeSession;
        if (!session) {
          return current;
        }

        const currentElapsed = getCurrentElapsedSeconds(session, Date.now());
        if (currentElapsed < session.lastBreakReminderAt + BREAK_THRESHOLD_SECONDS) {
          return current;
        }

        return {
          ...current,
          activeSession: {
            ...session,
            lastBreakReminderAt: currentElapsed
          }
        };
      });
      setBreakReminderOpen(true);
    });

    const offInactivity = window.moveSenseDesktop?.onInactivityAlert(() => {
      setAppState((current) => {
        const session = current.activeSession;
        if (!session || session.inactivityAlertOpen) {
          return current;
        }

        const elapsed = getCurrentElapsedSeconds(session, Date.now());
        return {
          ...current,
          activeSession: {
            ...session,
            paused: true,
            runStartedAt: null,
            pauseStartedAt: new Date().toISOString(),
            elapsedBeforePause: elapsed,
            idleEvents: session.idleEvents + 1,
            inactivityAlertOpen: true
          }
        };
      });
    });

    return () => {
      offBreak?.();
      offInactivity?.();
    };
  }, []);

  useEffect(() => {
    if (
      appState.settings.soundEnabled &&
      (breakReminderOpen || appState.activeSession?.inactivityAlertOpen)
    ) {
      playAlertTone();
    }
  }, [
    appState.activeSession?.inactivityAlertOpen,
    appState.settings.soundEnabled,
    breakReminderOpen
  ]);

  useInterval(() => {
    const currentNow = Date.now();
    setNow(currentNow);

    setAppState((current) => {
      const currentDayStamp = getDayStamp(new Date(currentNow));
      if (current.dayStamp !== currentDayStamp) {
        const liveElapsedSeconds = getCurrentElapsedSeconds(current.activeSession, currentNow);
        const archived = archiveCurrentDay(current, liveElapsedSeconds);
        return {
          ...archived,
          dayStamp: currentDayStamp,
          sessions: [],
          dailyStudySeconds: 0,
          totalBreaks: 0,
          activeSession: null
        };
      }

      const session = current.activeSession;
      if (!session || session.paused) {
        return current;
      }

      const currentElapsed = getCurrentElapsedSeconds(session, currentNow);
      const idleSeconds = Math.floor((currentNow - lastInteractionAt) / 1000);

      if (idleSeconds >= INACTIVITY_THRESHOLD_SECONDS && !session.inactivityAlertOpen) {
        return {
          ...current,
          activeSession: {
            ...session,
            paused: true,
            runStartedAt: null,
            pauseStartedAt: new Date(currentNow).toISOString(),
            elapsedBeforePause: currentElapsed,
            idleEvents: session.idleEvents + 1,
            inactivityAlertOpen: true
          }
        };
      }

      if (currentElapsed >= session.lastBreakReminderAt + BREAK_THRESHOLD_SECONDS) {
        setBreakReminderOpen(true);
        return {
          ...current,
          activeSession: {
            ...session,
            lastBreakReminderAt: currentElapsed
          }
        };
      }

      return current;
    });
  }, 1000);

  const activeSession = appState.activeSession;
  const liveElapsedSeconds = getCurrentElapsedSeconds(activeSession, now);
  const dailyStudySeconds = appState.dailyStudySeconds + liveElapsedSeconds;
  const productivityScore = getProductivityScore(dailyStudySeconds, appState.totalBreaks);
  const activityStatus = useMemo(() => {
    if (!activeSession) {
      return 'Ready to begin';
    }
    if (activeSession.inactivityAlertOpen) {
      return 'Inactive';
    }
    return activeSession.paused ? 'Paused' : 'In focus';
  }, [activeSession]);

  const breakProgress = activeSession
    ? Math.min(
        ((liveElapsedSeconds - activeSession.lastBreakReminderAt) / BREAK_THRESHOLD_SECONDS) * 100,
        100
      )
    : 0;
  const nextBreakCountdown = activeSession
    ? Math.max(
        0,
        BREAK_THRESHOLD_SECONDS - (liveElapsedSeconds - activeSession.lastBreakReminderAt)
      )
    : BREAK_THRESHOLD_SECONDS;
  const currentSuggestion = activeSession?.currentSuggestion ?? 'stretching';
  const todaySessions = activeSession
    ? [
        ...appState.sessions,
        {
          id: activeSession.id,
          startedAt: activeSession.startedAt,
          endedAt: null,
          durationSeconds: liveElapsedSeconds,
          breakCount: activeSession.breakCount,
          idleEvents: activeSession.idleEvents
        }
      ]
    : appState.sessions;
  const totalIdleAlerts = todaySessions.reduce((sum, item) => sum + item.idleEvents, 0);
  const yesterday = appState.history.find(
    (entry) => entry.dayStamp === getYesterdayStamp(appState.dayStamp)
  );
  const comparisonDelta = yesterday ? dailyStudySeconds - yesterday.studySeconds : 0;
  const comparisonScoreDelta = yesterday ? productivityScore - yesterday.productivityScore : 0;
  const comparisonMessage = !yesterday
    ? 'Today is your baseline. Finish a full day to unlock richer comparison insights.'
    : comparisonDelta >= 0
      ? `You studied ${formatDuration(comparisonDelta)} more than yesterday.`
      : `You are ${formatDuration(Math.abs(comparisonDelta))} behind yesterday's pace.`;
  const scoreBand =
    productivityScore >= 80 ? 'High momentum' : productivityScore >= 55 ? 'Balanced' : 'Needs rhythm';
  const motivation = activeSession?.inactivityAlertOpen
    ? 'Focus slipped for a moment. Resume when you are ready.'
    : breakReminderOpen
      ? 'Time to recharge!'
      : activeSession && !activeSession.paused && breakProgress < 55
        ? 'Great focus!'
        : activeSession && !activeSession.paused
          ? 'Strong pace. Protect your energy for the next block.'
          : comparisonScoreDelta > 0
            ? 'You studied more effectively than yesterday.'
            : 'Build your next strong session.';

  function syncBackgroundMonitor(nextState: PersistedState) {
    const session = nextState.activeSession;
    window.moveSenseDesktop?.syncMonitor({
      sessionRunning: Boolean(session),
      sessionPaused: session?.paused ?? true,
      elapsedSeconds: getCurrentElapsedSeconds(session, Date.now()),
      inactivityThresholdSeconds: INACTIVITY_THRESHOLD_SECONDS,
      breakThresholdSeconds: BREAK_THRESHOLD_SECONDS,
      lastBreakReminderAt: session?.lastBreakReminderAt ?? 0,
      inactivityAlertOpen: session?.inactivityAlertOpen ?? false,
      breakReminderOpen,
      notificationsEnabled: nextState.settings.notificationsEnabled,
      soundEnabled: nextState.settings.soundEnabled
    });
  }

  useEffect(() => {
    syncBackgroundMonitor(appState);
  }, [appState, breakReminderOpen]);

  function startSession() {
    setAppState((current) => {
      if (current.activeSession && !current.activeSession.paused) {
        return current;
      }

      if (current.activeSession?.paused) {
        return {
          ...current,
          activeSession: {
            ...current.activeSession,
            paused: false,
            runStartedAt: new Date().toISOString(),
            pauseStartedAt: null,
            inactivityAlertOpen: false
          }
        };
      }

      return {
        ...current,
        activeSession: {
          id: crypto.randomUUID(),
          startedAt: new Date().toISOString(),
          runStartedAt: new Date().toISOString(),
          elapsedBeforePause: 0,
          paused: false,
          pauseStartedAt: null,
          breakCount: 0,
          idleEvents: 0,
          lastBreakReminderAt: 0,
          currentSuggestion: suggestionRotation[0],
          inactivityAlertOpen: false
        }
      };
    });
    setLastInteractionAt(Date.now());
  }

  function pauseSession() {
    setAppState((current) => {
      const session = current.activeSession;
      if (!session || session.paused) {
        return current;
      }

      const elapsed = getCurrentElapsedSeconds(session, Date.now());
      return {
        ...current,
        activeSession: {
          ...session,
          paused: true,
          runStartedAt: null,
          pauseStartedAt: new Date().toISOString(),
          elapsedBeforePause: elapsed
        }
      };
    });
  }

  function resetSession() {
    setAppState((current) => ({
      ...current,
      activeSession: null
    }));
    setBreakReminderOpen(false);
  }

  function finishSession() {
    setAppState((current) => {
      const session = current.activeSession;
      if (!session) {
        return current;
      }

      const finalElapsed = getCurrentElapsedSeconds(session, Date.now());
      return {
        ...current,
        dailyStudySeconds: current.dailyStudySeconds + finalElapsed,
        sessions: [...current.sessions, createSessionRecord(session, finalElapsed)],
        activeSession: null
      };
    });
    setBreakReminderOpen(false);
  }

  function acknowledgeBreak() {
    setAppState((current) => {
      const session = current.activeSession;
      if (!session) {
        return current;
      }

      const elapsed = getCurrentElapsedSeconds(session, Date.now());
      const currentIndex = Math.max(
        0,
        suggestionRotation.indexOf(
          session.currentSuggestion as (typeof suggestionRotation)[number]
        )
      );
      const nextSuggestion =
        suggestionRotation[(currentIndex + 1) % suggestionRotation.length];

      return {
        ...current,
        totalBreaks: current.totalBreaks + 1,
        activeSession: {
          ...session,
          breakCount: session.breakCount + 1,
          paused: true,
          runStartedAt: null,
          pauseStartedAt: new Date().toISOString(),
          elapsedBeforePause: elapsed,
          inactivityAlertOpen: false,
          currentSuggestion: nextSuggestion
        }
      };
    });
    setBreakReminderOpen(false);
  }

  function dismissBreakReminder() {
    setBreakReminderOpen(false);
  }

  function updateTheme(theme: ThemeMode) {
    setAppState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        theme
      }
    }));
  }

  function toggleSetting(key: 'notificationsEnabled' | 'soundEnabled') {
    setAppState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        [key]: !current.settings[key]
      }
    }));
  }

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="hero">
        <div className="hero-copy">
          <div className="topbar">
            <p className="hero__eyebrow">Adaptive focus workspace</p>
            <div className="theme-toggle">
              <button
                className={`theme-toggle__button ${
                  appState.settings.theme === 'dark' ? 'theme-toggle__button--active' : ''
                }`}
                onClick={() => updateTheme('dark')}
              >
                Dark
              </button>
              <button
                className={`theme-toggle__button ${
                  appState.settings.theme === 'light' ? 'theme-toggle__button--active' : ''
                }`}
                onClick={() => updateTheme('light')}
              >
                Light
              </button>
            </div>
          </div>
          <h1>Study deeply. Recover intelligently. Keep moving.</h1>
          <p className="hero__description">
            MoveSense now keeps watch in the background too, so break reminders and inactivity
            warnings can reach you through native desktop notifications even when the app is not
            frontmost.
          </p>
          <div className="hero-banner">
            <span className="hero-banner__tag">Motivation</span>
            <strong>{motivation}</strong>
            <p>{comparisonMessage}</p>
          </div>
        </div>

        <section className="session-console">
          <div className="session-console__label-row">
            <span className={`status-dot ${activeSession && !activeSession.paused ? 'status-dot--live' : ''}`} />
            <span>{activityStatus}</span>
            <span className="session-console__platform">
              {window.moveSenseDesktop?.platform === 'darwin'
                ? 'macOS desktop'
                : 'Windows-ready desktop'}
            </span>
          </div>

          <div className="session-console__timer">{formatDuration(liveElapsedSeconds)}</div>
          <p className="session-console__caption">Live elapsed study time</p>

          <div className="progress-block">
            <div className="progress-block__row">
              <span>Session progress to next break</span>
              <strong>{Math.round(breakProgress)}%</strong>
            </div>
            <div className="progress-bar">
              <div className="progress-bar__fill" style={{ width: `${breakProgress}%` }} />
            </div>
            <div className="progress-block__row progress-block__row--muted">
              <span>Next break</span>
              <strong>{formatDuration(nextBreakCountdown)}</strong>
            </div>
          </div>

          <div className="session-console__actions">
            <button
              className="btn btn--primary"
              onClick={startSession}
              disabled={Boolean(activeSession && !activeSession.paused)}
            >
              {activeSession ? (activeSession.paused ? 'Resume session' : 'Session running') : 'Start session'}
            </button>
            <button
              className="btn btn--secondary"
              onClick={pauseSession}
              disabled={!activeSession || activeSession.paused}
            >
              Pause
            </button>
            <button className="btn btn--ghost" onClick={finishSession} disabled={!activeSession}>
              Finish
            </button>
            <button className="btn btn--ghost" onClick={resetSession} disabled={!activeSession}>
              Reset
            </button>
          </div>

          <div className="session-console__microstats">
            <div>
              <span>Idle alert</span>
              <strong>{INACTIVITY_THRESHOLD_SECONDS}s threshold</strong>
            </div>
            <div>
              <span>Alert delivery</span>
              <strong>
                {appState.settings.notificationsEnabled
                  ? 'Background notifications on'
                  : 'In-app only'}
              </strong>
            </div>
          </div>
        </section>
      </header>

      <main className="dashboard-grid">
        <section className="stats-grid">
          <StatCard
            eyebrow="Total study time"
            value={formatDuration(dailyStudySeconds)}
            detail="Accumulated today across every completed and active session."
            accent="blue"
            icon={<span>01</span>}
          />
          <StatCard
            eyebrow="Breaks taken"
            value={String(appState.totalBreaks).padStart(2, '0')}
            detail="Acknowledged recovery moments to maintain long-session stamina."
            accent="teal"
            icon={<span>02</span>}
          />
          <StatCard
            eyebrow="Productivity score"
            value={`${productivityScore}%`}
            detail={`${scoreBand}. Study duration and break adherence are both factored in.`}
            accent="amber"
            icon={<span>03</span>}
          />
          <StatCard
            eyebrow="Activity alerts"
            value={String(totalIdleAlerts).padStart(2, '0')}
            detail="Times inactivity triggered a pause-and-resume checkpoint."
            accent="coral"
            icon={<span>04</span>}
          />
        </section>

        <section className="panel panel--wide">
          <div className="panel__header">
            <div>
              <p className="panel__eyebrow">Productivity visualization</p>
              <h2>Daily performance overview</h2>
            </div>
            <div className="panel__tag">{scoreBand}</div>
          </div>

          <div className="score-visual">
            <div className="score-ring">
              <div
                className="score-ring__fill"
                style={{ '--score': `${productivityScore}` } as CSSProperties}
              />
              <div className="score-ring__core">
                <strong>{productivityScore}%</strong>
                <span>Productivity</span>
              </div>
            </div>
            <div className="score-bars">
              <div className="score-bars__item">
                <span>Study depth</span>
                <div className="progress-bar progress-bar--compact">
                  <div
                    className="progress-bar__fill progress-bar__fill--blue"
                    style={{ width: `${Math.min((dailyStudySeconds / (4 * 3600)) * 100, 100)}%` }}
                  />
                </div>
              </div>
              <div className="score-bars__item">
                <span>Break adherence</span>
                <div className="progress-bar progress-bar--compact">
                  <div
                    className="progress-bar__fill progress-bar__fill--teal"
                    style={{
                      width: `${Math.min(
                        (appState.totalBreaks /
                          Math.max(1, Math.floor(dailyStudySeconds / BREAK_THRESHOLD_SECONDS))) *
                          100,
                        100
                      )}%`
                    }}
                  />
                </div>
              </div>
              <div className="score-bars__insight">{comparisonMessage}</div>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel__header">
            <div>
              <p className="panel__eyebrow">Alerts and theme</p>
              <h2>Experience settings</h2>
            </div>
          </div>
          <div className="settings-list">
            <button className="setting-row" onClick={() => toggleSetting('notificationsEnabled')}>
              <div>
                <strong>Desktop notifications</strong>
                <span>Show break and inactivity alerts when MoveSense is in the background.</span>
              </div>
              <span className={`toggle-pill ${appState.settings.notificationsEnabled ? 'toggle-pill--on' : ''}`}>
                {appState.settings.notificationsEnabled ? 'On' : 'Off'}
              </span>
            </button>
            <button className="setting-row" onClick={() => toggleSetting('soundEnabled')}>
              <div>
                <strong>Sound alerts</strong>
                <span>Play a soft chime for break reminders and inactivity warnings.</span>
              </div>
              <span className={`toggle-pill ${appState.settings.soundEnabled ? 'toggle-pill--on' : ''}`}>
                {appState.settings.soundEnabled ? 'On' : 'Off'}
              </span>
            </button>
          </div>
        </section>

        <section className="panel panel--wide">
          <div className="panel__header">
            <div>
              <p className="panel__eyebrow">Session timeline</p>
              <h2>Daily activity overview</h2>
            </div>
            <div className="panel__tag">Local persistence enabled</div>
          </div>
          <SessionTimeline sessions={todaySessions} />
        </section>

        <section className="panel">
          <div className="panel__header">
            <div>
              <p className="panel__eyebrow">Movement suggestions</p>
              <h2>Recommended break actions</h2>
            </div>
          </div>
          <SuggestionBoard activeSuggestion={currentSuggestion} />
        </section>

        <section className="panel">
          <div className="panel__header">
            <div>
              <p className="panel__eyebrow">Daily comparison</p>
              <h2>Yesterday vs today</h2>
            </div>
          </div>
          <div className="comparison-card">
            <strong>{yesterday ? motivation : 'Comparison builds after your first full day.'}</strong>
            <p>{comparisonMessage}</p>
            <div className="comparison-card__metrics">
              <div>
                <span>Study delta</span>
                <strong>{yesterday ? formatDuration(Math.abs(comparisonDelta)) : '--:--:--'}</strong>
              </div>
              <div>
                <span>Score delta</span>
                <strong>{yesterday ? `${comparisonScoreDelta >= 0 ? '+' : ''}${comparisonScoreDelta}%` : '--'}</strong>
              </div>
            </div>
          </div>
        </section>
      </main>

      {activeSession?.inactivityAlertOpen && (
        <OverlayModal
          title="Activity paused after inactivity"
          description="No mouse or keyboard input was detected for the configured threshold. This alert can also reach you as a native desktop notification while MoveSense is in the background."
          actions={
            <>
              <button className="btn btn--primary" onClick={startSession}>
                Resume session
              </button>
              <button className="btn btn--secondary" onClick={acknowledgeBreak}>
                Take a break
              </button>
            </>
          }
        />
      )}

      {breakReminderOpen && (
        <OverlayModal
          title="Time to recharge!"
          description="You have studied continuously for 45 minutes. A short reset now will improve retention, reduce strain, and help you keep a strong productivity score."
          actions={
            <>
              <button className="btn btn--primary" onClick={acknowledgeBreak}>
                Acknowledge break
              </button>
              <button className="btn btn--secondary" onClick={dismissBreakReminder}>
                Snooze for now
              </button>
            </>
          }
        />
      )}
    </div>
  );
}
