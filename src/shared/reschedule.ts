// What to do when a video is dropped on a day whose times are all taken. Three answers, and they
// differ in how much else they disturb — which matters, because every already-uploaded video whose
// publish time changes costs another call to YouTube.
import { MIN_SCHEDULE_LEAD_MS } from './queue';
import { slotsForDay } from './slots';

export type DropStrategy = 'swap' | 'insert' | 'next_free';

export interface Scheduled {
  id: number;
  scheduled_for: string | null;
  /** Already on YouTube, so changing its time means telling YouTube about it. */
  onYouTube: boolean;
}

export interface ReschedulePlan {
  /** The moves to apply, in order. A null time means the video loses its slot. */
  changes: Array<{ id: number; at: string | null }>;
  /** How many of those are already on YouTube and will need a remote update. */
  remoteUpdates: number;
  problem?: string;
}

const EMPTY: ReschedulePlan = { changes: [], remoteUpdates: 0 };

const countRemote = (changes: ReschedulePlan['changes'], all: readonly Scheduled[]): number =>
  changes.filter((change) => all.find((entry) => entry.id === change.id)?.onYouTube === true).length;

/** Every slot from the given day onwards, in order, for the horizon. */
function slotSequence(from: Date, uploadTimes: readonly string[], days: number): string[] {
  const out: string[] = [];
  for (let offset = 0; offset <= days; offset += 1) {
    const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset);
    out.push(...slotsForDay(day, uploadTimes));
  }
  return out;
}

export interface DropQuery {
  moving: Scheduled;
  day: Date;
  all: readonly Scheduled[];
  uploadTimes: readonly string[];
  now: Date;
  horizonDays?: number;
}

/**
 * Swap: the arriving video takes the first slot on that day, and whatever was there takes the
 * arriving video's old time — or loses its slot, if the arrival had none. Two changes, whatever the
 * size of the schedule.
 */
export function planSwap(query: DropQuery): ReschedulePlan {
  const slots = slotsForDay(query.day, query.uploadTimes);
  const reachable = slots.filter((slot) => Date.parse(slot) >= query.now.getTime() + MIN_SCHEDULE_LEAD_MS);
  if (reachable.length === 0) return { ...EMPTY, problem: 'No time left on that day' };

  const target = reachable[0] as string;
  const occupant = query.all.find((entry) => entry.id !== query.moving.id && entry.scheduled_for === target);

  const changes: ReschedulePlan['changes'] = [{ id: query.moving.id, at: target }];
  if (occupant !== undefined) changes.push({ id: occupant.id, at: query.moving.scheduled_for });
  return { changes, remoteUpdates: countRemote(changes, query.all) };
}

/**
 * Insert: the arriving video takes the slot and everything from there on moves back one. Keeps the
 * order of the backlog, at the cost of touching every video after it.
 */
export function planInsert(query: DropQuery): ReschedulePlan {
  const horizon = query.horizonDays ?? 365;
  const sequence = slotSequence(query.day, query.uploadTimes, horizon).filter(
    (slot) => Date.parse(slot) >= query.now.getTime() + MIN_SCHEDULE_LEAD_MS
  );
  if (sequence.length === 0) return { ...EMPTY, problem: 'No time left on that day' };

  const target = sequence[0] as string;
  // Everything already sitting at or after the target, oldest first.
  const displaced = query.all
    .filter(
      (entry) =>
        entry.id !== query.moving.id &&
        entry.scheduled_for !== null &&
        Date.parse(entry.scheduled_for) >= Date.parse(target)
    )
    .sort((a, b) => Date.parse(a.scheduled_for as string) - Date.parse(b.scheduled_for as string));

  const changes: ReschedulePlan['changes'] = [{ id: query.moving.id, at: target }];
  for (let position = 0; position < displaced.length; position += 1) {
    const next = sequence[position + 1];
    if (next === undefined) {
      return { ...EMPTY, problem: 'The schedule does not reach far enough to move everything back' };
    }
    changes.push({ id: (displaced[position] as Scheduled).id, at: next });
  }
  return { changes, remoteUpdates: countRemote(changes, query.all) };
}

/** The existing behaviour: leave the day alone and take the next free slot anywhere. */
export function planNextFree(query: DropQuery, at: string | null): ReschedulePlan {
  if (at === null) return { ...EMPTY, problem: 'No free time before the schedule runs out' };
  const changes = [{ id: query.moving.id, at }];
  return { changes, remoteUpdates: countRemote(changes, query.all) };
}

/** Roughly what a plan costs against the daily API allowance: videos.update is 50 units each. */
export const UPDATE_UNITS = 50;
export const quotaCost = (plan: ReschedulePlan): number => plan.remoteUpdates * UPDATE_UNITS;
