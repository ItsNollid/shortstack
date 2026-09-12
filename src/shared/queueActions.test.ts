import { describe, expect, it } from 'vitest';
import { transition, type QueueStateFields } from '../main/domain/queueState';
import { ATTENTION_CODES, QUEUE_STATES } from './queue';
import { BULK_ACTIONS, actionableIds, canApply, type ActionSubject } from './queueActions';

const fields = (over: Partial<QueueStateFields>): QueueStateFields => ({
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

const subject = (item: QueueStateFields): ActionSubject => ({
  state: item.state,
  youtube_video_id: item.youtube_video_id,
  remote_tombstone: item.remote_tombstone,
  attention_code: item.attention_code
});

const ctx = { now: new Date('2026-03-01T12:00:00.000Z'), uploadMethod: 'assisted' as const };

describe('bulk action availability', () => {
  it('agrees with the state machine for every state, with and without a YouTube video', () => {
    for (const state of QUEUE_STATES) {
      for (const linked of [null, 'yt123']) {
        const item = fields({ state, youtube_video_id: linked });
        for (const action of BULK_ACTIONS) {
          const machineAllows = transition(item, { type: action }, ctx).ok;
          expect(
            canApply(subject(item), action),
            `${action} on ${state}${linked === null ? '' : ' (on YouTube)'}`
          ).toBe(machineAllows);
        }
      }
    }
  });

  it('agrees with the state machine for every attention code', () => {
    for (const code of ATTENTION_CODES) {
      const item = fields({ state: 'needs_attention', attention_code: code });
      expect(canApply(subject(item), 'reject'), code).toBe(transition(item, { type: 'reject' }, ctx).ok);
    }
  });

  it('applies an action only to the selected videos that can take it', () => {
    const selection = [
      { id: 1, ...subject(fields({ state: 'pending' })) },
      { id: 2, ...subject(fields({ state: 'published', youtube_video_id: 'yt1' })) },
      { id: 3, ...subject(fields({ state: 'pending' })) }
    ];
    expect(actionableIds(selection, 'approve')).toEqual([1, 3]);
    expect(actionableIds(selection, 'restore')).toEqual([]);
  });
});
