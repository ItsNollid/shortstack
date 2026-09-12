import { describe, expect, it } from 'vitest';
import { nextFreeSlot, pickSlotForDay, slotsForDay } from './slots';

const TIMES = ['09:00', '13:00', '18:00', '22:00'];
// Built from local components so the expectations hold in any machine timezone.
const localTime = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0);

describe('slotsForDay', () => {
  it('returns the configured times on that local day, in order', () => {
    const slots = slotsForDay(at(2026, 9, 12), ['22:00', '09:00', '13:00']);
    expect(slots.map(localTime)).toEqual(['09:00', '13:00', '22:00']);
    expect(new Date(slots[0]).getDate()).toBe(12);
  });

  it('ignores malformed times and duplicates', () => {
    expect(slotsForDay(at(2026, 9, 12), ['09:00', '09:00', '9am', '25:00', '']).map(localTime)).toEqual(['09:00']);
  });
});

describe('pickSlotForDay', () => {
  const now = at(2026, 9, 12, 8, 0);

  it('picks the first slot that is still at least 30 minutes away', () => {
    const slot = pickSlotForDay(at(2026, 9, 12), { uploadTimes: TIMES, taken: [], now });
    expect(localTime(slot as string)).toBe('09:00');
  });

  it('skips slots that are too close to now', () => {
    const slot = pickSlotForDay(at(2026, 9, 12), { uploadTimes: TIMES, taken: [], now: at(2026, 9, 12, 8, 45) });
    expect(localTime(slot as string)).toBe('13:00');
  });

  it('skips slots already claimed', () => {
    const nine = slotsForDay(at(2026, 9, 12), TIMES)[0];
    const slot = pickSlotForDay(at(2026, 9, 12), { uploadTimes: TIMES, taken: [nine], now });
    expect(localTime(slot as string)).toBe('13:00');
  });

  it('returns null when the day has nothing left', () => {
    const all = slotsForDay(at(2026, 9, 12), TIMES);
    expect(pickSlotForDay(at(2026, 9, 12), { uploadTimes: TIMES, taken: all, now })).toBeNull();
    expect(pickSlotForDay(at(2026, 9, 11), { uploadTimes: TIMES, taken: [], now })).toBeNull();
  });
});

describe('nextFreeSlot', () => {
  const now = at(2026, 9, 12, 8, 0);

  it('fills today first, then rolls forward instead of doubling up', () => {
    const taken: string[] = [];
    const picked: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      const slot = nextFreeSlot({ uploadTimes: TIMES, taken, now });
      expect(slot).not.toBeNull();
      taken.push(slot as string);
      picked.push(slot as string);
    }
    expect(picked.map(localTime)).toEqual(['09:00', '13:00', '18:00', '22:00', '09:00', '13:00']);
    expect(new Date(picked[4]).getDate()).toBe(13);
    expect(new Set(picked).size).toBe(6);
  });

  it('keeps the same local time on every day, across daylight-saving changes', () => {
    const taken: string[] = [];
    const marchNow = at(2026, 3, 6, 8, 0);
    const hours = new Set<string>();
    for (let i = 0; i < 12; i += 1) {
      const slot = nextFreeSlot({ uploadTimes: ['09:00'], taken, now: marchNow }) as string;
      taken.push(slot);
      hours.add(localTime(slot));
    }
    expect([...hours]).toEqual(['09:00']);
    expect(new Set(taken).size).toBe(12);
  });

  it('gives up past the horizon', () => {
    const taken = [...slotsForDay(at(2026, 9, 12), TIMES), ...slotsForDay(at(2026, 9, 13), TIMES)];
    expect(nextFreeSlot({ uploadTimes: TIMES, taken, now, horizonDays: 1 })).toBeNull();
  });

  it('returns null when the user has no upload times configured', () => {
    expect(nextFreeSlot({ uploadTimes: [], taken: [], now })).toBeNull();
  });
});
