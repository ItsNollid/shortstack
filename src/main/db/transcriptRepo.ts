// What was said in each video, kept so a clip is listened to once. A transcript belongs to the file as it was when
// it was heard: once the file's size or modified time changes, it is no longer about this file and is not returned.
import type Database from 'better-sqlite3';
import type { Backend, TranscriptSegment } from '../../shared/transcript';

export interface StoredTranscript {
  model: string;
  backend: Backend;
  madeAt: string;
  segments: TranscriptSegment[];
}

interface SourceFacts {
  file_size: number | null;
  mtime_ms: number | null;
}

const sourceOf = (db: Database.Database, videoId: number): SourceFacts | undefined =>
  db.prepare('SELECT file_size, mtime_ms FROM videos WHERE id = ?').get(videoId) as SourceFacts | undefined;

export function saveTranscript(db: Database.Database, videoId: number, transcript: StoredTranscript): void {
  const source = sourceOf(db, videoId);
  db.prepare(
    `INSERT INTO video_transcripts (video_id, model, backend, made_at, source_size, source_mtime_ms, segments)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(video_id) DO UPDATE SET model = excluded.model, backend = excluded.backend, made_at = excluded.made_at,
       source_size = excluded.source_size, source_mtime_ms = excluded.source_mtime_ms, segments = excluded.segments`
  ).run(
    videoId,
    transcript.model,
    transcript.backend,
    transcript.madeAt,
    source?.file_size ?? null,
    source?.mtime_ms ?? null,
    JSON.stringify(transcript.segments)
  );
}

const isSegment = (value: unknown): value is TranscriptSegment => {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.from === 'number' && typeof record.to === 'number' && typeof record.text === 'string';
};

export function readTranscript(db: Database.Database, videoId: number): StoredTranscript | null {
  const row = db
    .prepare('SELECT model, backend, made_at, source_size, source_mtime_ms, segments FROM video_transcripts WHERE video_id = ?')
    .get(videoId) as
    | { model: string; backend: string; made_at: string; source_size: number | null; source_mtime_ms: number | null; segments: string }
    | undefined;
  if (row === undefined) return null;

  const source = sourceOf(db, videoId);
  if (source === undefined || source.file_size !== row.source_size || source.mtime_ms !== row.source_mtime_ms) return null;

  try {
    const parsed: unknown = JSON.parse(row.segments);
    if (!Array.isArray(parsed)) return null;
    const backend: Backend = row.backend === 'gpu' || row.backend === 'cpu' ? row.backend : 'unknown';
    return {
      model: row.model,
      backend,
      madeAt: row.made_at,
      segments: parsed.filter(isSegment).map(({ from, to, text }) => ({ from, to, text }))
    };
  } catch {
    return null;
  }
}

export function clearTranscripts(db: Database.Database): number {
  return db.prepare('DELETE FROM video_transcripts').run().changes;
}
