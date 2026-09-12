// Picks publish slots from the user's daily upload times. Pure and timezone-aware:
// slots are built as local wall-clock times so they survive daylight-saving changes,
// then stored as UTC instants.
import { MIN_SCHEDULE_LEAD_MS } from '../../shared/queue';

export interface SlotQuery {
  /** Daily times as "HH:MM" in the user's local timezone. */
  uploadTimes: readonly string[];
  /** Slots already claimed, as ISO strings. */
  taken: readonly string[];
  now: Date;
  /** How far ahead to look before giving up. */
  horizonDays?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseTime(value: string): { hours: number; minutes: number } | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match === null ? null : { hours: Number(match[1]), minutes: Number(match[2]) };
}

/** Every slot on the given local day, in order. */
export function slotsForDay(day: Date, uploadTimes: readonly string[]): string[] {
  const instants: number[] = [];
  for (const time of uploadTimes) {
    const parsed = parseTime(time);
    if (parsed === null) continue;
    instants.push(new Date(day.getFullYear(), day.getMonth(), day.getDate(), parsed.hours, parsed.minutes, 0, 0).getTime());
  }
  return [...new Set(instants)].sort((a, b) => a - b).map((instant) => new Date(instant).toISOString());
}

function isFree(slot: string, taken: readonly string[]): boolean {
  const instant = Date.parse(slot);
  return !taken.some((entry) => Date.parse(entry) === instant);
}

function isReachable(slot: string, now: Date): boolean {
  return Date.parse(slot) >= now.getTime() + MIN_SCHEDULE_LEAD_MS;
}

/** The first free slot on this day that is still reachable, or null when the day is full or past. */
export function pickSlotForDay(day: Date, query: Omit<SlotQuery, 'horizonDays'>): string | null {
  return slotsForDay(day, query.uploadTimes).find((slot) => isReachable(slot, query.now) && isFree(slot, query.taken)) ?? null;
}

/**
 * The next free slot from today onward: used to auto-fill approved videos that have no date.
 * When a day is full it moves to the next day rather than doubling up, which keeps the
 * cadence the user configured.
 */
export function nextFreeSlot(query: SlotQuery): string | null {
  const horizonDays = query.horizonDays ?? 60;
  for (let offset = 0; offset <= horizonDays; offset += 1) {
    const day = new Date(query.now.getTime() + offset * DAY_MS);
    const slot = pickSlotForDay(day, query);
    if (slot !== null) return slot;
  }
  return null;
}
