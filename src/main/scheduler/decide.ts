// Pure scheduler decision: given the queue, settings and current holds, return the actions
// this tick should take. No clock, no database, no network, so every rule is testable.
import { MIN_SCHEDULE_LEAD_MS, type UploadMethod } from '../../shared/queue';
import { MISSABLE_STATES, PUBLISH_GRACE_MS, desiredPublishAt, isOnYouTube, type QueueStateFields } from '../domain/queueState';
import type { PostingKind } from '../../shared/rotation';
import { dayKey, nextFreeSlot } from '../../shared/slots';
import { sourceKey } from '../../shared/sourceVideo';

export interface SchedulerItem extends QueueStateFields {
  id: number;
  /** Which lane this posting draws its publish time from. */
  posting_kind: PostingKind;
  /** The file backing this item is gone or has changed. */
  missing: boolean;
  /** The long video it was cut from, by title, so Shorts from one video can be kept apart. */
  source_title?: string | null;
}

export interface SchedulerSettings {
  uploadMethod: UploadMethod;
  /** Times for first postings. */
  uploadTimes: readonly string[];
  /** Times for re-runs, kept separate so a backlog of them never delays a new video. */
  rotationUploadTimes: readonly string[];
  /** How far ahead auto-scheduling books, so the near-term schedule stays free to change. */
  autoScheduleDays: number;
  paused: boolean;
  /** Most Shorts from the same long video to book on one day. 0 or left out means no limit. */
  sourceDailyLimit?: number;
}

export interface SchedulerHolds {
  auth: 'ok' | 'expired' | 'disconnected' | 'offline';
  /** Set after a 5xx or rate limit: no API calls until it passes. */
  apiBackoffUntil: string | null;
  /** Set after quotaExceeded or uploadLimitExceeded: no new uploads until it passes. */
  uploadQuotaUntil: string | null;
  /** An upload is already running in this process. */
  uploadInFlight: boolean;
  /** The engine raises this periodically so failed remote syncs get another chance. */
  retryRemoteErrors: boolean;
  /** When the channel was last looked at for videos uploaded in Studio. Null before the first look. */
  lastDetectAt: string | null;
}

export interface SchedulerInput {
  now: Date;
  items: readonly SchedulerItem[];
  settings: SchedulerSettings;
  holds: SchedulerHolds;
}

export type SchedulerAction =
  | { type: 'missed_slot'; id: number }
  | { type: 'auto_slot'; id: number; at: string }
  | { type: 'begin_manual_upload'; id: number }
  | { type: 'start_upload'; id: number }
  | { type: 'sync_remote'; id: number }
  | { type: 'verify_remote'; id: number }
  | { type: 'detect_manual_uploads'; ids: number[] }
  | { type: 'remind_manual_upload'; id: number; at: string };

export const MAX_SYNC_PER_TICK = 3;
export const MAX_VERIFY_PER_TICK = 5;
/** How long before its slot the person is reminded to upload a video in Studio. */
export const REMIND_BEFORE_MS = 2 * 60 * 60_000;
/** How often to look for a Studio upload while one is due within the reminder window. */
export const DETECT_SOON_MS = 2 * 60_000;
/** How often otherwise. Each look costs two units of the daily allowance. */
export const DETECT_IDLE_MS = 10 * 60_000;

const passed = (iso: string | null, now: Date): boolean => iso === null || Date.parse(iso) <= now.getTime();
const linkedToYouTube = (item: SchedulerItem): boolean => item.youtube_video_id !== null && !item.remote_tombstone;

/** Waiting for the person to upload it in Studio: moved to waiting, or approved and not moved yet because of a pause. */
const awaitsStudioUpload = (item: SchedulerItem, method: UploadMethod): boolean =>
  !isOnYouTube(item) && (item.state === 'awaiting_manual_upload' || (method === 'assisted' && item.state === 'approved'));

/** Whether it is time to look at the channel again: often while a slot is close, rarely otherwise. */
function detectionDue(waiting: readonly SchedulerItem[], lastDetectAt: string | null, now: Date): boolean {
  if (lastDetectAt === null) return true;
  const soon = waiting.some((item) => {
    const at = desiredPublishAt(item);
    return at !== null && Date.parse(at) - now.getTime() <= REMIND_BEFORE_MS;
  });
  return now.getTime() - Date.parse(lastDetectAt) >= (soon ? DETECT_SOON_MS : DETECT_IDLE_MS);
}

function bySoonestSlotThenId(a: SchedulerItem, b: SchedulerItem): number {
  const left = a.scheduled_for === null ? Number.POSITIVE_INFINITY : Date.parse(a.scheduled_for);
  const right = b.scheduled_for === null ? Number.POSITIVE_INFINITY : Date.parse(b.scheduled_for);
  return left === right ? a.id - b.id : left - right;
}

