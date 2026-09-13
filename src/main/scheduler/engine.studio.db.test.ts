// Reminders to upload in Studio, and looking for those uploads, as the engine performs them.
import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { writeSetting } from '../db/settingsRepo';
import { TEST_NOW, createTestDb, seedQueueItem } from '../db/testFixtures';
import type { EffectOutcome, SchedulerEffects, UploadReminder } from './engine';
import { SchedulerEngine } from './engine';

let db: Database.Database;
beforeEach(() => {
  db = createTestDb();
  // As on the channel this was found on: uploads through Studio, and the scheduler paused.
  writeSetting(db, 'upload_method', 'assisted');
  writeSetting(db, 'scheduler_paused', true);
});

function fakeEffects() {
  const looks: number[][] = [];
  const onChange = vi.fn();
  const effects: SchedulerEffects = {
    authState: () => 'ok',
    startUpload: async (): Promise<EffectOutcome> => ({ ok: true }),
    syncRemote: async () => ({ ok: true }),
    verifyRemote: async () => ({ ok: true }),
    detectManualUploads: async (ids) => {
      looks.push([...ids]);
      return { ok: true };
    },
    onChange
  };
  return { effects, looks, onChange };
}

const minutesFromNow = (minutes: number): string => new Date(TEST_NOW.getTime() + minutes * 60_000).toISOString();

async function tick(engine: SchedulerEngine, clock: { now: Date }, times: number): Promise<void> {
  for (let count = 0; count < times; count += 1) {
    await engine.runTick();
    clock.now = new Date(clock.now.getTime() + 30_000);
  }
}

describe('uploads made in Studio', () => {
  it('reminds once for a slot under two hours away, however many ticks pass', async () => {
    const id = seedQueueItem(db, {
      filename: 'PETER GRIFFIN IN CALL OF DUTY.mov',
      privacy: 'public',
      state: 'approved',
      scheduledFor: minutesFromNow(100),
      scheduleSource: 'manual'
    });
    const reminders: UploadReminder[] = [];
    const { effects } = fakeEffects();
    const clock = { now: TEST_NOW };
    const engine = new SchedulerEngine({ db, effects, now: () => clock.now, remind: (reminder) => reminders.push(reminder) });

    await tick(engine, clock, 6);
    expect(reminders).toEqual([{ queueId: id, title: 'PETER GRIFFIN IN CALL OF DUTY', publishAt: minutesFromNow(100) }]);
  });

  it('looks at the channel on the first tick, then waits, and does not refresh the screen for looking', async () => {
    seedQueueItem(db, { privacy: 'public', state: 'approved', scheduledFor: minutesFromNow(24 * 60), scheduleSource: 'manual' });
    const { effects, looks, onChange } = fakeEffects();
    const clock = { now: TEST_NOW };
    const engine = new SchedulerEngine({ db, effects, now: () => clock.now });

    // Five minutes of 30-second ticks: once every tick used to be ten looks and ten refreshes.
    await tick(engine, clock, 10);
    expect(looks).toHaveLength(1);
    expect(onChange).not.toHaveBeenCalled();
  });
});
