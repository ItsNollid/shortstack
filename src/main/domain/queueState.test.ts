import { describe, expect, it } from 'vitest';
import { QUEUE_STATES, type UploadMethod } from '../../shared/queue';
import {
  PUBLISH_GRACE_MS,
  transition,
  type QueueEvent,
  type QueueStateFields,
  type TransitionContext
} from './queueState';

const NOW = new Date('2026-09-12T12:00:00.000Z');
const ctx = (uploadMethod: UploadMethod = 'assisted', now: Date = NOW): TransitionContext => ({ now, uploadMethod });
const inMinutes = (m: number) => new Date(NOW.getTime() + m * 60_000).toISOString();

function item(overrides: Partial<QueueStateFields> = {}): QueueStateFields {
  return {
    state: 'pending',
    privacy: 'public',
    scheduled_for: null,
    schedule_source: null,
    youtube_video_id: null,
    remote_tombstone: false,
    remote_publish_at: null,
    remote_sync: null,
    remote_error: null,
    upload_session_uri: null,
    upload_bytes_confirmed: 0,
    attempts: 0,
    last_error: null,
    next_attempt_at: null,
    attention_code: null,
    attention_from_state: null,
    ...overrides
  };
}

function apply(base: QueueStateFields, event: QueueEvent, c: TransitionContext = ctx()): QueueStateFields {
  const result = transition(base, event, c);
  if (!result.ok) throw new Error(`transition refused: ${result.reason}`);
  return { ...base, ...result.patch };
}

function refused(base: QueueStateFields, event: QueueEvent, c: TransitionContext = ctx()): string {
  const result = transition(base, event, c);
  if (result.ok) throw new Error(`expected refusal, got patch ${JSON.stringify(result.patch)}`);
  return result.reason;
}

describe('invariants', () => {
  it('never starts an upload for a video that is already on YouTube', () => {
    for (const state of QUEUE_STATES) {
      for (const remote of [{ youtube_video_id: 'yt1' }, { remote_tombstone: true }]) {
        const base = item({ state, ...remote });
        expect(transition(base, { type: 'begin_upload', sessionUri: 's1' }, ctx('api')).ok, state).toBe(false);
        expect(transition(base, { type: 'begin_manual_upload' }, ctx('assisted')).ok, state).toBe(false);
      }
    }
  });

  it('always records the YouTube id when an upload completes, whatever the current state', () => {
    for (const state of QUEUE_STATES) {
      const next = apply(item({ state }), { type: 'upload_completed', videoId: 'yt1' }, ctx('api'));
      expect(next.youtube_video_id, state).toBe('yt1');
      expect(next.upload_session_uri).toBeNull();
    }
  });

  it('never gives an automatic slot to held or non-public videos', () => {
    for (const state of QUEUE_STATES) {
      expect(transition(item({ state, schedule_source: 'hold' }), { type: 'auto_slot', at: inMinutes(120) }, ctx()).ok).toBe(false);
      expect(transition(item({ state, privacy: 'unlisted' }), { type: 'auto_slot', at: inMinutes(120) }, ctx()).ok).toBe(false);
    }
  });
});

describe('approval', () => {
  it('approves pending videos only', () => {
    expect(apply(item(), { type: 'approve' }).state).toBe('approved');
    expect(refused(item({ state: 'approved' }), { type: 'approve' })).toMatch(/Only pending/);
  });

  it('unapproves pre-upload videos back to pending and drops their auto slot', () => {
    const next = apply(item({ state: 'approved', scheduled_for: inMinutes(60), schedule_source: 'auto' }), { type: 'unapprove' });
    expect(next).toMatchObject({ state: 'pending', scheduled_for: null, schedule_source: null });
  });

  it('keeps a manual slot when unapproving before upload', () => {
    const next = apply(item({ state: 'approved', scheduled_for: inMinutes(60), schedule_source: 'manual' }), { type: 'unapprove' });
    expect(next).toMatchObject({ state: 'pending', scheduled_for: inMinutes(60), schedule_source: 'manual' });
  });

  it('refuses to unapprove mid-upload', () => {
    expect(refused(item({ state: 'uploading' }), { type: 'unapprove' })).toMatch(/Cancel the upload/);
  });

  it('unapproving an uploaded video puts it on hold and asks sync to clear the remote schedule', () => {
    const next = apply(
      item({ state: 'scheduled', youtube_video_id: 'yt1', scheduled_for: inMinutes(90), schedule_source: 'manual', remote_sync: 'synced' }),
      { type: 'unapprove' }
    );
    expect(next).toMatchObject({ state: 'uploaded', schedule_source: 'hold', scheduled_for: null, remote_sync: 'pending' });
  });
});

