import './bootstrap/profile';
import { BrowserWindow, Notification, Tray, app, dialog, safeStorage } from 'electron';
import * as fs from 'fs/promises';
import { readFileSync } from 'fs';
import * as path from 'path';
import { runtimeProfile } from './bootstrap/profile';
import { getDb, initDatabase } from './db/appDatabase';
import { readSettings, writeSetting } from './db/settingsRepo';
import { broadcast, registerIpcHandlers } from './ipc';
import { createSchedulerEffects } from './scheduler/effects';
import { DraftWorker } from './ai/draftWorker';
import { UpdateService } from './updates/updateService';
import { buildInfo } from '../shared/buildInfo';
import { SchedulerEngine } from './scheduler/engine';
import { AuthService } from './youtube/authService';
import { DryRunYouTubeGateway, HttpYouTubeGateway, type YouTubeGateway } from './youtube/gateway';
import { uploadVideoResumable, type UploadOutcome } from './youtube/resumableUpload';
import { recordSpend } from './db/spendRepo';
import { TokenStore, type SecretStorage } from './youtube/tokenStore';
import { AppIcon } from './icons/appIcon';
import { handleMediaRequests, registerMediaScheme } from './media/mediaProtocol';
import { readActiveChannel } from './db/channelRepo';
import { applyStartWithWindows } from './startup';
import { createTray } from './tray';
import { createMainWindow } from './window';
import { ListeningService } from './listening/service';

let mainWindow: BrowserWindow | null = null;
let tray: (Tray & { refresh?(): void }) | null = null;
let engine: SchedulerEngine | null = null;
let draftWorker: DraftWorker | null = null;
let updates: UpdateService | null = null;
let updateTimer: ReturnType<typeof setInterval> | null = null;
let appIcon: AppIcon | null = null;
let isQuitting = false;

export const getMainWindow = (): BrowserWindow | null => mainWindow;

