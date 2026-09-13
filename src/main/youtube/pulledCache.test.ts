import { describe, expect, it, vi } from 'vitest';
import type { GatewayResult } from './gateway';
import { PulledCache, parseMaxAge } from './pulledCache';

function clock(start = '2026-09-13T18:00:00Z'): { now: () => Date; advance: (ms: number) => void } {
  let now = new Date(start);
  return {
    now: () => now,
    advance: (ms) => {
      now = new Date(now.getTime() + ms);
    }
  };
}

function counter(): () => Promise<GatewayResult<number>> {
  let calls = 0;
  return async () => {
    calls += 1;
    return { ok: true, value: calls };
  };
}

const valueOf = (result: GatewayResult<{ value: number; pulledAt: string } | null>): number | null =>
  result.ok ? (result.value?.value ?? null) : null;

describe('kept analytics', () => {
  it('asks YouTube nothing when told to show only what is kept', async () => {
    const cache = new PulledCache();
    const fetch = vi.fn(counter());
    expect(await cache.get('channel:28', null, fetch)).toEqual({ ok: true, value: null });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('asks once, then shows the same answer until it is older than the limit', async () => {
    const time = clock();
    const cache = new PulledCache(time.now);
    const fetch = counter();

    expect(valueOf(await cache.get('channel:28', 600_000, fetch))).toBe(1);
    time.advance(599_000);
    expect(valueOf(await cache.get('channel:28', 600_000, fetch))).toBe(1);
    time.advance(2_000);
    const third = await cache.get('channel:28', 600_000, fetch);
    expect(valueOf(third)).toBe(2);
    expect(third.ok && third.value?.pulledAt).toBe('2026-09-13T18:10:01.000Z');
  });

  it('always asks for a limit of zero, and only once for no limit at all', async () => {
    const cache = new PulledCache();
    const fetch = counter();
    expect(valueOf(await cache.get('k', Number.POSITIVE_INFINITY, fetch))).toBe(1);
    expect(valueOf(await cache.get('k', Number.POSITIVE_INFINITY, fetch))).toBe(1);
    expect(valueOf(await cache.get('k', 0, fetch))).toBe(2);
    expect(valueOf(await cache.get('k', null, fetch))).toBe(2);
  });

  it('keeps each question apart', async () => {
    const cache = new PulledCache();
    await cache.get('channel:7', 0, async () => ({ ok: true, value: 7 }));
    await cache.get('channel:28', 0, async () => ({ ok: true, value: 28 }));
    expect(valueOf(await cache.get('channel:7', null, counter()))).toBe(7);
    expect(valueOf(await cache.get('channel:28', null, counter()))).toBe(28);
  });

  it('does not keep a failure, so the next look tries again', async () => {
    const cache = new PulledCache();
    const failed = await cache.get('k', Number.POSITIVE_INFINITY, async (): Promise<GatewayResult<number>> => ({
      ok: false,
      reason: 'Quota used up',
      code: 'quotaExceeded',
      retryable: false
    }));
    expect(failed.ok).toBe(false);
    expect(valueOf(await cache.get('k', Number.POSITIVE_INFINITY, counter()))).toBe(1);
  });

  it('makes one request when two parts of the page ask at the same moment', async () => {
    const cache = new PulledCache();
    const fetch = vi.fn(counter());
    const [first, second] = await Promise.all([
      cache.get('videos:28', Number.POSITIVE_INFINITY, fetch),
      cache.get('videos:28', Number.POSITIVE_INFINITY, fetch)
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(valueOf(first)).toBe(1);
    expect(valueOf(second)).toBe(1);
  });

  // Disconnecting must not leave the old channel's numbers behind — not even ones still arriving.
  it('forgets everything when cleared, including an answer still on its way', async () => {
    const cache = new PulledCache();
    await cache.get('channel:28', 0, async () => ({ ok: true, value: 1 }));

    let finish: (result: GatewayResult<number>) => void = () => undefined;
    const slow = cache.get('channel:7', 0, () => new Promise<GatewayResult<number>>((resolve) => (finish = resolve)));
    cache.clear();
    finish({ ok: true, value: 7 });
    await slow;

    expect(await cache.get('channel:28', null, counter())).toEqual({ ok: true, value: null });
    expect(await cache.get('channel:7', null, counter())).toEqual({ ok: true, value: null });
  });
});

describe('the limit the page sends', () => {
  it('accepts a number of milliseconds, no limit, or never', () => {
    expect(parseMaxAge(0)).toBe(0);
    expect(parseMaxAge(900_000)).toBe(900_000);
    expect(parseMaxAge(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
    expect(parseMaxAge(null)).toBeNull();
    expect(parseMaxAge(undefined)).toBe(Number.POSITIVE_INFINITY);
  });

  it('refuses anything else', () => {
    expect(parseMaxAge(-1)).toBeUndefined();
    expect(parseMaxAge(Number.NaN)).toBeUndefined();
    expect(parseMaxAge('15')).toBeUndefined();
  });
});
