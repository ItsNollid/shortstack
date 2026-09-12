// Drag-and-drop rules for the calendar. Pure, so the grid, the tray and the keyboard path all
// refuse the same drops for the same reasons — and so a test can prove those reasons match the
// state machine rather than approximating it.
import type { AttentionCode, Privacy, QueueState } from './queue';
import { MIN_SCHEDULE_LEAD_MS } from './queue';
import { pickSlotForDay } from './slots';

/** Custom type so `dragover` can tell a queue chip from a file dropped in from the desktop. */
export const DRAG_TYPE = 'application/x-shortstack-queue';

export interface DragSubject {
  id: number;
  state: QueueState;
  privacy: Privacy;
  attention_code: AttentionCode | null;
  scheduled_for: string | null;
}

const SCHEDULE_RESOLVABLE: readonly AttentionCode[] = ['missed_slot', 'set_schedule_in_studio'];

/** Why this video cannot be given a publish time at all, or null when it can. */
export function scheduleBlocker(item: DragSubject): string | null {
  if (item.state === 'published') return 'Already published. Manage it in YouTube Studio.';
  if (item.state === 'rejected') return 'Rejected videos are not scheduled. Restore it first.';
  if (item.privacy !== 'public') {
    return 'Only public videos are scheduled. Unlisted and private videos upload straight away.';
  }
  if (item.state === 'needs_attention') {
    if (item.attention_code === null || !SCHEDULE_RESOLVABLE.includes(item.attention_code)) {
      return 'Sort out what this video needs before giving it a time.';
    }
  }
  return null;
}

export const canDrag = (item: DragSubject): boolean => scheduleBlocker(item) === null;

export type DropVerdict = { ok: true; at: string } | { ok: false; reason: string };

export interface DropQuery {
  item: DragSubject;
  day: Date;
  uploadTimes: readonly string[];
  /** Publish times already claimed, including the dragged video's own, which is ignored. */
  taken: ReadonlyArray<{ id: number; scheduled_for: string | null }>;
  now: Date;
}

/** What happens if this video is dropped on this day. */
export function dropOnDay({ item, day, uploadTimes, taken, now }: DropQuery): DropVerdict {
  const blocker = scheduleBlocker(item);
  if (blocker !== null) return { ok: false, reason: blocker };

  const endOfDay = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
  if (endOfDay <= now.getTime()) return { ok: false, reason: 'That day has already been and gone.' };

  if (uploadTimes.length === 0) return { ok: false, reason: 'Add at least one daily upload time in Settings.' };

  const claimed = taken
    .filter((entry) => entry.id !== item.id && entry.scheduled_for !== null)
    .map((entry) => entry.scheduled_for as string);

  const at = pickSlotForDay(day, { uploadTimes, taken: claimed, now });
  if (at !== null) return { ok: true, at };

  const anyReachable = uploadTimes.length > 0 && endOfDay > now.getTime() + MIN_SCHEDULE_LEAD_MS;
  return {
    ok: false,
    reason: anyReachable
      ? 'Every time on that day is taken. Try another day, or add a time in Settings.'
      : 'No time left on that day. Publishing needs at least 30 minutes notice.'
  };
}
