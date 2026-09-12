import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listActivity } from '../db/activityRepo';
import { getQueueItem } from '../db/queueRepo';
import { writeSetting } from '../db/settingsRepo';
import { TEST_NOW, createTestDb, seedQueueItem } from '../db/testFixtures';
import type { EffectOutcome, SchedulerEffects } from './engine';
import { SchedulerEngine } from './engine';

function fakeEffects(overrides: Partial<SchedulerEffects> = {}) {
  const calls = { startUpload: [] as number[], syncRemote: [] as number[], verifyRemote: [] as number[], detect: [] as number[][] };
  let releaseUpload: ((outcome: EffectOutcome) => void) | null = null;
  const effects: SchedulerEffects = {
    authState: () => 'ok',
    startUpload: (id) => {
      calls.startUpload.push(id);
      return new Promise<EffectOutcome>((resolve) => {
        releaseUpload = resolve;
      });
    },
    syncRemote: async (id) => {
      calls.syncRemote.push(id);
      return { ok: true };
    },
    verifyRemote: async (id) => {
      calls.verifyRemote.push(id);
      return { ok: true };
    },
    detectManualUploads: async (ids) => {
      calls.detect.push([...ids]);
      return { ok: true };
    },
    ...overrides
  };
  return { effects, calls, release: (outcome: EffectOutcome = { ok: true }) => releaseUpload?.(outcome) };
}

let db: Database.Database;
beforeEach(() => {
  db = createTestDb();
});

const engineFor = (effects: SchedulerEffects, now: () => Date = () => TEST_NOW) => new SchedulerEngine({ db, effects, now });

describe('scheduler engine', () => {
  it('auto-schedules approved videos and records what it did', async () => {
    const id = seedQueueItem(db, { state: 'approved' });
    const { effects } = fakeEffects();
    await engineFor(effects).runTick();

    const item = getQueueItem(db, id);
    expect(item?.schedule_source).toBe('auto');
    expect(item?.scheduled_for).not.toBeNull();
    expect(listActivity(db, { queueId: id }).map((entry) => entry.action)).toContain('auto_slot');
  });

  it('keeps a persisted pause across a restart, and stops writing to YouTube', async () => {
    const id = seedQueueItem(db, { state: 'approved' });
    const { effects, calls } = fakeEffects();

    const first = engineFor(effects);
    first.pause();
    expect(first.isPaused()).toBe(true);

    // A brand new engine on the same database: the old build silently un-paused here.
    const restarted = engineFor(effects);
    expect(restarted.isPaused()).toBe(true);
    await restarted.runTick();

    expect(calls.startUpload).toEqual([]);
    expect(getQueueItem(db, id)?.scheduled_for).toBeNull();

    restarted.resume();
    expect(restarted.isPaused()).toBe(false);
  });

  it('never starts a second upload while one is in flight', async () => {
    writeSetting(db, 'api_audit_confirmed_at', TEST_NOW.toISOString());
    writeSetting(db, 'upload_method', 'api');
    seedQueueItem(db, { state: 'approved' });
    const { effects, calls, release } = fakeEffects();
    const engine = engineFor(effects);

    await engine.runTick();
    expect(calls.startUpload).toHaveLength(1);

    await engine.runTick();
    expect(calls.startUpload).toHaveLength(1);

    release({ ok: true });
    await new Promise((resolve) => setImmediate(resolve));
    await engine.runTick();
    expect(calls.startUpload).toHaveLength(2);
  });

  it('stops uploading after an effect reports a quota hold', async () => {
    writeSetting(db, 'api_audit_confirmed_at', TEST_NOW.toISOString());
    writeSetting(db, 'upload_method', 'api');
    seedQueueItem(db, { state: 'approved' });
    const { effects, calls, release } = fakeEffects();
    const engine = engineFor(effects);

    await engine.runTick();
    release({ ok: false, hold: { kind: 'upload_quota', until: new Date(TEST_NOW.getTime() + 3_600_000).toISOString() } });
    await new Promise((resolve) => setImmediate(resolve));

    await engine.runTick();
    expect(calls.startUpload).toHaveLength(1);
    expect(engine.status().uploadQuotaUntil).not.toBeNull();
  });

  it('flags a slot it can no longer meet', async () => {
    const id = seedQueueItem(db, {
      state: 'approved',
      scheduledFor: new Date(TEST_NOW.getTime() + 5 * 60_000).toISOString(),
      scheduleSource: 'manual'
    });
    await engineFor(fakeEffects().effects).runTick();
    expect(getQueueItem(db, id)).toMatchObject({ state: 'needs_attention', attention_code: 'missed_slot' });
  });

  it('moves approved videos into the assisted path and asks for detection', async () => {
    const id = seedQueueItem(db, { state: 'approved' });
    const { effects, calls } = fakeEffects();
    const engine = engineFor(effects);

    await engine.runTick();
    expect(getQueueItem(db, id)?.state).toBe('awaiting_manual_upload');

    await engine.runTick();
    expect(calls.detect).toContainEqual([id]);
  });

  it('survives an effect that throws', async () => {
    writeSetting(db, 'api_audit_confirmed_at', TEST_NOW.toISOString());
    writeSetting(db, 'upload_method', 'api');
    seedQueueItem(db, { state: 'approved' });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { effects } = fakeEffects({ startUpload: async () => { throw new Error('network down'); } });
    const engine = engineFor(effects);

    await expect(engine.runTick()).resolves.toBeDefined();
    await new Promise((resolve) => setImmediate(resolve));
    expect(engine.status().uploadInFlight).toBe(false);
    spy.mockRestore();
  });

  it('reports status for the UI instead of hardcoded zeroes', async () => {
    seedQueueItem(db, { state: 'approved' });
    seedQueueItem(db, { filename: 'b.mov', state: 'pending' });
    const engine = engineFor(fakeEffects().effects);
    await engine.runTick();

    const status = engine.status();
    expect(status.counts.pending).toBe(1);
    expect(status.nextPublishAt).not.toBeNull();
    expect(status).toMatchObject({ paused: false, auth: 'ok', uploadInFlight: false });
  });
});

