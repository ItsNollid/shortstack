import { describe, expect, it } from 'vitest';
import { allFacts, buildBrief, favouredAngle, parseBrief, titleAngleFact, withTitleAngles, type VideoStat } from './insights';
import type { TitleAngle } from './titleAngles';

let counter = 0;
const video = (titleAngle: TitleAngle | null, views: number): VideoStat => ({
  videoId: `v${(counter += 1)}`,
  title: 'A video',
  description: '',
  tags: [],
  publishedAt: '2026-09-01T14:00:00',
  views,
  averageViewPercentage: 50,
  likes: 5,
  subscribersGained: 1,
  titleAngle
});
const times = (count: number, make: () => VideoStat): VideoStat[] => Array.from({ length: count }, make);

describe('which kind of title does best', () => {
  it('waits for enough videos of at least two kinds, and says how many there are', () => {
    const fact = titleAngleFact([...times(4, () => video('reaction', 100)), ...times(2, () => video('play', 300)), video(null, 900)]);
    expect(fact).toMatchObject({ id: 'title-angle', confidence: 'insufficient', sampleSize: 6 });
    expect(fact.statement).toContain('4 reaction, 2 play, 0 joke');
    expect(fact.leader).toBeUndefined();
  });

  it('names the kind that gets clearly more views, in words and for code', () => {
    const fact = titleAngleFact([
      ...times(3, () => video('reaction', 900)),
      ...times(3, () => video('play', 300)),
      ...times(3, () => video('joke', 200))
    ]);
    expect(fact.statement).toBe(
      'Titles about the reaction get a median of 900 views across 3 videos, against 300 for titles about the play (3 videos) and 200 for titles about the joke (3 videos).'
    );
    expect(fact).toMatchObject({ confidence: 'weak', leader: 'reaction', sampleSize: 9 });
  });

  it('names no leader when the difference is too small to act on', () => {
    const fact = titleAngleFact([...times(3, () => video('reaction', 310)), ...times(3, () => video('play', 300))]);
    expect(fact.statement).toMatch(/^The kind of title makes no real difference yet/);
    expect(fact.leader).toBeUndefined();
  });

  it('counts only titles that were one of the offers', () => {
    expect(titleAngleFact(times(10, () => video(null, 500))).sampleSize).toBe(0);
  });
});

describe('the kind of title, into the numbers and back out', () => {
  it('is filled in for each video from ShortStack records', () => {
    const first = video(null, 1);
    const second = video(null, 2);
    expect(withTitleAngles([first, second], new Map([[first.videoId, 'joke']])).map((each) => each.titleAngle)).toEqual(['joke', null]);
  });

  it('is read back out of a brief as the favoured kind, including one that was stored and loaded again', () => {
    const videos = [...times(3, () => video('joke', 900)), ...times(3, () => video('play', 100))];
    expect(favouredAngle(buildBrief(videos))).toBe('joke');
    expect(favouredAngle(parseBrief(JSON.stringify(buildBrief(videos))))).toBe('joke');
    expect(favouredAngle(buildBrief([]))).toBeNull();
    expect(favouredAngle(null)).toBeNull();
  });

  it('is part of every brief', () => {
    expect(allFacts([]).map((fact) => fact.id)).toContain('title-angle');
  });
});
