// A video's whole journey through the real pieces: the scanner reading real files, the real
// repositories, the real decision function and the real effects, with only YouTube itself stubbed.
// The unit tests prove each part; this proves they are actually wired to each other.
import type Database from 'better-sqlite3';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listActivity } from './db/activityRepo';
import { applyQueueEvent, getQueueItem, listQueueItems } from './db/queueRepo';
import { writeSetting } from './db/settingsRepo';
import { createTestDb } from './db/testFixtures';
import { scanFolder } from './files/scanner';
import { createSchedulerEffects } from './scheduler/effects';
import { SchedulerEngine } from './scheduler/engine';
import type { GatewayResult, RecentUpload, VideoStatusSnapshot, YouTubeGateway } from './youtube/gateway';

const REFUSED = { ok: false as const, reason: 'not used in this test', code: null, retryable: false };

let db: Database.Database;
let folder: string;
let now = new Date('2026-09-12T08:00:00');

const setNow = (iso: string): void => {
  now = new Date(iso);
};

beforeEach(async () => {
  db = createTestDb();
  folder = await fs.mkdtemp(path.join(os.tmpdir(), 'shortstack-e2e-'));
  setNow('2026-09-12T08:00:00');
  writeSetting(db, 'shorts_folder', folder);
  writeSetting(db, 'upload_times', ['09:00', '13:00', '18:00']);
  writeSetting(db, 'default_privacy', 'public');
  writeSetting(db, 'upload_method', 'assisted');
});

afterEach(async () => {
  await fs.rm(folder, { recursive: true, force: true });
});

/** A file big enough to be hashed and stable, without being a real video. */
async function putClip(name: string, size = 6 * 1024 * 1024): Promise<void> {
  await fs.writeFile(path.join(folder, name), Buffer.alloc(size, 7));
}

interface StubState {
  uploads: RecentUpload[];
  status: VideoStatusSnapshot;
  planCalls: Array<{ videoId: string; publishAt: string | null }>;
}

function stubGateway(state: StubState): YouTubeGateway {
  return {
    fetchChannelProfile: async () => REFUSED,
    fetchVideoStatus: async (): Promise<GatewayResult<VideoStatusSnapshot>> => ({ ok: true, value: state.status }),
    setPublishPlan: async (videoId, plan): Promise<GatewayResult<VideoStatusSnapshot>> => {
      state.planCalls.push({ videoId, publishAt: plan.publishAt });
      state.status = { ...state.status, privacyStatus: plan.privacyStatus, publishAt: plan.publishAt };
      return { ok: true, value: state.status };
    },
    listRecentUploads: async (): Promise<GatewayResult<RecentUpload[]>> => ({ ok: true, value: state.uploads }),
    fetchChannelAnalytics: async () => REFUSED
  };
}

function buildEngine(state: StubState): SchedulerEngine {
  const effects = createSchedulerEffects({
    db,
    gateway: stubGateway(state),
    uploadVideo: async () => ({
      status: 'failed',
      retryable: false,
      error: 'no API uploads in assisted mode',
      code: 'dry_run'
    }),
    accessToken: async () => 'token',
    authState: () => 'ok',
    uploadMethod: () => 'assisted',
    uploadsPlaylistId: () => 'UU_test',
    maxAttempts: () => 3,
    statFile: async (filePath) => {
      try {
        return { size: (await fs.stat(filePath)).size };
      } catch {
        return null;
      }
    },
    now: () => now
  });
  return new SchedulerEngine({ db, effects, now: () => now });
}

const freshState = (): StubState => ({
  uploads: [],
  status: { privacyStatus: 'private', publishAt: null, uploadStatus: 'processed', rejectionReason: null },
  planCalls: []
});

