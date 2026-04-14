import {
  app,
  BrowserWindow,
  Notification,
  ipcMain,
  nativeTheme,
  powerMonitor
} from 'electron';
import path from 'node:path';

const isDev = !app.isPackaged;

type MonitorState = {
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

let mainWindow: BrowserWindow | null = null;
let monitorState: MonitorState = {
  sessionRunning: false,
  sessionPaused: true,
  elapsedSeconds: 0,
  inactivityThresholdSeconds: 60,
  breakThresholdSeconds: 45 * 60,
  lastBreakReminderAt: 0,
  inactivityAlertOpen: false,
  breakReminderOpen: false,
  notificationsEnabled: true,
  soundEnabled: true
};
let lastInactivityNotifiedFor = 0;
let lastBreakNotifiedFor = 0;

function bringWindowToFront() {
  if (!mainWindow) {
    return;
  }

  if (process.platform === 'darwin') {
    app.show();
    app.dock?.show();
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }

  mainWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true
  });
  mainWindow.moveTop();
  mainWindow.show();
  mainWindow.flashFrame(true);
  mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
  mainWindow.focus();
  app.focus({ steal: true });

  setTimeout(() => {
    mainWindow?.setAlwaysOnTop(false);
    mainWindow?.setVisibleOnAllWorkspaces(false);
    mainWindow?.flashFrame(false);
  }, 1500);
}

function shouldShowBackgroundNotification() {
  if (!mainWindow) {
    return false;
  }

  return !mainWindow.isFocused() || mainWindow.isMinimized() || !mainWindow.isVisible();
}

function notifyUser(title: string, body: string) {
  if (!monitorState.notificationsEnabled || !Notification.isSupported()) {
    return;
  }

  const notification = new Notification({
    title,
    body,
    silent: !monitorState.soundEnabled
  });

  notification.on('click', () => {
    bringWindowToFront();
  });

  notification.show();

  if (process.platform === 'win32' && mainWindow) {
    mainWindow.flashFrame(true);
    setTimeout(() => mainWindow?.flashFrame(false), 1500);
  }
}

function syncWindowMonitor(channel: 'monitor:break' | 'monitor:inactivity', payload: object) {
  if (!mainWindow) {
    return;
  }

  mainWindow.webContents.send(channel, payload);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#0d1b24',
    titleBarStyle: 'hiddenInset',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (isDev) {
    void mainWindow.loadURL('http://localhost:5173');
  } else {
    void mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'));
  }
}

function beginMonitorLoop() {
  setInterval(() => {
    if (!mainWindow || !monitorState.sessionRunning || monitorState.sessionPaused) {
      return;
    }

    const idleSeconds = powerMonitor.getSystemIdleTime();

    if (
      shouldShowBackgroundNotification() &&
      idleSeconds >= monitorState.inactivityThresholdSeconds &&
      !monitorState.inactivityAlertOpen &&
      lastInactivityNotifiedFor !== monitorState.elapsedSeconds
    ) {
      lastInactivityNotifiedFor = monitorState.elapsedSeconds;
      syncWindowMonitor('monitor:inactivity', { idleSeconds });
      bringWindowToFront();
      notifyUser(
        'MoveSense paused your study session',
        'No keyboard or mouse activity was detected. Resume when you are back.'
      );
    }

    const nextBreakAt = monitorState.lastBreakReminderAt + monitorState.breakThresholdSeconds;
    if (
      shouldShowBackgroundNotification() &&
      monitorState.elapsedSeconds >= nextBreakAt &&
      !monitorState.breakReminderOpen &&
      lastBreakNotifiedFor < nextBreakAt
    ) {
      lastBreakNotifiedFor = nextBreakAt;
      syncWindowMonitor('monitor:break', { elapsedSeconds: monitorState.elapsedSeconds });
      bringWindowToFront();
      notifyUser(
        'MoveSense break reminder',
        'You reached your focus threshold. It is a good time to stretch, walk, or stand.'
      );
    }
  }, 5000);
}

app.whenReady().then(() => {
  createWindow();
  beginMonitorLoop();

  ipcMain.on('session-monitor:update', (_event, nextState: MonitorState) => {
    monitorState = nextState;

    if (!nextState.sessionRunning || nextState.sessionPaused) {
      lastInactivityNotifiedFor = 0;
    }

    if (!nextState.sessionRunning || nextState.elapsedSeconds < nextState.breakThresholdSeconds) {
      lastBreakNotifiedFor = 0;
    }
  });

  ipcMain.on('theme:set', (_event, theme: 'light' | 'dark') => {
    nativeTheme.themeSource = theme;
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
