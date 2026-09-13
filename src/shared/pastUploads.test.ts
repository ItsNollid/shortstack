import { describe, expect, it } from 'vitest';
import { copyableFrom, matchesSearch, type PastUpload } from './pastUploads';

const upload = (over: Partial<PastUpload> = {}): PastUpload => ({
  videoId: 'abc',
  title: 'Zombie map guide',
  description: 'Round 100 strategy',
  tags: ['blackops3', 'zombies'],
  categoryId: '20',
  thumbnailUrl: 'https://i.ytimg.com/vi/abc/hq.jpg',
  publishedAt: '2026-01-01T00:00:00.000Z',
  privacy: 'public',
  ...over
});

describe('copyableFrom', () => {
  it('takes the details that describe the video', () => {
    expect(copyableFrom(upload())).toEqual({
      title: 'Zombie map guide',
      description: 'Round 100 strategy',
      tags: ['blackops3', 'zombies'],
      categoryId: '20'
    });
  });

  it('leaves visibility and timing alone, because those belong to this posting', () => {
    // Copying the old video's visibility would quietly decide something the user is about to decide.
    const copied = copyableFrom(upload({ privacy: 'private' })) as unknown as Record<string, unknown>;
    expect(copied.privacy).toBeUndefined();
    expect(copied.publishedAt).toBeUndefined();
  });
});

describe('matchesSearch', () => {
  it('matches the title, the description and the tags', () => {
    expect(matchesSearch(upload(), 'zombie')).toBe(true);
    expect(matchesSearch(upload(), 'round 100')).toBe(true);
    expect(matchesSearch(upload(), 'blackops3')).toBe(true);
  });

  it('ignores case and surrounding space', () => {
    expect(matchesSearch(upload(), '  ZOMBIE  ')).toBe(true);
  });

  it('lets everything through on an empty search', () => {
    expect(matchesSearch(upload(), '')).toBe(true);
    expect(matchesSearch(upload(), '   ')).toBe(true);
  });

  it('says no when nothing matches', () => {
    expect(matchesSearch(upload(), 'minecraft')).toBe(false);
  });
});
