import { describe, expect, it } from 'vitest';
import { KEEP_WITHOUT_REFRESH_MS, retentionVerdict, type RefreshOutcome } from './retention';

const NOW = new Date('2026-09-18T12:00:00.000Z');
const agedBy = (ms: number): string => new Date(NOW.getTime() - ms).toISOString();
const verdict = (outcome: RefreshOutcome, lastRefreshedAt: string | null = agedBy(60_000)) =>
  retentionVerdict({ outcome, lastRefreshedAt, now: NOW });

describe('how long channel details may stay without being confirmed', () => {
  it('keeps them when there is nothing stored, or the check just confirmed them', () => {
    expect(verdict('nothing_stored', null)).toEqual({ forget: false });
    expect(verdict('refreshed')).toEqual({ forget: false });
  });

  it('deletes them as soon as access is gone, however recently they were confirmed', () => {
    expect(verdict('access_gone')).toEqual({ forget: true, because: 'access_gone' });
  });

  it('keeps unconfirmable details for a month, then deletes them', () => {
    expect(verdict('unreachable', agedBy(KEEP_WITHOUT_REFRESH_MS - 60_000))).toEqual({ forget: false });
    expect(verdict('unreachable', agedBy(KEEP_WITHOUT_REFRESH_MS))).toEqual({ forget: true, because: 'unconfirmed' });
  });

  it('treats details with no date, or an unreadable one, as already past keeping', () => {
    expect(verdict('unreachable', null)).toEqual({ forget: true, because: 'unconfirmed' });
    expect(verdict('unreachable', 'the other day')).toEqual({ forget: true, because: 'unconfirmed' });
  });
});
