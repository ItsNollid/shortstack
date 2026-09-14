import { describe, expect, it } from 'vitest';
import { listActivity } from '../db/activityRepo';
import { applyQueueEvent, getQueueItem } from '../db/queueRepo';
import { writeSetting } from '../db/settingsRepo';
import { createTestDb, seedQueueItem } from '../db/testFixtures';
import { applyFill, previewFill, undoFill } from './fill';

const NOW = new Date(2026, 8, 14, 8, 0, 0);
const ctx = { now: NOW, uploadMethod: 'assisted' as const };
const at = (day: number, hour: number): string => new Date(2026, 8, day, hour, 0, 0).toISOString();

function queue() {
  const db = createTestDb();
  writeSetting(db, 'upload_times', ['09:00', '18:00']);
  const waiting = seedQueueItem(db, { filename: 'waiting.mov' });
  const approved = seedQueueItem(db, {
    filename: 'approved.mov',
    state: 'approved'
  });
  return { db, waiting, approved };
}

describe('filling the calendar, for real', () => {
  it('gives each video a time from the daily schedule without approving anything, and says so in the history', () => {
    const { db, waiting, approved } = queue();
    expect(previewFill(db, true, NOW).assignments.map((entry) => entry.id)).toEqual([approved, waiting]);

    const result = applyFill(db, true, ctx);
    expect(result).toEqual({
      filled: [
        { id: approved, at: at(14, 9) },
        { id: waiting, at: at(14, 18) }
      ],
      refused: 0
    });
    expect(getQueueItem(db, waiting)).toMatchObject({
      state: 'pending',
      scheduled_for: at(14, 18),
      schedule_source: 'auto'
    });
    expect(listActivity(db, { queueId: waiting }).map((entry) => entry.action)).toContain('fill_slot');
  });

  it('leaves videos waiting for approval alone when not asked to include them', () => {
    const { db, waiting, approved } = queue();
    expect(applyFill(db, false, ctx).filled.map((entry) => entry.id)).toEqual([approved]);
    expect(getQueueItem(db, waiting)?.scheduled_for).toBeNull();
  });

  it('undoes only the times still where filling put them, back to no time rather than kept off', () => {
    const { db, waiting, approved } = queue();
    const { filled } = applyFill(db, true, ctx);
    // Moved by hand after filling: that one is the person's now.
    applyQueueEvent(db, approved, { type: 'schedule', at: at(16, 9) }, ctx);

    expect(undoFill(db, filled, ctx)).toBe(1);
    expect(getQueueItem(db, waiting)).toMatchObject({
      scheduled_for: null,
      schedule_source: null
    });
    expect(getQueueItem(db, approved)).toMatchObject({
      scheduled_for: at(16, 9),
      schedule_source: 'manual'
    });
  });
});
