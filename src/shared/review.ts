// Working through a large library one video at a time. The awkward part is not the card, it is what
// happens to your place in the queue when the video you just acted on leaves it.
import type { QueueState } from './queue';

/** Videos waiting for a decision. Rejected and published ones have had theirs. */
export const NEEDS_REVIEW: readonly QueueState[] = ['pending', 'needs_attention'];

export const needsReview = (state: QueueState): boolean => NEEDS_REVIEW.includes(state);

/**
 * Where to stand after the list changes under you. Acting on a video removes it from the set, so
 * the same index now holds the next one and the cursor should not move; it only steps back when it
 * has run off the end.
 */
export function positionAfterChange(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(Math.max(0, index), length - 1);
}

/** Moving by hand, which wraps so a long session never dead-ends at either edge. */
export function step(index: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return (((index + delta) % length) + length) % length;
}

export interface ReviewProgress {
  position: number;
  total: number;
  done: number;
}

export function progress(index: number, remaining: number, startedWith: number): ReviewProgress {
  const done = Math.max(0, startedWith - remaining);
  return { position: remaining === 0 ? startedWith : done + 1, total: startedWith, done };
}