describe('reject and restore', () => {
  it('rejects and restores pre-upload videos', () => {
    const rejected = apply(item({ state: 'approved' }), { type: 'reject' });
    expect(rejected.state).toBe('rejected');
    expect(apply(rejected, { type: 'restore' }).state).toBe('pending');
  });

  it('refuses to reject videos that reached YouTube or might have', () => {
    expect(refused(item({ state: 'uploaded', youtube_video_id: 'yt1' }), { type: 'reject' })).toMatch(/already on YouTube/);
    expect(refused(item({ state: 'published', remote_tombstone: true }), { type: 'reject' })).toMatch(/already on YouTube/);
    expect(
      refused(item({ state: 'needs_attention', attention_code: 'possible_duplicate', attention_from_state: 'approved' }), { type: 'reject' })
    ).toMatch(/already reached YouTube/);
  });
});

describe('scheduling', () => {
  it('requires a public target and at least 30 minutes of lead time', () => {
    expect(refused(item({ privacy: 'unlisted' }), { type: 'schedule', at: inMinutes(120) })).toMatch(/Only public/);
    expect(refused(item(), { type: 'schedule', at: inMinutes(29) })).toMatch(/30 minutes/);
    expect(refused(item(), { type: 'schedule', at: 'not a date' })).toMatch(/30 minutes/);
    expect(apply(item(), { type: 'schedule', at: inMinutes(30) })).toMatchObject({ schedule_source: 'manual', scheduled_for: inMinutes(30) });
  });

  it('refuses to reschedule published or rejected videos', () => {
    expect(refused(item({ state: 'published', youtube_video_id: 'yt1' }), { type: 'schedule', at: inMinutes(60) })).toMatch(/published/);
    expect(refused(item({ state: 'rejected' }), { type: 'hold' })).toMatch(/rejected/);
  });

  it('rescheduling an uploaded video marks it for remote sync and unconfirms the schedule', () => {
    const next = apply(
      item({ state: 'scheduled', youtube_video_id: 'yt1', scheduled_for: inMinutes(60), schedule_source: 'manual', remote_sync: 'synced' }),
      { type: 'schedule', at: inMinutes(240) }
    );
    expect(next).toMatchObject({ state: 'uploaded', scheduled_for: inMinutes(240), remote_sync: 'pending' });
  });

  it('a new schedule resolves a missed slot', () => {
    const next = apply(
      item({ state: 'needs_attention', attention_code: 'missed_slot', attention_from_state: 'approved', schedule_source: 'manual' }),
      { type: 'schedule', at: inMinutes(120) }
    );
    expect(next).toMatchObject({ state: 'approved', attention_code: null, attention_from_state: null });
  });

  it('refuses to schedule over unrelated problems', () => {
    expect(
      refused(item({ state: 'needs_attention', attention_code: 'file_missing', attention_from_state: 'approved' }), {
        type: 'schedule',
        at: inMinutes(120)
      })
    ).toMatch(/Resolve the issue/);
  });

  it('hold removes the slot and excludes the video from auto-fill', () => {
    const held = apply(item({ state: 'approved', scheduled_for: inMinutes(60), schedule_source: 'auto' }), { type: 'hold' });
    expect(held).toMatchObject({ scheduled_for: null, schedule_source: 'hold' });
    expect(transition(held, { type: 'auto_slot', at: inMinutes(120) }, ctx()).ok).toBe(false);
  });

  it('auto-slots approved, undated public videos only', () => {
    expect(apply(item({ state: 'approved' }), { type: 'auto_slot', at: inMinutes(60) })).toMatchObject({ schedule_source: 'auto' });
    expect(refused(item({ state: 'pending' }), { type: 'auto_slot', at: inMinutes(60) })).toMatch(/pending/);
    expect(refused(item({ state: 'approved', scheduled_for: inMinutes(90), schedule_source: 'manual' }), { type: 'auto_slot', at: inMinutes(60) }))
      .toMatch(/already has a schedule/);
  });
});

