// Booking publish times from the daily schedule, one video at a time so two can never collide. Shared by the
// scheduler, which gives approved videos times on its own, and by Fill the calendar, which does the same when asked,
// so the two can never disagree about where a video should go.
import type { PostingKind } from './rotation';
import { dayKey, nextFreeSlot } from './slots';
import { sourceKey } from './sourceVideo';

export interface BookingItem {
  id: number;
  state: string;
  scheduled_for: string | null;
  posting_kind: PostingKind;
  source_title?: string | null;
}

export interface BookingSettings {
  /** Times for first postings. */
  uploadTimes: readonly string[];
  /** Times for re-runs. */
  rotationUploadTimes: readonly string[];
  /** How far ahead to book. */
  horizonDays: number;
  /** Most Shorts from the same long video on one day. 0 or left out means no limit. */
  sourceDailyLimit?: number;
}

export interface Booking {
  id: number;
  at: string;
}

export interface BookingInput {
  /** The videos to book, in the order they should get the earliest times. */
  ordered: readonly BookingItem[];
  /** Everything in the queue, for counting how many from each long video a day already has. */
  items: readonly BookingItem[];
  /** Publish times already claimed. */
  taken: readonly string[];
  /** Times about to be released, which count as free. */
  freed?: ReadonlySet<string>;
  settings: BookingSettings;
  now: Date;
}

export function bookSlots({ ordered, items, taken: claimed, freed = new Set(), settings, now }: BookingInput): Booking[] {
  const taken = [...claimed];
  const bookings: Booking[] = [];

  // Each lane draws from its own times. A slot claimed by either lane is claimed for both, since both end up as real
  // publish times on the channel; the lanes separate when videos go out, not whether they collide.
  const lane = (kind: PostingKind): readonly string[] => (kind === 'rotation' ? settings.rotationUploadTimes : settings.uploadTimes);

  // Shorts from one long video, counted per day, so a limit can keep a batch from going out all at once. Five to ten
  // come from each long video here, and without one they would fill the day back to back.
  const limit = settings.sourceDailyLimit ?? 0;
  const perSource = new Map<string, Map<string, number>>();
  const book = (source: string, day: string): void => {
    const days = perSource.get(source) ?? new Map<string, number>();
    days.set(day, (days.get(day) ?? 0) + 1);
    perSource.set(source, days);
  };
  if (limit > 0) {
    for (const item of items) {
      const source = sourceKey(item.source_title);
      if (source === null || item.scheduled_for === null || item.state === 'rejected' || freed.has(item.scheduled_for)) continue;
      book(source, dayKey(new Date(item.scheduled_for)));
    }
  }

  for (const item of ordered) {
    const uploadTimes = lane(item.posting_kind);
    if (uploadTimes.length === 0) continue;
    const source = limit > 0 ? sourceKey(item.source_title) : null;
    const blockedDays =
      source === null
        ? undefined
        : new Set([...(perSource.get(source) ?? new Map<string, number>())].filter(([, booked]) => booked >= limit).map(([day]) => day));
    const at = nextFreeSlot({
      uploadTimes,
      taken,
      now,
      horizonDays: settings.horizonDays,
      blockedDays
    });
    // One lane running out does not stop the other: they book independently.
    if (at === null) continue;
    taken.push(at);
    if (source !== null) book(source, dayKey(new Date(at)));
    bookings.push({ id: item.id, at });
  }
  return bookings;
}
