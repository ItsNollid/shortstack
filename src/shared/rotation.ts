// Rotation: the same video posted more than once, on purpose, so each run reaches people who
// missed the last one. Deliberately separate from the duplicate protection in the state machine —
// that stops a single posting uploading twice, which stays true no matter how many postings exist.
import type { QueueState } from './queue';

export type PostingKind = 'new' | 'rotation';

export interface VideoPostingFacts {
  /** Postings ShortStack has made of this file, including any in flight. */
  postings: number;
  /** Set at intake for a file that was already published before ShortStack ever saw it. */
  publishedBefore: boolean;
}

/**
 * A file's first posting is an announcement; the rest are re-runs. A back catalogue imported into
 * ShortStack has no postings on record, so without the intake flag every re-upload would be
 * announced to subscribers as though it were new.
 */
export function postingKind(facts: VideoPostingFacts): PostingKind {
  if (facts.publishedBefore) return 'rotation';
  return facts.postings === 0 ? 'new' : 'rotation';
}

/** Only an announcement should reach subscribers; a re-run should not. */
export function shouldNotifySubscribers(kind: PostingKind, notifyOnNew: boolean): boolean {
  return kind === 'new' ? notifyOnNew : false;
}

export interface RotationPolicy {
  /** 0 means rotation is off; postings stop after the first. */
  maxPostings: number;
  /** Taken out of rotation by hand, whatever the count says. */
  paused: boolean;
  /** Days that must pass since the last posting. Re-posting the same short a day later is both
   *  pointless — the same people see it — and the behaviour YouTube's repetitious content policy
   *  is aimed at. */
  minGapDays: number;
}

export interface RotationState extends VideoPostingFacts, RotationPolicy {
  /** True while a posting of this video is queued or on its way out. */
  hasPostingInFlight: boolean;
  /** When the most recent posting went out, or null if none has. */
  lastPostingAt: string | null;
  now: Date;
}

export type RotationVerdict =
  | { rotate: true }
  | { rotate: false; reason: 'paused' | 'limit_reached' | 'already_queued' | 'rotation_off' | 'too_soon' };

/** Whether ShortStack should queue another posting of this video right now. */
export function shouldRotate(state: RotationState): RotationVerdict {
  if (state.paused) return { rotate: false, reason: 'paused' };
  if (state.maxPostings <= 0) return { rotate: false, reason: 'rotation_off' };
  // One posting of a video in flight at a time: queueing two runs of the same file at once is how
  // a rotation turns into a burst.
  if (state.hasPostingInFlight) return { rotate: false, reason: 'already_queued' };
  if (state.postings >= state.maxPostings) return { rotate: false, reason: 'limit_reached' };

  if (state.lastPostingAt !== null && state.minGapDays > 0) {
    const since = state.now.getTime() - Date.parse(state.lastPostingAt);
    if (Number.isFinite(since) && since < state.minGapDays * 24 * 60 * 60 * 1000) {
      return { rotate: false, reason: 'too_soon' };
    }
  }
  return { rotate: true };
}

/** States that mean a posting is still on its way out and should not be counted as finished. */
export const IN_FLIGHT_STATES: readonly QueueState[] = [
  'pending',
  'approved',
  'awaiting_manual_upload',
  'uploading',
  'uploaded',
  'scheduled',
  'failed',
  'needs_attention'
];

export const isInFlight = (state: QueueState): boolean => IN_FLIGHT_STATES.includes(state);
