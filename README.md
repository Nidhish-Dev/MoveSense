# MoveSense

MoveSense is a desktop productivity companion built with React, Electron, and TypeScript for macOS and Windows. It helps users track study sessions, detect inactivity, encourage healthier break habits, and review daily focus performance in a polished desktop interface.

## Features

- Start, pause, reset, resume, and finish study sessions
- Live study timer with `HH:MM:SS` display
- Daily total study tracking
- Inactivity detection using keyboard and mouse activity
- Smart break reminders after long continuous focus sessions
- Native desktop alerts when the app is in the background
- Automatic app popup on inactivity or break alerts
- Movement suggestions such as stretching, walking, and standing
- Productivity score and visual progress indicators
- Motivational feedback messages
- Optional sound alerts
- Light and dark theme toggle with saved preference
- Daily comparison insights versus previous study performance
- Persistent local data using `localStorage`

## Tech Stack

- React
- Electron
- TypeScript
- Vite
- electron-builder

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Run in development

```bash
npm run dev
```

This starts the Vite renderer and launches the Electron desktop window.

## Build and Package

### Build everything

```bash
npm run build
```

### Package for macOS

```bash
npm run package:mac
```

### Package for Windows

```bash
npm run package:win
```

Packaged output is generated in the `release/` folder.

## Project Structure

```text
electron/              Electron main and preload process
src/                   React app source
src/components/        UI components
src/hooks/             Reusable hooks
src/lib/               Storage and time utilities
dist/                  Renderer build output
dist-electron/         Electron build output
release/               Packaged application artifacts
```

## How Background Alerts Work

MoveSense keeps the Electron process aware of session state. If the app is running in the background and inactivity or break conditions are met, it can:

- trigger a native desktop notification
- play a sound alert if enabled
- bring the MoveSense window to the front

This helps ensure the user notices inactivity warnings even while working in another application.

## Data Persistence

MoveSense stores session history, settings, and daily insights in browser `localStorage`. This allows the app to preserve state across reloads without requiring a backend.

## Notes

- macOS packaging may require code signing for full distribution-ready behavior.
- Windows packaging is configured through Electron Builder and is best generated on a Windows machine or CI environment.

## License

MIT
