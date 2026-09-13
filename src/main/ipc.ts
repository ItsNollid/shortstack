// Typed IPC handlers. Every argument is validated here: the renderer is the least trusted part
// of the app, and the previous version let it choose SQL column names.
import type Database from 'better-sqlite3';
import { BrowserWindow, app, clipboard, dialog, ipcMain, shell } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { findModel } from '../shared/aiModels';
import type { AppEvent, AppInfo, AuthStatus, Result, ShortStackApi } from '../shared/ipc';
import { parseVideoId } from '../shared/youtubeUrl';
import { generateMetadata, listModels, testModel } from './ai/ollamaClient';
import { listActivity } from './db/activityRepo';
import { clearChannels, readActiveChannel, upsertChannel } from './db/channelRepo';
import { applyQueueEvent, getQueueItem, listQueueItems, updateQueueMetadata } from './db/queueRepo';
import { readSettings, writeSetting } from './db/settingsRepo';
import { listUploads } from './db/uploadRepo';
import type { QueueEvent } from './domain/queueState';
import { scanFolder } from './files/scanner';
import type { SchedulerEngine } from './scheduler/engine';
import { createPosting, markPublishedBefore, setRotationPaused } from './db/rotationRepo';
import { draftFor } from './ai/draft';
import { buildInsightPrompt, sanitizeAdvice } from './ai/insightPrompt';
import { buildBrief } from '../shared/insights';
import { adviseWith } from './ai/advise';
import type { UpdateService } from './updates/updateService';
import { saveFrames, readFrames } from './media/frames';
import { clearThumbnails, missingThumbnails, readThumbnail, saveThumbnail } from './media/thumbnails';
import { applyStartWithWindows } from './startup';
import type { AuthService } from './youtube/authService';
import type { YouTubeGateway } from './youtube/gateway';
import { awaitAuthorizationCode } from './youtube/loopbackServer';
import { REQUIRED_SCOPES, buildAuthUrl, parseClientSecret } from './youtube/oauthFlow';

export interface IpcContext {
  db: Database.Database;
  engine: SchedulerEngine;
  auth: AuthService;
  gateway: YouTubeGateway;
  profile: { profile: 'dev' | 'live'; uploads: 'dry-run' | 'live' };
  credentialsDir: string;
  /** Where poster frames are cached. */
  thumbnailDir: string;
  /** Called when the scheduler is paused or resumed, so the taskbar badge can follow. */
  onSchedulerChanged?(): void;
  /** Nudged after a scan or a settings change, so drafting starts now rather than on the next tick. */
  draftWorker?: { kick(): void };
  updates: UpdateService;
  getWindow(): BrowserWindow | null;
  /** The app's icon follows the connected channel's picture. */
  appIcon: { refresh(avatarUrl: string | null): Promise<boolean>; clear(): Promise<void> };
}

type Handlers = { [K in Exclude<keyof ShortStackApi, 'on'>]: ShortStackApi[K] };

const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const fail = (code: string, message: string): Result<never> => ({ ok: false, error: { code, message } });

const asId = (value: unknown): number | null => (typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null);
const asIds = (value: unknown): number[] | null => {
  if (!Array.isArray(value) || value.length === 0 || value.length > 500) return null;
  const ids = value.map(asId);
  return ids.every((id): id is number => id !== null) ? ids : null;
};

export function broadcast(window: BrowserWindow | null, event: AppEvent, payload?: unknown): void {
  window?.webContents.send(event, payload ?? null);
}

