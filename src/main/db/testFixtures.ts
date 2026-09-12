// Helpers shared by the database tests.
import Database from 'better-sqlite3';
import { migrate } from './migrations';

export const TEST_NOW = new Date('2026-09-12T12:00:00.000Z');

export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db, { now: () => TEST_NOW });
  return db;
}

export interface SeedQueueOptions {
  filename?: string;
  privacy?: string;
  state?: string;
  scheduledFor?: string | null;
  scheduleSource?: string | null;
  youtubeVideoId?: string | null;
}

export function seedQueueItem(db: Database.Database, options: SeedQueueOptions = {}): number {
  const filename = options.filename ?? 'clip.mov';
  const created = '2026-09-12T11:00:00.000Z';
  const video = db
    .prepare('INSERT INTO videos (filename, filepath, file_hash, status, created_at, missing, file_size) VALUES (?, ?, ?, ?, ?, 0, ?)')
    .run(filename, `E:/Shorts/${filename}`, `hash-${filename}`, 'pending', created, 1024);
  const queue = db
    .prepare(
      `INSERT INTO queue (
         video_id, title, description, tags, category_id, privacy, notify_subscribers, made_for_kids, approved,
         platforms, state, schedule_source, scheduled_for, youtube_video_id, attempts, upload_bytes_confirmed,
         remote_tombstone, created_at, updated_at
       ) VALUES (?, ?, '', '[]', '22', ?, 0, 0, 0, '["youtube"]', ?, ?, ?, ?, 0, 0, 0, ?, ?)`
    )
    .run(
      video.lastInsertRowid,
      filename.replace(/\.[^.]+$/, ''),
      options.privacy ?? 'public',
      options.state ?? 'pending',
      options.scheduleSource ?? null,
      options.scheduledFor ?? null,
      options.youtubeVideoId ?? null,
      created,
      created
    );
  return Number(queue.lastInsertRowid);
}

export function rawQueueRow(db: Database.Database, id: number): Record<string, unknown> {
  return db.prepare('SELECT * FROM queue WHERE id = ?').get(id) as Record<string, unknown>;
}
