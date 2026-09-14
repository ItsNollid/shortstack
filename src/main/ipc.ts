// Typed IPC handlers. Every argument is validated here: the renderer is the least trusted part
// of the app, and the previous version let it choose SQL column names.
import type Database from 'better-sqlite3';
import { BrowserWindow, app, clipboard, dialog, ipcMain, shell, type OpenDialogOptions } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { findModel } from '../shared/aiModels';
import type { AppEvent, AppInfo, AuthStatus, Result, ShortStackApi } from '../shared/ipc';
import { parseVideoId } from '../shared/youtubeUrl';
import { generateMetadata, listModels, testModel } from './ai/ollamaClient';
import { listActivity } from './db/activityRepo';
import { clearChannels, readActiveChannel, upsertChannel } from './db/channelRepo';
import { applyQueueEvent, getQueueItem, listQueueItems, listTitleAngles, updateQueueMetadata, applyRestyle, previewRestyle } from './db/queueRepo';
import { readSettings, writeSetting } from './db/settingsRepo';
import { listUploads } from './db/uploadRepo';
import type { QueueEvent } from './domain/queueState';
import { scanFolder } from './files/scanner';
import type { SchedulerEngine } from './scheduler/engine';
import { createPosting, markPublishedBefore, setRotationPaused } from './db/rotationRepo';
import { linkNamedSource, listKnownGames, listKnownSources, setVideoGame, setVideoSource } from './db/videoRepo';
import { clearPastUploadsCache, draftFor } from './ai/draft';
import { lookAtVideo, storedReport } from './ai/lookAtVideo';
import { buildInsightPrompt, sanitizeAdvice } from './ai/insightPrompt';
import { buildBrief, withTitleAngles } from '../shared/insights';
import { moodFor, quotaState, whatIsLeft } from '../shared/quota';
import { listSpendSince, pruneSpend } from './db/spendRepo';
import { changeFor, parseAction } from '../shared/channelActions';
import { adviseWith } from './ai/advise';
import { PulledCache, parseMaxAge } from './youtube/pulledCache';
import type { UpdateService } from './updates/updateService';
import { saveFrames, readFrames, parseFrameSetInfo } from './media/frames';
import { clearThumbnails, missingThumbnails, readThumbnail, saveThumbnail } from './media/thumbnails';
import { applyStartWithWindows } from './startup';
import type { AuthService } from './youtube/authService';
import type { YouTubeGateway } from './youtube/gateway';
import { awaitAuthorizationCode } from './youtube/loopbackServer';
import { REQUIRED_SCOPES, buildAuthUrl, parseClientSecret } from './youtube/oauthFlow';
import { resolveSource } from './sources';
import type { ListeningService } from './listening/service';
import { checkModelFile } from './listening/install';
import { applyPlatformPost, listPlatformPosts } from './db/platformPostRepo';
import { isOtherPlatform, parsePostLink, type OtherPlatform, type PostEvent } from '../shared/platformPosts';
import { PLATFORMS, type Platform } from '../shared/queue';
import { findTools, renderForPlatforms, renderPath } from './media/renderRunner';
import { setQueuePlatforms } from './db/queueRepo';
import { applyFill, previewFill, undoFill } from './scheduler/fill';

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
  /** Listening to what is said in videos. Absent where the app is run without it, such as in some tests. */
  listening?: ListeningService;
  /** Where files made for TikTok and Instagram are kept. */
  rendersDir?: string;
  /** The app's icon follows the connected channel's picture. */
  appIcon: { refresh(avatarUrl: string | null): Promise<boolean>; clear(): Promise<void> };
}

type Handlers = { [K in Exclude<keyof ShortStackApi, 'on'>]: ShortStackApi[K] };

const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const fail = (code: string, message: string): Result<never> => ({ ok: false, error: { code, message } });

const asId = (value: unknown): number | null => (typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null);
const asListeningRequest = (value: unknown): { engine: 'cpu' | 'gpu' } | { model: string } | null => {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.engine === 'cpu' || record.engine === 'gpu') return { engine: record.engine };
  if (typeof record.model === 'string' && record.model.length > 0 && record.model.length <= 64) return { model: record.model };
  return null;
};

