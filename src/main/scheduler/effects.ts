// Joins the scheduler to the outside world: the uploader, the YouTube API and the filesystem.
// Every dependency is injected, so the whole layer runs in tests without network or Electron.
import type Database from 'better-sqlite3';
import type { UploadMethod } from '../../shared/queue';
import { applyQueueEvent, getQueueItem, recordUploadSession } from '../db/queueRepo';
import { recordUpload } from '../db/uploadRepo';
import { setVideoMissing } from '../db/videoRepo';
import type { YouTubeGateway } from '../youtube/gateway';
import type { UploadOutcome, UploadRequest, UploaderDeps } from '../youtube/resumableUpload';
import type { SchedulerHolds } from './decide';
import type { EffectOutcome, SchedulerEffects } from './engine';
import { matchUploadToFile, publishPlanFor } from './publishPlan';

export interface EffectsDeps {
  db: Database.Database;
  gateway: YouTubeGateway;
  uploadVideo(request: UploadRequest, deps: UploaderDeps): Promise<UploadOutcome>;
  accessToken(): Promise<string>;
  authState(): SchedulerHolds['auth'];
  uploadMethod(): UploadMethod;
  uploadsPlaylistId(): string | null;
  maxAttempts(): number;
  statFile(filePath: string): Promise<{ size: number } | null>;
  now(): Date;
  onChange?(): void;
}

const OK: EffectOutcome = { ok: true };

/** 1 minute, 5, 30, then 2 hours: long enough to outlast a blip, short enough to not feel stuck. */
export function retryDelayMs(attempts: number): number {
  const ladder = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];
  return ladder[Math.min(Math.max(attempts, 0), ladder.length - 1)];
}

export function mimeTypeFor(filename: string): string {
  const extension = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  if (extension === '.mov') return 'video/quicktime';
  if (extension === '.webm') return 'video/webm';
  if (extension === '.mkv') return 'video/x-matroska';
  if (extension === '.avi') return 'video/x-msvideo';
  return 'video/mp4';
}

const context = (deps: EffectsDeps) => ({ now: deps.now(), uploadMethod: deps.uploadMethod() });

const hold = (deps: EffectsDeps, kind: 'api' | 'upload_quota', minutes: number): EffectOutcome => ({
  ok: false,
  hold: { kind, until: new Date(deps.now().getTime() + minutes * 60_000).toISOString() }
});

export async function startUpload(deps: EffectsDeps, itemId: number): Promise<EffectOutcome> {
  const item = getQueueItem(deps.db, itemId);
  if (item === undefined) return OK;

  const stats = await deps.statFile(item.filepath);
  if (stats === null || (item.file_size !== null && stats.size !== item.file_size)) {
    // Uploading a file that moved or changed would publish the wrong thing.
    setVideoMissing(deps.db, item.video_id, stats === null);
    applyQueueEvent(
      deps.db,
      itemId,
      {
        type: 'flag',
        code: stats === null ? 'file_missing' : 'file_changed',
        error: stats === null ? 'The video file is no longer where it was' : 'The video file changed since it was added'
      },
      context(deps)
    );
    return OK;
  }

  const started = applyQueueEvent(deps.db, itemId, { type: 'begin_upload', sessionUri: item.upload_session_uri }, context(deps));
  if (!started.ok) return OK;

  const outcome = await deps.uploadVideo(
    {
      filePath: item.filepath,
      fileSize: stats.size,
      mimeType: mimeTypeFor(item.filename),
      // Always uploaded private; the publish plan is applied afterwards by remote sync.
      metadata: {
        snippet: { title: item.title, description: item.description, tags: item.tags, categoryId: item.category_id },
        status: { privacyStatus: 'private', selfDeclaredMadeForKids: item.made_for_kids }
      },
      sessionUri: item.upload_session_uri,
      bytesConfirmed: item.upload_bytes_confirmed
    },
    {
      accessToken: deps.accessToken,
      onSession: (sessionUri) => recordUploadSession(deps.db, itemId, sessionUri, deps.now()),
      onProgress: (bytesConfirmed) => {
        applyQueueEvent(deps.db, itemId, { type: 'upload_progress', bytesConfirmed }, context(deps));
        deps.onChange?.();
      }
    }
  );

  if (outcome.status === 'completed') {
    applyQueueEvent(deps.db, itemId, { type: 'upload_completed', videoId: outcome.videoId }, context(deps));
    recordUpload(deps.db, { queueId: itemId, youtubeVideoId: outcome.videoId, status: 'success', method: 'api', now: deps.now() });
    return OK;
  }
  if (outcome.status === 'session_lost') {
    applyQueueEvent(deps.db, itemId, { type: 'upload_session_lost' }, context(deps));
    return OK;
  }
  if (outcome.status === 'possible_duplicate') {
    applyQueueEvent(deps.db, itemId, { type: 'upload_possible_duplicate', error: outcome.error }, context(deps));
    recordUpload(deps.db, {
      queueId: itemId,
      youtubeVideoId: null,
      status: 'failed',
      method: 'api',
      errorMessage: outcome.error,
      errorCode: 'possible_duplicate',
      now: deps.now()
    });
    return OK;
  }

  const attempts = (getQueueItem(deps.db, itemId)?.attempts ?? 0) + 1;
  applyQueueEvent(
    deps.db,
    itemId,
    {
      type: 'upload_failed',
      retryable: outcome.retryable,
      error: outcome.error,
      nextAttemptAt: outcome.retryable ? new Date(deps.now().getTime() + retryDelayMs(attempts)).toISOString() : null,
      maxAttempts: deps.maxAttempts()
    },
    context(deps)
  );
  recordUpload(deps.db, {
    queueId: itemId,
    youtubeVideoId: null,
    status: 'failed',
    method: 'api',
    errorMessage: outcome.error,
    errorCode: outcome.code,
    now: deps.now()
  });
  return outcome.hold === undefined ? OK : hold(deps, outcome.hold, 60);
}

