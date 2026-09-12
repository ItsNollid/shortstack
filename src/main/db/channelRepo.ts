import type Database from 'better-sqlite3';
import { toDbValue } from './rows';

export interface ChannelRecord {
  id: string;
  title: string;
  handle: string | null;
  avatarUrl: string | null;
  subscriberCount: number | null;
  updatedAt: string;
}

/** Stores the connected channel. The channels table existed but nothing ever wrote to it. */
export function upsertChannel(db: Database.Database, channel: Omit<ChannelRecord, 'updatedAt'>, now: Date): void {
  db.prepare(
    `INSERT INTO channels (id, name, handle, avatar_url, subscriber_count, is_active, credentials_path, created_at, updated_at)
     VALUES (@id, @name, @handle, @avatar_url, @subscriber_count, 1, NULL, @now, @now)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       handle = excluded.handle,
       avatar_url = excluded.avatar_url,
       subscriber_count = excluded.subscriber_count,
       is_active = 1,
       updated_at = excluded.updated_at`
  ).run({
    id: channel.id,
    name: channel.title,
    handle: toDbValue(channel.handle),
    avatar_url: toDbValue(channel.avatarUrl),
    subscriber_count: toDbValue(channel.subscriberCount),
    now: now.toISOString()
  });
  db.prepare('UPDATE channels SET is_active = 0 WHERE id <> ?').run(channel.id);
}

export function readActiveChannel(db: Database.Database): ChannelRecord | null {
  const row = db.prepare('SELECT * FROM channels WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1').get() as
    | Record<string, unknown>
    | undefined;
  if (row === undefined) return null;
  return {
    id: String(row.id ?? ''),
    title: typeof row.name === 'string' ? row.name : 'Your channel',
    handle: typeof row.handle === 'string' ? row.handle : null,
    avatarUrl: typeof row.avatar_url === 'string' ? row.avatar_url : null,
    subscriberCount: typeof row.subscriber_count === 'number' ? row.subscriber_count : null,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : ''
  };
}

/** Removes stored channel data, which the API policies require on disconnect. */
export function clearChannels(db: Database.Database): void {
  db.prepare('DELETE FROM channels').run();
}
