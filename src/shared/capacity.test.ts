import { describe, expect, it } from 'vitest';
import { SCHEDULE_HORIZON_DAYS, scheduleCapacity } from './capacity';

const NOW = new Date('2026-03-01T08:00:00');

describe('scheduleCapacity', () => {
  it('counts what the daily times can actually hold before the horizon runs out', () => {
    const twice = scheduleCapacity({ uploadTimes: ['09:00', '18:00'], taken: [], now: NOW, waiting: 0 });
    // Today counts too, because both of today's times are still more than 30 minutes away.
    expect(twice.freeSlots).toBe(2 * (SCHEDULE_HORIZON_DAYS + 1));
  });

  it('says how many videos cannot be given a time at all', () => {
    const capacity = scheduleCapacity({ uploadTimes: ['09:00'], taken: [], now: NOW, waiting: 200 });
    expect(capacity.freeSlots).toBe(SCHEDULE_HORIZON_DAYS + 1);
    expect(capacity.stranded).toBe(200 - (SCHEDULE_HORIZON_DAYS + 1));
  });

  it('reports nothing stranded when the schedule has room', () => {
    const capacity = scheduleCapacity({ uploadTimes: ['09:00', '13:00', '18:00', '22:00'], taken: [], now: NOW, waiting: 200 });
    expect(capacity.stranded).toBe(0);
  });

  it('does not count slots another video already holds', () => {
    const taken = [new Date(2026, 2, 1, 9, 0).toISOString(), new Date(2026, 2, 2, 9, 0).toISOString()];
    const withTaken = scheduleCapacity({ uploadTimes: ['09:00'], taken, now: NOW, waiting: 0 });
    const without = scheduleCapacity({ uploadTimes: ['09:00'], taken: [], now: NOW, waiting: 0 });
    expect(withTaken.freeSlots).toBe(without.freeSlots - 2);
  });

  it('ignores times inside the thirty minute publish lead', () => {
    const lateNow = new Date('2026-03-01T08:45:00');
    const capacity = scheduleCapacity({ uploadTimes: ['09:00'], taken: [], now: lateNow, waiting: 0 });
    // Today's 09:00 is fifteen minutes away, so it does not count.
    expect(capacity.freeSlots).toBe(SCHEDULE_HORIZON_DAYS);
  });

  it('says how long a backlog would take to clear at the current rate', () => {
    expect(scheduleCapacity({ uploadTimes: ['09:00', '18:00'], taken: [], now: NOW, waiting: 200 }).daysToClear).toBe(100);
    expect(scheduleCapacity({ uploadTimes: [], taken: [], now: NOW, waiting: 5 }).daysToClear).toBe(Infinity);
  });
});
