import { describe, expect, it } from 'vitest';
import { PulledCache } from './pulledCache';

describe('reading the newest pull without asking YouTube', () => {
  it('returns the most recent answer kept under the prefix', async () => {
    let clock = new Date('2026-09-19T10:00:00.000Z');
    const cache = new PulledCache(() => clock);
    await cache.get('videos:28', 60_000, () => Promise.resolve({ ok: true as const, value: ['older'] }));
    clock = new Date('2026-09-19T11:00:00.000Z');
    await cache.get('videos:90', 60_000, () => Promise.resolve({ ok: true as const, value: ['newer'] }));
    await cache.get('channel:28', 60_000, () => Promise.resolve({ ok: true as const, value: ['other'] }));
    expect(cache.newest<string[]>('videos:')).toEqual({ value: ['newer'], pulledAt: '2026-09-19T11:00:00.000Z' });
  });

  it('is null when nothing under the prefix was pulled, and after a clear', async () => {
    const cache = new PulledCache();
    expect(cache.newest('videos:')).toBeNull();
    await cache.get('videos:28', 60_000, () => Promise.resolve({ ok: true as const, value: [] }));
    cache.clear();
    expect(cache.newest('videos:')).toBeNull();
  });
});
