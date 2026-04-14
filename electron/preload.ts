import { contextBridge, ipcRenderer } from 'electron';

type MonitorPayload = {
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
};

contextBridge.exposeInMainWorld('moveSenseDesktop', {
  platform: process.platform,
  syncMonitor: (payload: MonitorPayload) => ipcRenderer.send('session-monitor:update', payload),
  setTheme: (theme: 'dark' | 'light') => ipcRenderer.send('theme:set', theme),
  onBreakAlert: (callback: (payload: { elapsedSeconds: number }) => void) => {
    const listener = (_event: unknown, payload: { elapsedSeconds: number }) => callback(payload);
    ipcRenderer.on('monitor:break', listener);
    return () => ipcRenderer.removeListener('monitor:break', listener);
  },
  onInactivityAlert: (callback: (payload: { idleSeconds: number }) => void) => {
    const listener = (_event: unknown, payload: { idleSeconds: number }) => callback(payload);
    ipcRenderer.on('monitor:inactivity', listener);
    return () => ipcRenderer.removeListener('monitor:inactivity', listener);
  }
});