describe('assisted uploads', () => {
  it('moves approved videos to awaiting manual upload only in assisted mode', () => {
    expect(apply(item({ state: 'approved' }), { type: 'begin_manual_upload' }, ctx('assisted')).state).toBe('awaiting_manual_upload');
    expect(refused(item({ state: 'approved' }), { type: 'begin_manual_upload' }, ctx('api'))).toMatch(/turned off/);
  });

  it('linking an approved video keeps its schedule', () => {
    const next = apply(item({ state: 'awaiting_manual_upload', scheduled_for: inMinutes(120), schedule_source: 'auto' }), {
      type: 'link_video',
      videoId: ' yt1 '
    });
    expect(next).toMatchObject({ state: 'uploaded', youtube_video_id: 'yt1', schedule_source: 'auto', remote_sync: 'pending' });
  });

  it('linking never grants approval: an unapproved video goes on hold', () => {
    const next = apply(item({ state: 'pending', scheduled_for: inMinutes(120), schedule_source: 'manual' }), { type: 'link_video', videoId: 'yt1' });
    expect(next).toMatchObject({ state: 'uploaded', schedule_source: 'hold', scheduled_for: null });
  });

  it('refuses to relink to a different video', () => {
    expect(refused(item({ state: 'uploaded', youtube_video_id: 'yt1' }), { type: 'link_video', videoId: 'yt2' })).toMatch(/different/);
  });

  it('switching to API uploads returns waiting videos to approved', () => {
    expect(apply(item({ state: 'awaiting_manual_upload' }), { type: 'method_changed' }, ctx('api')).state).toBe('approved');
  });
});

describe('API uploads', () => {
  it('begins uploads from approved or failed, resuming bytes only for the same session', () => {
    const started = apply(item({ state: 'approved' }), { type: 'begin_upload', sessionUri: 's1' }, ctx('api'));
    expect(started).toMatchObject({ state: 'uploading', upload_session_uri: 's1', upload_bytes_confirmed: 0 });

    const failed = item({ state: 'failed', upload_session_uri: 's1', upload_bytes_confirmed: 8_388_608 });
    expect(apply(failed, { type: 'begin_upload', sessionUri: 's1' }, ctx('api')).upload_bytes_confirmed).toBe(8_388_608);
    expect(apply(failed, { type: 'begin_upload', sessionUri: 's2' }, ctx('api')).upload_bytes_confirmed).toBe(0);
  });

  it('progress never moves backwards', () => {
    const uploading = item({ state: 'uploading', upload_bytes_confirmed: 1000 });
    expect(apply(uploading, { type: 'upload_progress', bytesConfirmed: 500 }, ctx('api')).upload_bytes_confirmed).toBe(1000);
  });

  it('completion after a cancel race still records the video, on hold', () => {
    const next = apply(item({ state: 'pending', scheduled_for: inMinutes(90), schedule_source: 'manual' }), {
      type: 'upload_completed',
      videoId: 'yt1'
    }, ctx('api'));
    expect(next).toMatchObject({ state: 'uploaded', youtube_video_id: 'yt1', schedule_source: 'hold', scheduled_for: null });
  });

  it('a second, different video id is flagged as duplicate uploads', () => {
    const next = apply(item({ state: 'uploaded', youtube_video_id: 'yt1' }), { type: 'upload_completed', videoId: 'yt2' }, ctx('api'));
    expect(next).toMatchObject({ state: 'needs_attention', attention_code: 'duplicate_uploads', youtube_video_id: 'yt1' });
  });

  it('retries retryable failures until attempts run out', () => {
    const uploading = item({ state: 'uploading', upload_session_uri: 's1' });
    const retry = apply(uploading, { type: 'upload_failed', retryable: true, error: '503', nextAttemptAt: inMinutes(5), maxAttempts: 3 }, ctx('api'));
    expect(retry).toMatchObject({ state: 'failed', attempts: 1, upload_session_uri: 's1', next_attempt_at: inMinutes(5) });

    const exhausted = apply({ ...uploading, attempts: 2 }, { type: 'upload_failed', retryable: true, error: '503', nextAttemptAt: inMinutes(5), maxAttempts: 3 }, ctx('api'));
    expect(exhausted).toMatchObject({ state: 'needs_attention', attention_code: 'retries_exhausted', attempts: 3, upload_session_uri: null });

    const invalid = apply(uploading, { type: 'upload_failed', retryable: false, error: 'invalidTitle', nextAttemptAt: null, maxAttempts: 3 }, ctx('api'));
    expect(invalid).toMatchObject({ state: 'needs_attention', attention_code: 'validation_error' });
  });

  it('cancelling returns the video to pending, never to approved', () => {
    expect(apply(item({ state: 'uploading', upload_session_uri: 's1' }), { type: 'upload_cancelled' }, ctx('api'))).toMatchObject({
      state: 'pending',
      upload_session_uri: null
    });
  });

  it('a possible duplicate can only leave attention by linking or explicit confirmation', () => {
    const flagged = apply(item({ state: 'uploading', upload_session_uri: 's1' }), { type: 'upload_possible_duplicate', error: '404 after final chunk' }, ctx('api'));
    expect(flagged).toMatchObject({ state: 'needs_attention', attention_code: 'possible_duplicate' });
    expect(refused(flagged, { type: 'resolve_attention' })).toMatch(/Link the existing/);
    expect(apply(flagged, { type: 'confirm_not_duplicate' }).state).toBe('approved');
    expect(apply(flagged, { type: 'link_video', videoId: 'yt1' })).toMatchObject({ state: 'uploaded', youtube_video_id: 'yt1' });
  });
});

