// Every screen describes a state with the same words. Keeping the copy here, tested, stops the
// queue, the calendar and the tray from disagreeing about what is happening to a video.
import type { AttentionCode, QueueState } from './queue';

export type Tone = 'neutral' | 'waiting' | 'ready' | 'scheduled' | 'active' | 'live' | 'attention';

export interface StatePresentation {
  label: string;
  tone: Tone;
  hint: string;
}

export interface AttentionPresentation {
  label: string;
  hint: string;
  /** The one thing the user can do about it, or null when only they can decide. */
  action: string | null;
}

const ATTENTION: Record<AttentionCode, AttentionPresentation> = {
  missed_slot: {
    label: 'Missed its time',
    hint: 'The scheduled time passed before this could go out, so it was not published late.',
    action: 'Pick a new time'
  },
  file_missing: {
    label: 'File missing',
    hint: 'The video file is no longer in the watched folder.',
    action: 'Put the file back, then scan'
  },
  file_changed: {
    label: 'File changed',
    hint: 'The file changed after it was added, so the details here may no longer match it.',
    action: 'Check the details'
  },
  possible_duplicate: {
    label: 'Check YouTube first',
    hint: 'The upload may have finished before the connection dropped. Uploading again could post it twice.',
    action: 'Link the video, or confirm it never arrived'
  },
  duplicate_uploads: {
    label: 'Uploaded more than once',
    hint: 'The previous version of ShortStack uploaded this video several times.',
    action: 'Tidy up the extras in YouTube Studio'
  },
  locked_private: {
    label: 'Locked private by YouTube',
    hint: 'Uploads from a Google Cloud project that has not passed the API audit stay private for good.',
    action: 'Read about the audit'
  },
  validation_error: {
    label: 'YouTube refused it',
    hint: 'YouTube rejected the video details, so nothing was uploaded.',
    action: 'Fix the details'
  },
  retries_exhausted: {
    label: 'Upload kept failing',
    hint: 'Every attempt failed, so ShortStack stopped trying.',
    action: 'Try again'
  },
  set_schedule_in_studio: {
    label: 'Set the time in Studio',
    hint: 'YouTube would not let ShortStack set the publish time for this video.',
    action: 'Open it in Studio'
  },
  channel_mismatch: {
    label: 'Belongs to another channel',
    hint: 'This video was queued for a different channel than the one now connected.',
    action: 'Confirm which channel it belongs to'
  },
  legacy_unrecorded_upload: {
    label: 'Unclear whether it uploaded',
    hint: 'The previous version may have uploaded this without recording which video it became.',
    action: 'Link the video, or confirm it never arrived'
  }
};

const STATES: Record<QueueState, StatePresentation> = {
  pending: { label: 'Needs approval', tone: 'waiting', hint: 'Nothing is uploaded until you approve it.' },
  approved: { label: 'Approved', tone: 'ready', hint: 'Waiting its turn to upload.' },
  awaiting_manual_upload: { label: 'Upload in Studio', tone: 'ready', hint: 'Waiting for you to upload this in YouTube Studio.' },
  uploading: { label: 'Uploading', tone: 'active', hint: 'Sending the file to YouTube.' },
  uploaded: { label: 'On YouTube', tone: 'scheduled', hint: 'Uploaded privately, with no publish time set yet.' },
  scheduled: { label: 'Scheduled', tone: 'scheduled', hint: 'YouTube will publish this at the time shown, even if this computer is off.' },
  published: { label: 'Published', tone: 'live', hint: 'Live on your channel.' },
  failed: { label: 'Retrying', tone: 'attention', hint: 'The last attempt failed. It will try again shortly.' },
  needs_attention: { label: 'Needs a look', tone: 'attention', hint: 'Something needs your decision.' },
  rejected: { label: 'Rejected', tone: 'neutral', hint: 'Kept out of the queue. You can restore it any time.' }
};

export function presentAttention(code: AttentionCode): AttentionPresentation {
  return ATTENTION[code];
}

export function presentState(state: QueueState, attentionCode: AttentionCode | null = null): StatePresentation {
  if (state === 'needs_attention' && attentionCode !== null) {
    const attention = ATTENTION[attentionCode];
    return { label: attention.label, tone: 'attention', hint: attention.hint };
  }
  return STATES[state];
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—';
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function formatFileSize(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const DIVISIONS: Array<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 7, unit: 'day' },
  { amount: 4.34524, unit: 'week' },
  { amount: 12, unit: 'month' },
  { amount: Number.POSITIVE_INFINITY, unit: 'year' }
];

/** "in 3 hours", "2 days ago": easier to judge at a glance than a timestamp. */
export function formatRelativeTime(iso: string | null, now: Date = new Date()): string {
  if (iso === null) return '—';
  const target = Date.parse(iso);
  if (!Number.isFinite(target)) return '—';

  let delta = (target - now.getTime()) / 1000;
  for (const division of DIVISIONS) {
    if (Math.abs(delta) < division.amount) return RELATIVE.format(Math.round(delta), division.unit);
    delta /= division.amount;
  }
  return '—';
}

/** A Short must be vertical and at most three minutes. */
export function shortsWarning(durationSeconds: number | null, width: number | null, height: number | null): string | null {
  if (durationSeconds !== null && durationSeconds > 180) return 'Longer than 3 minutes, so YouTube will not treat this as a Short';
  if (width !== null && height !== null && width > height) return 'Landscape, so YouTube will not treat this as a Short';
  return null;
}
