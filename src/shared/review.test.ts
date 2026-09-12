import { describe, expect, it } from 'vitest';
import { QUEUE_STATES } from './queue';
import { needsReview, positionAfterChange, progress, step } from './review';

describe('needsReview', () => {
  it('asks for a decision only where one is actually owed', () => {
    for (const state of QUEUE_STATES) {
      const owed = state === 'pending' || state === 'needs_attention';
      expect(needsReview(state), state).toBe(owed);
    }
  });
});

describe('positionAfterChange', () => {
  it('stays put when the video you acted on leaves the list', () => {
    // Five items, acting on the third: the same index now holds what was the fourth.
    expect(positionAfterChange(2, 4)).toBe(2);
  });

  it('steps back when the last item goes', () => {
    expect(positionAfterChange(3, 3)).toBe(2);
  });

  it('lands on nothing when the list empties', () => {
    expect(positionAfterChange(4, 0)).toBe(0);
  });

  it('never returns a negative position', () => {
    expect(positionAfterChange(-3, 5)).toBe(0);
  });
});

describe('step', () => {
  it('moves forward and back', () => {
    expect(step(1, 1, 5)).toBe(2);
    expect(step(1, -1, 5)).toBe(0);
  });

  it('wraps at both ends, so a long session never dead-ends', () => {
    expect(step(4, 1, 5)).toBe(0);
    expect(step(0, -1, 5)).toBe(4);
  });

  it('has nowhere to go in an empty list', () => {
    expect(step(0, 1, 0)).toBe(0);
  });
});

describe('progress', () => {
  it('counts how many have been dealt with, not where the cursor sits', () => {
    expect(progress(0, 200, 200)).toEqual({ position: 1, total: 200, done: 0 });
    expect(progress(0, 180, 200)).toEqual({ position: 21, total: 200, done: 20 });
  });

  it('reads as finished when nothing is left', () => {
    expect(progress(0, 0, 200)).toEqual({ position: 200, total: 200, done: 200 });
  });
});
