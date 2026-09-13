// Keeping Shorts cut from one long video from all going out on the same day, when asked to.
import { describe, expect, it } from 'vitest';
import { decide, type SchedulerAction, type SchedulerHolds, type SchedulerItem, type SchedulerSettings } from './decide';

// Local six in the morning, so the day's first slot is still reachable.
const NOW = new Date(2026, 8, 14, 6, 0, 0);

let nextId = 1;
function item(overrides: Partial<SchedulerItem> = {}): SchedulerItem {
  return {
    id: nextId++,
    posting_kind: 'new',
    missing: false,
    state: 'approved',
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
  uploadMethod: 'assisted',
  uploadTimes: ['09:00', '13:00', '18:00', '22:00'],
  rotationUploadTimes: [],
  autoScheduleDays: 14,
  paused: false,
  ...overrides
});

const holds: SchedulerHolds = {
  auth: 'ok',
  apiBackoffUntil: null,
  uploadQuotaUntil: null,
  uploadInFlight: false,
  retryRemoteErrors: false,
  lastDetectAt: null
};

function bookedDay(actions: readonly SchedulerAction[]): Map<number, string> {
  const days = new Map<number, string>();
  for (const action of actions) {
    if (action.type === 'auto_slot') days.set(action.id, new Date(action.at).toDateString());
  }
  return days;
}

describe('Shorts from the same long video', () => {
  it('go out on different days when limited to one a day, while other videos still fill the day', () => {
    const first = item({ source_title: 'Round 50 attempt on Kino' });
    const second = item({ source_title: 'round 50  attempt on kino' });
    const other = item({ source_title: 'CS2 with friends' });
    const days = bookedDay(decide({ now: NOW, items: [first, second, other], settings: settings({ sourceDailyLimit: 1 }), holds }));

    expect(days.get(first.id)).toBe(NOW.toDateString());
    expect(days.get(second.id)).not.toBe(days.get(first.id));
    expect(days.get(other.id)).toBe(NOW.toDateString());
  });

  it('count what is already booked for that day', () => {
    const booked = item({
      scheduled_for: new Date(2026, 8, 14, 18, 0, 0).toISOString(),
      schedule_source: 'manual',
      source_title: 'Round 50 attempt on Kino'
    });
    const fresh = item({ source_title: 'Round 50 attempt on Kino' });
    const days = bookedDay(decide({ now: NOW, items: [booked, fresh], settings: settings({ sourceDailyLimit: 1 }), holds }));
    expect(days.get(fresh.id)).toBe(new Date(2026, 8, 15).toDateString());
  });

  it('go out side by side when there is no limit, as before', () => {
    const first = item({ source_title: 'Round 50 attempt on Kino' });
    const second = item({ source_title: 'Round 50 attempt on Kino' });
    const days = bookedDay(decide({ now: NOW, items: [first, second], settings: settings(), holds }));
    expect(days.get(first.id)).toBe(days.get(second.id));
  });
});
