import { describe, expect, it } from 'vitest';
import type { QueueItemDTO } from './dto';
import { TOLERANCE_MINUTES, describeMatch, disagreements, matchFor, summarise } from './scheduleMatch';

const item = (over: Partial<QueueItemDTO>): QueueItemDTO =>
  ({
    id: 1,
    state: 'scheduled',
    youtube_video_id: 'abc123',
    scheduled_for: '2026-09-20T19:00:00.000Z',
    remote_publish_at: '2026-09-20T19:00:00.000Z',
    ...over
  }) as QueueItemDTO;

describe('matchFor', () => {
  it('agrees when both hold the same time', () => {
    expect(matchFor(item({})).state).toBe('agreed');
  });

  // YouTube stores seconds and ShortStack schedules on the minute, so an exact comparison would
  // report drift on videos that agree perfectly.
  it('allows a minute of slack', () => {
    expect(matchFor(item({ remote_publish_at: '2026-09-20T19:00:45.000Z' })).state).toBe('agreed');
    expect(matchFor(item({ remote_publish_at: '2026-09-20T19:02:00.000Z' })).state).toBe('different');
  });

  it('reports how far apart they are', () => {
    const match = matchFor(item({ remote_publish_at: '2026-09-20T21:30:00.000Z' }));
    expect(match.state).toBe('different');
    expect(match.driftMinutes).toBe(150);
  });

  // The case that matters most: a video is on YouTube, ShortStack thinks it has a time, and YouTube
  // has no publish time at all. Left alone it simply never goes out.
  it('notices a video on YouTube with no publish time set there', () => {
    expect(matchFor(item({ remote_publish_at: null })).state).toBe('not_set_on_youtube');
  });

  it('says nothing is wrong when nothing is planned and nothing is set', () => {
    expect(matchFor(item({ scheduled_for: null, remote_publish_at: null })).state).toBe('not_uploaded');
  });

  it('leaves alone what is not on YouTube yet, and what is already out', () => {
    expect(matchFor(item({ youtube_video_id: null })).state).toBe('not_uploaded');
    expect(matchFor(item({ state: 'published' })).state).toBe('published');
  });

  it('treats a time YouTube has and ShortStack does not as a disagreement', () => {
    expect(matchFor(item({ scheduled_for: null })).state).toBe('different');
  });

  it('does not crash on a time that is not a time', () => {
    expect(matchFor(item({ remote_publish_at: 'soon' })).state).toBe('different');
  });
});

describe('disagreements', () => {
  it('returns only what needs a decision, worst drift first', () => {
    const list = [
      item({ id: 1 }),
      item({ id: 2, remote_publish_at: '2026-09-20T19:30:00.000Z' }),
      item({ id: 3, remote_publish_at: '2026-09-21T19:00:00.000Z' }),
      item({ id: 4, youtube_video_id: null }),
      item({ id: 5, state: 'published' })
    ];
    expect(disagreements(list).map((match) => match.item.id)).toEqual([3, 2]);
  });
});

describe('summarise', () => {
  it('counts every video into exactly one bucket', () => {
    const list = [
      item({ id: 1 }),
      item({ id: 2, remote_publish_at: '2026-09-21T19:00:00.000Z' }),
      item({ id: 3, remote_publish_at: null }),
      item({ id: 4, youtube_video_id: null }),
      item({ id: 5, state: 'published' })
    ];
    const summary = summarise(list);
    expect(summary).toEqual({ agreed: 1, different: 1, notSetOnYouTube: 1, notUploaded: 1, published: 1 });
    expect(Object.values(summary).reduce((total, count) => total + count, 0)).toBe(list.length);
  });
});

describe('describeMatch', () => {
  it('says how far apart when they differ, and plainly otherwise', () => {
    expect(describeMatch(matchFor(item({ remote_publish_at: '2026-09-20T20:00:00.000Z' })))).toContain('60 minutes apart');
    expect(describeMatch(matchFor(item({})))).toBe('YouTube has the same time');
    expect(describeMatch(matchFor(item({ remote_publish_at: null })))).toMatch(/no publish time is set there/);
  });
});

describe('the tolerance', () => {
  it('is a minute, not a guess', () => {
    expect(TOLERANCE_MINUTES).toBe(1);
  });
});
