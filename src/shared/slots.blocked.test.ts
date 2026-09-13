import { describe, expect, it } from 'vitest';
import { dayKey, nextFreeSlot } from './slots';

describe('days nothing more may be booked on', () => {
  const now = new Date(2026, 8, 14, 6, 0, 0);

  it('moves to the next day when this one is blocked', () => {
    const at = nextFreeSlot({ uploadTimes: ['09:00'], taken: [], now, blockedDays: new Set([dayKey(now)]) });
    expect(at).not.toBeNull();
    expect(new Date(at as string).getDate()).toBe(15);
  });

  it('names a day by the local calendar, whatever the hour', () => {
    expect(dayKey(new Date(2026, 8, 14, 23, 30))).toBe(dayKey(new Date(2026, 8, 14, 0, 5)));
    expect(dayKey(new Date(2026, 8, 14, 12, 0))).not.toBe(dayKey(new Date(2026, 8, 15, 12, 0)));
  });
});
