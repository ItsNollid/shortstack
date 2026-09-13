import { beforeEach, describe, expect, it } from 'vitest';
import type { PastUpload } from '../../shared/pastUploads';
import { cachedPastUploads, clearPastUploadsCache } from './draft';

const upload = (videoId: string): PastUpload => ({
  videoId,
  title: `Video ${videoId}`,
  description: '#shorts',
  tags: [],
  categoryId: '20',
  thumbnailUrl: null,
  publishedAt: null,
  privacy: 'public'
});

/** Counts the asks, and answers with whatever is queued next. */
function source(answers: Array<'fail' | PastUpload[]>) {
  let asks = 0;
  return {
    get asks() {
      return asks;
    },
    listPastUploads: async () => {
      const next = answers[Math.min(asks, answers.length - 1)];
      asks += 1;
      if (next === 'fail') throw new Error('YouTube did not answer');
      return { ok: true, value: { items: next as PastUpload[] } };
    }
  };
}

const HALF_HOUR = 30 * 60_000;

beforeEach(() => clearPastUploadsCache());

describe('cachedPastUploads', () => {
  // A drafting run asked once per video: four hundred calls for two hundred videos, same six results.
  it('asks once and reuses the answer', async () => {
    const fake = source([[upload('a')]]);
    await cachedPastUploads(fake, 'UU1', 0);
    await cachedPastUploads(fake, 'UU1', 1000);
    await cachedPastUploads(fake, 'UU1', HALF_HOUR - 1);
    expect(fake.asks).toBe(1);
  });

  it('asks again once the answer has gone stale', async () => {
    const fake = source([[upload('a')], [upload('b')]]);
    await cachedPastUploads(fake, 'UU1', 0);
    const later = await cachedPastUploads(fake, 'UU1', HALF_HOUR + 1);
    expect(fake.asks).toBe(2);
    expect(later.map((item) => item.videoId)).toEqual(['b']);
  });

  it('never caches a failure, so the next video tries again', async () => {
    const fake = source(['fail', [upload('a')]]);
    expect(await cachedPastUploads(fake, 'UU1', 0)).toEqual([]);
    expect((await cachedPastUploads(fake, 'UU1', 10)).map((item) => item.videoId)).toEqual(['a']);
    expect(fake.asks).toBe(2);
  });

  it('keeps the last good list while YouTube is not answering', async () => {
    const fake = source([[upload('a')], 'fail']);
    await cachedPastUploads(fake, 'UU1', 0);
    const during = await cachedPastUploads(fake, 'UU1', HALF_HOUR + 1);
    expect(during.map((item) => item.videoId)).toEqual(['a']);
  });

  it('keeps two channels apart', async () => {
    const fake = source([[upload('a')], [upload('b')]]);
    await cachedPastUploads(fake, 'UU1', 0);
    const other = await cachedPastUploads(fake, 'UU2', 0);
    expect(other.map((item) => item.videoId)).toEqual(['b']);
  });

  // A cached list of someone's uploads must not outlive their permission.
  it('forgets everything when cleared', async () => {
    const fake = source([[upload('a')], [upload('b')]]);
    await cachedPastUploads(fake, 'UU1', 0);
    clearPastUploadsCache();
    await cachedPastUploads(fake, 'UU1', 1);
    expect(fake.asks).toBe(2);
  });
});
