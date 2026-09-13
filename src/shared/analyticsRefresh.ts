// When Analytics asks YouTube again, and when it shows the answer it already has.
//
// It used to ask every time the page opened: a click on Analytics was a round of YouTube calls, even
// a minute after the last. Now the last answer is kept while the app runs, and a setting decides how
// old it may be before it is asked for again.

export type AnalyticsRefresh = 'manual' | 'interval' | 'on_open';

export const ANALYTICS_REFRESH_MODES: readonly AnalyticsRefresh[] = ['manual', 'interval', 'on_open'];
export const MIN_REFRESH_MINUTES = 5;
export const MAX_REFRESH_MINUTES = 30;
export const DEFAULT_REFRESH_MINUTES = 15;
/** The choices offered for the interval, inside the allowed range. */
export const REFRESH_MINUTE_CHOICES: readonly number[] = [5, 10, 15, 20, 30];

/**
 * How old a kept answer may be, in milliseconds, and still be shown instead of asking YouTube.
 * `Infinity` means any kept answer will do, asking only when there is none. `null` means never ask:
 * show what is kept, or nothing.
 */
export type MaxAge = number | null;

/** What prompted a look at the numbers. */
export type PullReason = 'open' | 'range' | 'tick' | 'button';

/** One answer from YouTube, and when it arrived. */
export interface Pulled<T> {
  value: T;
  pulledAt: string;
}

export function maxAgeFor(mode: AnalyticsRefresh, minutes: number, reason: PullReason): MaxAge {
  // Pressing Refresh is the one thing that always asks.
  if (reason === 'button') return 0;
  switch (mode) {
    case 'manual':
      // A different range is a different question, so it is asked once if nothing is kept for it.
      // Opening the page is not a question at all.
      return reason === 'range' ? Number.POSITIVE_INFINITY : null;
    case 'on_open':
      return reason === 'open' ? 0 : Number.POSITIVE_INFINITY;
    case 'interval':
      return Math.min(MAX_REFRESH_MINUTES, Math.max(MIN_REFRESH_MINUTES, minutes)) * 60_000;
  }
}

/** Whether a kept answer is young enough for the given limit. A limit of zero means only a new answer will do. */
export function freshEnough(pulledAt: string, maxAge: MaxAge, now: Date): boolean {
  if (maxAge === null) return true;
  // Measured: without this, Refresh pressed in the same millisecond the answer arrived returned it again.
  if (maxAge === 0) return false;
  const age = now.getTime() - Date.parse(pulledAt);
  return Number.isFinite(age) && age <= maxAge;
}

/** "just now", "4 minutes ago", "an hour ago": how long since the numbers were pulled. */
export function pulledAgo(pulledAt: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - Date.parse(pulledAt)) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? 'an hour ago' : `${hours} hours ago`;
}
