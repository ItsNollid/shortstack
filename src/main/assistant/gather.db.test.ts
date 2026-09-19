import { describe, expect, it } from 'vitest';
import type { VideoStat } from '../../shared/insights';
import { writeSetting } from '../db/settingsRepo';
import { createTestDb, seedQueueItem } from '../db/testFixtures';
import { gatherFacts } from './gather';

const NOW = new Date('2026-09-19T12:00:00.000Z');
const stat = (videoId: string, views: number): VideoStat => ({
  videoId,
  title: videoId,
  description: '',
  tags: [],
  publishedAt: '2026-09-01T18:00:00.000Z',
  views,
  averageViewPercentage: 50,
  likes: 0,
  subscribersGained: 1
});
const BRIEF = {
  usable: [{ id: 'time-of-day', statement: 'Evening videos get the most views.', sampleSize: 12, confidence: 'strong' }],
  missing: [],
  videoCount: 34,
  tooEarly: false,
  madeAt: '2026-09-19T10:00:00.000Z'
};
const ids = (facts: ReadonlyArray<{ id: string }>): string[] => facts.map((fact) => fact.id);

describe('gathering what the assistant may say', () => {
  it('says nothing is measured about a channel Analytics has never read, and still gives the daily times', () => {
    const db = createTestDb();
    const gathered = gatherFacts({ db, videoStats: () => null, now: NOW }, { kind: 'channel' });
    expect(ids(gathered?.facts ?? [])).toEqual(['channel-none', 'daily-times']);
    expect(gathered?.basedOn).toBe('nothing measured yet');
  });

  it('gives the saved findings for the channel', () => {
    const db = createTestDb();
    writeSetting(db, 'insight_findings', JSON.stringify(BRIEF));
    const gathered = gatherFacts({ db, videoStats: () => null, now: NOW }, { kind: 'channel' });
    expect(ids(gathered?.facts ?? [])).toContain('finding:time-of-day');
    expect(gathered?.basedOn).toBe('34 videos from the last Analytics refresh');
  });

  it('gives a waiting video its own facts, with no comparison', () => {
    const db = createTestDb();
    const id = seedQueueItem(db, { filename: 'clip.mov' });
    const facts = ids(gatherFacts({ db, videoStats: () => null, now: NOW }, { kind: 'video', queueId: id })?.facts ?? []);
    expect(facts).toEqual(expect.arrayContaining(['video-state', 'video-title', 'daily-times']));
    expect(facts.some((each) => each.startsWith('compare-'))).toBe(false);
  });

  it('compares a published video when Analytics has been pulled, and says so when it has not', () => {
    const db = createTestDb();
    const id = seedQueueItem(db, { filename: 'hit.mov', state: 'published', youtubeVideoId: 'hit' });
    const pulled = { value: [stat('a', 100), stat('b', 200), stat('c', 300), stat('hit', 640)], pulledAt: '2026-09-19T11:00:00.000Z' };
    const withStats = gatherFacts({ db, videoStats: () => pulled, now: NOW }, { kind: 'video', queueId: id });
    expect(ids(withStats?.facts ?? [])).toContain('compare-views');
    expect(withStats?.basedOn).toBe('this video against 3 others from the last Analytics refresh');
    const without = gatherFacts({ db, videoStats: () => null, now: NOW }, { kind: 'video', queueId: id });
    expect(ids(without?.facts ?? [])).toContain('compare-unpulled');
  });

  it('gives the plan for the calendar and the queue', () => {
    const db = createTestDb();
    seedQueueItem(db, { filename: 'waiting.mov' });
    expect(ids(gatherFacts({ db, videoStats: () => null, now: NOW }, { kind: 'plan' })?.facts ?? [])).toContain('plan-waiting');
  });

  it('has nothing to say about a video no longer in the queue', () => {
    const db = createTestDb();
    expect(gatherFacts({ db, videoStats: () => null, now: NOW }, { kind: 'video', queueId: 999 })).toBeNull();
  });
});
