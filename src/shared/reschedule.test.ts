import { describe, expect, it } from 'vitest';
import { UPDATE_UNITS, planInsert, planNextFree, planSwap, quotaCost, type Scheduled } from './reschedule';

const NOW = new Date('2026-03-01T08:00:00');
const TIMES = ['09:00', '18:00'];
const day = (d: number): Date => new Date(2026, 2, d);
const at = (d: number, h: number): string => new Date(2026, 2, d, h, 0).toISOString();

const video = (id: number, scheduled: string | null, onYouTube = false): Scheduled => ({
  id,
  scheduled_for: scheduled,
  onYouTube
});

describe('swap', () => {
  it('trades places with whatever was there', () => {
    const moving = video(1, at(10, 9));
    const occupant = video(2, at(2, 9));
    const plan = planSwap({ moving, day: day(2), all: [moving, occupant], uploadTimes: TIMES, now: NOW });

    expect(plan.changes).toEqual([
      { id: 1, at: at(2, 9) },
      { id: 2, at: at(10, 9) }
    ]);
  });

  it('leaves the displaced video with no time when the arrival had none', () => {
    const moving = video(1, null);
    const occupant = video(2, at(2, 9));
    const plan = planSwap({ moving, day: day(2), all: [moving, occupant], uploadTimes: TIMES, now: NOW });

    expect(plan.changes[1]).toEqual({ id: 2, at: null });
  });

  it('costs two changes however large the schedule is', () => {
    const moving = video(1, at(30, 9));
    const others = Array.from({ length: 200 }, (_, index) => video(index + 2, at(2 + index, 9)));
    const plan = planSwap({ moving, day: day(2), all: [moving, ...others], uploadTimes: TIMES, now: NOW });
    expect(plan.changes).toHaveLength(2);
  });

  it('refuses a day with nothing reachable left on it', () => {
    const moving = video(1, null);
    const plan = planSwap({ moving, day: day(1), all: [moving], uploadTimes: ['07:00'], now: NOW });
    expect(plan.problem).toBeDefined();
    expect(plan.changes).toHaveLength(0);
  });
});

describe('insert', () => {
  it('takes the slot and moves everything after it back one', () => {
    const moving = video(1, null);
    const a = video(2, at(2, 9));
    const b = video(3, at(2, 18));
    const plan = planInsert({ moving, day: day(2), all: [moving, a, b], uploadTimes: TIMES, now: NOW });

    expect(plan.changes).toEqual([
      { id: 1, at: at(2, 9) },
      { id: 2, at: at(2, 18) },
      { id: 3, at: at(3, 9) }
    ]);
  });

  it('leaves videos before the target alone', () => {
    const moving = video(1, null);
    const earlier = video(2, at(1, 18));
    const later = video(3, at(5, 9));
    const plan = planInsert({ moving, day: day(5), all: [moving, earlier, later], uploadTimes: TIMES, now: NOW });

    expect(plan.changes.map((change) => change.id)).toEqual([1, 3]);
  });

  it('is the expensive one, and says how expensive', () => {
    // Fifty already-published videos after the insertion point all need telling.
    const moving = video(1, null);
    const others = Array.from({ length: 50 }, (_, index) => video(index + 2, at(2 + index, 9), true));
    const plan = planInsert({ moving, day: day(2), all: [moving, ...others], uploadTimes: ['09:00'], now: NOW });

    expect(plan.remoteUpdates).toBe(50);
    expect(quotaCost(plan)).toBe(50 * UPDATE_UNITS);
  });

  it('refuses rather than dropping videos off the end of the schedule', () => {
    const moving = video(1, null);
    const others = Array.from({ length: 5 }, (_, index) => video(index + 2, at(2 + index, 9)));
    const plan = planInsert({
      moving,
      day: day(2),
      all: [moving, ...others],
      uploadTimes: ['09:00'],
      now: NOW,
      horizonDays: 3
    });
    expect(plan.problem).toBeDefined();
    expect(plan.changes).toHaveLength(0);
  });
});

describe('next free', () => {
  it('moves only the one video', () => {
    const moving = video(1, null);
    const plan = planNextFree({ moving, day: day(2), all: [moving], uploadTimes: TIMES, now: NOW }, at(9, 9));
    expect(plan.changes).toEqual([{ id: 1, at: at(9, 9) }]);
  });

  it('says so when there is nowhere left', () => {
    const moving = video(1, null);
    const plan = planNextFree({ moving, day: day(2), all: [moving], uploadTimes: TIMES, now: NOW }, null);
    expect(plan.problem).toBeDefined();
  });
});

describe('what each choice costs', () => {
  it('counts only the videos already on YouTube', () => {
    const moving = video(1, at(10, 9), true);
    const occupant = video(2, at(2, 9), false);
    const plan = planSwap({ moving, day: day(2), all: [moving, occupant], uploadTimes: TIMES, now: NOW });
    expect(plan.remoteUpdates).toBe(1);
  });
});
