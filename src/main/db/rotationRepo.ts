// Reading and writing the rotation facts that live on a video rather than on a single posting.
import type Database from 'better-sqlite3';
import { isInFlight, postingKind, shouldRotate, type PostingKind, type RotationVerdict } from '../../shared/rotation';
import type { QueueState } from '../../shared/queue';
import { appendActivity } from './activityRepo';
import { toDbValue } from './rows';

export interface VideoRotation {
  videoId: number;
  publishedBefore: boolean;
  paused: boolean;
  postings: number;
  hasPostingInFlight: boolean;
}

const ROTATION_QUERY = `
  SELECT v.id AS videoId,
         v.published_before AS publishedBefore,
         v.rotation_paused AS paused,
         (SELECT COUNT(*) FROM queue q WHERE q.video_id = v.id) AS postings
  FROM videos v
`;

interface RotationRow {
  videoId: number;
  publishedBefore: number;
  paused: number;
  postings: number;
}

function withFlight(db: Database.Database, row: RotationRow): VideoRotation {
  const states = db.prepare('SELECT state FROM queue WHERE video_id = ?').all(row.videoId) as Array<{ state: QueueState }>;
  return {
    videoId: row.videoId,
    publishedBefore: row.publishedBefore === 1,
    paused: row.paused === 1,
    postings: row.postings,
    hasPostingInFlight: states.some((entry) => isInFlight(entry.state))
  };
}

export function readVideoRotation(db: Database.Database, videoId: number): VideoRotation | null {
  const row = db.prepare(`${ROTATION_QUERY} WHERE v.id = ?`).get(videoId) as RotationRow | undefined;
  return row === undefined ? null : withFlight(db, row);
}

export function listVideoRotation(db: Database.Database): VideoRotation[] {
  const rows = db.prepare(ROTATION_QUERY).all() as RotationRow[];
  return rows.map((row) => withFlight(db, row));
}

/** The kind the next posting of this video would be. */
export function nextPostingKind(rotation: VideoRotation): PostingKind {
  return postingKind({ postings: rotation.postings, publishedBefore: rotation.publishedBefore });
}

export function rotationVerdict(rotation: VideoRotation, maxPostings: number): RotationVerdict {
  return shouldRotate({
    postings: rotation.postings,
    publishedBefore: rotation.publishedBefore,
    maxPostings,
    paused: rotation.paused,
    hasPostingInFlight: rotation.hasPostingInFlight
  });
}

/** Marks files as already published elsewhere, so their first posting here is a re-run. This is
 *  what stops an imported back catalogue announcing itself to subscribers. */
export function markPublishedBefore(db: Database.Database, videoIds: readonly number[], publishedBefore: boolean, now: Date): number {
  if (videoIds.length === 0) return 0;
  const update = db.prepare('UPDATE videos SET published_before = ? WHERE id = ?');
  const run = db.transaction(() => {
    let changed = 0;
    for (const id of videoIds) changed += update.run(toDbValue(publishedBefore), id).changes;
    return changed;
  });
  const changed = run();

  // Worth recording: it changes whether subscribers get told about the next posting.
  appendActivity(db, {
    queueId: null,
    action: 'mark_published_before',
    detail: publishedBefore
      ? `Marked ${changed} video${changed === 1 ? '' : 's'} as already published, so their next posting is a re-run`
      : `Marked ${changed} video${changed === 1 ? '' : 's'} as never published before`,
    now
  });
  return changed;
}

export function setRotationPaused(db: Database.Database, videoIds: readonly number[], paused: boolean, now: Date): number {
  if (videoIds.length === 0) return 0;
  const update = db.prepare('UPDATE videos SET rotation_paused = ? WHERE id = ?');
  const run = db.transaction(() => {
    let changed = 0;
    for (const id of videoIds) changed += update.run(toDbValue(paused), id).changes;
    return changed;
  });
  const changed = run();
  appendActivity(db, {
    queueId: null,
    action: paused ? 'rotation_paused' : 'rotation_resumed',
    detail: `${paused ? 'Took' : 'Put'} ${changed} video${changed === 1 ? '' : 's'} ${paused ? 'out of' : 'back into'} rotation`,
    now
  });
  return changed;
}
