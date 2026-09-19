// How long channel details may sit on this computer without being confirmed with YouTube. The privacy policy
// promises both halves of this out loud: details that cannot be refreshed for 30 days are deleted, and access
// taken away from the Google account page means they go the next time ShortStack runs. This decides which.

export const KEEP_WITHOUT_REFRESH_MS = 30 * 24 * 60 * 60_000;

/** What came of the last attempt to confirm the channel with YouTube. */
export type RefreshOutcome = 'nothing_stored' | 'refreshed' | 'access_gone' | 'unreachable';

export interface RetentionInput {
  outcome: RefreshOutcome;
  /** When the stored details last came from YouTube. */
  lastRefreshedAt: string | null;
  now: Date;
}

export type RetentionVerdict = { forget: false } | { forget: true; because: 'access_gone' | 'unconfirmed' };

const KEEP: RetentionVerdict = { forget: false };

export function retentionVerdict({ outcome, lastRefreshedAt, now }: RetentionInput): RetentionVerdict {
  if (outcome === 'nothing_stored' || outcome === 'refreshed') return KEEP;
  // Permission is gone, so the data goes now — the policy says the next time ShortStack runs, not in a month.
  if (outcome === 'access_gone') return { forget: true, because: 'access_gone' };

  const last = lastRefreshedAt === null ? Number.NaN : Date.parse(lastRefreshedAt);
  // Details carrying no date have never been confirmed here, so they are already past keeping. Nothing is lost
  // by being strict: the next check that reaches YouTube fetches them again.
  if (!Number.isFinite(last)) return { forget: true, because: 'unconfirmed' };
  return now.getTime() - last >= KEEP_WITHOUT_REFRESH_MS ? { forget: true, because: 'unconfirmed' } : KEEP;
}
