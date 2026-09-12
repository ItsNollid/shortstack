import { describe, expect, it } from 'vitest';
import { QUEUE_STATES } from './queue';
import { isInFlight, postingKind, shouldNotifySubscribers, shouldRotate, type RotationState } from './rotation';

const state = (over: Partial<RotationState> = {}): RotationState => ({
  postings: 0,
  publishedBefore: false,
  maxPostings: 6,
  paused: false,
  hasPostingInFlight: false,
  ...over
});

describe('postingKind', () => {
  it('calls the first posting new and the rest re-runs', () => {
    expect(postingKind({ postings: 0, publishedBefore: false })).toBe('new');
    expect(postingKind({ postings: 1, publishedBefore: false })).toBe('rotation');
    expect(postingKind({ postings: 9, publishedBefore: false })).toBe('rotation');
  });

  it('treats an imported back catalogue as rotation, not as brand new', () => {
    // Without this, importing a folder of previously published videos would announce every one of
    // them to subscribers as though it had never been posted.
    expect(postingKind({ postings: 0, publishedBefore: true })).toBe('rotation');
    expect(postingKind({ postings: 3, publishedBefore: true })).toBe('rotation');
  });
});

describe('shouldNotifySubscribers', () => {
  it('announces a new video only when the setting allows it', () => {
    expect(shouldNotifySubscribers('new', true)).toBe(true);
    expect(shouldNotifySubscribers('new', false)).toBe(false);
  });

  it('never announces a re-run, whatever the setting says', () => {
    expect(shouldNotifySubscribers('rotation', true)).toBe(false);
    expect(shouldNotifySubscribers('rotation', false)).toBe(false);
  });
});

describe('shouldRotate', () => {
  it('queues another posting while there is room', () => {
    expect(shouldRotate(state({ postings: 2 }))).toEqual({ rotate: true });
  });

  it('stops at the limit', () => {
    expect(shouldRotate(state({ postings: 6, maxPostings: 6 }))).toEqual({ rotate: false, reason: 'limit_reached' });
  });

  it('respects being taken out of rotation by hand, even with room left', () => {
    expect(shouldRotate(state({ postings: 1, paused: true }))).toEqual({ rotate: false, reason: 'paused' });
  });

  it('never queues a second run of a video that is still going out', () => {
    expect(shouldRotate(state({ postings: 1, hasPostingInFlight: true }))).toEqual({
      rotate: false,
      reason: 'already_queued'
    });
  });

  it('treats a limit of zero as rotation switched off', () => {
    expect(shouldRotate(state({ maxPostings: 0 }))).toEqual({ rotate: false, reason: 'rotation_off' });
  });

  it('puts the manual pause ahead of every other reason, so the UI can say the true one', () => {
    const everything = state({ paused: true, maxPostings: 0, postings: 99, hasPostingInFlight: true });
    expect(shouldRotate(everything)).toEqual({ rotate: false, reason: 'paused' });
  });
});

describe('isInFlight', () => {
  it('counts every state where a posting has not finished', () => {
    for (const queueState of QUEUE_STATES) {
      const finished = queueState === 'published' || queueState === 'rejected';
      expect(isInFlight(queueState), queueState).toBe(!finished);
    }
  });
});