const asPostEvent = (platform: OtherPlatform, value: unknown): PostEvent | null => {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.type === 'skip' || record.type === 'restore') return { type: record.type };
  if (record.type !== 'posted') return null;
  if (record.link === null || record.link === undefined || record.link === '') return { type: 'posted', url: null };
  if (typeof record.link !== 'string' || record.link.length > 2048) return null;
  const url = parsePostLink(platform, record.link);
  return url === null ? null : { type: 'posted', url };
};

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
    listPastUploads: (playlistId: string, options: { limit: number }) => context.gateway.listPastUploads(playlistId, options),
    ...(context.listening !== undefined ? { hear: (queueId: number) => (context.listening as ListeningService).speechFor(queueId) } : {})
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

  // The last answer to each Analytics question, kept while the app runs so that opening the page does
  // not ask YouTube again. Cleared whenever the channel is disconnected or another one connected.
  const analyticsPulls = new PulledCache();

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
    queueRestylePreview: async () => ok(previewRestyle(db)),
    queueRestyle: async (ids) => {
      const parsed = asIds(ids);
      if (parsed === null) return fail('invalid', 'No videos selected');
      const result = applyRestyle(db, parsed, eventContext());
      if (result.changed > 0) changed();
      return ok(result);
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
    queueFillPreview: async (includeUnapproved) => {
      if (typeof includeUnapproved !== 'boolean') return fail('invalid', 'Expected yes or no');
      return ok(previewFill(db, includeUnapproved, new Date()));
    },
    queueFill: async (includeUnapproved) => {
      if (typeof includeUnapproved !== 'boolean') return fail('invalid', 'Expected yes or no');
      const result = applyFill(db, includeUnapproved, eventContext());
      if (result.filled.length > 0) {
        changed();
        void engine.kick();
      }
      return ok(result);
    },
    queueUndoFill: async (entries) => {
      if (
        !Array.isArray(entries) ||
        entries.length > 1000 ||
        entries.some((entry) => asId(entry?.id) === null || typeof entry?.at !== 'string' || !Number.isFinite(Date.parse(entry.at)))
      ) {
        return fail('invalid', 'Those times are not valid');
      }
      const undone = undoFill(db, entries, eventContext());
      if (undone > 0) changed();
      return ok(undone);
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
          {
            notifyOnNew: settings.notify_subscribers,
            maxPostings: settings.rotation_max_postings,
            force: true,
            freshDetails: settings.ai_auto_draft && settings.ai_refresh_reruns
          },
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

    framesSave: async (queueId, frames, info) => {
      const parsed = asId(queueId);
      if (parsed === null) return fail('invalid', 'That video id is not valid');
      if (!Array.isArray(frames) || frames.some((frame) => !(frame instanceof Uint8Array))) {
        return fail('invalid', 'Expected image bytes');
      }
      const details = parseFrameSetInfo(info);
      if (details === 'invalid') return fail('invalid', 'Those still details are not valid');
      const saved = await saveFrames(
        { db, dir: context.thumbnailDir },
        parsed,
        frames.map((frame) => Buffer.from(frame)),
        details ?? undefined
      );
      if (!saved.ok) return fail('refused', saved.reason);
      // New stills make whatever the model said about the old ones go away.
      broadcast(context.getWindow(), 'reading:changed');
      return ok(null);
    },

    videoSetGame: async (queueId, game) => {
      const parsed = asId(queueId);
      if (parsed === null) return fail('invalid', 'That video id is not valid');
      if (game !== null && typeof game !== 'string') return fail('invalid', 'That is not a game name');

      const item = getQueueItem(db, parsed);
      if (item === undefined) return fail('not_found', 'That video is no longer in the queue');

      setVideoGame(db, item.video_id, game);
      changed();
      const updated = getQueueItem(db, parsed);
      return updated === undefined ? fail('not_found', 'That video is no longer in the queue') : ok(updated);
    },

    gamesKnown: async () => ok(listKnownGames(db)),

    videoSetSource: async (queueId, source) => {
      const parsed = asId(queueId);
      if (parsed === null) return fail('invalid', 'That video id is not valid');
      const item = getQueueItem(db, parsed);
      if (item === undefined) return fail('not_found', 'That video is no longer in the queue');

      if (source === null) {
        setVideoSource(db, item.video_id, null);
      } else {
        if (typeof source !== 'object' || typeof source.title !== 'string' || typeof source.link !== 'string') {
          return fail('invalid', 'That is not a long video');
        }
        // A link is named by YouTube, which already knows the title. Checked here rather than trusted from the window.
        const resolved = await resolveSource(
          source,
          { title: item.source_title, url: item.source_url },
          listKnownSources(db),
          readActiveChannel(db)?.id ?? null,
          (videoId) => context.gateway.fetchVideoTitle(videoId)
        );
        if (!resolved.ok) return fail('invalid', resolved.problem);
        setVideoSource(db, item.video_id, resolved.source);
        // Shorts named after this long video before it was up are linked along with it.
        linkNamedSource(db, [item.source_title ?? '', source.title], resolved.source);
      }
      changed();
      const updated = getQueueItem(db, parsed);
      return updated === undefined ? fail('not_found', 'That video is no longer in the queue') : ok(updated);
    },

    sourcesKnown: async () => ok(listKnownSources(db)),

    videosScan: async () => {
      const summary = await scanFolder(db);
      changed();
      void engine.kick();
      return ok(summary);
    },

    settingsGetAll: async () => ok(readSettings(db).settings),
    settingsIgnored: async () => ok(readSettings(db).ignored),
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

    analyticsGet: async (days, maxAge) => {
      const window = typeof days === 'number' && Number.isFinite(days) ? Math.min(365, Math.max(1, Math.round(days))) : 28;
      const limit = parseMaxAge(maxAge);
      if (limit === undefined) return fail('invalid', 'That refresh limit is not valid');
      const result = await analyticsPulls.get(`channel:${window}`, limit, () => context.gateway.fetchChannelAnalytics(window));
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
      // Another channel's numbers must never show under this one.
      analyticsPulls.clear();
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
      // The uploads list kept for drafting is this channel's data too, and goes when permission does.
      clearPastUploadsCache();
      // So do the analytics kept for the page.
      analyticsPulls.clear();
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
    insightsGet: async (days, maxAge) => {
      const window = Number(days);
      if (!Number.isFinite(window) || window < 1) return fail('invalid', 'That range is not valid');
      const limit = parseMaxAge(maxAge);
      if (limit === undefined) return fail('invalid', 'That refresh limit is not valid');
      const stats = await analyticsPulls.get(`videos:${window}`, limit, () => context.gateway.fetchVideoPerformance(window));
      if (!stats.ok) return fail(stats.code ?? 'error', stats.reason);
      if (stats.value === null) return ok(null);

      // With the kind of title each video went out under, which only ShortStack knows.
      const brief = buildBrief(withTitleAngles(stats.value.value, listTitleAngles(db)));
      // Kept so writing a title can use it without two YouTube calls per video.
      writeSetting(db, 'insight_findings', JSON.stringify(brief).slice(0, 8000));
      return ok(brief);
    },

    insightsAdvise: async (days) => {
      const window = Number(days);
      if (!Number.isFinite(window) || window < 1) return fail('invalid', 'That range is not valid');
      // The numbers the findings on screen were built from, not a second round of YouTube calls.
      const stats = await analyticsPulls.get(`videos:${window}`, Number.POSITIVE_INFINITY, () =>
        context.gateway.fetchVideoPerformance(window)
      );
      if (!stats.ok) return fail(stats.code ?? 'error', stats.reason);
      if (stats.value === null) return fail('not_pulled', 'Pull your analytics first');

      const { settings } = readSettings(db);
      const channel = readActiveChannel(db);
      const brief = buildBrief(withTitleAngles(stats.value.value, listTitleAngles(db)));
      const prompt = buildInsightPrompt({
        brief,
        channelName: channel?.title ?? null,
        goal: settings.insight_goal,
        context: settings.insight_context,
        currentTimes: { newLane: settings.upload_times, rotationLane: settings.rotation_upload_times }
      });

      const answer = await adviseWith({ db, prompt });
      if (!answer.ok) return fail(answer.code, answer.reason);

      const advice = sanitizeAdvice(answer.value, brief.usable.map((fact) => fact.id));
      return advice === null ? fail('bad_output', 'The model did not answer in a usable shape') : ok(advice);
    },

    actionPreview: async (action) => {
      // Parsed again on this side. What the renderer sends is not what decides an action is allowed.
      const parsed = parseAction(action);
      if (parsed === null) return fail('invalid', 'That is not a change ShortStack can make');
      return ok(changeFor(parsed, readSettings(db).settings));
    },

    actionApply: async (action) => {
      const parsed = parseAction(action);
      if (parsed === null) return fail('invalid', 'That is not a change ShortStack can make');

      const change = changeFor(parsed, readSettings(db).settings);
      if (change === null) return fail('refused', 'That would not change anything');

      const written = writeSetting(db, change.key, change.value);
      if (!written.ok) return fail('refused', written.reason);

      // Times feed the scheduler and the drafting worker; both should notice straight away.
      context.draftWorker?.kick();
      void engine.kick();
      changed();
      return ok(change);
    },

    quotaGet: async () => {
      const now = new Date();
      pruneSpend(db, now);
      // Two days back covers any Pacific "today" wherever this computer is.
      const spend = listSpendSince(db, new Date(now.getTime() - 2 * 86_400_000));
      const state = quotaState(spend, readSettings(db).settings.quota_daily_units, now);
      return ok({
        ...state,
        mood: moodFor(state),
        affordable: whatIsLeft(state.remaining),
        counting: context.profile.uploads === 'live'
      });
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
    platformPostsList: async (queueId) => {
      const parsed = asId(queueId);
      if (parsed === null) return fail('invalid', 'That video id is not valid');
      const posts = listPlatformPosts(db, parsed);
      return posts === null ? fail('not_found', 'That video is no longer in the queue') : ok(posts);
    },
    platformPostApply: async (queueId, platform, event) => {
      const parsed = asId(queueId);
      if (parsed === null) return fail('invalid', 'That video id is not valid');
      if (!isOtherPlatform(platform)) return fail('invalid', 'That is not a platform ShortStack posts to');
      // The link is checked here, whatever the screen already checked: the renderer is not what decides it is one.
      const request = asPostEvent(platform, event);
      if (request === null) {
        return fail('invalid', platform === 'tiktok' ? 'That is not a link to a TikTok video' : 'That is not a link to an Instagram reel or post');
      }
      const result = applyPlatformPost(db, parsed, platform, request, new Date());
      if (!result.ok) return fail('refused', result.reason);
      changed();
      return ok(result.post);
    },
    platformPrepareFile: async (queueId) => {
      const parsed = asId(queueId);
      if (parsed === null) return fail('invalid', 'That video id is not valid');
      const item = getQueueItem(db, parsed);
      if (item === undefined) return fail('not_found', 'That video is no longer in the queue');
      if (context.rendersDir === undefined) return fail('unavailable', 'Making files for other platforms is not available in this build');
      const tools = await findTools();
      if (tools === null) return fail('missing_tool', 'Making the file needs ffmpeg, and it is not installed anywhere ShortStack can find it');
      const rendered = await renderForPlatforms({ tools, dir: context.rendersDir }, { videoId: item.video_id, filePath: item.filepath });
      if (!rendered.ok) return fail('refused', rendered.reason);
      return ok({ sizeBytes: rendered.info.sizeBytes, reused: rendered.reused, problems: rendered.problems });
    },
    platformRevealFile: async (queueId) => {
      const parsed = asId(queueId);
      if (parsed === null) return fail('invalid', 'That video id is not valid');
      const item = getQueueItem(db, parsed);
      if (item === undefined) return fail('not_found', 'That video is no longer in the queue');
      if (context.rendersDir === undefined) return fail('unavailable', 'Making files for other platforms is not available in this build');
      const file = renderPath(context.rendersDir, item.video_id);
      const made = await fs.access(file).then(
        () => true,
        () => false
      );
      if (!made) return fail('not_found', 'Make the file first');
      shell.showItemInFolder(file);
      return ok(null);
    },
    queueSetPlatforms: async (queueId, platforms) => {
      const parsed = asId(queueId);
      if (parsed === null) return fail('invalid', 'That video id is not valid');
      if (!Array.isArray(platforms) || platforms.some((entry) => !(PLATFORMS as readonly unknown[]).includes(entry))) {
        return fail('invalid', 'Pick platforms from the supported list');
      }
      if (!platforms.includes('youtube')) return fail('invalid', 'YouTube is always one of them');
      const updated = setQueuePlatforms(db, parsed, [...new Set(platforms)] as Platform[], new Date());
      if (updated === null) return fail('not_found', 'That video is no longer in the queue');
      changed();
      return ok(updated);
    },
    videoHeard: async (queueId) => {
      const parsed = asId(queueId);
      if (parsed === null) return fail('invalid', 'That video id is not valid');
      if (context.listening === undefined) return fail('unavailable', 'Listening is not available in this build');
      const heard = await context.listening.transcriptFor(parsed, false);
      return heard.ok ? ok(heard.transcript) : fail('refused', heard.reason);
    },
    videoListen: async (queueId) => {
      const parsed = asId(queueId);
      if (parsed === null) return fail('invalid', 'That video id is not valid');
      if (context.listening === undefined) return fail('unavailable', 'Listening is not available in this build');
      const heard = await context.listening.transcriptFor(parsed, true);
      if (!heard.ok) return fail('refused', heard.reason);
      return heard.transcript === null ? fail('refused', 'Nothing was heard') : ok(heard.transcript);
    },
    listeningStatus: async () =>
      context.listening === undefined ? fail('unavailable', 'Listening is not available in this build') : ok(await context.listening.status()),
    listeningDownload: async (request) => {
      const parsed = asListeningRequest(request);
      if (parsed === null) return fail('invalid', 'That is not something ShortStack can download');
      if (context.listening === undefined) return fail('unavailable', 'Listening is not available in this build');
      const started = context.listening.start(parsed);
      return started.ok ? ok(null) : fail('refused', started.reason);
    },
    listeningCancel: async () => {
      context.listening?.cancel();
      return ok(null);
    },
    listeningRemove: async (request) => {
      const parsed = asListeningRequest(request);
      if (parsed === null) return fail('invalid', 'That is not something ShortStack can remove');
      if (context.listening === undefined) return fail('unavailable', 'Listening is not available in this build');
      await context.listening.remove(parsed);
      return ok(null);
    },
    listeningChooseModelFile: async () => {
      const window = context.getWindow();
      const options: OpenDialogOptions = { properties: ['openFile'], filters: [{ name: 'whisper.cpp model', extensions: ['bin'] }] };
      const picked = window === null ? await dialog.showOpenDialog(options) : await dialog.showOpenDialog(window, options);
      const file = picked.canceled ? undefined : picked.filePaths[0];
      if (file === undefined) return ok(null);
      const checked = await checkModelFile(file);
      if (!checked.ok) return fail('invalid', checked.reason);
      const written = writeSetting(db, 'listen_model_file', file);
      if (!written.ok) return fail('refused', written.reason);
      broadcast(context.getWindow(), 'listening:changed');
      return ok(file);
    },
    videoReading: async (queueId) => {
      const parsed = asId(queueId);
      if (parsed === null) return fail('invalid', 'That video id is not valid');
      return ok(storedReport(db, parsed));
    },
    videoLook: async (queueId) => {
      const parsed = asId(queueId);
      if (parsed === null) return fail('invalid', 'That video id is not valid');
      const report = await lookAtVideo({ db, thumbnailDir: context.thumbnailDir }, parsed);
      if (!report.ok) return fail(report.code, report.reason);
      broadcast(context.getWindow(), 'reading:changed');
      return ok(report.value);
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
