// Pure queue state machine. Every change to a queue item's lifecycle goes through
// transition(), which either returns the column patch to apply or a reason to refuse.
import {
  MIN_SCHEDULE_LEAD_MS,
  type AttentionCode,
  type Privacy,
  type QueueState,
  type RemoteSync,
  type ScheduleSource,
  type UploadMethod
} from '../../shared/queue';

export interface QueueStateFields {
  state: QueueState;
  privacy: Privacy;
  scheduled_for: string | null;
  schedule_source: ScheduleSource | null;
  youtube_video_id: string | null;
  remote_tombstone: boolean;
  remote_publish_at: string | null;
  remote_sync: RemoteSync | null;
  remote_error: string | null;
  upload_session_uri: string | null;
  upload_bytes_confirmed: number;
  attempts: number;
  last_error: string | null;
  next_attempt_at: string | null;
  attention_code: AttentionCode | null;
  attention_from_state: QueueState | null;
}

export type QueueEvent =
  | { type: 'approve' }
  | { type: 'unapprove' }
  | { type: 'reject' }
  | { type: 'restore' }
  | { type: 'schedule'; at: string }
  | { type: 'hold' }
  | { type: 'auto_slot'; at: string }
  | { type: 'edit_metadata' }
  | { type: 'method_changed' }
  | { type: 'begin_manual_upload' }
  | { type: 'link_video'; videoId: string }
  | { type: 'begin_upload'; sessionUri: string }
  | { type: 'upload_progress'; bytesConfirmed: number }
  | { type: 'upload_completed'; videoId: string }
  | { type: 'upload_failed'; retryable: boolean; error: string; nextAttemptAt: string | null; maxAttempts: number }
  | { type: 'upload_session_lost' }
  | { type: 'upload_possible_duplicate'; error: string }
  | { type: 'upload_cancelled' }
  | { type: 'remote_observed'; privacy: Privacy; publishAt: string | null }
  | { type: 'remote_sync_failed'; error: string; scheduleRefused: boolean }
  | { type: 'missed_slot' }
  | { type: 'flag'; code: AttentionCode; error: string }
  | { type: 'resolve_attention' }
  | { type: 'confirm_not_duplicate' }
  | { type: 'disconnect' };

export interface TransitionContext {
  now: Date;
  uploadMethod: UploadMethod;
}

export type TransitionResult = { ok: true; patch: Partial<QueueStateFields> } | { ok: false; reason: string };

/** How long after a slot a still-private video is given before it's treated as locked private. */
export const PUBLISH_GRACE_MS = 15 * 60 * 1000;

const REJECTABLE: ReadonlySet<QueueState> = new Set(['pending', 'approved', 'awaiting_manual_upload', 'failed', 'needs_attention']);
const AUTO_SLOTTABLE: ReadonlySet<QueueState> = new Set(['approved', 'awaiting_manual_upload', 'uploading', 'uploaded', 'failed']);
const MISSABLE: ReadonlySet<QueueState> = new Set(['approved', 'awaiting_manual_upload', 'uploaded', 'failed']);
const RECONCILABLE: ReadonlySet<QueueState> = new Set(['uploaded', 'scheduled', 'published', 'needs_attention']);
const SCHEDULE_RESOLVABLE: ReadonlySet<AttentionCode> = new Set(['missed_slot', 'set_schedule_in_studio']);
const DUPLICATE_CODES: ReadonlySet<AttentionCode> = new Set(['possible_duplicate', 'duplicate_uploads']);

const ok = (patch: Partial<QueueStateFields>): TransitionResult => ({ ok: true, patch });
const deny = (reason: string): TransitionResult => ({ ok: false, reason });

const clearAttention = { attention_code: null, attention_from_state: null } as const;
const clearSession = { upload_session_uri: null, upload_bytes_confirmed: 0 } as const;

