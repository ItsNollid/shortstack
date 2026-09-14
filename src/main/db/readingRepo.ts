// What the local model made of each video's stills, kept so a video is looked at once rather than on
// every visit. One reading per video: every posting of the same file shows the same frames.
import type Database from 'better-sqlite3';
import { SCENES, type StillReading } from '../../shared/videoReading';

export interface StoredReading {
  model: string;
  readAt: string;
  stills: StillReading[];
}

export function saveReading(db: Database.Database, videoId: number, reading: StoredReading): void {
  db.prepare(
    `INSERT INTO video_readings (video_id, model, read_at, stills) VALUES (?, ?, ?, ?)
     ON CONFLICT(video_id) DO UPDATE SET model = excluded.model, read_at = excluded.read_at, stills = excluded.stills`
  ).run(videoId, reading.model, reading.readAt, JSON.stringify(reading.stills));
}

const isStill = (value: unknown): value is StillReading => {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.part === 'string' &&
    (record.time === null || typeof record.time === 'number') &&
    typeof record.scene === 'string' &&
    (SCENES as readonly string[]).includes(record.scene) &&
    typeof record.appeal === 'number' &&
    typeof record.what === 'string'
  );
};

export function readReading(db: Database.Database, videoId: number): StoredReading | null {
  const row = db.prepare('SELECT model, read_at, stills FROM video_readings WHERE video_id = ?').get(videoId) as
    | { model: string; read_at: string; stills: string }
    | undefined;
  if (row === undefined) return null;
  try {
    const stills: unknown = JSON.parse(row.stills);
    if (!Array.isArray(stills)) return null;
    // Only the fields a reading has, so nothing else that was stored alongside reaches the screen.
    const kept = stills.filter(isStill).map(({ part, time, scene, appeal, what }) => ({ part, time, scene, appeal, what }));
    return { model: row.model, readAt: row.read_at, stills: kept };
  } catch {
    return null;
  }
}

export function clearReading(db: Database.Database, videoId: number): void {
  db.prepare('DELETE FROM video_readings WHERE video_id = ?').run(videoId);
}
