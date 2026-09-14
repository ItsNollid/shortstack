// Choosing a publish time on a video itself, rather than only by dragging it onto the Calendar.
import { nextFreeSlot } from './slots';

export interface SlotChoiceQuery {
  uploadTimes: readonly string[];
  /** Times other videos already have. */
  taken: readonly string[];
  now: Date;
  horizonDays?: number;
  count: number;
}

/** The next few free times from the daily schedule, soonest first, none of them the same. */
export function nextFreeSlots(query: SlotChoiceQuery): string[] {
  const found: string[] = [];
  while (found.length < query.count) {
    const slot = nextFreeSlot({
      uploadTimes: query.uploadTimes,
      taken: [...query.taken, ...found],
      now: query.now,
      horizonDays: query.horizonDays
    });
    if (slot === null) break;
    found.push(slot);
  }
  return found;
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** A time the way a date-and-time box shows it: local wall-clock time, to the minute. */
export const toLocalInput = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

/** What a date-and-time box holds, as an instant, or null when it holds nothing usable. */
export function fromLocalInput(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (match === null) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), 0, 0);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