describe('a video from folder to published', () => {
  it('is scanned, approved, given a time, linked and confirmed, without ever uploading twice', async () => {
    const state = freshState();
    const engine = buildEngine(state);

    // 1. The scanner finds it, and it waits for approval rather than acting on its own.
    await putClip('morning-run.mov');
    const scan = await scanFolder(db, { now: () => now });
    expect(scan.status).toBe('ok');
    expect(scan.added).toBe(1);

    const found = listQueueItems(db)[0];
    expect(found?.state).toBe('pending');
    const id = found?.id as number;

    // 2. Approving is the user's decision, and only then does anything move.
    expect(applyQueueEvent(db, id, { type: 'approve' }, { now, uploadMethod: 'assisted' }).ok).toBe(true);

    // 3. The tick gives it the next free daily slot and, in assisted mode, waits for the user.
    await engine.kick();
    const slotted = getQueueItem(db, id);
    expect(slotted?.schedule_source).toBe('auto');
    expect(new Date(slotted?.scheduled_for as string).getHours()).toBe(9);
    expect(slotted?.state).toBe('awaiting_manual_upload');

    // 4. The user uploads it in Studio; detection matches it by file name and size.
    state.uploads = [
      { videoId: 'yt_morning', title: 'morning-run', publishedAt: null, fileName: 'morning-run.mov', fileSize: 6 * 1024 * 1024 }
    ];
    await engine.kick();
    const linked = getQueueItem(db, id);
    expect(linked?.youtube_video_id).toBe('yt_morning');
    expect(linked?.state).toBe('uploaded');

    // 5. The publish time goes to YouTube, which is what makes it independent of this computer.
    await engine.kick();
    expect(state.planCalls).toHaveLength(1);
    expect(state.planCalls[0]?.publishAt).toBe(slotted?.scheduled_for);
    expect(getQueueItem(db, id)?.state).toBe('scheduled');

    // 6. After the slot passes, YouTube reports it public and ShortStack agrees.
    setNow('2026-09-12T14:00:00');
    state.status = { privacyStatus: 'public', publishAt: null, uploadStatus: 'processed', rejectionReason: null };
    await engine.kick();
    expect(getQueueItem(db, id)?.state).toBe('published');

    // 7. Nothing ever tried to upload it, and every step is on the record.
    const actions = listActivity(db, { queueId: id }).map((entry) => entry.action);
    expect(actions).toContain('approve');
    expect(actions).toContain('auto_slot');
    expect(actions).toContain('link_video');
    expect(actions).not.toContain('begin_upload');

    // 8. Further ticks change nothing: a published video is finished with, and rotation holds off
    //    because the minimum gap since its posting has not passed. Asserted rather than assumed —
    //    without the gap this tick would queue a second posting five hours after the first.
    const before = getQueueItem(db, id)?.updated_at;
    await engine.kick();
    await engine.kick();
    expect(getQueueItem(db, id)?.updated_at).toBe(before);
    expect(state.planCalls).toHaveLength(1);
    expect(listQueueItems(db)).toHaveLength(1);

    // 9. Once the gap has passed, it comes back around as a re-run that still needs approving.
    setNow('2026-10-12T09:00:00');
    await engine.kick();

    const postings = listQueueItems(db);
    expect(postings).toHaveLength(2);
    const rerun = postings.find((entry) => entry.id !== id);
    expect(rerun?.state).toBe('pending');
    expect(rerun?.posting_kind).toBe('rotation');
    expect(rerun?.notify_subscribers).toBe(false);
  });

  it('never starts an upload for a video that is already on YouTube', async () => {
    const state = freshState();
    const engine = buildEngine(state);

    await putClip('already-up.mov');
    await scanFolder(db, { now: () => now });
    const id = listQueueItems(db)[0]?.id as number;
    applyQueueEvent(db, id, { type: 'approve' }, { now, uploadMethod: 'assisted' });
    applyQueueEvent(db, id, { type: 'link_video', videoId: 'yt_existing' }, { now, uploadMethod: 'assisted' });

    await engine.kick();
    await engine.kick();

    expect(getQueueItem(db, id)?.youtube_video_id).toBe('yt_existing');
    expect(listActivity(db, { queueId: id }).map((entry) => entry.action)).not.toContain('begin_upload');
  });

  it('stays paused across a restart', async () => {
    const state = freshState();
    const first = buildEngine(state);

    await putClip('paused.mov');
    await scanFolder(db, { now: () => now });
    const id = listQueueItems(db)[0]?.id as number;
    applyQueueEvent(db, id, { type: 'approve' }, { now, uploadMethod: 'assisted' });

    first.pause();
    await first.kick();
    expect(getQueueItem(db, id)?.scheduled_for).toBeNull();

    // A new engine on the same database is what a restart looks like.
    const second = buildEngine(state);
    expect(second.isPaused()).toBe(true);
    await second.kick();
    expect(getQueueItem(db, id)?.scheduled_for).toBeNull();

    second.resume();
    await second.kick();
    expect(getQueueItem(db, id)?.scheduled_for).not.toBeNull();
  });

  it('does not schedule a video the user kept private', async () => {
    writeSetting(db, 'default_privacy', 'private');
    const state = freshState();
    const engine = buildEngine(state);

    await putClip('private-clip.mov');
    await scanFolder(db, { now: () => now });
    const id = listQueueItems(db)[0]?.id as number;
    expect(getQueueItem(db, id)?.privacy).toBe('private');

    applyQueueEvent(db, id, { type: 'approve' }, { now, uploadMethod: 'assisted' });
    await engine.kick();

    expect(getQueueItem(db, id)?.scheduled_for).toBeNull();
    expect(listActivity(db, { queueId: id }).map((entry) => entry.action)).not.toContain('auto_slot');
  });
});
