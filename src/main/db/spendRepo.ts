// The ledger behind the quota meter. One row per priced call, kept for a month so a bad day can be
// looked back on, and pruned so it does not grow for as long as the app is installed.
import type Database from 'better-sqlite3';
import type { QuotaSpend } from '../../shared/quota';

/** A month is long enough to notice a pattern and short enough never to matter on disk. */
const KEEP_DAYS = 30;

export function recordSpend(db: Database.Database, method: string, units: number, at: Date = new Date()): void {
  // A negative or fractional price can only come from a bug; recording it would quietly corrupt
  // every total after it.
  if (!Number.isInteger(units) || units <= 0) return;
  db.prepare('INSERT INTO api_spend (method, units, at) VALUES (?, ?, ?)').run(method, units, at.toISOString());
}

/** Everything since a moment, oldest first. Two days back is plenty to cover any Pacific "today". */
export function listSpendSince(db: Database.Database, since: Date): QuotaSpend[] {
  return db
    .prepare('SELECT method, units, at FROM api_spend WHERE at >= ? ORDER BY at')
    .all(since.toISOString()) as QuotaSpend[];
}

export function pruneSpend(db: Database.Database, now: Date = new Date()): number {
  const cutoff = new Date(now.getTime() - KEEP_DAYS * 86_400_000).toISOString();
  return db.prepare('DELETE FROM api_spend WHERE at < ?').run(cutoff).changes;
}
