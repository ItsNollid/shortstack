import './bootstrap/profile';
import { BrowserWindow, Tray, app, dialog, safeStorage } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { runtimeProfile } from './bootstrap/profile';
import { getDb, initDatabase } from './database';
import { readSettings } from './db/settingsRepo';
import { registerIpcHandlers } from './ipc';
import { createSchedulerEffects } from './scheduler/effects';
import { SchedulerEngine } from './scheduler/engine';
import { AuthService } from './youtube/authService';
import { DryRunYouTubeGateway, HttpYouTubeGateway, type YouTubeGateway } from './youtube/gateway';
import { uploadVideoResumable, type UploadOutcome } from './youtube/resumableUpload';
import { TokenStore, type SecretStorage } from './youtube/tokenStore';
import { createTray } from './tray';
import { createMainWindow } from './window';

let mainWindow: BrowserWindow | null = null;
let tray: (Tray & { refresh?(): void }) | null = null;
let engine: SchedulerEngine | null = null;
let isQuitting = false;

export const getMainWindow = (): BrowserWindow | null => mainWindow;

// Taken before the database is opened: a second copy must never run a second scheduler.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.setAppUserModelId(app.isPackaged ? 'com.shortstack.app' : process.execPath);
  app.whenReady().then(start).catch(failToStart);
}

function showWindow(): void {
  if (mainWindow === null) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function failToStart(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[ShortStack] failed to start', error);
  dialog.showErrorBox('ShortStack could not start', message);
  app.exit(1);
}

async function start(): Promise<void> {
  initDatabase();
  const db = getDb();

  const credentialsDir = path.join(app.getPath('userData'), 'credentials');
  const secrets: SecretStorage = {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (plain) => safeStorage.encryptString(plain),
    decrypt: (cipher) => safeStorage.decryptString(cipher)
  };
  const auth = new AuthService({
    store: new TokenStore(
      path.join(credentialsDir, 'tokens.enc'),
      secrets,
      path.join(credentialsDir, 'tokens.json') // written in the clear by the previous build
    ),
    clientSecretFile: path.join(credentialsDir, 'client_secret.json')
  });

  const uploadsAreLive = runtimeProfile.uploads === 'live';
  const gateway: YouTubeGateway = uploadsAreLive
    ? new HttpYouTubeGateway({ accessToken: () => auth.accessToken() })
    : new DryRunYouTubeGateway();

  const refuseUpload = async (): Promise<UploadOutcome> => ({
    status: 'failed',
    retryable: false,
    error: 'ShortStack is running in dry-run mode, so nothing is uploaded',
    code: 'dry_run'
  });

  const effects = createSchedulerEffects({
    db,
    gateway,
    uploadVideo: uploadsAreLive ? uploadVideoResumable : refuseUpload,
    accessToken: () => auth.accessToken(),
    authState: () => auth.state(),
    uploadMethod: () => readSettings(db).settings.upload_method,
    uploadsPlaylistId: () => null,
    maxAttempts: () => readSettings(db).settings.auto_retry_max,
    statFile: async (filePath) => {
      try {
        const stats = await fs.stat(filePath);
        return { size: stats.size };
      } catch {
        return null;
      }
    },
    now: () => new Date(),
    onChange: () => {
      tray?.refresh?.();
      mainWindow?.webContents.send('app:queueChanged');
    }
  });

  engine = new SchedulerEngine({ db, effects });
  registerIpcHandlers();

  mainWindow = createMainWindow({
    hideOnClose: () => readSettings(db).settings.close_to_tray,
    isQuitting: () => isQuitting
  });

  // Windows shutdown or sign-out arrives on the window, not the app: stop cleanly instead of
  // being killed mid-write.
  mainWindow.on('session-end', () => {
    isQuitting = true;
    engine?.stop();
  });

  tray = createTray({
    showWindow,
    quit: () => {
      isQuitting = true;
      app.quit();
    },
    isPaused: () => engine?.isPaused() ?? true,
    setPaused: (paused) => {
      if (paused) engine?.pause();
      else engine?.resume();
    },
    describeStatus: () => describeStatus()
  });

  engine.start();
  console.info(`[ShortStack] started (uploads ${runtimeProfile.uploads})`);
}

function describeStatus(): string {
  const status = engine?.status();
  if (status === undefined) return 'starting up';
  if (status.paused) return 'uploads paused';
  const waiting = (status.counts.pending ?? 0) + (status.counts.approved ?? 0);
  const next = status.nextPublishAt === null ? 'nothing scheduled' : `next at ${new Date(status.nextPublishAt).toLocaleString()}`;
  return `${waiting} waiting, ${next}`;
}

app.on('before-quit', () => {
  isQuitting = true;
  engine?.stop();
});


app.on('window-all-closed', () => {
  // The app lives in the tray so the schedule keeps running; quitting is explicit.
  if (process.platform !== 'darwin' && isQuitting) app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && mainWindow === null) void start();
});