describe('remote reconciliation', () => {
  const uploaded = (overrides: Partial<QueueStateFields> = {}) =>
    item({ state: 'uploaded', youtube_video_id: 'yt1', scheduled_for: inMinutes(120), schedule_source: 'manual', remote_sync: 'pending', ...overrides });

  it('confirms a matching remote schedule', () => {
    const next = apply(uploaded(), { type: 'remote_observed', privacy: 'private', publishAt: inMinutes(120) });
    expect(next).toMatchObject({ state: 'scheduled', remote_sync: 'synced', remote_publish_at: inMinutes(120) });
  });

  it('keeps pushing when YouTube has a different schedule than a local change', () => {
    const next = apply(uploaded({ scheduled_for: inMinutes(300) }), { type: 'remote_observed', privacy: 'private', publishAt: inMinutes(120) });
    expect(next).toMatchObject({ state: 'uploaded', remote_sync: 'pending', scheduled_for: inMinutes(300) });
  });

  it('marks public videos as published', () => {
    const next = apply(uploaded({ state: 'scheduled', remote_sync: 'synced', remote_publish_at: inMinutes(120) }), {
      type: 'remote_observed',
      privacy: 'public',
      publishAt: null
    });
    expect(next.state).toBe('published');
  });

  it('flags locked private only after the grace period', () => {
    const slot = new Date(NOW.getTime() - 5 * 60_000).toISOString();
    const scheduled = uploaded({ state: 'scheduled', scheduled_for: slot, remote_sync: 'synced', remote_publish_at: slot });
    expect(apply(scheduled, { type: 'remote_observed', privacy: 'private', publishAt: slot }).state).toBe('scheduled');

    const later = new Date(Date.parse(slot) + PUBLISH_GRACE_MS + 1000);
    const next = apply(scheduled, { type: 'remote_observed', privacy: 'private', publishAt: slot }, ctx('assisted', later));
    expect(next).toMatchObject({ state: 'needs_attention', attention_code: 'locked_private' });
    expect(apply(next, { type: 'resolve_attention' })).toMatchObject({ state: 'uploaded', schedule_source: 'hold' });
  });

  it('adopts a schedule changed in Studio after the last sync', () => {
    const synced = uploaded({ state: 'scheduled', remote_sync: 'synced', remote_publish_at: inMinutes(120) });
    const moved = apply(synced, { type: 'remote_observed', privacy: 'private', publishAt: inMinutes(600) });
    expect(moved).toMatchObject({ state: 'scheduled', scheduled_for: inMinutes(600), schedule_source: 'manual', remote_sync: 'synced' });

    const cleared = apply(synced, { type: 'remote_observed', privacy: 'private', publishAt: null });
    expect(cleared).toMatchObject({ state: 'uploaded', schedule_source: 'hold', scheduled_for: null, remote_sync: 'synced' });
  });

  it('respects a published video made private in Studio instead of re-publishing it', () => {
    const next = apply(uploaded({ state: 'published', remote_sync: 'synced', remote_publish_at: null }), {
      type: 'remote_observed',
      privacy: 'private',
      publishAt: null
    });
    expect(next).toMatchObject({ state: 'uploaded', schedule_source: 'hold', remote_sync: 'synced' });
  });

  it('asks the user to set the schedule in Studio when YouTube refuses, then adopts what they set', () => {
    const refusedSync = apply(uploaded(), { type: 'remote_sync_failed', error: 'forbidden', scheduleRefused: true });
    expect(refusedSync).toMatchObject({ state: 'needs_attention', attention_code: 'set_schedule_in_studio', remote_sync: 'error' });

    const setInStudio = apply(refusedSync, { type: 'remote_observed', privacy: 'private', publishAt: inMinutes(180) });
    expect(setInStudio).toMatchObject({ state: 'scheduled', scheduled_for: inMinutes(180), attention_code: null });
  });

  it('does not raise schedule attention when nothing should be scheduled', () => {
    const next = apply(uploaded({ schedule_source: 'hold', scheduled_for: null }), { type: 'remote_sync_failed', error: 'forbidden', scheduleRefused: true });
    expect(next).toMatchObject({ state: 'uploaded', remote_sync: 'error' });
  });

  it('non-public targets are published once YouTube shows the target visibility', () => {
    const unlisted = uploaded({ privacy: 'unlisted', scheduled_for: null, schedule_source: null });
    expect(apply(unlisted, { type: 'remote_observed', privacy: 'unlisted', publishAt: null }).state).toBe('published');
    expect(apply(unlisted, { type: 'remote_observed', privacy: 'private', publishAt: null })).toMatchObject({ state: 'uploaded', remote_sync: 'pending' });
  });

  it('leaves unrelated attention flags alone while updating remote fields', () => {
    const flagged = uploaded({ state: 'needs_attention', attention_code: 'channel_mismatch', attention_from_state: 'uploaded' });
    const next = apply(flagged, { type: 'remote_observed', privacy: 'private', publishAt: inMinutes(120) });
    expect(next).toMatchObject({ state: 'needs_attention', attention_code: 'channel_mismatch', remote_publish_at: inMinutes(120) });
  });
});

