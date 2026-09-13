// Poster frames for the list views. Chromium does the decoding in the renderer, where a video
// element already exists; this side only stores what it produces and hands it back.
import type Database from 'better-sqlite3';
import * as fs from 'fs/promises';
import * as path from 'path';

/** PNG magic. Anything else is not a thumbnail and does not get written. */
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A poster frame at list size is tens of kilobytes; anything far larger is not one. */
export const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;

export const isPng = (bytes: Buffer): boolean =>
  bytes.length > PNG_HEADER.length && bytes.subarray(0, PNG_HEADER.length).equals(PNG_HEADER);

export const thumbnailPath = (dir: string, videoId: number): string => path.join(dir, `${videoId}.png`);

export interface ThumbnailDeps {
  db: Database.Database;
  dir: string;
}

const videoIdFor = (db: Database.Database, queueId: number): number | null => {
  const row = db.prepare('SELECT video_id FROM queue WHERE id = ?').get(queueId) as { video_id?: number } | undefined;
  return row?.video_id ?? null;
};

export type SaveResult = { ok: true; videoId: number } | { ok: false; reason: string };

/** Thumbnails are keyed by video, not by posting: every posting of a file looks the same. */
export async function saveThumbnail(deps: ThumbnailDeps, queueId: number, bytes: Buffer): Promise<SaveResult> {
  if (!isPng(bytes)) return { ok: false, reason: 'That is not a PNG' };
  if (bytes.length > MAX_THUMBNAIL_BYTES) return { ok: false, reason: 'That image is too large to be a thumbnail' };

  const videoId = videoIdFor(deps.db, queueId);
  if (videoId === null) return { ok: false, reason: 'That video is no longer in the queue' };

  await fs.mkdir(deps.dir, { recursive: true });
  await fs.writeFile(thumbnailPath(deps.dir, videoId), bytes);
  return { ok: true, videoId };
}

export async function readThumbnail(deps: ThumbnailDeps, queueId: number): Promise<Buffer | null> {
  const videoId = videoIdFor(deps.db, queueId);
  if (videoId === null) return null;
  try {
    return await fs.readFile(thumbnailPath(deps.dir, videoId));
  } catch {
    return null;
  }
}

/**
 * Queue ids whose video has no poster frame yet, one per video so the same file is not decoded
 * once for every posting of it.
 */
export async function missingThumbnails(deps: ThumbnailDeps, limit = 200): Promise<number[]> {
  let have: Set<number>;
  try {
    const files = await fs.readdir(deps.dir);
    have = new Set(files.filter((name) => name.endsWith('.png')).map((name) => Number(name.slice(0, -4))));
  } catch {
    have = new Set();
  }

  const rows = deps.db
    .prepare(
      `SELECT MIN(q.id) AS queueId, q.video_id AS videoId
       FROM queue q JOIN videos v ON v.id = q.video_id
       WHERE v.missing = 0
       GROUP BY q.video_id
       ORDER BY queueId`
    )
    .all() as Array<{ queueId: number; videoId: number }>;

  return rows
    .filter((row) => !have.has(row.videoId))
    .slice(0, limit)
    .map((row) => row.queueId);
}

/** Part of disconnecting and of forgetting a video: the frames are the user's content. */
export async function clearThumbnails(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
}
