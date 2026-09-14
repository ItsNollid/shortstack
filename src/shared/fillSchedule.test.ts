import { describe, expect, it } from 'vitest';
import { planFill, type FillItem } from './fillSchedule';

// Local time on purpose: daily times are set in the hours the person lives in.
const NOW = new Date(2026, 8, 14, 8, 0, 0);
const at = (day: number, hour: number): string => new Date(2026, 8, day, hour, 0, 0).toISOString();

const SETTINGS = {
  uploadTimes: ['09:00', '18:00'],
  rotationUploadTimes: ['12:00'],
  horizonDays: 14,
  sourceDailyLimit: 0
};

let nextId = 1;
const video = (over: Partial<FillItem> = {}): FillItem => ({
  id: nextId++,
  title: `Clip ${nextId}`,
  state: 'pending',
  privacy: 'public',
  scheduled_for: null,
  schedule_source: null,
  posting_kind: 'new',
  source_title: null,
  ...over
});

describe('filling the calendar', () => {
  it('gives approved videos the earliest free times, skipping ones already taken', () => {
    const booked = video({
      state: 'approved',
      scheduled_for: at(14, 9),
      schedule_source: 'manual'
    });
    const first = video({ state: 'approved' });
    const second = video({ state: 'awaiting_manual_upload' });
    const plan = planFill({
      items: [booked, first, second],
      settings: SETTINGS,
      now: NOW,
      includeUnapproved: false
    });
    expect(plan.assignments.map((entry) => [entry.id, entry.at])).toEqual([
      [first.id, at(14, 18)],
      [second.id, at(15, 9)]
    ]);
    expect(plan.leftOver).toBe(0);
  });

  it('leaves videos waiting for approval out unless asked, and counts them either way', () => {
    const waiting = video();
    const approved = video({ state: 'approved' });
    const without = planFill({
      items: [waiting, approved],
      settings: SETTINGS,
      now: NOW,
      includeUnapproved: false
    });
    expect(without.assignments.map((entry) => entry.id)).toEqual([approved.id]);
    expect(without.awaitingApproval).toBe(1);

    const withThem = planFill({
      items: [waiting, approved],
      settings: SETTINGS,
      now: NOW,
      includeUnapproved: true
    });
    // Approved first, even though the waiting one is older.
    expect(withThem.assignments).toEqual([
      {
        id: approved.id,
        title: approved.title,
        at: at(14, 9),
        awaitingApproval: false
      },
      {
        id: waiting.id,
        title: waiting.title,
        at: at(14, 18),
        awaitingApproval: true
      }
    ]);
  });

  it('puts re-runs in their own lane of times, after new videos', () => {
    const rerun = video({ state: 'approved', posting_kind: 'rotation' });
    const fresh = video({ state: 'approved' });
    const plan = planFill({
      items: [rerun, fresh],
      settings: SETTINGS,
      now: NOW,
      includeUnapproved: false
    });
    expect(plan.assignments.find((entry) => entry.id === fresh.id)?.at).toBe(at(14, 9));
    expect(plan.assignments.find((entry) => entry.id === rerun.id)?.at).toBe(at(14, 12));
  });

  it('leaves alone what was taken off the schedule, what is not public, and what is already decided', () => {
    const plan = planFill({
      items: [
        video({ state: 'approved', schedule_source: 'hold' }),
        video({ state: 'approved', privacy: 'unlisted' }),
        video({ state: 'rejected' }),
        video({ state: 'published' })
      ],
      settings: SETTINGS,
      now: NOW,
      includeUnapproved: true
    });
    expect(plan).toMatchObject({
      assignments: [],
      keptOff: 1,
      leftOver: 0,
      awaitingApproval: 0
    });
  });

  it('says how many did not fit within the days it books ahead', () => {
    const many = Array.from({ length: 5 }, () => video({ state: 'approved' }));
    const plan = planFill({
      items: many,
      settings: { ...SETTINGS, horizonDays: 1 },
      now: NOW,
      includeUnapproved: false
    });
    // Two times today and two tomorrow.
    expect(plan.assignments).toHaveLength(4);
    expect(plan).toMatchObject({ leftOver: 1, horizonDays: 1 });
  });

  it('keeps to the limit on Shorts from one long video per day', () => {
    const fromRun = Array.from({ length: 3 }, () => video({ state: 'approved', source_title: 'Round 50 attempt' }));
    const plan = planFill({
      items: fromRun,
      settings: { ...SETTINGS, sourceDailyLimit: 1 },
      now: NOW,
      includeUnapproved: false
    });
    expect(plan.assignments.map((entry) => new Date(entry.at).getDate())).toEqual([14, 15, 16]);
  });
});