describe('automatic rotation', () => {
  const settings = (over: Record<string, unknown> = {}): void => {
    writeSetting(db, 'rotation_max_postings', 3);
    writeSetting(db, 'rotation_min_gap_days', 14);
    writeSetting(db, 'rotation_upload_times', ['15:00']);
    for (const [key, value] of Object.entries(over)) writeSetting(db, key as never, value as never);
  };

  const postingsOf = (videoId: number): number =>
    (db.prepare('SELECT COUNT(*) n FROM queue WHERE video_id = ?').get(videoId) as { n: number }).n;

  const videoIdFor = (queueId: number): number =>
    (db.prepare('SELECT video_id FROM queue WHERE id = ?').get(queueId) as { video_id: number }).video_id;

  it('queues another posting once a video is due one', async () => {
    settings();
    const published = seedQueueItem(db, { filename: 'hit.mov', state: 'published', scheduledFor: '2026-08-01T09:00:00.000Z' });
    const video = videoIdFor(published);

    const { effects } = fakeEffects();
    await engineFor(effects).kick();

    expect(postingsOf(video)).toBe(2);
    const created = db.prepare('SELECT state, posting_kind, notify_subscribers FROM queue WHERE video_id = ? ORDER BY id DESC LIMIT 1').get(video) as Record<string, unknown>;
    // Still needs approving, and never announces itself.
    expect(created.state).toBe('pending');
    expect(created.posting_kind).toBe('rotation');
    expect(created.notify_subscribers).toBe(0);
  });

  it('waits until enough time has passed since the last posting', async () => {
    settings();
    const recent = new Date(TEST_NOW.getTime() - 2 * 86_400_000).toISOString();
    const published = seedQueueItem(db, { filename: 'recent.mov', state: 'published', scheduledFor: recent });
    const video = videoIdFor(published);

    const { effects } = fakeEffects();
    await engineFor(effects).kick();

    expect(postingsOf(video)).toBe(1);
  });

  it('does nothing while the scheduler is paused', async () => {
    settings();
    const published = seedQueueItem(db, { filename: 'paused.mov', state: 'published', scheduledFor: '2026-08-01T09:00:00.000Z' });
    const video = videoIdFor(published);

    const { effects } = fakeEffects();
    const engine = engineFor(effects);
    engine.pause();
    await engine.kick();

    expect(postingsOf(video)).toBe(1);
  });

  it('does nothing when rotation is switched off', async () => {
    settings({ rotation_max_postings: 0 });
    const published = seedQueueItem(db, { filename: 'off.mov', state: 'published', scheduledFor: '2026-08-01T09:00:00.000Z' });
    const video = videoIdFor(published);

    const { effects } = fakeEffects();
    await engineFor(effects).kick();

    expect(postingsOf(video)).toBe(1);
  });

  it('stops at the limit rather than posting forever', async () => {
    settings({ rotation_max_postings: 2 });
    const published = seedQueueItem(db, { filename: 'twice.mov', state: 'published', scheduledFor: '2026-08-01T09:00:00.000Z' });
    const video = videoIdFor(published);

    const { effects } = fakeEffects();
    await engineFor(effects).kick();
    expect(postingsOf(video)).toBe(2);

    // The second posting is still pending, so nothing more should be queued anyway.
    await engineFor(effects).kick();
    expect(postingsOf(video)).toBe(2);
  });
});
