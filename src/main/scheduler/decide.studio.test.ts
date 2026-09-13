// Videos uploaded by hand in YouTube Studio: noticing them while paused, looking at a cost the daily
// allowance can bear, and reminding the person before a slot is missed.
import { describe, expect, it } from 'vitest';
import {
  DETECT_IDLE_MS,
  DETECT_SOON_MS,
  REMIND_BEFORE_MS,
  decide,
  type SchedulerHolds,
  type SchedulerItem,
  type SchedulerSettings
} from './decide';

const NOW = new Date('2026-09-13T12:00:00.000Z');
const inMinutes = (minutes: number): string => new Date(NOW.getTime() + minutes * 60_000).toISOString();

let nextId = 1;
function item(overrides: Partial<SchedulerItem> = {}): SchedulerItem {
  return {
    id: nextId++,
    posting_kind: 'new',
    missing: false,
    state: 'approved',
    privacy: 'public',
    scheduled_for: null,
    schedule_source: 'manual',
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
  uploadMethod: 'assisted',
  uploadTimes: ['09:00', '13:00', '18:00', '22:00'],
  rotationUploadTimes: [],
  autoScheduleDays: 14,
  paused: false,
  ...overrides
});

const holds = (overrides: Partial<SchedulerHolds> = {}): SchedulerHolds => ({
  auth: 'ok',
  apiBackoffUntil: null,
  uploadQuotaUntil: null,
  uploadInFlight: false,
  retryRemoteErrors: false,
  lastDetectAt: null,
  ...overrides
});

const run = (items: SchedulerItem[], s = settings(), h = holds()) => decide({ now: NOW, items, settings: s, holds: h });
const types = (items: SchedulerItem[], s?: SchedulerSettings, h?: SchedulerHolds) => run(items, s, h).map((action) => action.type);
const lookedMinutesAgo = (minutes: number): SchedulerHolds => holds({ lastDetectAt: inMinutes(-minutes) });

describe('noticing uploads made in Studio', () => {
  // The channel's real state when this was found: paused, four approved videos, none of them linked.
  it('looks while paused, including for videos still marked approved', () => {
    const approved = item({ scheduled_for: inMinutes(24 * 60) });
    const actions = run([approved], settings({ paused: true }));
    expect(actions).toContainEqual({ type: 'detect_manual_uploads', ids: [approved.id] });
    expect(actions.map((action) => action.type)).not.toContain('begin_manual_upload');
  });

  it('does not look for approved videos when uploads are automatic', () => {
    expect(types([item({ scheduled_for: inMinutes(24 * 60) })], settings({ uploadMethod: 'api', paused: true }))).not.toContain(
      'detect_manual_uploads'
    );
  });

  it('looks every ten minutes while nothing is due soon', () => {
    const later = item({ state: 'awaiting_manual_upload', scheduled_for: inMinutes(10 * 60) });
    expect(DETECT_IDLE_MS).toBe(10 * 60_000);
    expect(types([later], settings(), lookedMinutesAgo(9))).not.toContain('detect_manual_uploads');
    expect(types([later], settings(), lookedMinutesAgo(10))).toContain('detect_manual_uploads');
  });

  it('looks every two minutes once a slot is within two hours', () => {
    const soon = item({ state: 'awaiting_manual_upload', scheduled_for: inMinutes(90) });
    expect(DETECT_SOON_MS).toBe(2 * 60_000);
    expect(types([soon], settings(), lookedMinutesAgo(1))).not.toContain('detect_manual_uploads');
    expect(types([soon], settings(), lookedMinutesAgo(2))).toContain('detect_manual_uploads');
  });

  // Every 30-second tick used to be a look: two API calls, 5,760 units a day for one waiting video.
  it('costs at most a few hundred units on a day with nothing due', () => {
    const later = item({ state: 'awaiting_manual_upload', scheduled_for: inMinutes(3 * 24 * 60) });
    let lastDetectAt: string | null = null;
    let looks = 0;
    for (let tick = 0; tick < 2 * 60 * 24; tick += 1) {
      const now = new Date(NOW.getTime() + tick * 30_000);
      const actions = decide({ now, items: [later], settings: settings(), holds: holds({ lastDetectAt }) });
      if (actions.some((action) => action.type === 'detect_manual_uploads')) {
        looks += 1;
        lastDetectAt = now.toISOString();
      }
    }
    expect(looks * 2).toBeLessThanOrEqual(300);
  });
});

describe('reminding before a slot', () => {
  it('reminds within two hours of the slot, even while paused', () => {
    const due = item({ scheduled_for: inMinutes(100) });
    const far = item({ scheduled_for: inMinutes(REMIND_BEFORE_MS / 60_000 + 30) });
    const actions = run([due, far], settings({ paused: true }));
    expect(actions.filter((action) => action.type === 'remind_manual_upload')).toEqual([
      { type: 'remind_manual_upload', id: due.id, at: due.scheduled_for }
    ]);
  });

  it('does not remind about a slot that can no longer be met — that one is missed instead', () => {
    const missed = item({ scheduled_for: inMinutes(20) });
    const found = types([missed], settings({ paused: true }));
    expect(found).toContain('missed_slot');
    expect(found).not.toContain('remind_manual_upload');
  });

  it('does not remind about a video already on YouTube, or when uploads are automatic', () => {
    const linked = item({ state: 'uploaded', youtube_video_id: 'abc123', scheduled_for: inMinutes(100) });
    expect(types([linked])).not.toContain('remind_manual_upload');
    expect(types([item({ scheduled_for: inMinutes(100) })], settings({ uploadMethod: 'api' }))).not.toContain('remind_manual_upload');
  });
});
