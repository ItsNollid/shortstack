import { describe, expect, it } from 'vitest';
import { MIN_SCHEDULE_LEAD_MS } from '../../shared/queue';
import { PUBLISH_GRACE_MS } from '../domain/queueState';
import { MAX_SYNC_PER_TICK, MAX_VERIFY_PER_TICK, decide, type SchedulerHolds, type SchedulerItem, type SchedulerSettings } from './decide';

const NOW = new Date('2026-09-12T12:00:00.000Z');
const inMinutes = (m: number) => new Date(NOW.getTime() + m * 60_000).toISOString();
const longPast = () => new Date(NOW.getTime() - PUBLISH_GRACE_MS - 60_000).toISOString();

let nextId = 1;
function item(overrides: Partial<SchedulerItem> = {}): SchedulerItem {
  return {
    id: nextId++,
    missing: false,
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

const settings = (overrides: Partial<SchedulerSettings> = {}): SchedulerSettings => ({
  uploadMethod: 'api',
  uploadTimes: ['09:00', '13:00', '18:00', '22:00'],
  paused: false,
  ...overrides
});

const holds = (overrides: Partial<SchedulerHolds> = {}): SchedulerHolds => ({
  auth: 'ok',
  apiBackoffUntil: null,
  uploadQuotaUntil: null,
  uploadInFlight: false,
  retryRemoteErrors: false,
  ...overrides
});

const run = (items: SchedulerItem[], s = settings(), h = holds()) => decide({ now: NOW, items, settings: s, holds: h });
const types = (items: SchedulerItem[], s?: SchedulerSettings, h?: SchedulerHolds) => run(items, s, h).map((a) => a.type);

describe('uploads', () => {
  it('starts exactly one upload per tick, soonest slot first', () => {
    const later = item({ state: 'approved', scheduled_for: inMinutes(600), schedule_source: 'manual' });
    const sooner = item({ state: 'approved', scheduled_for: inMinutes(120), schedule_source: 'manual' });
    expect(run([later, sooner]).filter((a) => a.type === 'start_upload')).toEqual([{ type: 'start_upload', id: sooner.id }]);
  });

  it('a stuck item loses its turn instead of blocking the queue', () => {
    const stuck = item({ state: 'failed', next_attempt_at: inMinutes(30), scheduled_for: inMinutes(60), schedule_source: 'manual' });
    const healthy = item({ state: 'approved', scheduled_for: inMinutes(240), schedule_source: 'manual' });
    expect(run([stuck, healthy]).filter((a) => a.type === 'start_upload')).toEqual([{ type: 'start_upload', id: healthy.id }]);
  });

  it('retries a failed item once its backoff has passed', () => {
    expect(types([item({ state: 'failed', next_attempt_at: inMinutes(-1) })])).toContain('start_upload');
  });

  it('never uploads a missing file or a video already on YouTube', () => {
    expect(types([item({ state: 'approved', missing: true })])).not.toContain('start_upload');
    expect(types([item({ state: 'approved', youtube_video_id: 'yt1' })])).not.toContain('start_upload');
    expect(types([item({ state: 'approved', remote_tombstone: true })])).not.toContain('start_upload');
  });

  it('holds back uploads while one is in flight, or quota is spent', () => {
    const ready = [item({ state: 'approved' })];
    expect(types(ready, settings(), holds({ uploadInFlight: true }))).not.toContain('start_upload');
    expect(types(ready, settings(), holds({ uploadQuotaUntil: inMinutes(120) }))).not.toContain('start_upload');
    expect(types(ready, settings(), holds({ uploadQuotaUntil: inMinutes(-1) }))).toContain('start_upload');
  });

  it('uses the manual path in assisted mode', () => {
    const assisted = types([item({ state: 'approved' })], settings({ uploadMethod: 'assisted' }));
    expect(assisted).toContain('begin_manual_upload');
    expect(assisted).not.toContain('start_upload');
  });
});

describe('automatic slots', () => {
  it('gives each undated approved video its own future slot', () => {
    const slots = run([item({ state: 'approved' }), item({ state: 'approved' })]).filter((a) => a.type === 'auto_slot');
    expect(slots).toHaveLength(2);
    const times = slots.map((a) => (a as { at: string }).at);
    expect(new Set(times).size).toBe(2);
    for (const at of times) expect(Date.parse(at)).toBeGreaterThanOrEqual(NOW.getTime() + MIN_SCHEDULE_LEAD_MS);
  });

  it('skips held, non-public, already dated and unapproved videos', () => {
    expect(
      types([
        item({ state: 'approved', schedule_source: 'hold' }),
        item({ state: 'approved', privacy: 'unlisted' }),
        item({ state: 'approved', scheduled_for: inMinutes(300), schedule_source: 'manual' }),
        item({ state: 'pending' })
      ])
    ).not.toContain('auto_slot');
  });

  it('never hands out a slot another video already holds', () => {
    const claimed = run([item({ state: 'approved' })]).find((a) => a.type === 'auto_slot') as { at: string };
    const holder = item({ state: 'uploaded', youtube_video_id: 'yt1', scheduled_for: claimed.at, schedule_source: 'manual', remote_sync: 'synced' });
    const slot = run([holder, item({ state: 'approved' })]).find((a) => a.type === 'auto_slot') as { at: string };
    expect(slot.at).not.toBe(claimed.at);
  });
});

describe('missed slots', () => {
  it('flags a slot that can no longer be met, and frees an automatic one for reuse', () => {
    const missed = item({ state: 'approved', scheduled_for: inMinutes(10), schedule_source: 'auto' });
    const waiting = item({ state: 'approved' });
    const actions = run([missed, waiting]);
    expect(actions).toContainEqual({ type: 'missed_slot', id: missed.id });
    const reuse = actions.find((a) => a.type === 'auto_slot') as { id: number; at: string };
    expect(reuse.id).toBe(waiting.id);
    expect(actions.filter((a) => a.type === 'auto_slot' && a.id === missed.id)).toHaveLength(0);
  });

  it('still flags missed slots while paused, so nothing publishes late on resume', () => {
    expect(types([item({ state: 'approved', scheduled_for: inMinutes(5), schedule_source: 'manual' })], settings({ paused: true }))).toEqual([
      'missed_slot'
    ]);
  });
});

describe('holds', () => {
  const mixed = () => [
    item({ state: 'approved' }),
    item({ state: 'uploaded', youtube_video_id: 'yt1', remote_sync: 'pending' }),
    item({ state: 'scheduled', youtube_video_id: 'yt2', scheduled_for: longPast(), schedule_source: 'manual', remote_sync: 'synced' })
  ];

  it('pauses everything that writes, but keeps reading YouTube', () => {
    expect(types(mixed(), settings({ paused: true }))).toEqual(['verify_remote']);
    expect(types(mixed())).toEqual(expect.arrayContaining(['start_upload', 'sync_remote', 'verify_remote']));
  });

  it('makes no API calls while the connection is expired or backing off', () => {
    const expired = types(mixed(), settings(), holds({ auth: 'expired' }));
    expect(expired).not.toContain('sync_remote');
    expect(expired).not.toContain('start_upload');
    expect(expired).not.toContain('verify_remote');
    // Local planning continues so the calendar stays correct while disconnected.
    expect(expired).toContain('auto_slot');
    expect(types(mixed(), settings(), holds({ apiBackoffUntil: inMinutes(5) }))).not.toContain('sync_remote');
  });
});

describe('remote sync and verification', () => {
  it('retries errored syncs only when the engine asks for it', () => {
    const errored = [item({ state: 'uploaded', youtube_video_id: 'yt1', remote_sync: 'error' })];
    expect(types(errored)).not.toContain('sync_remote');
    expect(types(errored, settings(), holds({ retryRemoteErrors: true }))).toContain('sync_remote');
  });

  it('verifies a scheduled video only after the publish grace period', () => {
    const justPassed = item({ state: 'scheduled', youtube_video_id: 'yt1', scheduled_for: inMinutes(-5), schedule_source: 'manual', remote_sync: 'synced' });
    expect(types([justPassed])).not.toContain('verify_remote');
    const wellPassed = item({ state: 'scheduled', youtube_video_id: 'yt2', scheduled_for: longPast(), schedule_source: 'manual', remote_sync: 'synced' });
    expect(types([wellPassed])).toContain('verify_remote');
  });

  it('caps how much work one tick queues up', () => {
    const pending = Array.from({ length: 10 }, () => item({ state: 'uploaded', youtube_video_id: `yt${nextId}`, remote_sync: 'pending' }));
    const overdue = Array.from({ length: 10 }, () =>
      item({ state: 'scheduled', youtube_video_id: `old${nextId}`, scheduled_for: longPast(), schedule_source: 'manual', remote_sync: 'synced' })
    );
    const actions = run([...pending, ...overdue]);
    expect(actions.filter((a) => a.type === 'sync_remote')).toHaveLength(MAX_SYNC_PER_TICK);
    expect(actions.filter((a) => a.type === 'verify_remote')).toHaveLength(MAX_VERIFY_PER_TICK);
  });

  it('asks for detection while videos wait on a manual upload', () => {
    const waiting = item({ state: 'awaiting_manual_upload' });
    expect(run([waiting], settings({ uploadMethod: 'assisted' }))).toContainEqual({ type: 'detect_manual_uploads', ids: [waiting.id] });
  });
});
