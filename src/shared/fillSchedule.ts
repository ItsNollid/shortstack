// Fill the calendar: every video without a time gets one from the daily schedule, when the person asks. It is the
// same booking the scheduler does for approved videos on its own, and — only because a person asked — it can include
// videos still waiting for approval. It gives times. It approves nothing and uploads nothing.
import type { Privacy, QueueState, ScheduleSource } from './queue';
import { bookSlots, type BookingItem, type BookingSettings } from './slotBooking';

export interface FillItem extends BookingItem {
  title: string;
  state: QueueState;
  privacy: Privacy;
  schedule_source: ScheduleSource | null;
}

/** Approved and on the way to YouTube: the states the scheduler itself gives times in. */
const APPROVED_STATES: ReadonlySet<QueueState> = new Set(['approved', 'awaiting_manual_upload', 'uploaded', 'failed']);

export interface FillAssignment {
  id: number;
  title: string;
  at: string;
  awaitingApproval: boolean;
}

export interface FillPlan {
  assignments: FillAssignment[];
  /** Videos that could have had a time but found no free one within the days ShortStack books ahead. */
  leftOver: number;
  /** Videos the person took off the schedule, which filling leaves alone. */
  keptOff: number;
  /** Videos without a time that are still waiting for approval, whether or not they were included. */
  awaitingApproval: number;
  horizonDays: number;
}

export interface FillInput {
  items: readonly FillItem[];
  settings: BookingSettings;
  now: Date;
  includeUnapproved: boolean;
}

export function planFill({ items, settings, now, includeUnapproved }: FillInput): FillPlan {
  const undated = items.filter(
    (item) => item.privacy === 'public' && item.scheduled_for === null && (APPROVED_STATES.has(item.state) || item.state === 'pending')
  );
  const keptOff = undated.filter((item) => item.schedule_source === 'hold').length;
  const open = undated.filter((item) => item.schedule_source !== 'hold');
  const awaitingApproval = open.filter((item) => item.state === 'pending').length;
  const candidates = open.filter((item) => includeUnapproved || item.state !== 'pending');

  // Approved videos first, since they are decided; then new postings before re-runs, as the scheduler orders them.
  const ordered = [...candidates].sort((a, b) => {
    const waitingA = a.state === 'pending' ? 1 : 0;
    const waitingB = b.state === 'pending' ? 1 : 0;
    if (waitingA !== waitingB) return waitingA - waitingB;
    if (a.posting_kind !== b.posting_kind) return a.posting_kind === 'new' ? -1 : 1;
    return a.id - b.id;
  });

  const taken = items
    .filter((item) => item.scheduled_for !== null && item.state !== 'rejected' && item.state !== 'published')
    .map((item) => item.scheduled_for as string);

  const byId = new Map(candidates.map((item) => [item.id, item]));
  const assignments = bookSlots({ ordered, items, taken, settings, now })
    .map((booking) => {
      const item = byId.get(booking.id) as FillItem;
      return {
        id: booking.id,
        title: item.title,
        at: booking.at,
        awaitingApproval: item.state === 'pending'
      };
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  return {
    assignments,
    leftOver: candidates.length - assignments.length,
    keptOff,
    awaitingApproval,
    horizonDays: settings.horizonDays
  };
}