export async function syncRemote(deps: EffectsDeps, itemId: number): Promise<EffectOutcome> {
  const item = getQueueItem(deps.db, itemId);
  if (item === undefined || item.youtube_video_id === null) return OK;

  const result = await deps.gateway.setPublishPlan(item.youtube_video_id, publishPlanFor(item));
  if (result.ok) {
    applyQueueEvent(
      deps.db,
      itemId,
      { type: 'remote_observed', privacy: result.value.privacyStatus, publishAt: result.value.publishAt },
      context(deps)
    );
    return OK;
  }
  applyQueueEvent(
    deps.db,
    itemId,
    { type: 'remote_sync_failed', error: result.reason, scheduleRefused: result.scheduleRefused === true },
    context(deps)
  );
  return result.hold === undefined ? OK : hold(deps, result.hold, 15);
}

export async function verifyRemote(deps: EffectsDeps, itemId: number): Promise<EffectOutcome> {
  const item = getQueueItem(deps.db, itemId);
  if (item === undefined || item.youtube_video_id === null) return OK;

  const result = await deps.gateway.fetchVideoStatus(item.youtube_video_id);
  if (result.ok) {
    applyQueueEvent(
      deps.db,
      itemId,
      { type: 'remote_observed', privacy: result.value.privacyStatus, publishAt: result.value.publishAt },
      context(deps)
    );
    return OK;
  }
  return result.hold === undefined ? OK : hold(deps, result.hold, 15);
}

export async function detectManualUploads(deps: EffectsDeps, itemIds: readonly number[]): Promise<EffectOutcome> {
  const playlistId = deps.uploadsPlaylistId();
  if (playlistId === null || itemIds.length === 0) return OK;

  const uploads = await deps.gateway.listRecentUploads(playlistId);
  if (!uploads.ok) return uploads.hold === undefined ? OK : hold(deps, uploads.hold, 15);

  let linkedAny = false;
  for (const itemId of itemIds) {
    const item = getQueueItem(deps.db, itemId);
    if (item === undefined || item.youtube_video_id !== null) continue;

    const match = matchUploadToFile(uploads.value, { filename: item.filename, fileSize: item.file_size });
    if (match === null) continue;

    const linked = applyQueueEvent(deps.db, itemId, { type: 'link_video', videoId: match.videoId }, context(deps));
    if (linked.ok) {
      linkedAny = true;
      recordUpload(deps.db, {
        queueId: itemId,
        youtubeVideoId: match.videoId,
        status: 'success',
        method: 'assisted',
        now: deps.now()
      });
    }
  }
  // Looking is not a change; linking a video is, and the engine leaves saying so to whatever made it.
  if (linkedAny) deps.onChange?.();
  return OK;
}

export function createSchedulerEffects(deps: EffectsDeps): SchedulerEffects {
  return {
    authState: () => deps.authState(),
    startUpload: (itemId) => startUpload(deps, itemId),
    syncRemote: (itemId) => syncRemote(deps, itemId),
    verifyRemote: (itemId) => verifyRemote(deps, itemId),
    detectManualUploads: (itemIds) => detectManualUploads(deps, itemIds),
    onChange: deps.onChange
  };
}
