import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { getQueueItem } from '../db/queueRepo';
import { TEST_NOW, createTestDb, seedQueueItem } from '../db/testFixtures';
import { listUploads } from '../db/uploadRepo';
import type { YouTubeGateway } from '../youtube/gateway';
import type { UploadOutcome } from '../youtube/resumableUpload';
import { detectManualUploads, retryDelayMs, startUpload, syncRemote, verifyRemote, type EffectsDeps } from './effects';

let db: Database.Database;
beforeEach(() => {
  db = createTestDb();
});

export const gatewayStub = (overrides: Partial<YouTubeGateway> = {}): YouTubeGateway => ({
  fetchChannelProfile: async () => ({ ok: false, reason: 'not used', code: null, retryable: false }),
  fetchVideoStatus: async () => ({ ok: false, reason: 'not used', code: null, retryable: false }),
  setPublishPlan: async () => ({ ok: false, reason: 'not used', code: null, retryable: false }),
  listRecentUploads: async () => ({ ok: true, value: [] }),
  ...overrides
});

export function makeDeps(database: Database.Database, overrides: Partial<EffectsDeps> = {}): EffectsDeps {
  return {
    db: database,
    gateway: gatewayStub(),
    uploadVideo: async () => ({ status: 'completed', videoId: 'yt-new', sessionUri: 'session-1' }),
    accessToken: async () => 'token',
    authState: () => 'ok',
    uploadMethod: () => 'api',
    uploadsPlaylistId: () => 'UU123',
    maxAttempts: () => 3,
    statFile: async () => ({ size: 1024 }),
    now: () => TEST_NOW,
    ...overrides
  };
}

describe('startUpload', () => {
  it('uploads private, records the video id and writes history', async () => {
    const id = seedQueueItem(db, { state: 'approved' });
    let sentMetadata: Record<string, unknown> = {};
    await startUpload(
      makeDeps(db, {
        uploadVideo: async (request) => {
          sentMetadata = request.metadata;
          return { status: 'completed', videoId: 'yt-new', sessionUri: 's1' };
        }
      }),
      id
    );

    expect(getQueueItem(db, id)).toMatchObject({ state: 'uploaded', youtube_video_id: 'yt-new', remote_sync: 'pending' });
    expect((sentMetadata.status as Record<string, unknown>).privacyStatus).toBe('private');
    expect(listUploads(db)[0]).toMatchObject({ status: 'success', youtube_video_id: 'yt-new', method: 'api' });
  });

  it('persists the upload session before any bytes are sent', async () => {
    const id = seedQueueItem(db, { state: 'approved' });
    let sessionAtUploadTime: string | null = null;
    await startUpload(
      makeDeps(db, {
        uploadVideo: async (_request, uploaderDeps) => {
          await uploaderDeps.onSession?.('https://upload/session-abc');
          sessionAtUploadTime = getQueueItem(db, id)?.upload_session_uri ?? null;
          return { status: 'completed', videoId: 'yt-new', sessionUri: 'https://upload/session-abc' };
        }
      }),
      id
    );
    expect(sessionAtUploadTime).toBe('https://upload/session-abc');
  });

  it('refuses to upload a file that moved or changed', async () => {
    const mustNotRun = async (): Promise<UploadOutcome> => {
      throw new Error('upload must not start');
    };
    const missing = seedQueueItem(db, { state: 'approved', filename: 'gone.mov' });
    await startUpload(makeDeps(db, { statFile: async () => null, uploadVideo: mustNotRun }), missing);
    expect(getQueueItem(db, missing)).toMatchObject({ state: 'needs_attention', attention_code: 'file_missing' });

    const changed = seedQueueItem(db, { state: 'approved', filename: 'changed.mov' });
    db.prepare('UPDATE videos SET file_size = 1024 WHERE id = (SELECT video_id FROM queue WHERE id = ?)').run(changed);
    await startUpload(makeDeps(db, { statFile: async () => ({ size: 2048 }), uploadVideo: mustNotRun }), changed);
    expect(getQueueItem(db, changed)).toMatchObject({ state: 'needs_attention', attention_code: 'file_changed' });
  });

  it('schedules a retry with backoff and records the failure', async () => {
    const id = seedQueueItem(db, { state: 'approved' });
    const outcome: UploadOutcome = { status: 'failed', retryable: true, error: 'Upload failed (503)', code: 'backendError', hold: 'api' };
    const result = await startUpload(makeDeps(db, { uploadVideo: async () => outcome }), id);

    const item = getQueueItem(db, id);
    expect(item).toMatchObject({ state: 'failed', attempts: 1 });
    expect(Date.parse(item?.next_attempt_at as string)).toBe(TEST_NOW.getTime() + retryDelayMs(1));
    expect(listUploads(db)[0]).toMatchObject({ status: 'failed', error_code: 'backendError' });
    expect(result).toMatchObject({ ok: false, hold: { kind: 'api' } });
  });

  it('parks a possible duplicate instead of retrying it', async () => {
    const id = seedQueueItem(db, { state: 'approved' });
    await startUpload(
      makeDeps(db, { uploadVideo: async () => ({ status: 'possible_duplicate', error: 'session expired after the final chunk' }) }),
      id
    );
    expect(getQueueItem(db, id)).toMatchObject({ state: 'needs_attention', attention_code: 'possible_duplicate' });
    expect(listUploads(db)[0]).toMatchObject({ status: 'failed', error_code: 'possible_duplicate' });
  });

  it('restarts cleanly when the session was lost early', async () => {
    const id = seedQueueItem(db, { state: 'approved' });
    await startUpload(makeDeps(db, { uploadVideo: async () => ({ status: 'session_lost' }) }), id);
    expect(getQueueItem(db, id)).toMatchObject({ state: 'failed', upload_session_uri: null });
  });
});

