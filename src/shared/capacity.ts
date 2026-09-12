// How much room the daily schedule actually has. The auto-slotter stops at a 60-day horizon, so a
// large batch can quietly run out of dates; this is what lets the app say so instead of going quiet.
import { MIN_SCHEDULE_LEAD_MS } from './queue';
import { slotsForDay } from './slots';

export const SCHEDULE_HORIZON_DAYS = 60;

export interface CapacityQuery {
  uploadTimes: readonly string[];
  /** Publish times already claimed, as ISO strings. */
  taken: readonly string[];
  now: Date;
  /** Approved, public videos still waiting for a time. */
  waiting: number;
  horizonDays?: number;
}

export interface Capacity {
  /** Free, reachable slots between now and the end of the horizon. */
  freeSlots: number;
  /** How many of the waiting videos cannot be given a time at all. */
  stranded: number;
  /** The last day the schedule reaches. */
  horizonEnd: Date;
  /** Days needed to place everything waiting, ignoring the horizon. */
  daysToClear: number;
}

export function scheduleCapacity(query: CapacityQuery): Capacity {
  const horizonDays = query.horizonDays ?? SCHEDULE_HORIZON_DAYS;
  const claimed = new Set(query.taken.map((iso) => Date.parse(iso)));
  const earliest = query.now.getTime() + MIN_SCHEDULE_LEAD_MS;

  let freeSlots = 0;
  for (let offset = 0; offset <= horizonDays; offset += 1) {
    const day = new Date(query.now.getFullYear(), query.now.getMonth(), query.now.getDate() + offset);
    for (const slot of slotsForDay(day, query.uploadTimes)) {
      const at = Date.parse(slot);
      if (at >= earliest && !claimed.has(at)) freeSlots += 1;
    }
  }

  const perDay = new Set(query.uploadTimes).size;
  return {
    freeSlots,
    stranded: Math.max(0, query.waiting - freeSlots),
    horizonEnd: new Date(query.now.getFullYear(), query.now.getMonth(), query.now.getDate() + horizonDays),
    daysToClear: perDay === 0 ? Infinity : Math.ceil(query.waiting / perDay)
  };
}
