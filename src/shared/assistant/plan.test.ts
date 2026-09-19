import { describe, expect, it } from 'vitest';
import type { FillPlan } from '../fillSchedule';
import { planFacts, type PlanItem } from './plan';

// Local time on purpose: days are the person's days. 19 September 2026 is a Saturday.
const NOW = new Date(2026, 8, 19, 8, 0, 0);
const at = (day: number, hour: number): string => new Date(2026, 8, day, hour, 0, 0).toISOString();

let nextId = 1;
const video = (over: Partial<PlanItem> = {}): PlanItem => ({
  id: nextId++,
  title: `Clip ${nextId}`,
  state: 'approved',
  scheduled_for: null,
  posting_kind: 'new',
  game: null,
  source_title: null,
  ...over
});

const ITEMS: PlanItem[] = [
  video({ state: 'pending' }),
  video({ state: 'pending' }),
  video({ title: 'Round 50 clutch', scheduled_for: at(19, 18), game: 'CS2', source_title: 'Round 50 attempt' }),
  video({ title: 'Round 50 fail', scheduled_for: at(20, 9), game: 'cs2', source_title: 'round 50 attempt' }),
  video({ title: 'Creeper jump', scheduled_for: at(21, 18), posting_kind: 'rotation', game: 'Minecraft' }),
  video({ state: 'rejected', scheduled_for: at(22, 9) }),
  video({ state: 'published', scheduled_for: at(10, 9) })
];

describe('what the assistant may say about the plan', () => {
  const texts = (fill: FillPlan | null = null): string[] => planFacts(ITEMS, fill, NOW).map((fact) => fact.text);

  it('counts what is waiting and what has no time', () => {
    expect(texts()).toEqual(expect.arrayContaining(['2 videos are waiting for approval.', '2 videos have no publish time yet.']));
  });

  it('describes the next seven days, leaving out what was set aside', () => {
    expect(texts()).toContain('3 videos are set to go out in the next seven days: 2 new and 1 re-run.');
    expect(texts()).toContain('Nothing is set to go out on Tuesday, Wednesday, Thursday and Friday.');
  });

  it('points out the same game, and the same long video, back to back', () => {
    expect(texts()).toContain('Two videos from the same game go out back to back: "Round 50 clutch" then "Round 50 fail".');
    expect(texts()).toContain('Two videos from the same long video go out back to back: "Round 50 clutch" then "Round 50 fail".');
  });

  it('says what Fill the calendar would do', () => {
    const fill: FillPlan = {
      assignments: [
        { id: 1, title: 'a', at: at(22, 9), awaitingApproval: true },
        { id: 2, title: 'b', at: at(22, 13), awaitingApproval: true }
      ],
      leftOver: 0,
      keptOff: 0,
      awaitingApproval: 2,
      horizonDays: 14
    };
    expect(texts(fill)).toContain(`Fill the calendar would give 2 videos a time, the first at ${at(22, 9)}.`);
  });
});
