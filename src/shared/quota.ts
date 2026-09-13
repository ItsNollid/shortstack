// Keeping track of what ShortStack has spent of the daily YouTube API allowance.
//
// There is no endpoint that reports your usage — the real figure exists only in the Google Cloud
// console. So this counts what this app spends, which it can do exactly, because every method has a
// published price. What it cannot see is anything else using the same Cloud project, so the honest
// framing everywhere is "what ShortStack has used", never "what you have used".
//
// The prices are from the YouTube Data API documentation. An upload costs 1600 units against a
// default allowance of 10,000, which is the whole story of this screen: everything else is rounding,
// and six uploads is a day.

export const DEFAULT_DAILY_UNITS = 10_000;

/** Published unit costs. Anything not listed is a read, which is 1. */
export const UNIT_COSTS = {
  'videos.insert': 1600,
  'videos.update': 50,
  'thumbnails.set': 50,
  'search.list': 100,
  'videos.list': 1,
  'channels.list': 1,
  'playlistItems.list': 1,
  'videos.delete': 50
} as const;

export type ApiMethod = keyof typeof UNIT_COSTS;

export const costOf = (method: string): number => (UNIT_COSTS as Record<string, number>)[method] ?? 1;

/**
 * The allowance resets at midnight Pacific Time, not local midnight and not UTC. Worked out through
 * Intl rather than by hand so that the two weeks a year when California changes clocks and nowhere
 * else does are not a special case someone has to remember.
 */
export function pacificDay(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(at);
}

/** When the allowance next resets, as a real instant. */
export function nextReset(at: Date): Date {
  const today = pacificDay(at);
  // Step forward an hour at a time until the Pacific date rolls over. Coarse, but this is a label
  // under a progress bar, and an hour of slack on "resets in about 7 hours" is invisible.
  const cursor = new Date(at.getTime());
  for (let hours = 0; hours < 48; hours += 1) {
    cursor.setTime(cursor.getTime() + 3_600_000);
    if (pacificDay(cursor) !== today) {
      // Back to the top of that hour, which is close enough to midnight for a human-readable label.
      cursor.setUTCMinutes(0, 0, 0);
      return cursor;
    }
  }
  return new Date(at.getTime() + 86_400_000);
}

export interface QuotaSpend {
  method: string;
  units: number;
  at: string;
}

export interface QuotaState {
  used: number;
  limit: number;
  remaining: number;
  /** 0-100, clamped, so a raised allowance cannot draw a bar past its own end. */
  percentUsed: number;
  resetsAt: string;
  /** What the spend went on, largest first. */
  breakdown: Array<{ method: string; units: number; calls: number }>;
}

export function quotaState(spend: readonly QuotaSpend[], limit: number, now: Date): QuotaState {
  const today = pacificDay(now);
  const todays = spend.filter((entry) => pacificDay(new Date(entry.at)) === today);

  const byMethod = new Map<string, { units: number; calls: number }>();
  let used = 0;
  for (const entry of todays) {
    used += entry.units;
    const existing = byMethod.get(entry.method);
    if (existing === undefined) byMethod.set(entry.method, { units: entry.units, calls: 1 });
    else {
      existing.units += entry.units;
      existing.calls += 1;
    }
  }

  const safeLimit = limit > 0 ? limit : DEFAULT_DAILY_UNITS;
  return {
    used,
    limit: safeLimit,
    remaining: Math.max(0, safeLimit - used),
    percentUsed: Math.min(100, Math.max(0, (used / safeLimit) * 100)),
    resetsAt: nextReset(now).toISOString(),
    breakdown: [...byMethod.entries()]
      .map(([method, totals]) => ({ method, ...totals }))
      .sort((left, right) => right.units - left.units)
  };
}

export interface Affordable {
  what: string;
  count: number;
}

/**
 * What is left, in things the person actually does. A number of units means nothing on its own —
 * "1,700 left" is only useful once you know it is one more upload.
 */
export function whatIsLeft(remaining: number): Affordable[] {
  return [
    { what: 'more uploads through the API', count: Math.floor(remaining / UNIT_COSTS['videos.insert']) },
    { what: 'schedule or detail changes', count: Math.floor(remaining / UNIT_COSTS['videos.update']) },
    { what: 'checks on what is on your channel', count: remaining }
  ].filter((entry) => entry.count > 0);
}

export type QuotaMood = 'plenty' | 'watch' | 'nearly_out' | 'out';

export function moodFor(state: QuotaState): QuotaMood {
  if (state.remaining <= 0) return 'out';
  // An upload is 1600, so anything under that is out of uploads whatever the percentage says.
  if (state.remaining < UNIT_COSTS['videos.insert']) return 'nearly_out';
  return state.percentUsed >= 70 ? 'watch' : 'plenty';
}

const MOOD_WORDS: Record<QuotaMood, string> = {
  plenty: 'Plenty left today',
  watch: 'Getting through it',
  nearly_out: 'Not enough left for another upload',
  out: 'Nothing left until it resets'
};

export const describeMood = (mood: QuotaMood): string => MOOD_WORDS[mood];

/**
 * Which priced method a Data API request is. The gateway only knows a path and a verb, and the price
 * depends on both: GET /videos is a 1-unit read and PUT /videos is a 50-unit update.
 */
export function methodFor(path: string, verb = 'GET'): string {
  const resource = (path.split('?')[0] ?? '').replace(/^\/+/, '').split('/')[0] ?? '';
  const upper = verb.toUpperCase();

  if (resource === 'thumbnails') return 'thumbnails.set';
  if (resource === 'search') return 'search.list';
  if (resource === 'videos') {
    if (upper === 'PUT') return 'videos.update';
    if (upper === 'DELETE') return 'videos.delete';
    if (upper === 'POST') return 'videos.insert';
    return 'videos.list';
  }
  if (resource === 'channels') return upper === 'PUT' ? 'channels.update' : 'channels.list';
  if (resource === 'playlistItems') return 'playlistItems.list';
  return `${resource || 'unknown'}.list`;
}
