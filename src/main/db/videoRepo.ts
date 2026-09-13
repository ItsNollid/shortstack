import type Database from 'better-sqlite3';
import type { Platform, Privacy } from '../../shared/queue';
import type { KnownVideo } from '../files/fileIdentity';
import { toDbValue } from './rows';

export interface NewVideo {
  filename: string;
  filepath: string;
  fileHash: string;
  hashAlgo: string;
  fileSize: number;
  mtimeMs: number;
}

export interface QueueDefaults {
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  privacy: Privacy;
  notifySubscribers: boolean;
  madeForKids: boolean;
  platforms: Platform[];
}

const KNOWN_VIDEO_SELECT = `
  SELECT v.id, v.filepath, v.file_hash, v.hash_algo, v.file_size, v.mtime_ms,
    EXISTS (
      SELECT 1 FROM queue q
      WHERE q.video_id = v.id AND (q.youtube_video_id IS NOT NULL OR q.remote_tombstone = 1)
    ) AS reached
  FROM videos v
`;

function toKnownVideo(row: Record<string, unknown>): KnownVideo {
  return {
    id: Number(row.id),
    filepath: String(row.filepath ?? ''),
    file_hash: typeof row.file_hash === 'string' ? row.file_hash : null,
    hash_algo: typeof row.hash_algo === 'string' ? row.hash_algo : null,
    file_size: typeof row.file_size === 'number' ? row.file_size : null,
    mtime_ms: typeof row.mtime_ms === 'number' ? row.mtime_ms : null,
    reachedYouTube: row.reached === 1
  };
}

export function findVideoByPath(db: Database.Database, filepath: string): KnownVideo | undefined {
  const row = db.prepare(`${KNOWN_VIDEO_SELECT} WHERE v.filepath = ?`).get(filepath) as Record<string, unknown> | undefined;
  return row === undefined ? undefined : toKnownVideo(row);
}

export function findVideoByHash(db: Database.Database, hash: string): KnownVideo | undefined {
  const row = db.prepare(`${KNOWN_VIDEO_SELECT} WHERE v.file_hash = ?`).get(hash) as Record<string, unknown> | undefined;
  return row === undefined ? undefined : toKnownVideo(row);
}

export function listKnownVideos(db: Database.Database): KnownVideo[] {
  return (db.prepare(KNOWN_VIDEO_SELECT).all() as Array<Record<string, unknown>>).map(toKnownVideo);
}

/** Inserts the video and its queue row together: a crash can't leave a video with no queue entry. */
export function insertVideoWithQueueItem(
  db: Database.Database,
  video: NewVideo,
  defaults: QueueDefaults,
  now: Date
): { videoId: number; queueId: number } {
  const insert = db.transaction(() => {
    const timestamp = now.toISOString();
    const videoResult = db
      .prepare(
        `INSERT INTO videos (filename, filepath, file_hash, hash_algo, file_size, mtime_ms, status, missing, created_at)
         VALUES (@filename, @filepath, @file_hash, @hash_algo, @file_size, @mtime_ms, 'pending', 0, @created_at)`
      )
      .run({
        filename: video.filename,
        filepath: video.filepath,
        file_hash: video.fileHash,
        hash_algo: video.hashAlgo,
        file_size: video.fileSize,
        mtime_ms: video.mtimeMs,
        created_at: timestamp
      });

    const queueResult = db
      .prepare(
        `INSERT INTO queue (
           video_id, title, description, tags, category_id, privacy, notify_subscribers, made_for_kids,
           approved, platforms, state, attempts, upload_bytes_confirmed, remote_tombstone, created_at, updated_at
         ) VALUES (
           @video_id, @title, @description, @tags, @category_id, @privacy, @notify_subscribers, @made_for_kids,
           0, @platforms, 'pending', 0, 0, 0, @created_at, @created_at
         )`
      )
      .run({
        video_id: videoResult.lastInsertRowid,
        title: defaults.title,
        description: defaults.description,
        tags: toDbValue(defaults.tags),
        category_id: defaults.categoryId,
        privacy: defaults.privacy,
        notify_subscribers: toDbValue(defaults.notifySubscribers),
        made_for_kids: toDbValue(defaults.madeForKids),
        platforms: toDbValue(defaults.platforms),
        created_at: timestamp
      });

    return { videoId: Number(videoResult.lastInsertRowid), queueId: Number(queueResult.lastInsertRowid) };
  });
  return insert();
}

export function updateVideoStats(
  db: Database.Database,
  videoId: number,
  stats: { fileHash: string; hashAlgo: string; fileSize: number; mtimeMs: number }
): void {
  db.prepare(
    'UPDATE videos SET file_hash = @file_hash, hash_algo = @hash_algo, file_size = @file_size, mtime_ms = @mtime_ms, missing = 0 WHERE id = @id'
  ).run({
    id: videoId,
    file_hash: stats.fileHash,
    hash_algo: stats.hashAlgo,
    file_size: stats.fileSize,
    mtime_ms: stats.mtimeMs
  });
}

export function setVideoMissing(db: Database.Database, videoId: number, missing: boolean): void {
  db.prepare('UPDATE videos SET missing = ? WHERE id = ?').run(toDbValue(missing), videoId);
}

export function setVideoProbe(
  db: Database.Database,
  videoId: number,
  probe: { durationS: number | null; width: number | null; height: number | null }
): void {
  db.prepare('UPDATE videos SET duration_s = @duration_s, width = @width, height = @height WHERE id = @id').run({
    id: videoId,
    duration_s: probe.durationS,
    width: probe.width,
    height: probe.height
  });
}

export function queueIdForVideo(db: Database.Database, videoId: number): number | undefined {
  const row = db.prepare('SELECT id FROM queue WHERE video_id = ? ORDER BY id DESC LIMIT 1').get(videoId) as { id: number } | undefined;
  return row?.id;
}

/**
 * Which game a video is of. Stored on the video because it does not change between postings, and
 * trimmed to nothing rather than kept as an empty string so "unknown" has one spelling.
 */
export function setVideoGame(db: Database.Database, videoId: number, game: string | null): void {
  const cleaned = game === null ? null : game.replace(/[<>]/g, '').trim().slice(0, 80);
  const next = cleaned === '' ? null : cleaned;
  const previous = db.prepare('SELECT game FROM videos WHERE id = ?').get(videoId) as { game?: string | null } | undefined;

  db.transaction(() => {
    db.prepare('UPDATE videos SET game = ? WHERE id = ?').run(next, videoId);

    // A draft written before the game was known was written blind: the model guessed from the frame,
    // and the hashtags were built without the game's own. If nobody has edited it since, it is marked
    // for the worker to write again with the right game. Anything a person typed is left alone, and so
    // is anything already on its way to YouTube.
    if ((previous?.game ?? null) !== next) {
      db.prepare(
        "UPDATE queue SET ai_drafted_at = NULL WHERE video_id = ? AND ai_drafted_at IS NOT NULL AND metadata_edited_at IS NULL AND state IN ('pending', 'approved')"
      ).run(videoId);
    }
  })();
}

/** Every game already in use, so the field can suggest what this channel actually plays. */
export function listKnownGames(db: Database.Database): string[] {
  const rows = db
    .prepare("SELECT DISTINCT game FROM videos WHERE game IS NOT NULL AND trim(game) <> '' ORDER BY game")
    .all() as Array<{ game: string }>;
  return rows.map((row) => row.game);
}
