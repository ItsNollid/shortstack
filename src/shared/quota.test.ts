import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DAILY_UNITS,
  UNIT_COSTS,
  costOf,
  describeMood,
  moodFor,
  nextReset,
  pacificDay,
  quotaState,
  whatIsLeft,
  type QuotaSpend
} from './quota';

const spend = (method: string, at: string, units = costOf(method)): QuotaSpend => ({ method, units, at });

describe('costOf', () => {
  it('knows the published prices', () => {
    expect(costOf('videos.insert')).toBe(1600);
    expect(costOf('videos.update')).toBe(50);
    expect(costOf('videos.list')).toBe(1);
  });

  // Getting this wrong in the other direction would under-report and let someone hit the wall.
  it('treats anything it does not know as a read, which is the cheapest thing it could be', () => {
    expect(costOf('something.new')).toBe(1);
  });
});

describe('pacificDay', () => {
  // The allowance resets on California's clock, not the user's and not UTC.
  it('uses the Pacific date, not the local one', () => {
    // September is daylight time, so Pacific is UTC-7 and midnight there is 07:00 UTC. A minute
    // before that is still the previous day, which is the boundary the allowance resets on.
    expect(pacificDay(new Date('2026-09-20T06:59:00Z'))).toBe('2026-09-19');
    expect(pacificDay(new Date('2026-09-20T07:00:00Z'))).toBe('2026-09-20');
  });

  it('handles the weeks when California has changed clocks and elsewhere has not', () => {
    // Pacific is UTC-8 in January and UTC-7 in July; both must land on the right day.
    expect(pacificDay(new Date('2026-01-15T07:30:00Z'))).toBe('2026-01-14');
    expect(pacificDay(new Date('2026-07-15T07:30:00Z'))).toBe('2026-07-15');
  });
});

describe('nextReset', () => {
  it('is in the future and lands on the following Pacific day', () => {
    const now = new Date('2026-09-20T20:00:00Z');
    const reset = nextReset(now);
    expect(reset.getTime()).toBeGreaterThan(now.getTime());
    expect(pacificDay(reset)).not.toBe(pacificDay(now));
  });

  it('is never more than a day and a bit away', () => {
    const now = new Date('2026-09-20T08:30:00Z');
    expect(nextReset(now).getTime() - now.getTime()).toBeLessThanOrEqual(26 * 3_600_000);
  });
});

describe('quotaState', () => {
  const now = new Date('2026-09-20T20:00:00Z');
  const today = '2026-09-20T18:00:00Z';
  const yesterday = '2026-09-19T18:00:00Z';

  it('adds up what was spent today and nothing else', () => {
    const state = quotaState([spend('videos.insert', today), spend('videos.insert', yesterday)], DEFAULT_DAILY_UNITS, now);
    expect(state.used).toBe(1600);
    expect(state.remaining).toBe(8400);
  });

  it('breaks it down by method, largest first', () => {
    const state = quotaState(
      [spend('videos.list', today), spend('videos.list', today), spend('videos.insert', today)],
      DEFAULT_DAILY_UNITS,
      now
    );
    expect(state.breakdown[0]).toEqual({ method: 'videos.insert', units: 1600, calls: 1 });
    expect(state.breakdown[1]).toEqual({ method: 'videos.list', units: 2, calls: 2 });
  });

  it('is empty and full on a day with no calls', () => {
    const state = quotaState([], DEFAULT_DAILY_UNITS, now);
    expect(state).toMatchObject({ used: 0, remaining: DEFAULT_DAILY_UNITS, percentUsed: 0, breakdown: [] });
  });

  // A bar that runs past its own end looks like a bug even when the number behind it is right.
  it('never draws past full, however much was spent', () => {
    const overspent = Array.from({ length: 10 }, () => spend('videos.insert', today));
    const state = quotaState(overspent, DEFAULT_DAILY_UNITS, now);
    expect(state.used).toBe(16_000);
    expect(state.percentUsed).toBe(100);
    expect(state.remaining).toBe(0);
  });

  it('falls back to the default rather than dividing by a nonsense allowance', () => {
    expect(quotaState([spend('videos.list', today)], 0, now).limit).toBe(DEFAULT_DAILY_UNITS);
  });
});

describe('whatIsLeft', () => {
  // Units mean nothing on their own. "1,700 left" is only useful once it says "one more upload".
  it('turns units into things a person does', () => {
    const left = whatIsLeft(3300);
    expect(left[0]).toEqual({ what: 'more uploads through the API', count: 2 });
    expect(left.find((entry) => entry.what.includes('schedule'))?.count).toBe(66);
  });

  it('leaves out what is no longer affordable rather than showing a zero', () => {
    const left = whatIsLeft(100);
    expect(left.some((entry) => entry.what.includes('uploads'))).toBe(false);
    expect(left.some((entry) => entry.what.includes('schedule'))).toBe(true);
    expect(whatIsLeft(0)).toEqual([]);
  });
});

describe('moodFor', () => {
  const state = (used: number) => quotaState([{ method: 'videos.insert', units: used, at: '2026-09-20T18:00:00Z' }], DEFAULT_DAILY_UNITS, new Date('2026-09-20T20:00:00Z'));

  it('is relaxed early and watchful later', () => {
    expect(moodFor(state(1000))).toBe('plenty');
    expect(moodFor(state(7500))).toBe('watch');
  });

  // The number that matters is whether another upload fits, not the percentage. At 85% used there
  // is still 1500 left, which looks fine and is not enough for a single upload.
  it('says so when what is left will not cover another upload', () => {
    expect(moodFor(state(8500))).toBe('nearly_out');
    expect(moodFor(state(UNIT_COSTS['videos.insert'] === 1600 ? 8400 : 0))).toBe('watch');
  });

  it('says when there is nothing left at all', () => {
    expect(moodFor(state(10_000))).toBe('out');
    expect(moodFor(state(99_000))).toBe('out');
  });

  it('has words for every mood', () => {
    for (const mood of ['plenty', 'watch', 'nearly_out', 'out'] as const) {
      expect(describeMood(mood).length).toBeGreaterThan(0);
    }
  });
});
