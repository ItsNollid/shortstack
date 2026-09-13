import { describe, expect, it } from 'vitest';
import { freshEnough, maxAgeFor, pulledAgo } from './analyticsRefresh';

describe('how old an answer may be', () => {
  it('always asks when Refresh is pressed, whatever the setting', () => {
    expect(maxAgeFor('manual', 15, 'button')).toBe(0);
    expect(maxAgeFor('interval', 15, 'button')).toBe(0);
    expect(maxAgeFor('on_open', 15, 'button')).toBe(0);
  });

  it('never asks on its own when set to manual, except once for a range it has nothing for', () => {
    expect(maxAgeFor('manual', 15, 'open')).toBeNull();
    expect(maxAgeFor('manual', 15, 'tick')).toBeNull();
    expect(maxAgeFor('manual', 15, 'range')).toBe(Number.POSITIVE_INFINITY);
  });

  it('asks every time the page opens when set to, and keeps the answer otherwise', () => {
    expect(maxAgeFor('on_open', 15, 'open')).toBe(0);
    expect(maxAgeFor('on_open', 15, 'range')).toBe(Number.POSITIVE_INFINITY);
  });

  it('on an interval, accepts an answer up to that many minutes old, kept inside 5 to 30', () => {
    expect(maxAgeFor('interval', 10, 'open')).toBe(600_000);
    expect(maxAgeFor('interval', 10, 'tick')).toBe(600_000);
    expect(maxAgeFor('interval', 2, 'tick')).toBe(300_000);
    expect(maxAgeFor('interval', 90, 'tick')).toBe(1_800_000);
  });
});

describe('freshness', () => {
  const now = new Date('2026-09-13T18:00:00Z');

  it('compares the age against the limit', () => {
    expect(freshEnough('2026-09-13T17:50:00Z', 600_000, now)).toBe(true);
    expect(freshEnough('2026-09-13T17:49:59Z', 600_000, now)).toBe(false);
    expect(freshEnough('2026-09-13T10:00:00Z', Number.POSITIVE_INFINITY, now)).toBe(true);
    expect(freshEnough('2026-09-13T17:59:59Z', 0, now)).toBe(false);
  });

  it('says how long ago, in words', () => {
    expect(pulledAgo('2026-09-13T17:59:40Z', now)).toBe('just now');
    expect(pulledAgo('2026-09-13T17:59:00Z', now)).toBe('1 minute ago');
    expect(pulledAgo('2026-09-13T17:36:00Z', now)).toBe('24 minutes ago');
    expect(pulledAgo('2026-09-13T16:30:00Z', now)).toBe('an hour ago');
    expect(pulledAgo('2026-09-13T13:00:00Z', now)).toBe('5 hours ago');
  });
});
