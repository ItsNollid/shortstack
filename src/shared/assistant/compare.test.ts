import { describe, expect, it } from 'vitest';
import type { VideoStat } from '../insights';
import { compareToTypical, viewsVersusTypical } from './compare';

const stat = (videoId: string, views: number, watched: number, subscribers: number): VideoStat => ({
  videoId,
  title: videoId,
  description: '',
  tags: [],
  publishedAt: '2026-09-01T18:00:00.000Z',
  views,
  averageViewPercentage: watched,
  likes: 0,
  subscribersGained: subscribers
});
const OTHERS = [stat('a', 100, 50, 1), stat('b', 200, 55, 1), stat('c', 300, 60, 3)];

describe('views against the typical video, in words', () => {
  it('says how many times over, how much fewer, or about the same', () => {
    expect(viewsVersusTypical(300, 200)).toBe("300 views, 1.5 times the channel's typical 200");
    expect(viewsVersusTypical(134, 200)).toBe("134 views, 33% fewer than the channel's typical 200");
    expect(viewsVersusTypical(200, 200)).toBe("200 views, about the same as the channel's typical 200");
    expect(viewsVersusTypical(50, 0)).toBe("50 views; the channel's typical video has none to compare with");
  });
});

describe('a published video against the channel’s typical one', () => {
  it('puts views, watching and subscribers against the median of the others', () => {
    const facts = compareToTypical('hit', [...OTHERS, stat('hit', 640, 43, 8)]);
    expect(facts.map((fact) => fact.text)).toEqual([
      "Views: 640 views, 3.2 times the channel's typical 200.",
      "People watch 43% of it on average, 12 points less than the channel's typical 55%.",
      'Subscribers gained per 1,000 views: 12.5, against a typical 10.',
      'Compared with the channel\'s other 3 videos in the last Analytics pull; "typical" means the median.'
    ]);
    expect(facts.every((fact) => fact.derived)).toBe(true);
  });

  it('says so when the video is not in the last pull', () => {
    expect(compareToTypical('missing', OTHERS)).toEqual([
      {
        id: 'compare-missing',
        text: 'This video is not in the last Analytics pull, so it cannot be compared yet. Refreshing Analytics would include it.',
        derived: false
      }
    ]);
  });

  it('will not call anything typical from too few other videos', () => {
    const facts = compareToTypical('hit', [stat('a', 100, 50, 1), stat('b', 200, 55, 1), stat('hit', 640, 43, 8)]);
    expect(facts).toEqual([{ id: 'compare-too-few', text: 'Only 2 other videos to compare with, which is too few to say what is typical.', derived: false }]);
  });
});
