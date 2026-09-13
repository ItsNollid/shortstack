// Where a video actually is. The calendar shows a time for everything on it, but a time in
// ShortStack and a time YouTube has agreed to are very different promises: one needs this computer
// running at the right moment, the other does not.
import type { QueueItemDTO } from './dto';

export type Whereabouts = 'local_only' | 'on_youtube' | 'youtube_holds_time';

export function whereabouts(item: QueueItemDTO): Whereabouts {
  if (item.state === 'scheduled' || item.state === 'published') return 'youtube_holds_time';
  return item.youtube_video_id !== null ? 'on_youtube' : 'local_only';
}

const EXPLANATION: Record<Whereabouts, string> = {
  local_only: 'Only in ShortStack so far. Nothing about this exists on YouTube yet.',
  on_youtube: 'On YouTube as a private video, with no publish time set there yet.',
  youtube_holds_time: 'YouTube has this and will publish it at this time, even if this computer is off.'
};

export const explainWhereabouts = (item: QueueItemDTO): string => EXPLANATION[whereabouts(item)];

/** The only state in which the calendar's time is a promise YouTube has made rather than a plan. */
export const youTubeHasTheTime = (item: QueueItemDTO): boolean => whereabouts(item) === 'youtube_holds_time';