describe('syncRemote', () => {
  it('sends the publish plan and records what YouTube confirmed', async () => {
    const at = new Date(TEST_NOW.getTime() + 3 * 60 * 60_000).toISOString();
    const id = seedQueueItem(db, { state: 'uploaded', youtubeVideoId: 'yt-1', scheduledFor: at, scheduleSource: 'manual' });
    let sent: unknown = null;

    await syncRemote(
      makeDeps(db, {
        gateway: gatewayStub({
          setPublishPlan: async (_videoId, plan) => {
            sent = plan;
            return { ok: true, value: { privacyStatus: 'private', publishAt: at, uploadStatus: 'processed', rejectionReason: null } };
          }
        })
      }),
      id
    );

    expect(sent).toEqual({ privacyStatus: 'private', publishAt: at });
    expect(getQueueItem(db, id)).toMatchObject({ state: 'scheduled', remote_sync: 'synced', remote_publish_at: at });
  });

  it('asks the user to set the schedule in Studio when YouTube refuses', async () => {
    const at = new Date(TEST_NOW.getTime() + 3 * 60 * 60_000).toISOString();
    const id = seedQueueItem(db, { state: 'uploaded', youtubeVideoId: 'yt-1', scheduledFor: at, scheduleSource: 'manual' });

    await syncRemote(
      makeDeps(db, {
        gateway: gatewayStub({
          setPublishPlan: async () => ({
            ok: false,
            reason: 'Updating the video failed (403)',
            code: 'forbidden',
            retryable: false,
            scheduleRefused: true
          })
        })
      }),
      id
    );
    expect(getQueueItem(db, id)).toMatchObject({ state: 'needs_attention', attention_code: 'set_schedule_in_studio', remote_sync: 'error' });
  });
});

describe('verifyRemote', () => {
  const scheduledInThePast = () => {
    const past = new Date(TEST_NOW.getTime() - 60 * 60_000).toISOString();
    const id = seedQueueItem(db, { state: 'scheduled', youtubeVideoId: 'yt-1', scheduledFor: past, scheduleSource: 'manual' });
    db.prepare("UPDATE queue SET remote_sync = 'synced', remote_publish_at = ? WHERE id = ?").run(past, id);
    return { id, past };
  };

  it('marks a video published once YouTube reports it public', async () => {
    const { id } = scheduledInThePast();
    await verifyRemote(
      makeDeps(db, {
        gateway: gatewayStub({
          fetchVideoStatus: async () => ({
            ok: true,
            value: { privacyStatus: 'public', publishAt: null, uploadStatus: 'processed', rejectionReason: null }
          })
        })
      }),
      id
    );
    expect(getQueueItem(db, id)?.state).toBe('published');
  });

  it('flags a video still private long after its slot, which is what an unaudited project causes', async () => {
    const { id, past } = scheduledInThePast();
    await verifyRemote(
      makeDeps(db, {
        gateway: gatewayStub({
          fetchVideoStatus: async () => ({
            ok: true,
            value: { privacyStatus: 'private', publishAt: past, uploadStatus: 'processed', rejectionReason: null }
          })
        })
      }),
      id
    );
    expect(getQueueItem(db, id)).toMatchObject({ state: 'needs_attention', attention_code: 'locked_private' });
  });
});

describe('detectManualUploads', () => {
  it('links an upload that matches the file and records it as assisted', async () => {
    const id = seedQueueItem(db, { state: 'awaiting_manual_upload', filename: 'peter.mov' });
    db.prepare('UPDATE videos SET file_size = 1024 WHERE id = (SELECT video_id FROM queue WHERE id = ?)').run(id);

    await detectManualUploads(
      makeDeps(db, {
        gateway: gatewayStub({
          listRecentUploads: async () => ({
            ok: true,
            value: [{ videoId: 'yt-manual', title: 'Peter', publishedAt: null, fileName: 'peter.mov', fileSize: 1024 }]
          })
        })
      }),
      [id]
    );

    expect(getQueueItem(db, id)).toMatchObject({ state: 'uploaded', youtube_video_id: 'yt-manual' });
    expect(listUploads(db)[0]).toMatchObject({ method: 'assisted', youtube_video_id: 'yt-manual' });
  });

  it('leaves a video waiting when nothing matches it', async () => {
    const id = seedQueueItem(db, { state: 'awaiting_manual_upload', filename: 'peter.mov' });
    await detectManualUploads(
      makeDeps(db, {
        gateway: gatewayStub({
          listRecentUploads: async () => ({
            ok: true,
            value: [{ videoId: 'yt-other', title: 'Other', publishedAt: null, fileName: 'other.mov', fileSize: 99 }]
          })
        })
      }),
      [id]
    );
    expect(getQueueItem(db, id)).toMatchObject({ state: 'awaiting_manual_upload', youtube_video_id: null });
  });
});
