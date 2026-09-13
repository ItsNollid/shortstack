import { describe, expect, it } from 'vitest';
import { createTestDb } from './testFixtures';
import { listSpendSince, pruneSpend, recordSpend } from './spendRepo';

const at = (iso: string): Date => new Date(iso);

describe('the spend ledger', () => {
  it('records a call and reads it back', () => {
    const db = createTestDb();
    recordSpend(db, 'videos.insert', 1600, at('2026-09-20T18:00:00Z'));
    expect(listSpendSince(db, at('2026-09-20T00:00:00Z'))).toEqual([
      { method: 'videos.insert', units: 1600, at: '2026-09-20T18:00:00.000Z' }
    ]);
  });

  it('reads only what is since the moment asked for, oldest first', () => {
    const db = createTestDb();
    recordSpend(db, 'videos.list', 1, at('2026-09-18T10:00:00Z'));
    recordSpend(db, 'videos.update', 50, at('2026-09-20T12:00:00Z'));
    recordSpend(db, 'videos.list', 1, at('2026-09-20T09:00:00Z'));

    const since = listSpendSince(db, at('2026-09-20T00:00:00Z'));
    expect(since.map((entry) => entry.method)).toEqual(['videos.list', 'videos.update']);
  });

  // A negative or fractional price can only be a bug, and recording it would corrupt every total.
  it('refuses a price that cannot be real', () => {
    const db = createTestDb();
    for (const units of [0, -50, 1.5, Number.NaN]) recordSpend(db, 'videos.list', units, at('2026-09-20T12:00:00Z'));
    expect(listSpendSince(db, at('2026-09-01T00:00:00Z'))).toEqual([]);
  });

  it('forgets anything older than a month, and keeps the rest', () => {
    const db = createTestDb();
    recordSpend(db, 'videos.list', 1, at('2026-07-01T12:00:00Z'));
    recordSpend(db, 'videos.list', 1, at('2026-09-15T12:00:00Z'));

    expect(pruneSpend(db, at('2026-09-20T12:00:00Z'))).toBe(1);
    expect(listSpendSince(db, at('2026-01-01T00:00:00Z'))).toHaveLength(1);
  });
});
