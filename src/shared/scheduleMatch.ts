// Comparing the time ShortStack holds against the time YouTube holds.
//
// These are two separate promises and they can drift: a publish time changed in Studio, a sync that
// failed, a video ShortStack thinks is scheduled that YouTube never accepted. The app used to show
// its own time and say nothing about whether YouTube agreed, which is the worst of both — it looks
// certain and is not.
//
// Nothing here fixes anything. It reports, in both directions, and the person decides which side is
// right; a tool that silently made YouTube match itself would eventually move a video someone had
// deliberately rescheduled in Studio.
import type { QueueItemDTO } from './dto';

export type MatchState =
  /** Both hold the same time, within the tolerance below. */
  | 'agreed'
  /** ShortStack has a time; YouTube has this video but no publish time on it. */
  | 'not_set_on_youtube'
  /** Both have a time and they differ. */
  | 'different'
  /** Nothing is on YouTube yet, so there is nothing to disagree with. */
  | 'not_uploaded'
  /** Already out; the time is history rather than a plan. */
  | 'published';

export interface ScheduleMatch {
  item: QueueItemDTO;
  state: MatchState;
  /** Minutes between the two times, when both exist. */
  driftMinutes: number | null;
}

/**
 * A minute of slack. YouTube stores seconds and ShortStack schedules on the minute, so an exact
 * comparison would report drift on videos that agree perfectly.
 */
export const TOLERANCE_MINUTES = 1;

const minutesBetween = (left: string, right: string): number | null => {
  const a = Date.parse(left);
  const b = Date.parse(right);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round(Math.abs(a - b) / 60_000);
};

export function matchFor(item: QueueItemDTO): ScheduleMatch {
  if (item.state === 'published') return { item, state: 'published', driftMinutes: null };
  if (item.youtube_video_id === null) return { item, state: 'not_uploaded', driftMinutes: null };

  const mine = item.scheduled_for;
  const theirs = item.remote_publish_at;

  if (theirs === null) {
    // On YouTube as a private video with no publish time. Only a problem if a time was planned.
    return { item, state: mine === null ? 'not_uploaded' : 'not_set_on_youtube', driftMinutes: null };
  }
  if (mine === null) return { item, state: 'different', driftMinutes: null };

  const drift = minutesBetween(mine, theirs);
  if (drift === null) return { item, state: 'different', driftMinutes: null };
  return drift <= TOLERANCE_MINUTES ? { item, state: 'agreed', driftMinutes: drift } : { item, state: 'different', driftMinutes: drift };
}

/** Only the ones worth acting on, worst drift first so the biggest surprise is at the top. */
export function disagreements(items: readonly QueueItemDTO[]): ScheduleMatch[] {
  return items
    .map(matchFor)
    .filter((match) => match.state === 'different' || match.state === 'not_set_on_youtube')
    .sort((left, right) => (right.driftMinutes ?? 0) - (left.driftMinutes ?? 0));
}

export interface MatchSummary {
  agreed: number;
  different: number;
  notSetOnYouTube: number;
  notUploaded: number;
  published: number;
}

export function summarise(items: readonly QueueItemDTO[]): MatchSummary {
  const summary: MatchSummary = { agreed: 0, different: 0, notSetOnYouTube: 0, notUploaded: 0, published: 0 };
  for (const item of items) {
    const { state } = matchFor(item);
    if (state === 'agreed') summary.agreed += 1;
    else if (state === 'different') summary.different += 1;
    else if (state === 'not_set_on_youtube') summary.notSetOnYouTube += 1;
    else if (state === 'not_uploaded') summary.notUploaded += 1;
    else summary.published += 1;
  }
  return summary;
}

const MATCH_WORDS: Record<MatchState, string> = {
  agreed: 'YouTube has the same time',
  not_set_on_youtube: 'On YouTube, but no publish time is set there',
  different: 'ShortStack and YouTube hold different times',
  not_uploaded: 'Not on YouTube yet',
  published: 'Already published'
};

export const describeMatch = (match: ScheduleMatch): string =>
  match.state === 'different' && match.driftMinutes !== null
    ? `${MATCH_WORDS.different} — ${match.driftMinutes} minutes apart`
    : MATCH_WORDS[match.state];
