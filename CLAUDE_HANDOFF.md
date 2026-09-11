# ShortStack: Claude Handoff Documentation

Welcome, Claude! This document outlines the architecture, quirks, and current state of the ShortStack application to help you seamlessly take over the project for UI redesign and further feature development.

## 🏗️ Architecture Overview

ShortStack is a desktop application built with **Electron**, **React**, **Vite**, and **SQLite**. 

It uses a standard two-process architecture:
- **Main Process (Node.js)**: Handles backend tasks like SQLite database access, file system scanning, background scheduling, and the YouTube OAuth2/Upload API.
- **Renderer Process (React)**: The frontend UI. It communicates with the main process *exclusively* via an IPC bridge.

### Key Directories
- `src/main/`: All backend Node.js code (Database, IPC handlers, background scanners, YouTube APIs).
- `src/renderer/`: All frontend React code (Pages, Components, Hooks, CSS).
- `src/preload/`: The preload script that exposes the `window.api` bridge to the renderer.
- `src/shared/`: Shared types and constants (`types.ts` is the source of truth for all data models).

## 🔌 IPC Communication
The frontend cannot access the database or file system directly. It calls functions on `window.api`, which are intercepted by the `ipcMain` handlers in `src/main/ipc.ts`. 

> [!IMPORTANT]
> When adding new features that require backend access, you must:
> 1. Add the type definition to `window.api` in `src/preload/index.ts`.
> 2. Add the corresponding handler in `src/main/ipc.ts`.

## 🗄️ Database Quirks (Crucial)

We use `better-sqlite3`. There are a few strict rules to follow to prevent fatal crashes:

1. **No JavaScript Booleans**: SQLite hates `true` and `false`. The `setSetting` and `updateQueueItem` handlers have been modified to convert JS booleans to strings (e.g., `'true'`, `'false'`) before inserting them into the database, and they convert them back to booleans on read. **Always double-check type conversions when writing new database queries.**
2. **Snake Case vs Camel Case**: The database columns are strictly `snake_case` (e.g., `category_id`, `setup_complete`). The frontend React code generally expects `camelCase`, but to avoid massive conversion overhead, most of the frontend hooks have been updated to accept the raw `snake_case` properties returned from the backend. Stick to `snake_case` for any data properties passed through IPC.
3. **JSON Tags**: The `tags` column in the database stores a stringified JSON array. You must `JSON.parse()` it on the frontend before mapping over it, and `JSON.stringify()` it before sending it back to the backend.

## 🚀 The Uploader & Scheduler

- **File Scanner**: `src/main/files/scanner.ts` watches the user's selected folder for new `.mp4` files and adds them to the queue as `Pending`.
- **Scheduler**: `src/main/scheduler.ts` runs on a loop. It looks for items where `scheduled_for` is in the past AND `approved = 1`. 
- **Approval Gate**: Videos will **never** be uploaded automatically unless the user manually approves them. This is a hard safety gate.
- **YouTube API**: `src/main/youtube/uploader.ts` handles the actual chunked upload to Google's servers. 

> [!WARNING]
> Do **NOT** remove the manual approval gate in the scheduler unless specifically requested by the user, to prevent accidental channel spam.

## 🛠️ Build Process Caveat

The project uses `electron-builder`. On Windows, if Developer Mode is not enabled, the `winCodeSign` module will fail to create symbolic links at the very end of the `npm run package` command, causing the installer generation to crash.

**However**, the unpacked executable is successfully generated *before* this failure. 
You can always find the working compiled app at: `dist/win-unpacked/ShortStack.exe`. 
Do not waste time trying to fix the `winCodeSign` symlink error unless you have admin rights to change Windows developer settings.

## 🤖 Phase 2, 3, and 4 (The Marathon Sprint)

Subagent teams recently completed a massive architecture expansion. Claude, be aware of these new modules when redesigning the UI:

1. **Analytics Dashboard (`src/main/youtube/analytics.ts`)**: We implemented a `fetchChannelAnalytics` hook that queries the YouTube API v2 for the last 28 days of views, watch time, and subscriber growth. It is wired to `Analytics.tsx` via Recharts. 
2. **Local AI Engine (`src/main/ai/ollama.ts`)**: The app now integrates with **Ollama**. There is a `window.api.generateMetadata()` function that pings `localhost:11434` to auto-generate optimized titles and tags. The `MetadataEditor.tsx` has a new button to trigger this. Ensure this button looks amazing in your redesign.
3. **Multi-Platform Support**: The database `queue` table has been upgraded to support a `platforms` JSON string array. Stubs for TikTok and Instagram OAuth flows exist in `src/main/platforms/`. The user will inject their developer API keys into these files later. 
4. **Calendar View**: A basic CSS-grid Calendar layout was created in `src/renderer/pages/Calendar.tsx`. You will need to implement the actual JavaScript drag-and-drop logic for scheduling queued videos into specific days.
## ⚙️ How the App Works (Behavioral Spec)

Claude, use this spec to verify that your redesigned UI still executes the intended functionality properly.

1. **Folder Scanning & Ingestion**:
   - The user selects a specific folder during setup. This path is stored in the `shorts_folder` database setting.
   - The user can click a "Scan Folder" button (or trigger `window.api.scanFolder()`). The backend hashes every `.mp4` in that folder and inserts new unique videos into the `videos` table, and automatically stubs a corresponding row in the `queue` table (with status 'pending' and empty metadata).
2. **The Queue & AI Metadata**:
   - The `Queue.tsx` page displays all items. Items have 3 primary states: `Pending` (not approved), `Approved` (approved but not uploaded), and `Scheduled` (approved and given a future date).
   - In the `MetadataEditor.tsx`, the user can click "Auto-Generate with AI". This calls `window.api.generateMetadata(filename)`, which sends a prompt to a local Ollama daemon (`localhost:11434`) asking for a JSON object with a title, description, and tags. This JSON is parsed and populated into the UI inputs.
3. **Approval & Scheduling**:
   - The user manually tweaks the metadata and hits "Save".
   - The user clicks an "Approve" button, which flips `approved` to `1` in the database. 
   - *Optional:* The user can assign a `scheduled_for` ISO timestamp to the queue item (e.g., via the Calendar drag-and-drop).
4. **The Background Scheduler**:
   - `src/main/scheduler.ts` runs a `node-cron` job. Every time it ticks, it queries the database for exactly ONE item where `approved = 1` and `(scheduled_for IS NULL OR scheduled_for <= NOW())`. 
   - The scheduler state (paused vs running) is saved to the SQLite database `scheduler_paused` setting so it persists across reboots. If paused, the cron job skips execution.
5. **Uploading**:
   - If the scheduler finds an eligible video, it kicks off a chunked upload via `googleapis` (`youtube.videos.insert`).
   - The video status updates to `uploaded`, and an entry is created in the `uploads` history table.
   - A native desktop notification is fired upon success or failure.
6. **Analytics**:
   - The `Analytics.tsx` tab queries the YouTube API v2 (`fetchChannelAnalytics`) to retrieve 28-day channel metrics (views, estimated minutes watched, subscriber deltas) and displays them using Recharts.
## 🎨 Next Steps for Redesign

The user wants a complete UI/UX overhaul. 
1. Review `src/renderer/styles/globals.css` and `components.css`. 
2. The current UI uses a basic glassmorphism dark mode. You have full creative freedom to gut and replace the CSS, but ensure you maintain the underlying `window.api` hook connections in the components (`useQueue`, `useIPC`, etc.).
3. The Setup screen (`Setup.tsx`) is fully functional. Do not break the OAuth flow when redesigning it.
4. **Dynamic App Icon**: The user requested a feature where the app's icon dynamically swaps to match the currently connected YouTube channel's profile picture. Please wire this up!

Good luck!