export function isOnYouTube(item: Pick<QueueStateFields, 'youtube_video_id' | 'remote_tombstone'>): boolean {
  return item.youtube_video_id !== null || item.remote_tombstone;
}

/** The publish time YouTube should hold for this item, or null when it shouldn't be scheduled. */
export function desiredPublishAt(item: Pick<QueueStateFields, 'privacy' | 'schedule_source' | 'scheduled_for'>): string | null {
  return item.privacy === 'public' && item.schedule_source !== 'hold' ? item.scheduled_for : null;
}

export function sameInstant(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return Date.parse(a) === Date.parse(b);
}

function isReachableSlot(at: string, now: Date): boolean {
  const t = Date.parse(at);
  return Number.isFinite(t) && t >= now.getTime() + MIN_SCHEDULE_LEAD_MS;
}

function clearAutoSlot(item: QueueStateFields): Partial<QueueStateFields> {
  return item.schedule_source === 'auto' ? { scheduled_for: null, schedule_source: null } : {};
}

function stateBeforeAttention(item: QueueStateFields): QueueState {
  const from = item.attention_from_state;
  if (from === null || from === 'uploading' || from === 'needs_attention') {
    return item.youtube_video_id !== null ? 'uploaded' : 'approved';
  }
  return from === 'scheduled' ? 'uploaded' : from;
}

function applyScheduleChange(item: QueueStateFields, change: Partial<QueueStateFields>): TransitionResult {
  if (item.state === 'published' || item.state === 'rejected') {
    return deny(`A ${item.state} video can't be rescheduled`);
  }
  let patch: Partial<QueueStateFields> = { ...change };
  if (item.state === 'needs_attention') {
    if (item.attention_code === null || !SCHEDULE_RESOLVABLE.has(item.attention_code)) {
      return deny('Resolve the issue on this video before scheduling it');
    }
    patch = { ...patch, ...clearAttention, state: stateBeforeAttention(item) };
  }
  if (item.youtube_video_id !== null) {
    patch.remote_sync = 'pending';
    if ((patch.state ?? item.state) === 'scheduled') patch.state = 'uploaded';
  }
  return ok(patch);
}

function observeRemote(
  item: QueueStateFields,
  event: Extract<QueueEvent, { type: 'remote_observed' }>,
  now: Date
): TransitionResult {
  if (item.youtube_video_id === null) return deny('Not linked to a YouTube video');
  if (!RECONCILABLE.has(item.state)) return deny(`Can't reconcile a ${item.state} video with YouTube`);

  const patch: Partial<QueueStateFields> = { remote_publish_at: event.publishAt, remote_error: null };

  // The user made a published video non-public in Studio: respect it and stop scheduling.
  if (item.state === 'published' && item.privacy === 'public' && event.privacy !== 'public') {
    return ok({ ...patch, state: 'uploaded', schedule_source: 'hold', scheduled_for: null, remote_sync: 'synced' });
  }

  // A schedule changed in Studio (after we last synced, or after we asked the user to set it there) wins.
  const adoptStudioSchedule =
    item.remote_sync === 'synced' ||
    (item.state === 'needs_attention' && item.attention_code === 'set_schedule_in_studio' && event.publishAt !== null);
  if (adoptStudioSchedule && !sameInstant(event.publishAt, item.remote_publish_at)) {
    patch.scheduled_for = event.publishAt;
    patch.schedule_source = event.publishAt === null ? 'hold' : 'manual';
  }

  const desired = desiredPublishAt({ ...item, ...patch });
  let next: QueueState;
  let inSync: boolean;
  if (item.privacy === 'public') {
    if (event.privacy === 'public') {
      next = 'published';
      inSync = true;
    } else if (desired !== null && sameInstant(desired, event.publishAt)) {
      next = Date.parse(desired) + PUBLISH_GRACE_MS <= now.getTime() ? 'needs_attention' : 'scheduled';
      inSync = true;
    } else {
      next = 'uploaded';
      inSync = desired === null && event.publishAt === null;
    }
  } else {
    inSync = event.privacy === item.privacy;
    next = inSync ? 'published' : 'uploaded';
  }
  patch.remote_sync = inSync ? 'synced' : 'pending';

  const reconcilableAttention = item.attention_code === 'set_schedule_in_studio' || item.attention_code === 'locked_private';
  if (item.state === 'needs_attention' && !reconcilableAttention) return ok(patch);

  if (next === 'needs_attention') {
    return ok({ ...patch, state: 'needs_attention', attention_code: 'locked_private', attention_from_state: 'scheduled' });
  }
  return ok({ ...patch, ...clearAttention, state: next });
}

