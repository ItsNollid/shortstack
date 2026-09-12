import type Database from 'better-sqlite3';
import type { UploadDTO } from '../../shared/dto';
import { toDbValue, toUploadDTO } from './rows';

export interface UploadRecord {
  queueId: number;
  youtubeVideoId: string | null;
  status: 'success' | 'failed';
  method: 'api' | 'assisted';
  errorMessage?: string | null;
  errorCode?: string | null;
  bytesTotal?: number | null;
  now: Date;
}

/** Every attempt is recorded, including failures: the old build only ever wrote successes. */
export function recordUpload(db: Database.Database, entry: UploadRecord): number {
  const previous = db.prepare('SELECT COUNT(*) AS n FROM uploads WHERE queue_id = ?').get(entry.queueId) as { n: number };
  const result = db
    .prepare(
      `INSERT INTO uploads (queue_id, youtube_video_id, uploaded_at, status, method, error_message, error_code, retry_count)
       VALUES (@queue_id, @youtube_video_id, @uploaded_at, @status, @method, @error_message, @error_code, @retry_count)`
    )
    .run({
      queue_id: entry.queueId,
      youtube_video_id: entry.youtubeVideoId,
      uploaded_at: entry.status === 'success' ? entry.now.toISOString() : null,
      status: entry.status,
      method: entry.method,
      error_message: toDbValue(entry.errorMessage ?? null),
      error_code: toDbValue(entry.errorCode ?? null),
      retry_count: previous.n
    });
  return Number(result.lastInsertRowid);
}

export function listUploads(db: Database.Database): UploadDTO[] {
  const rows = db
    .prepare(
      `SELECT u.*, q.title, v.filename
       FROM uploads u
       JOIN queue q ON q.id = u.queue_id
       JOIN videos v ON v.id = q.video_id
       ORDER BY u.id DESC`
    )
    .all() as Array<Record<string, unknown>>;
  return rows.map(toUploadDTO);
}
