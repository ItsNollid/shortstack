import { describe, expect, it } from 'vitest';
import { transition, type QueueStateFields } from '../main/domain/queueState';
import { QUEUE_STATES } from './queue';
import { canDrag, dropOnDay, scheduleBlocker, type DragSubject } from './calendarDnd';

const NOW = new Date('2026-03-10T09:00:00');
const TIMES = ['09:00', '13:00', '18:00'];

const subject = (over: Partial<DragSubject> = {}): DragSubject => ({
  id: 1,
  state: 'approved',
  privacy: 'public',
  attention_code: null,
  scheduled_for: null,
  ...over
});

const fields = (item: DragSubject): QueueStateFields => ({
  state: item.state,
  privacy: item.privacy,
  scheduled_for: item.scheduled_for,
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
  attention_code: item.attention_code,
  attention_from_state: item.attention_code === null ? null : 'approved'
});

const ctx = { now: NOW, uploadMethod: 'assisted' as const };
const reachable = '2026-03-12T13:00:00.000Z';

describe('what can be dragged', () => {
  it('matches what the state machine will actually accept, for every state', () => {
    for (const state of QUEUE_STATES) {
      const item = subject({ state });
      const machineAllows = transition(fields(item), { type: 'schedule', at: reachable }, ctx).ok;
      expect(canDrag(item), state).toBe(machineAllows);
    }
  });

  it('refuses unlisted and private videos, which are never scheduled', () => {
    for (const privacy of ['unlisted', 'private'] as const) {
      const item = subject({ privacy });
      expect(canDrag(item)).toBe(false);
      expect(transition(fields(item), { type: 'schedule', at: reachable }, ctx).ok).toBe(false);
      expect(scheduleBlocker(item)).toContain('Only public videos');
    }
  });

  it('allows a video that only needs a new time, but not one with a real problem', () => {
    expect(canDrag(subject({ state: 'needs_attention', attention_code: 'missed_slot' }))).toBe(true);
    expect(canDrag(subject({ state: 'needs_attention', attention_code: 'file_missing' }))).toBe(false);
  });
});

describe('dropping on a day', () => {
  const day = (iso: string): Date => new Date(iso);

  it('takes the first free time on that day', () => {
    const verdict = dropOnDay({ item: subject(), day: day('2026-03-12T00:00:00'), uploadTimes: TIMES, taken: [], now: NOW });
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(new Date(verdict.at).getHours()).toBe(9);
  });

  it('skips a time another video already holds', () => {
    const nine = new Date(2026, 2, 12, 9, 0).toISOString();
    const verdict = dropOnDay({
      item: subject(),
      day: day('2026-03-12T00:00:00'),
      uploadTimes: TIMES,
      taken: [{ id: 2, scheduled_for: nine }],
      now: NOW
    });
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(new Date(verdict.at).getHours()).toBe(13);
  });

  it('ignores the time the dragged video itself holds, so a day can be reshuffled', () => {
    const nine = new Date(2026, 2, 12, 9, 0).toISOString();
    const verdict = dropOnDay({
      item: subject({ scheduled_for: nine }),
      day: day('2026-03-12T00:00:00'),
      uploadTimes: TIMES,
      taken: [{ id: 1, scheduled_for: nine }],
      now: NOW
    });
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(new Date(verdict.at).getHours()).toBe(9);
  });

  it('refuses a day that is over', () => {
    const verdict = dropOnDay({ item: subject(), day: day('2026-03-09T00:00:00'), uploadTimes: TIMES, taken: [], now: NOW });
    expect(verdict).toEqual({ ok: false, reason: 'That day has already been and gone.' });
  });

  it('refuses today when every remaining time is inside the 30 minute lead', () => {
    const lateNow = new Date('2026-03-10T17:45:00');
    const verdict = dropOnDay({
      item: subject(),
      day: day('2026-03-10T00:00:00'),
      uploadTimes: TIMES,
      taken: [],
      now: lateNow
    });
    expect(verdict.ok).toBe(false);
  });

  it('says what to do when the day is full', () => {
    const taken = TIMES.map((time, index) => ({
      id: index + 10,
      scheduled_for: new Date(2026, 2, 12, Number(time.slice(0, 2)), 0).toISOString()
    }));
    const verdict = dropOnDay({ item: subject(), day: day('2026-03-12T00:00:00'), uploadTimes: TIMES, taken, now: NOW });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain('Every time on that day is taken');
  });

  it('asks for an upload time when none are configured', () => {
    const verdict = dropOnDay({ item: subject(), day: day('2026-03-12T00:00:00'), uploadTimes: [], taken: [], now: NOW });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain('Settings');
  });
});
