// One published video against the channel's typical video, worked out here so the model never does arithmetic.
// "Typical" is the median, so one viral video cannot make everything else look like a flop; the audit form
// describes it the same way.
import { MIN_PER_GROUP, median, subscribersPerThousand, type VideoStat } from '../insights';
import type { AssistantFact } from './types';

const round1 = (value: number): number => Math.round(value * 10) / 10;

/** Views against the typical video, in words. */
export function viewsVersusTypical(views: number, typical: number): string {
  if (typical <= 0) return `${views} views; the channel's typical video has none to compare with`;
  const ratio = views / typical;
  if (ratio >= 1.5) return `${views} views, ${round1(ratio)} times the channel's typical ${typical}`;
  if (ratio <= 0.67) return `${views} views, ${Math.round((1 - ratio) * 100)}% fewer than the channel's typical ${typical}`;
  return `${views} views, about the same as the channel's typical ${typical}`;
}

export function compareToTypical(videoId: string, all: readonly VideoStat[]): AssistantFact[] {
  const video = all.find((each) => each.videoId === videoId);
  if (video === undefined) {
    return [
      {
        id: 'compare-missing',
        text: 'This video is not in the last Analytics pull, so it cannot be compared yet. Refreshing Analytics would include it.',
        derived: false
      }
    ];
  }
  const others = all.filter((each) => each.videoId !== videoId);
  if (others.length < MIN_PER_GROUP) {
    return [
      { id: 'compare-too-few', text: `Only ${others.length} other videos to compare with, which is too few to say what is typical.`, derived: false }
    ];
  }

  const typicalViews = Math.round(median(others.map((each) => each.views)));
  const typicalWatched = Math.round(median(others.map((each) => each.averageViewPercentage)));
  const typicalSubscribers = round1(median(others.map(subscribersPerThousand)));
  const watched = Math.round(video.averageViewPercentage);
  const gap = watched - typicalWatched;

  return [
    { id: 'compare-views', text: `Views: ${viewsVersusTypical(video.views, typicalViews)}.`, derived: true },
    {
      id: 'compare-watched',
      text:
        gap === 0
          ? `People watch ${watched}% of it on average, the same as the channel's typical video.`
          : `People watch ${watched}% of it on average, ${Math.abs(gap)} points ${gap > 0 ? 'more' : 'less'} than the channel's typical ${typicalWatched}%.`,
      derived: true
    },
    {
      id: 'compare-subscribers',
      text: `Subscribers gained per 1,000 views: ${round1(subscribersPerThousand(video))}, against a typical ${typicalSubscribers}.`,
      derived: true
    },
    {
      id: 'compare-basis',
      text: `Compared with the channel's other ${others.length} videos in the last Analytics pull; "typical" means the median.`,
      derived: true
    }
  ];
}
