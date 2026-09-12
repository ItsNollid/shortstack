import type Database from 'better-sqlite3';
import type { ActivityEntryDTO } from '../../shared/dto';
import { toActivityDTO } from './rows';

export interface ActivityInput {
  queueId: number | null;
  action: string;
  detail: string | null;
  now: Date;
}

/** Records an action taken on the user's behalf: History shows these and the API policies require them. */
export function appendActivity(db: Database.Database, entry: ActivityInput): void {
  db.prepare('INSERT INTO activity_log (queue_id, action, detail, created_at) VALUES (?, ?, ?, ?)').run(
    entry.queueId,
    entry.action,
    entry.detail,
    entry.now.toISOString()
  );
}

export function listActivity(db: Database.Database, options: { queueId?: number; limit?: number } = {}): ActivityEntryDTO[] {
  const limit = options.limit ?? 200;
  const rows =
    options.queueId === undefined
      ? db.prepare('SELECT * FROM activity_log ORDER BY id DESC LIMIT ?').all(limit)
      : db.prepare('SELECT * FROM activity_log WHERE queue_id = ? ORDER BY id DESC LIMIT ?').all(options.queueId, limit);
  return (rows as Array<Record<string, unknown>>).map(toActivityDTO);
}
