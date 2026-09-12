// Pure scheduler decision: given the queue, settings and current holds, return the actions
// this tick should take. No clock, no database, no network, so every rule is testable.
import { MIN_SCHEDULE_LEAD_MS, type UploadMethod } from '../../shared/queue';
import { MISSABLE_STATES, PUBLISH_GRACE_MS, desiredPublishAt, isOnYouTube, type QueueStateFields } from '../domain/queueState';
import { nextFreeSlot } from '../../shared/slots';

export interface SchedulerItem extends QueueStateFields {
  id: number;
  /** The file backing this item is gone or has changed. */
  missing: boolean;
}

export interface SchedulerSettings {
  uploadMethod: UploadMethod;
  uploadTimes: readonly string[];
  paused: boolean;
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
  | { type: 'detect_manual_uploads'; ids: number[] };

export const MAX_SYNC_PER_TICK = 3;
export const MAX_VERIFY_PER_TICK = 5;

const passed = (iso: string | null, now: Date): boolean => iso === null || Date.parse(iso) <= now.getTime();
const linkedToYouTube = (item: SchedulerItem): boolean => item.youtube_video_id !== null && !item.remote_tombstone;

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

    for (const item of candidates) {
      const at = nextFreeSlot({ uploadTimes: settings.uploadTimes, taken, now });
      if (at === null) break;
      taken.push(at);
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

    const awaiting = items.filter((item) => item.state === 'awaiting_manual_upload' && !isOnYouTube(item)).map((item) => item.id);
    if (awaiting.length > 0) actions.push({ type: 'detect_manual_uploads', ids: awaiting });
  }

  return actions;
}
