import { describe, expect, it } from 'vitest';
import { getQueueItem } from './queueRepo';
import { createTestDb, seedQueueItem } from './testFixtures';
import { listKnownSources, setVideoSource } from './videoRepo';

describe('the long video a Short was cut from', () => {
  it('is kept on the video, and each long video is offered once, most recent first', () => {
    const db = createTestDb();
    const first = seedQueueItem(db, { filename: 'first.mov' });
    const second = seedQueueItem(db, { filename: 'second.mov' });
    const third = seedQueueItem(db, { filename: 'third.mov' });
    const videoOf = (id: number): number => getQueueItem(db, id)?.video_id as number;

    setVideoSource(db, videoOf(first), { title: 'Round 50 attempt', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
    setVideoSource(db, videoOf(second), { title: 'round 50 attempt', url: null });
    setVideoSource(db, videoOf(third), { title: 'CS2 with friends', url: null });

    expect(getQueueItem(db, first)).toMatchObject({
      source_title: 'Round 50 attempt',
      source_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    });
    // The same long video typed twice is one entry, and keeps the link it was given once.
    expect(listKnownSources(db)).toEqual([
      { title: 'CS2 with friends', url: null },
      { title: 'round 50 attempt', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }
    ]);

    setVideoSource(db, videoOf(third), null);
    expect(getQueueItem(db, third)).toMatchObject({ source_title: null, source_url: null });
  });
});
