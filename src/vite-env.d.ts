/// <reference types="vite/client" />

declare global {
  interface Window {
    moveSenseDesktop?: {
      platform: string;
      syncMonitor: (payload: {
        sessionRunning: boolean;
        sessionPaused: boolean;
        elapsedSeconds: number;
        inactivityThresholdSeconds: number;
        breakThresholdSeconds: number;
        lastBreakReminderAt: number;
        inactivityAlertOpen: boolean;
        breakReminderOpen: boolean;
        notificationsEnabled: boolean;
        soundEnabled: boolean;
      }) => void;
      setTheme: (theme: 'dark' | 'light') => void;
      onBreakAlert: (
        callback: (payload: { elapsedSeconds: number }) => void
      ) => () => void;
      onInactivityAlert: (
        callback: (payload: { idleSeconds: number }) => void
      ) => () => void;
    };
  }
}

export {};