export function registerIpcHandlers(context: IpcContext): void {
  const { db, engine, auth } = context;
  const eventContext = () => ({ now: new Date(), uploadMethod: readSettings(db).settings.upload_method });
  const changed = () => {
    broadcast(context.getWindow(), 'queue:changed');
    context.draftWorker?.kick();
  };

  /** Rotation belongs to the video, but the user selects postings. */
  const videoIdsFor = (queueIds: readonly number[]): number[] => {
    const rows = db
      .prepare(`SELECT DISTINCT video_id FROM queue WHERE id IN (${queueIds.map(() => '?').join(',')})`)
      .all(...queueIds) as Array<{ video_id: number }>;
    return rows.map((row) => row.video_id);
  };
  const draftDeps = {
    db,
    thumbnailDir: context.thumbnailDir,
    listPastUploads: (playlistId: string, options: { limit: number }) => context.gateway.listPastUploads(playlistId, options)
  };
  let signInAbort: AbortController | null = null;

  /** Fetches the channel behind the stored grant and records it. Returns why not, if it failed. */
  const captureChannel = async (): Promise<string | null> => {
    const profile = await context.gateway.fetchChannelProfile();
    if (!profile.ok) return profile.reason;
    upsertChannel(
      db,
      {
        id: profile.value.id,
        title: profile.value.title,
        handle: profile.value.handle,
        avatarUrl: profile.value.avatarUrl,
        subscriberCount: profile.value.subscriberCount,
        uploadsPlaylistId: profile.value.uploadsPlaylistId
      },
      new Date()
    );
    void context.appIcon.refresh(profile.value.avatarUrl);
    return null;
  };

  const applyToMany = (ids: number[], event: QueueEvent) => {
    const updated = [];
    let firstReason: string | null = null;
    for (const id of ids) {
      const result = applyQueueEvent(db, id, event, eventContext());
      if (result.ok) updated.push(result.item);
      else firstReason ??= result.reason;
    }
    if (updated.length === 0) return fail('refused', firstReason ?? 'Nothing to do');
    changed();
    void engine.kick();
    return ok(updated);
  };

  const applyToOne = (id: unknown, event: QueueEvent) => {
    const parsed = asId(id);
    if (parsed === null) return fail('invalid', 'That video id is not valid');
    const result = applyQueueEvent(db, parsed, event, eventContext());
    if (!result.ok) return fail('refused', result.reason);
    changed();
    void engine.kick();
    return ok(result.item);
  };

  const authStatus = async (): Promise<AuthStatus> => {
    const channel = readActiveChannel(db);
    return {
      state: auth.state(),
      hasClientSecret: auth.clientSecret() !== null,
      tokensEncrypted: auth.tokensEncrypted(),
      missingScopes: auth.missingScopes(),
      channel:
        channel === null
          ? null
          : {
              id: channel.id,
              title: channel.title,
              handle: channel.handle,
              avatarUrl: channel.avatarUrl,
              subscriberCount: channel.subscriberCount
            }
    };
  };

  const handlers: Handlers = {
    appInfo: async (): Promise<AppInfo> => ({
      profile: context.profile.profile,
      uploads: context.profile.uploads,
      version: app.getVersion(),
      platform: process.platform
    }),

    queueList: async () => ok(listQueueItems(db)),
    queueGet: async (id) => {
      const parsed = asId(id);
      if (parsed === null) return fail('invalid', 'That video id is not valid');
      const item = getQueueItem(db, parsed);
      return item === undefined ? fail('not_found', 'That video is no longer in the queue') : ok(item);
    },
    queueUpdateMetadata: async (id, patch, expectedUpdatedAt) => {
      const parsed = asId(id);
      if (parsed === null) return fail('invalid', 'That video id is not valid');
      if (typeof patch !== 'object' || patch === null) return fail('invalid', 'Nothing to change');
      const result = updateQueueMetadata(db, parsed, patch, { ...eventContext(), expectedUpdatedAt });
      if (!result.ok) return fail('refused', result.reason);
      changed();
      return ok(result.item);
    },
    queueApprove: async (ids) => {
      const parsed = asIds(ids);
      return parsed === null ? fail('invalid', 'No videos selected') : applyToMany(parsed, { type: 'approve' });
    },
    queueUnapprove: async (ids) => {
      const parsed = asIds(ids);
      return parsed === null ? fail('invalid', 'No videos selected') : applyToMany(parsed, { type: 'unapprove' });
    },
    queueReject: async (ids) => {
      const parsed = asIds(ids);
      return parsed === null ? fail('invalid', 'No videos selected') : applyToMany(parsed, { type: 'reject' });
    },
    queueRestore: async (ids) => {
      const parsed = asIds(ids);
      return parsed === null ? fail('invalid', 'No videos selected') : applyToMany(parsed, { type: 'restore' });
    },
    queueSchedule: async (id, publishAt) => {
      if (typeof publishAt !== 'string' || !Number.isFinite(Date.parse(publishAt))) return fail('invalid', 'That is not a valid time');
      return applyToOne(id, { type: 'schedule', at: publishAt });
    },
    queueHold: async (id) => applyToOne(id, { type: 'hold' }),
    queueCancelUpload: async (id) => applyToOne(id, { type: 'upload_cancelled' }),
    queueLinkVideo: async (id, urlOrId) => {
      const videoId = typeof urlOrId === 'string' ? parseVideoId(urlOrId) : null;
      return videoId === null
        ? fail('invalid', 'That does not look like a YouTube video link')
        : applyToOne(id, { type: 'link_video', videoId });
    },
    queueResolveAttention: async (id) => applyToOne(id, { type: 'resolve_attention' }),
    queueConfirmNotDuplicate: async (id) => applyToOne(id, { type: 'confirm_not_duplicate' }),

    rotationMarkPublishedBefore: async (ids, publishedBefore) => {
      const parsed = asIds(ids);
      if (parsed === null) return fail('invalid', 'Pick at least one video');
      if (typeof publishedBefore !== 'boolean') return fail('invalid', 'Expected on or off');
      const updated = markPublishedBefore(db, videoIdsFor(parsed), publishedBefore, new Date());
      if (updated > 0) changed();
      return ok(updated);
    },

    rotationSetPaused: async (ids, paused) => {
      const parsed = asIds(ids);
      if (parsed === null) return fail('invalid', 'Pick at least one video');
      if (typeof paused !== 'boolean') return fail('invalid', 'Expected on or off');
      const updated = setRotationPaused(db, videoIdsFor(parsed), paused, new Date());
      if (updated > 0) changed();
      return ok(updated);
    },

    rotationPostAgain: async (ids) => {
      const parsed = asIds(ids);
      if (parsed === null) return fail('invalid', 'Pick at least one video');
      const { settings } = readSettings(db);
      const now = new Date();
      let created = 0;
      let firstProblem: string | null = null;
      for (const videoId of videoIdsFor(parsed)) {
        const result = createPosting(
          db,
          videoId,
          { notifyOnNew: settings.notify_subscribers, maxPostings: settings.rotation_max_postings, force: true },
          now
        );
        if (result.ok) created += 1;
        else if (firstProblem === null) firstProblem = result.reason;
      }
      if (created === 0) return fail('refused', firstProblem ?? 'Nothing could be posted again');
      changed();
      void engine.kick();
      return ok(created);
    },

    thumbnailsMissing: async () => ok(await missingThumbnails({ db, dir: context.thumbnailDir })),

    thumbnailSave: async (queueId, png) => {
      const parsed = asId(queueId);
      if (parsed === null) return fail('invalid', 'That video id is not valid');
      if (!(png instanceof Uint8Array)) return fail('invalid', 'Expected image bytes');
      const saved = await saveThumbnail({ db, dir: context.thumbnailDir }, parsed, Buffer.from(png));
      return saved.ok ? ok(null) : fail('refused', saved.reason);
    },

    framesSave: async (queueId, frames) => {
      const parsed = asId(queueId);
      if (parsed === null) return fail('invalid', 'That video id is not valid');
      if (!Array.isArray(frames) || frames.some((frame) => !(frame instanceof Uint8Array))) {
        return fail('invalid', 'Expected image bytes');
      }
      const saved = await saveFrames({ db, dir: context.thumbnailDir }, parsed, frames.map((frame) => Buffer.from(frame)));
      return saved.ok ? ok(null) : fail('refused', saved.reason);
    },

    videosScan: async () => {
      const summary = await scanFolder(db);
      changed();
      void engine.kick();
      return ok(summary);
    },

    settingsGetAll: async () => ok(readSettings(db).settings),
    settingsSet: async (key, value) => {
      if (typeof key !== 'string') return fail('invalid', 'Unknown setting');
      const result = writeSetting(db, key, value);
      if (!result.ok) return fail('refused', result.reason);
      // Settings that mean something to the operating system have to be told to it.
      if (key === 'start_with_windows') applyStartWithWindows(result.settings.start_with_windows);
      if (key === 'ai_auto_draft' || key === 'ai_model' || key === 'ai_host') context.draftWorker?.kick();
      void engine.kick();
      return ok(result.settings);
    },

    schedulerStatus: async () => ok(engine.status()),
    schedulerPause: async () => {
      engine.pause();
      context.onSchedulerChanged?.();
      broadcast(context.getWindow(), 'scheduler:status');
      return ok(engine.status());
    },
    schedulerResume: async () => {
      engine.resume();
      context.onSchedulerChanged?.();
      broadcast(context.getWindow(), 'scheduler:status');
      return ok(engine.status());
    },

    analyticsGet: async (days) => {
      const window = typeof days === 'number' && Number.isFinite(days) ? Math.min(365, Math.max(1, Math.round(days))) : 28;
      const result = await context.gateway.fetchChannelAnalytics(window);
      if (!result.ok) return fail(result.code ?? 'analytics_failed', result.reason);
      return ok(result.value);
    },
    pastUploadsList: async (pageToken) => {
      const channel = readActiveChannel(db);
      if (channel === null) return fail('not_connected', 'Connect a channel first');
      if (channel.uploadsPlaylistId === null) {
        return fail('no_playlist', 'ShortStack does not know where your uploads live yet. Reconnect to pick it up.');
      }
      if (pageToken !== undefined && typeof pageToken !== 'string') return fail('invalid', 'Bad page token');

      const result = await context.gateway.listPastUploads(channel.uploadsPlaylistId, { pageToken });
      return result.ok ? ok(result.value) : fail(result.code ?? 'uploads_failed', result.reason);
    },

    uploadsList: async () => ok(listUploads(db)),
    activityList: async (queueId) => {
      if (queueId === undefined) return ok(listActivity(db));
      const parsed = asId(queueId);
      if (parsed === null) return fail('invalid', 'That video id is not valid');
      return ok(listActivity(db, { queueId: parsed }));
    },

    authStatus: async () => ok(await authStatus()),
    authCancel: async () => {
      signInAbort?.abort();
      signInAbort = null;
      return ok(null);
    },
    authConnect: async () => {
      const secret = auth.clientSecret();
      if (secret === null) return fail('no_client_secret', 'Add your Google client secret first');

      signInAbort?.abort();
      signInAbort = new AbortController();
      const code = await awaitAuthorizationCode({
        signal: signInAbort.signal,
        makeAuthUrl: (redirectUri, state, challenge) =>
          buildAuthUrl({ clientId: secret.clientId, redirectUri, scopes: REQUIRED_SCOPES, state, challenge }),
        openBrowser: (url) => void shell.openExternal(url)
      });
      signInAbort = null;
      if (!code.ok) return fail(code.cancelled ? 'cancelled' : 'sign_in_failed', code.reason);

      const exchanged = await auth.exchangeCode(code.code, code.verifier, code.redirectUri);
      if (!exchanged.ok) return fail('sign_in_failed', exchanged.reason);

      // The sign-in itself succeeded, so this still returns ok: the grant is stored and the user
      // should not be told to try again. But a failure here is why the app would otherwise know it
      // is signed in without knowing whose channel it is holding, so it is said out loud.
      const channelProblem = await captureChannel();
      if (channelProblem !== null) console.warn('[ShortStack] signed in, but reading the channel failed:', channelProblem);
      broadcast(context.getWindow(), 'auth:changed');
      void engine.kick();
      return ok(await authStatus());
    },
    authDisconnect: async () => {
      await auth.disconnect();
      // Stored channel data goes when access is revoked, as the API policies require. The cached
      // channel picture is part of that, so the icon goes back to the ShortStack mark here.
      clearChannels(db);
      await context.appIcon.clear();
      // Poster frames are drawn from the user's own videos, so they go with the rest of it.
      await clearThumbnails(context.thumbnailDir);
      for (const item of listQueueItems(db)) {
        if (item.youtube_video_id !== null) applyQueueEvent(db, item.id, { type: 'disconnect' }, eventContext());
      }
      broadcast(context.getWindow(), 'auth:changed');
      changed();
      return ok(await authStatus());
    },
    authImportClientSecret: async () => {
      const window = context.getWindow();
      const picked =
        window === null
          ? await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Client secret', extensions: ['json'] }] })
          : await dialog.showOpenDialog(window, {
              title: 'Choose your Google client secret',
              filters: [{ name: 'Client secret', extensions: ['json'] }],
              properties: ['openFile']
            });
      if (picked.canceled || picked.filePaths.length === 0) return ok(await authStatus());

      const contents = await fs.readFile(picked.filePaths[0], 'utf8');
      const parsed = parseClientSecret(contents);
      if (!parsed.ok) return fail('invalid_client_secret', parsed.reason);

      await fs.mkdir(context.credentialsDir, { recursive: true });
      await fs.writeFile(path.join(context.credentialsDir, 'client_secret.json'), contents, { mode: 0o600 });
      broadcast(context.getWindow(), 'auth:changed');
      return ok(await authStatus());
    },

    authRefreshChannel: async () => {
      if (auth.state() !== 'ok') return fail('not_connected', 'Connect a channel first');
      const problem = await captureChannel();
      if (problem !== null) return fail('channel_unavailable', problem);
      broadcast(context.getWindow(), 'auth:changed');
      return ok(await authStatus());
    },

    aiStatus: async () => {
      const { settings } = readSettings(db);
      const models = await listModels({ host: settings.ai_host });
      return models.ok
        ? ok({ running: true, models: models.value, message: `${models.value.length} model${models.value.length === 1 ? '' : 's'} available` })
        : ok({ running: models.code !== 'not_running', models: [], message: models.reason });
    },
    insightsGet: async (days) => {
      const window = Number(days);
      if (!Number.isFinite(window) || window < 1) return fail('invalid', 'That range is not valid');
      const stats = await context.gateway.fetchVideoPerformance(window);
      if (!stats.ok) return fail(stats.code ?? 'error', stats.reason);
      return ok(buildBrief(stats.value));
    },

    insightsAdvise: async (days) => {
      const window = Number(days);
      if (!Number.isFinite(window) || window < 1) return fail('invalid', 'That range is not valid');
      const stats = await context.gateway.fetchVideoPerformance(window);
      if (!stats.ok) return fail(stats.code ?? 'error', stats.reason);

      const { settings } = readSettings(db);
      const channel = readActiveChannel(db);
      const prompt = buildInsightPrompt({
        brief: buildBrief(stats.value),
        channelName: channel?.title ?? null,
        goal: settings.insight_goal,
        context: settings.insight_context
      });

      const answer = await adviseWith({ db, prompt });
      if (!answer.ok) return fail(answer.code, answer.reason);
      const advice = sanitizeAdvice(answer.value);
      return advice === null ? fail('bad_output', 'The model did not answer in a usable shape') : ok(advice);
    },

    updateStatus: async () => ok(context.updates.status()),
    updateCheck: async () => ok(await context.updates.check()),
    updateDownload: async () => {
      const result = await context.updates.download();
      return result.ok ? ok(null) : fail('refused', result.reason ?? 'Could not download that update');
    },
    updateInstall: async () => {
      const result = context.updates.install();
      return result.ok ? ok(null) : fail('refused', result.reason ?? 'Could not install that update');
    },
    updateRebuild: async () => {
      const result = context.updates.rebuild();
      return result.ok ? ok(null) : fail('refused', result.reason ?? 'Could not start a rebuild');
    },

    aiTest: async (model) => {
      if (typeof model !== 'string' || model.trim() === '') return fail('invalid', 'Choose a model first');
      const { settings } = readSettings(db);
      const result = await testModel(model.trim(), { host: settings.ai_host });
      return result.ok ? ok(null) : fail(result.code, result.reason);
    },
    aiGenerate: async (queueId) => {
      const parsed = asId(queueId);
      if (parsed === null) return fail('invalid', 'That video id is not valid');

      const suggestion = await draftFor(draftDeps, parsed);
      return suggestion.ok ? ok(suggestion.value) : fail(suggestion.code, suggestion.reason);
    },

    selectFolder: async () => {
      const window = context.getWindow();
      const picked =
        window === null
          ? await dialog.showOpenDialog({ properties: ['openDirectory'] })
          : await dialog.showOpenDialog(window, { properties: ['openDirectory'] });
      return ok(picked.canceled || picked.filePaths.length === 0 ? null : picked.filePaths[0]);
    },
    revealFile: async (queueId) => {
      const parsed = asId(queueId);
      if (parsed === null) return fail('invalid', 'That video id is not valid');
      const item = getQueueItem(db, parsed);
      if (item === undefined) return fail('not_found', 'That video is no longer in the queue');
      // Only paths already recorded in the database are ever revealed.
      shell.showItemInFolder(item.filepath);
      return ok(null);
    },
    openExternal: async (url) => {
      if (typeof url !== 'string' || !/^https:\/\//i.test(url)) return fail('invalid', 'Only https links can be opened');
      await shell.openExternal(url);
      return ok(null);
    },
    clipboardWrite: async (text) => {
      if (typeof text !== 'string') return fail('invalid', 'Expected text to copy');
      if (text.length > 100_000) return fail('invalid', 'That is too much text to copy');
      clipboard.writeText(text);
      return ok(null);
    },
    openStudioUpload: async () => {
      const channel = readActiveChannel(db);
      // Channel ids are an opaque token of URL-safe characters. Anything else is not one, and is
      // not going into a URL that gets handed to the operating system.
      const id = channel !== null && /^[A-Za-z0-9_-]{1,64}$/.test(channel.id) ? channel.id : null;
      const url = id === null ? 'https://studio.youtube.com' : `https://studio.youtube.com/channel/${id}/videos/upload?d=ud`;
      await shell.openExternal(url);
      return ok(null);
    }
  };

  for (const [method, handler] of Object.entries(handlers)) {
    ipcMain.removeHandler(method);
    ipcMain.handle(method, async (_event, ...args: unknown[]) => {
      try {
        return await (handler as (...callArgs: unknown[]) => Promise<unknown>)(...args);
      } catch (error) {
        console.error(`[ShortStack] ${method} failed`, error);
        return fail('unexpected', error instanceof Error ? error.message : String(error));
      }
    });
  }
}
