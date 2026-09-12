// Typed IPC handlers. Every argument is validated here: the renderer is the least trusted part
// of the app, and the previous version let it choose SQL column names.
import type Database from 'better-sqlite3';
import { BrowserWindow, app, clipboard, dialog, ipcMain, shell } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { AppEvent, AppInfo, AuthStatus, Result, ShortStackApi } from '../shared/ipc';
import { parseVideoId } from '../shared/youtubeUrl';
import { generateMetadata, listModels } from './ai/ollamaClient';
import { listActivity } from './db/activityRepo';
import { clearChannels, readActiveChannel, upsertChannel } from './db/channelRepo';
import { applyQueueEvent, getQueueItem, listQueueItems, updateQueueMetadata } from './db/queueRepo';
import { readSettings, writeSetting } from './db/settingsRepo';
import { listUploads } from './db/uploadRepo';
import type { QueueEvent } from './domain/queueState';
import { scanFolder } from './files/scanner';
import type { SchedulerEngine } from './scheduler/engine';
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
  getWindow(): BrowserWindow | null;
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
  const changed = () => broadcast(context.getWindow(), 'queue:changed');
  let signInAbort: AbortController | null = null;

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
      void engine.kick();
      return ok(result.settings);
    },

    schedulerStatus: async () => ok(engine.status()),
    schedulerPause: async () => {
      engine.pause();
      broadcast(context.getWindow(), 'scheduler:status');
      return ok(engine.status());
    },
    schedulerResume: async () => {
      engine.resume();
      broadcast(context.getWindow(), 'scheduler:status');
      return ok(engine.status());
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

      const profile = await context.gateway.fetchChannelProfile();
      if (profile.ok) {
        upsertChannel(
          db,
          {
            id: profile.value.id,
            title: profile.value.title,
            handle: profile.value.handle,
            avatarUrl: profile.value.avatarUrl,
            subscriberCount: profile.value.subscriberCount
          },
          new Date()
        );
      }
      broadcast(context.getWindow(), 'auth:changed');
      void engine.kick();
      return ok(await authStatus());
    },
    authDisconnect: async () => {
      await auth.disconnect();
      // Stored channel data goes when access is revoked, as the API policies require.
      clearChannels(db);
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

    aiStatus: async () => {
      const { settings } = readSettings(db);
      const models = await listModels({ host: settings.ai_host });
      return models.ok
        ? ok({ running: true, models: models.value, message: `${models.value.length} model${models.value.length === 1 ? '' : 's'} available` })
        : ok({ running: models.code !== 'not_running', models: [], message: models.reason });
    },
    aiGenerate: async (queueId) => {
      const parsed = asId(queueId);
      if (parsed === null) return fail('invalid', 'That video id is not valid');
      const item = getQueueItem(db, parsed);
      if (item === undefined) return fail('not_found', 'That video is no longer in the queue');

      const { settings } = readSettings(db);
      let model = settings.ai_model;
      if (model === '') {
        const models = await listModels({ host: settings.ai_host });
        if (!models.ok) return fail(models.code, models.reason);
        model = models.value[0];
      }
      const channel = readActiveChannel(db);
      const suggestion = await generateMetadata(
        { filename: item.filename, model, channelName: channel?.title ?? null, defaultTags: settings.default_tags },
        { host: settings.ai_host }
      );
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
      const url = channel === null ? 'https://studio.youtube.com' : `https://studio.youtube.com/channel/${channel.id}/videos/upload?d=ud`;
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
