import { describe, expect, it } from 'vitest';
import { fromLocalInput, nextFreeSlots, toLocalInput } from './slotChoices';

describe('picking a time on the video', () => {
  const now = new Date(2026, 8, 14, 10, 0, 0);

  it('offers the next free times from the daily schedule, skipping taken ones', () => {
    const taken = [new Date(2026, 8, 14, 13, 0, 0).toISOString()];
    const slots = nextFreeSlots({ uploadTimes: ['09:00', '13:00', '18:00'], taken, now, count: 3 });
    expect(slots.map((slot) => new Date(slot))).toEqual([
      new Date(2026, 8, 14, 18, 0, 0),
      new Date(2026, 8, 15, 9, 0, 0),
      new Date(2026, 8, 15, 13, 0, 0)
    ]);
  });

  it('offers fewer when the schedule runs out', () => {
    expect(nextFreeSlots({ uploadTimes: [], taken: [], now, count: 3 })).toEqual([]);
  });

  it('turns a date-and-time box value into an instant and back, in local time', () => {
    const at = new Date(2026, 8, 16, 10, 30, 0);
    expect(toLocalInput(at)).toBe('2026-09-16T10:30');
    expect(fromLocalInput('2026-09-16T10:30')).toBe(at.toISOString());
    expect(fromLocalInput('')).toBeNull();
    expect(fromLocalInput('next tuesday')).toBeNull();
  });
});