describe('missed slots', () => {
  it('re-slots automatic schedules and flags manual ones', () => {
    const near = inMinutes(10);
    expect(apply(item({ state: 'approved', scheduled_for: near, schedule_source: 'auto' }), { type: 'missed_slot' })).toMatchObject({
      scheduled_for: null,
      schedule_source: null,
      state: 'approved'
    });
    expect(apply(item({ state: 'awaiting_manual_upload', scheduled_for: near, schedule_source: 'manual' }), { type: 'missed_slot' })).toMatchObject({
      state: 'needs_attention',
      attention_code: 'missed_slot',
      attention_from_state: 'awaiting_manual_upload'
    });
  });

  it('ignores reachable slots and confirmed schedules', () => {
    expect(refused(item({ state: 'approved', scheduled_for: inMinutes(45), schedule_source: 'manual' }), { type: 'missed_slot' })).toMatch(/reachable/);
    expect(refused(item({ state: 'scheduled', youtube_video_id: 'yt1', scheduled_for: inMinutes(10), schedule_source: 'manual' }), { type: 'missed_slot' }))
      .toMatch(/scheduled/);
  });
});

describe('disconnect', () => {
  it('replaces remote ids with a tombstone that still blocks re-uploads', () => {
    const next = apply(item({ state: 'published', youtube_video_id: 'yt1', remote_publish_at: inMinutes(-60), remote_sync: 'synced' }), { type: 'disconnect' });
    expect(next).toMatchObject({ state: 'published', youtube_video_id: null, remote_tombstone: true, remote_publish_at: null, remote_sync: null });
    expect(transition({ ...next, state: 'approved' }, { type: 'begin_upload', sessionUri: 's1' }, ctx('api')).ok).toBe(false);
  });

  it('aborts an in-flight upload back to pending', () => {
    expect(apply(item({ state: 'uploading', upload_session_uri: 's1' }), { type: 'disconnect' })).toMatchObject({ state: 'pending', upload_session_uri: null });
  });
});

describe('uploads inherited from the old build', () => {
  const flagged = () =>
    item({
      state: 'needs_attention',
      attention_code: 'legacy_unrecorded_upload',
      attention_from_state: 'pending',
      schedule_source: 'hold'
    });

  it('cannot be rejected or waved away while it might already be on YouTube', () => {
    expect(refused(flagged(), { type: 'reject' })).toMatch(/already reached YouTube/);
    expect(refused(flagged(), { type: 'resolve_attention' })).toMatch(/Link the existing/);
  });

  it('leaves attention only by linking the real video or confirming it was never uploaded', () => {
    expect(apply(flagged(), { type: 'link_video', videoId: 'yt-old' })).toMatchObject({
      state: 'uploaded',
      youtube_video_id: 'yt-old'
    });
    expect(apply(flagged(), { type: 'confirm_not_duplicate' })).toMatchObject({ state: 'approved', attention_code: null });
  });
});