export function decide({ now, items, settings, holds }: SchedulerInput): SchedulerAction[] {
  const actions: SchedulerAction[] = [];
  const apiUsable = holds.auth === 'ok' && passed(holds.apiBackoffUntil, now);
  const mayAct = !settings.paused;
  const mayUpload = mayAct && apiUsable && passed(holds.uploadQuotaUntil, now) && !holds.uploadInFlight;

  // 1. Slots that can no longer be met are handled before anything claims a new one. This runs
  //    even while paused, so resuming never publishes something late by surprise.
  const missed = new Set<number>();
  for (const item of items) {
    const desired = desiredPublishAt(item);
    if (desired === null || !MISSABLE_STATES.has(item.state)) continue;
    if (Date.parse(desired) < now.getTime() + MIN_SCHEDULE_LEAD_MS) {
      actions.push({ type: 'missed_slot', id: item.id });
      missed.add(item.id);
    }
  }

  // 2. Auto-fill undated approved videos, one slot at a time so two can never collide.
  if (mayAct) {
    // A missed automatic slot is about to be released, so it counts as free again.
    const freed = new Set(
      items
        .filter((item) => missed.has(item.id) && item.schedule_source === 'auto' && item.scheduled_for !== null)
        .map((item) => item.scheduled_for as string)
    );
    const taken = items
      .filter((item) => item.scheduled_for !== null && item.state !== 'rejected' && item.state !== 'published')
      .map((item) => item.scheduled_for as string)
      .filter((slot) => !freed.has(slot));

    const candidates = items
      .filter(
        (item) =>
          !missed.has(item.id) &&
          item.privacy === 'public' &&
          item.scheduled_for === null &&
          item.schedule_source !== 'hold' &&
          (item.state === 'approved' || item.state === 'awaiting_manual_upload')
      )
      .sort((a, b) => a.id - b.id);

    // Each lane draws from its own times. A slot claimed by either lane is claimed for both, since
    // both end up as real publish times on the channel; the lanes separate when videos go out, not
    // whether they collide.
    const lane = (kind: PostingKind): readonly string[] =>
      kind === 'rotation' ? settings.rotationUploadTimes : settings.uploadTimes;

    // New postings first: a re-run should never take the slot a new video was waiting for.
    const ordered = [...candidates].sort((a, b) => {
      if (a.posting_kind !== b.posting_kind) return a.posting_kind === 'new' ? -1 : 1;
      return a.id - b.id;
    });

    // Shorts from one long video, counted per day, so a limit can keep a batch from going out all at once.
    // Five to ten come from each long video here, and without one they would fill the day back to back.
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
          : new Set(
              [...(perSource.get(source) ?? new Map<string, number>())].filter(([, booked]) => booked >= limit).map(([day]) => day)
            );
      const at = nextFreeSlot({ uploadTimes, taken, now, horizonDays: settings.autoScheduleDays, blockedDays });
      // One lane running out does not stop the other: they book independently.
      if (at === null) continue;
      taken.push(at);
      if (source !== null) book(source, dayKey(new Date(at)));
      actions.push({ type: 'auto_slot', id: item.id, at });
    }
  }

  // 3. Move approved videos into the upload path for the chosen method.
  if (mayAct && settings.uploadMethod === 'assisted') {
    for (const item of items) {
      if (item.state === 'approved' && !isOnYouTube(item)) actions.push({ type: 'begin_manual_upload', id: item.id });
    }
  }

  if (mayUpload && settings.uploadMethod === 'api') {
    const ready = items
      .filter(
        (item) =>
          !isOnYouTube(item) &&
          !item.missing &&
          (item.state === 'approved' ||
            (item.state === 'failed' && item.next_attempt_at !== null && passed(item.next_attempt_at, now)))
      )
      .sort(bySoonestSlotThenId);
    // One upload at a time, and a stuck item only loses its turn: it can never block the rest.
    if (ready.length > 0) actions.push({ type: 'start_upload', id: ready[0].id });
  }

  // 4. Push local intent to YouTube.
  if (mayAct && apiUsable) {
    const pending = items
      .filter(
        (item) =>
          linkedToYouTube(item) && (item.remote_sync === 'pending' || (holds.retryRemoteErrors && item.remote_sync === 'error'))
      )
      .sort((a, b) => a.id - b.id)
      .slice(0, MAX_SYNC_PER_TICK);
    for (const item of pending) actions.push({ type: 'sync_remote', id: item.id });
  }

  // 5. Read back what YouTube actually did. These are reads, so they continue while paused.
  if (apiUsable) {
    const due = items
      .filter((item) => {
        if (!linkedToYouTube(item) || item.state !== 'scheduled') return false;
        const desired = desiredPublishAt(item);
        return desired !== null && Date.parse(desired) + PUBLISH_GRACE_MS <= now.getTime();
      })
      .sort(bySoonestSlotThenId)
      .slice(0, MAX_VERIFY_PER_TICK);
    for (const item of due) actions.push({ type: 'verify_remote', id: item.id });

    // Studio uploads are looked for while paused, and for videos still marked approved: pausing stops
    // ShortStack acting, not noticing what the person did themselves. Not on every tick, though. A look
    // is two API calls, and every 30 seconds that came to 5,760 units a day, over half the allowance.
    const waiting = items.filter((item) => awaitsStudioUpload(item, settings.uploadMethod));
    if (waiting.length > 0 && detectionDue(waiting, holds.lastDetectAt, now)) {
      actions.push({ type: 'detect_manual_uploads', ids: waiting.map((item) => item.id) });
    }
  }

  // 6. Remind the person to upload in Studio as a slot comes close. It is only a reminder, so it comes
  //    while paused too — the missed-slot check at the top does not stop for a pause either.
  if (settings.uploadMethod === 'assisted') {
    for (const item of items) {
      if (item.missing || !awaitsStudioUpload(item, 'assisted')) continue;
      const at = desiredPublishAt(item);
      if (at === null) continue;
      const left = Date.parse(at) - now.getTime();
      if (left >= MIN_SCHEDULE_LEAD_MS && left <= REMIND_BEFORE_MS) actions.push({ type: 'remind_manual_upload', id: item.id, at });
    }
  }

  return actions;
}
