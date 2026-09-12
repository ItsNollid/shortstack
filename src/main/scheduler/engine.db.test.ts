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