export function transition(item: QueueStateFields, event: QueueEvent, ctx: TransitionContext): TransitionResult {
  switch (event.type) {
    case 'approve':
      if (item.state !== 'pending') return deny(`Only pending videos can be approved (this one is ${item.state})`);
      return ok({ state: 'approved', attempts: 0, last_error: null, next_attempt_at: null });

    case 'unapprove':
      if (item.state === 'uploading') return deny('Cancel the upload first');
      if (item.state === 'approved' || item.state === 'awaiting_manual_upload' || item.state === 'failed') {
        return ok({ state: 'pending', ...clearAutoSlot(item), ...clearSession, next_attempt_at: null });
      }
      if ((item.state === 'uploaded' || item.state === 'scheduled') && item.youtube_video_id !== null) {
        return ok({ state: 'uploaded', schedule_source: 'hold', scheduled_for: null, remote_sync: 'pending' });
      }
      return deny(`A ${item.state} video can't be unapproved`);

    case 'reject':
      if (isOnYouTube(item)) return deny('This video is already on YouTube. Manage it in YouTube Studio.');
      if (item.state === 'needs_attention' && item.attention_code !== null && DUPLICATE_CODES.has(item.attention_code)) {
        return deny('Check whether this video already reached YouTube before rejecting it');
      }
      if (!REJECTABLE.has(item.state)) return deny(`A ${item.state} video can't be rejected`);
      return ok({ state: 'rejected', ...clearAutoSlot(item), ...clearSession, ...clearAttention, next_attempt_at: null });

    case 'restore':
      if (item.state !== 'rejected') return deny('Only rejected videos can be restored');
      return ok({ state: 'pending' });

    case 'schedule':
      if (item.privacy !== 'public') {
        return deny('Only public videos can be scheduled. Unlisted and private videos keep their visibility when uploaded.');
      }
      if (!isReachableSlot(event.at, ctx.now)) return deny('Pick a time at least 30 minutes from now');
      return applyScheduleChange(item, { scheduled_for: new Date(event.at).toISOString(), schedule_source: 'manual' });

    case 'hold':
      return applyScheduleChange(item, { scheduled_for: null, schedule_source: 'hold' });

    case 'auto_slot':
      if (item.privacy !== 'public') return deny('Only public videos get automatic slots');
      if (item.scheduled_for !== null || item.schedule_source === 'hold') return deny('This video already has a schedule or is on hold');
      if (!AUTO_SLOTTABLE.has(item.state)) return deny(`A ${item.state} video doesn't get an automatic slot`);
      if (!isReachableSlot(event.at, ctx.now)) return deny('Automatic slots must be at least 30 minutes away');
      return ok({
        scheduled_for: new Date(event.at).toISOString(),
        schedule_source: 'auto',
        ...(item.youtube_video_id !== null ? { remote_sync: 'pending' as const } : {})
      });

    case 'edit_metadata':
      if (item.state === 'uploading') return deny('Wait for the upload to finish before editing');
      return ok(item.youtube_video_id !== null ? { remote_sync: 'pending' } : {});

    case 'method_changed':
      if (ctx.uploadMethod === 'api' && item.state === 'awaiting_manual_upload') return ok({ state: 'approved' });
      if (ctx.uploadMethod === 'assisted' && item.state === 'failed' && !isOnYouTube(item)) {
        return ok({ state: 'approved', ...clearSession, next_attempt_at: null });
      }
      return ok({});

    case 'begin_manual_upload':
      if (ctx.uploadMethod !== 'assisted') return deny('Assisted upload is turned off');
      if (isOnYouTube(item)) return deny('This video is already on YouTube');
      if (item.state !== 'approved') return deny(`A ${item.state} video isn't ready to upload`);
      return ok({ state: 'awaiting_manual_upload' });

    case 'link_video': {
      const videoId = event.videoId.trim();
      if (videoId === '') return deny('Enter a YouTube video link or ID');
      if (item.youtube_video_id !== null && item.youtube_video_id !== videoId) {
        return deny('This video is already linked to a different YouTube video');
      }
      if (item.state === 'uploading') return deny('Wait for the upload to finish');
      if (item.state === 'rejected') return deny('Restore this video before linking it');
      // Linking never grants approval: an unapproved video stays on hold instead of being auto-scheduled.
      const wasApproved = item.state === 'needs_attention' ? item.attention_from_state !== 'pending' : item.state !== 'pending';
      return ok({
        state: 'uploaded',
        youtube_video_id: videoId,
        remote_sync: 'pending',
        remote_error: null,
        last_error: null,
        next_attempt_at: null,
        ...clearSession,
        ...clearAttention,
        ...(wasApproved ? {} : { schedule_source: 'hold' as const, scheduled_for: null })
      });
    }

    case 'begin_upload':
      if (ctx.uploadMethod !== 'api') return deny('Automatic uploads are turned off');
      if (isOnYouTube(item)) return deny('This video is already on YouTube');
      if (item.state !== 'approved' && item.state !== 'failed') return deny(`A ${item.state} video isn't ready to upload`);
      return ok({
        state: 'uploading',
        upload_session_uri: event.sessionUri,
        upload_bytes_confirmed: event.sessionUri === item.upload_session_uri ? item.upload_bytes_confirmed : 0,
        next_attempt_at: null,
        last_error: null
      });

    case 'upload_progress':
      if (item.state !== 'uploading') return deny('No upload in progress');
      return ok({ upload_bytes_confirmed: Math.max(item.upload_bytes_confirmed, event.bytesConfirmed) });

    case 'upload_completed': {
      // A finished upload is always recorded, whatever happened to the item meanwhile.
      if (item.youtube_video_id !== null && item.youtube_video_id !== event.videoId) {
        return ok({
          state: 'needs_attention',
          attention_code: 'duplicate_uploads',
          attention_from_state: item.state === 'needs_attention' ? item.attention_from_state : item.state,
          last_error: `YouTube also created video ${event.videoId}`,
          ...clearSession
        });
      }
      const expected = item.state === 'uploading';
      return ok({
        state: 'uploaded',
        youtube_video_id: event.videoId,
        remote_sync: 'pending',
        remote_error: null,
        last_error: null,
        next_attempt_at: null,
        ...clearSession,
        ...clearAttention,
        ...(expected ? {} : { schedule_source: 'hold' as const, scheduled_for: null })
      });
    }

    case 'upload_failed': {
      if (item.state !== 'uploading') return deny('No upload in progress');
      const attempts = item.attempts + 1;
      if (event.retryable && event.nextAttemptAt !== null && attempts < event.maxAttempts) {
        return ok({ state: 'failed', attempts, last_error: event.error, next_attempt_at: event.nextAttemptAt });
      }
      return ok({
        state: 'needs_attention',
        attempts,
        last_error: event.error,
        attention_code: event.retryable ? 'retries_exhausted' : 'validation_error',
        attention_from_state: 'approved',
        next_attempt_at: null,
        ...clearSession
      });
    }

    case 'upload_session_lost':
      if (item.state !== 'uploading' && item.state !== 'failed') return deny('No upload session to discard');
      return ok({ state: 'failed', ...clearSession, next_attempt_at: ctx.now.toISOString() });

    case 'upload_possible_duplicate':
      if (item.state !== 'uploading' && item.state !== 'failed') return deny('No upload in progress');
      return ok({
        state: 'needs_attention',
        attention_code: 'possible_duplicate',
        attention_from_state: 'approved',
        last_error: event.error,
        next_attempt_at: null,
        ...clearSession
      });

    case 'upload_cancelled':
      if (item.state !== 'uploading') return deny('No upload in progress');
      return ok({ state: 'pending', ...clearSession, ...clearAutoSlot(item), next_attempt_at: null });

    case 'remote_observed':
      return observeRemote(item, event, ctx.now);

    case 'remote_sync_failed': {
      if (item.youtube_video_id === null) return deny('Not linked to a YouTube video');
      const patch: Partial<QueueStateFields> = { remote_sync: 'error', remote_error: event.error };
      if (event.scheduleRefused && desiredPublishAt(item) !== null && item.state !== 'needs_attention') {
        return ok({ ...patch, state: 'needs_attention', attention_code: 'set_schedule_in_studio', attention_from_state: item.state });
      }
      return ok(patch);
    }

    case 'missed_slot': {
      if (!MISSABLE.has(item.state)) return deny(`A ${item.state} video can't miss its slot`);
      const desired = desiredPublishAt(item);
      if (desired === null || Date.parse(desired) >= ctx.now.getTime() + MIN_SCHEDULE_LEAD_MS) {
        return deny('The slot is still reachable');
      }
      if (item.schedule_source === 'auto') {
        return ok({
          scheduled_for: null,
          schedule_source: null,
          ...(item.youtube_video_id !== null ? { remote_sync: 'pending' as const } : {})
        });
      }
      return ok({
        state: 'needs_attention',
        attention_code: 'missed_slot',
        attention_from_state: item.state,
        last_error: 'Missed its scheduled time'
      });
    }

    case 'flag': {
      if (item.state === 'uploading' || item.state === 'rejected' || item.state === 'published') {
        return deny(`A ${item.state} video can't be flagged`);
      }
      const from = item.state === 'needs_attention' ? item.attention_from_state : item.state;
      return ok({ state: 'needs_attention', attention_code: event.code, attention_from_state: from, last_error: event.error });
    }

    case 'resolve_attention': {
      if (item.state !== 'needs_attention') return deny('Nothing to resolve');
      if (item.attention_code !== null && DUPLICATE_CODES.has(item.attention_code) && item.youtube_video_id === null) {
        return deny('Link the existing YouTube video, or confirm it is not a duplicate');
      }
      if (item.attention_code === 'locked_private') {
        return ok({ state: 'uploaded', schedule_source: 'hold', scheduled_for: null, ...clearAttention, last_error: null });
      }
      const next = stateBeforeAttention(item);
      return ok({
        state: next,
        ...clearAttention,
        last_error: null,
        ...(next === 'uploaded' && item.youtube_video_id !== null ? { remote_sync: 'pending' as const } : {})
      });
    }

    case 'confirm_not_duplicate':
      if (item.state !== 'needs_attention' || item.attention_code !== 'possible_duplicate') {
        return deny('This video is not flagged as a possible duplicate');
      }
      if (isOnYouTube(item)) return deny('This video is already linked on YouTube');
      return ok({ state: 'approved', ...clearAttention, ...clearSession, last_error: null, next_attempt_at: null });

    case 'disconnect':
      if (item.state === 'uploading') return ok({ state: 'pending', ...clearSession, ...clearAutoSlot(item) });
      if (item.youtube_video_id === null) return ok({});
      return ok({ remote_tombstone: true, youtube_video_id: null, remote_publish_at: null, remote_sync: null, remote_error: null });

    default: {
      const unhandled: never = event;
      return deny(`Unknown event ${(unhandled as { type: string }).type}`);
    }
  }
}
