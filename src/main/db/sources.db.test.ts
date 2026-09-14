import { describe, expect, it } from 'vitest';
import { getQueueItem } from './queueRepo';
import { createTestDb, seedQueueItem } from './testFixtures';
import { linkNamedSource, listKnownSources, setVideoSource } from './videoRepo';

describe('the long video a Short was cut from', () => {
  it('is kept on the video, and each long video is offered once, most recent first', () => {
    const db = createTestDb();
    const first = seedQueueItem(db, { filename: 'first.mov' });
    const second = seedQueueItem(db, { filename: 'second.mov' });
    const third = seedQueueItem(db, { filename: 'third.mov' });
    const videoOf = (id: number): number => getQueueItem(db, id)?.video_id as number;

    setVideoSource(db, videoOf(first), { title: 'Round 50 attempt', url: 'https://www.youtube.com/watch?v=EfaSgECW4CY' });
    setVideoSource(db, videoOf(second), { title: 'round 50 attempt', url: null });
    setVideoSource(db, videoOf(third), { title: 'CS2 with friends', url: null });

    expect(getQueueItem(db, first)).toMatchObject({
      source_title: 'Round 50 attempt',
      source_url: 'https://www.youtube.com/watch?v=EfaSgECW4CY'
    });
    // The same long video typed twice is one entry, and keeps the link it was given once.
    expect(listKnownSources(db)).toEqual([
      { title: 'CS2 with friends', url: null },
      { title: 'round 50 attempt', url: 'https://www.youtube.com/watch?v=EfaSgECW4CY' }
    ]);

    setVideoSource(db, videoOf(third), null);
    expect(getQueueItem(db, third)).toMatchObject({ source_title: null, source_url: null });
  });

  // Shorts are often cut before the long video is up, so they are named by hand; linking one links the batch.
  it('gives every Short named after a long video its link and real title once one of them is linked', () => {
    const db = createTestDb();
    const shorts = ['a.mov', 'b.mov', 'c.mov'].map((filename) => seedQueueItem(db, { filename }));
    const other = seedQueueItem(db, { filename: 'other.mov' });
    const videoOf = (id: number): number => getQueueItem(db, id)?.video_id as number;
    for (const id of shorts) setVideoSource(db, videoOf(id), { title: 'round 50 attempt', url: null });
    setVideoSource(db, videoOf(other), { title: 'CS2 with friends', url: null });

    const linked = { title: 'ROUND 50 ATTEMPT ON KINO!', url: 'https://www.youtube.com/watch?v=EfaSgECW4CY' };
    setVideoSource(db, videoOf(shorts[0] as number), linked);
    expect(linkNamedSource(db, ['Round 50 Attempt'], linked)).toBe(2);

    for (const id of shorts) expect(getQueueItem(db, id)).toMatchObject({ source_title: linked.title, source_url: linked.url });
    expect(getQueueItem(db, other)).toMatchObject({ source_title: 'CS2 with friends', source_url: null });
  });
});
