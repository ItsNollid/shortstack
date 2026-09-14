import { describe, expect, it } from 'vitest';
import { transition, type QueueStateFields } from './queueState';

const NOW = new Date('2026-09-14T12:00:00.000Z');
const ctx = { now: NOW, uploadMethod: 'assisted' as const };
const inMinutes = (minutes: number): string => new Date(NOW.getTime() + minutes * 60_000).toISOString();

const item = (over: Partial<QueueStateFields> = {}): QueueStateFields => ({
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
  ...over
});

describe('a time from Fill the calendar', () => {
  it('can be given before approval, as a time ShortStack may move if it is missed, without approving', () => {
    expect(transition(item(), { type: 'fill_slot', at: inMinutes(120) }, ctx)).toEqual({
      ok: true,
      patch: { scheduled_for: inMinutes(120), schedule_source: 'auto' }
    });
    expect(transition(item({ state: 'approved' }), { type: 'fill_slot', at: inMinutes(120) }, ctx).ok).toBe(true);
  });

  it('is refused for what already has a time, was taken off the schedule, is not public, is decided, or is too soon', () => {
    const refused = (over: Partial<QueueStateFields>, at = inMinutes(120)): boolean =>
      !transition(item(over), { type: 'fill_slot', at }, ctx).ok;
    expect(refused({ scheduled_for: inMinutes(300), schedule_source: 'manual' })).toBe(true);
    expect(refused({ schedule_source: 'hold' })).toBe(true);
    expect(refused({ privacy: 'private' })).toBe(true);
    expect(refused({ state: 'rejected' })).toBe(true);
    expect(refused({ state: 'published' })).toBe(true);
    expect(refused({}, inMinutes(10))).toBe(true);
  });
});

describe('taking a time away', () => {
  it('leaves the video with no time, not kept off, so it can be given one again', () => {
    expect(transition(item({ scheduled_for: inMinutes(120), schedule_source: 'auto' }), { type: 'unschedule' }, ctx)).toEqual({
      ok: true,
      patch: { scheduled_for: null, schedule_source: null }
    });
  });

  it('is refused when there is no time to take away', () => {
    expect(transition(item(), { type: 'unschedule' }, ctx).ok).toBe(false);
  });
});