// Taken before the database is opened: a second copy must never run a second scheduler.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  registerMediaScheme();
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
    ? new HttpYouTubeGateway({ accessToken: () => auth.accessToken(), onSpend: (method, units) => recordSpend(db, method, units) })
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
    uploadVideo: uploadsAreLive
      ? (request, deps) => uploadVideoResumable(request, { ...deps, onSpend: (method, units) => recordSpend(db, method, units) })
      : refuseUpload,
    accessToken: () => auth.accessToken(),
    authState: () => auth.state(),
    uploadMethod: () => readSettings(db).settings.upload_method,
    // Was hardcoded null, which quietly disabled the whole of assisted-upload detection.
    uploadsPlaylistId: () => readActiveChannel(db)?.uploadsPlaylistId ?? null,
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
      refreshStatusBadge();
      // Through the same typed helper the IPC handlers use. Sending a raw channel name here is
      // how background work stopped reaching the screen: the renderer subscribes by exact name.
      broadcast(mainWindow, 'queue:changed');
      broadcast(mainWindow, 'scheduler:status');
    }
  });

  const thumbnailDir = path.join(app.getPath('userData'), 'thumbs');
  handleMediaRequests({ db, thumbnailDir });

  appIcon = new AppIcon({
    window: () => mainWindow,
    tray: () => tray,
    cacheDir: path.join(app.getPath('userData'), 'icons')
  });

  engine = new SchedulerEngine({
    db,
    effects,
    remind: (reminder) => {
      if (!Notification.isSupported()) return;
      const at = new Date(reminder.publishAt);
      const sameDay = at.toDateString() === new Date().toDateString();
      const when = at.toLocaleString([], sameDay ? { hour: "numeric", minute: "2-digit" } : { weekday: "long", hour: "numeric", minute: "2-digit" });
      const notice = new Notification({
        title: 'Time to upload in YouTube Studio',
        body: `“${reminder.title}” goes out at ${when}. ShortStack links it as soon as it appears on your channel.`
      });
      notice.on("click", showWindow);
      notice.show();
    }
  });
  // Listening lives beside the database, in the app's own folder, and only downloads what the person asks for.
  const listening = new ListeningService({
    db,
    root: path.join(app.getPath('userData'), 'listening'),
    onChange: () => broadcast(mainWindow, 'listening:changed')
  });
  draftWorker = new DraftWorker({
    db,
    draftDeps: {
      db,
      thumbnailDir,
      listPastUploads: (playlistId, options) => gateway.listPastUploads(playlistId, options),
      hear: (queueId) => listening.speechFor(queueId)
    },
    onChange: () => broadcast(mainWindow, 'queue:changed')
  });
  // Only loaded in a packaged build that has somewhere to look. Pointing electron-updater at a
  // repository nobody has created yet would have it fetching releases from whatever does sit at
  // that address, which is a worse outcome than having no updater at all.
  const publishTarget = (() => {
    try {
      const pkg = JSON.parse(readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf-8')) as {
        build?: { publish?: unknown };
      };
      const publish = pkg.build?.publish;
      return Array.isArray(publish) ? publish.length > 0 : publish != null;
    } catch {
      return false;
    }
  })();

  const autoUpdater =
    app.isPackaged && publishTarget
      ? (require('electron-updater') as { autoUpdater: import('./updates/updateService').AutoUpdater }).autoUpdater
      : undefined;

  updates = new UpdateService({
    channel: app.isPackaged ? 'release' : 'development',
    buildCommit: buildInfo().commit,
    // Where the source is, which only means anything on the machine it was built on.
    dev: { projectDir: app.isPackaged ? path.resolve(app.getAppPath(), '..', '..', '..') : app.getAppPath() },
    updater: autoUpdater,
    withoutUpdater: app.isPackaged
      ? 'This copy has no update source configured, so it cannot update itself.'
      : 'This build updates by rebuilding from source',
    onChange: (status) => broadcast(mainWindow, 'update:changed', status)
  });

  registerIpcHandlers({
    db,
    engine,
    auth,
    gateway,
    profile: { profile: runtimeProfile.profile, uploads: runtimeProfile.uploads },
    credentialsDir,
    thumbnailDir,
    listening,
    onSchedulerChanged: refreshStatusBadge,
    draftWorker,
    updates,
    getWindow: () => mainWindow,
    appIcon
  });

  mainWindow = createMainWindow({
    hideOnClose: () => readSettings(db).settings.close_to_tray,
    isQuitting: () => isQuitting,
    onFirstHideToTray: () => {
      if (readSettings(db).settings.close_to_tray_notice_shown) return;
      writeSetting(db, 'close_to_tray_notice_shown', true);
      new Notification({
        title: 'ShortStack is still running',
        body: 'It keeps the schedule from the tray. Quit from the tray menu to stop it entirely.'
      }).show();
    }
  });

  // Windows shutdown or sign-out arrives on the window, not the app: stop cleanly instead of
  // being killed mid-write.
  mainWindow.on('session-end', () => {
    isQuitting = true;
    engine?.stop();
    draftWorker?.stop();
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

  // The cached picture first, so a window that opens straight away is already wearing it, then a
  // fresh copy in the background. Channel data older than 30 days must not be kept, and refreshing
  // it on every launch is what keeps that true.
  void appIcon.restore().then(() => appIcon?.refresh(readActiveChannel(db)?.avatarUrl ?? null));

  // The stored preference and the operating system can drift: a reinstall, or someone removing the
  // entry by hand. Reconciling at launch keeps the switch honest.
  applyStartWithWindows(readSettings(db).settings.start_with_windows);

  engine.start();
  draftWorker.start();

  // Once at startup and then rarely. Nothing downloads by itself, so this only ever changes what a
  // banner says.
  void updates.check();
  updateTimer = setInterval(() => void updates?.check(), 6 * 60 * 60_000);
  if (typeof updateTimer.unref === 'function') updateTimer.unref();
  refreshStatusBadge();
  console.info(`[ShortStack] started (uploads ${runtimeProfile.uploads})`);
}

/** Keeps the taskbar badge in step with what the scheduler is doing. */
function refreshStatusBadge(): void {
  const status = engine?.status();
  if (status === undefined) return;
  appIcon?.setStatus({
    paused: status.paused,
    needsAttention: (status.counts.needs_attention ?? 0) > 0 || status.auth !== 'ok'
  });
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
  draftWorker?.stop();
  if (updateTimer !== null) clearInterval(updateTimer);
});


app.on('window-all-closed', () => {
  // The app lives in the tray so the schedule keeps running; quitting is explicit.
  if (process.platform !== 'darwin' && isQuitting) app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && mainWindow === null) void start();
});
