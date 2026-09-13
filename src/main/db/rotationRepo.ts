// Reading and writing the rotation facts that live on a video rather than on a single posting.
import type Database from 'better-sqlite3';
import {
  isInFlight,
  postingKind,
  shouldNotifySubscribers,
  shouldRotate,
  type PostingKind,
  type RotationVerdict
} from '../../shared/rotation';
import type { QueueState } from '../../shared/queue';
import { appendActivity } from './activityRepo';
import { toDbValue } from './rows';

export interface VideoRotation {
  videoId: number;
  publishedBefore: boolean;
  paused: boolean;
  postings: number;
  hasPostingInFlight: boolean;
  /** When the most recent posting was due out, or null if none has been. */
  lastPostingAt: string | null;
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
  const last = db
    .prepare(
      `SELECT COALESCE(scheduled_for, created_at) AS at FROM queue
       WHERE video_id = ? ORDER BY COALESCE(scheduled_for, created_at) DESC LIMIT 1`
    )
    .get(row.videoId) as { at?: string } | undefined;
  return {
    videoId: row.videoId,
    publishedBefore: row.publishedBefore === 1,
    paused: row.paused === 1,
    postings: row.postings,
    hasPostingInFlight: states.some((entry) => isInFlight(entry.state)),
    lastPostingAt: last?.at ?? null
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

export function rotationVerdict(
  rotation: VideoRotation,
  maxPostings: number,
  minGapDays = 0,
  now: Date = new Date()
): RotationVerdict {
  return shouldRotate({
    postings: rotation.postings,
    publishedBefore: rotation.publishedBefore,
    maxPostings,
    paused: rotation.paused,
    minGapDays,
    hasPostingInFlight: rotation.hasPostingInFlight,
    lastPostingAt: rotation.lastPostingAt,
    now
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

export type PostingResult = { ok: true; queueId: number; kind: PostingKind } | { ok: false; reason: string };

const REASONS: Record<Exclude<RotationVerdict, { rotate: true }>['reason'], string> = {
  paused: 'This video has been taken out of rotation',
  limit_reached: 'This video has already been posted as many times as the rotation limit allows',
  already_queued: 'A posting of this video is already on its way out',
  rotation_off: 'Rotation is switched off in Settings',
  too_soon: 'It has not been long enough since this video last went out'
};

export interface PostingDefaults {
  notifyOnNew: boolean;
  maxPostings: number;
  minGapDays?: number;
  /** Ignores the limit and the pause: what the user asked for directly, rather than automation. */
  force?: boolean;
}

/**
 * Queues another posting of a video, copying the details from its most recent one. It starts as
 * pending like anything else: a re-run is still something the user approves.
 */
export function createPosting(
  db: Database.Database,
  videoId: number,
  defaults: PostingDefaults,
  now: Date
): PostingResult {
  const run = db.transaction((): PostingResult => {
    const rotation = readVideoRotation(db, videoId);
    if (rotation === null) return { ok: false, reason: 'That video is no longer in the library' };

    if (defaults.force !== true) {
      const verdict = rotationVerdict(rotation, defaults.maxPostings, defaults.minGapDays ?? 0, now);
      if (!verdict.rotate) return { ok: false, reason: REASONS[verdict.reason] };
    } else if (rotation.hasPostingInFlight) {
      // Even a direct request will not queue two runs of the same file at once.
      return { ok: false, reason: REASONS.already_queued };
    }

    const previous = db
      .prepare(
        `SELECT title, description, tags, category_id, privacy, made_for_kids, platforms, channel_id,
                ai_drafted_at, metadata_edited_at
         FROM queue WHERE video_id = ? ORDER BY id DESC LIMIT 1`
      )
      .get(videoId) as Record<string, unknown> | undefined;
    if (previous === undefined) return { ok: false, reason: 'That video has never been posted, so there is nothing to repeat' };

    const kind = nextPostingKind(rotation);
    const nowIso = now.toISOString();
    const inserted = db
      .prepare(
        `INSERT INTO queue (
           video_id, channel_id, title, description, tags, category_id, privacy, notify_subscribers,
           made_for_kids, platforms, state, posting_kind, approved, attempts, upload_bytes_confirmed,
           remote_tombstone, ai_drafted_at, metadata_edited_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 0, 0, 0, 0, ?, ?, ?, ?)`
      )
      .run(
        videoId,
        previous.channel_id ?? null,
        previous.title ?? '',
        previous.description ?? '',
        previous.tags ?? '[]',
        previous.category_id ?? '22',
        previous.privacy ?? 'public',
        // A re-run never announces itself, whatever the default says.
        toDbValue(shouldNotifySubscribers(kind, defaults.notifyOnNew)),
        previous.made_for_kids ?? 0,
        previous.platforms ?? '["youtube"]',
        kind,
        // Carried over with the details they describe. Without this, every re-run of a video whose
        // details someone wrote by hand would look untouched and be drafted over.
        previous.ai_drafted_at ?? null,
        previous.metadata_edited_at ?? null,
        nowIso,
        nowIso
      );

    const queueId = Number(inserted.lastInsertRowid);
    appendActivity(db, {
      queueId,
      // Who asked matters: History separates what ShortStack did on its own from what the user did.
      action: defaults.force === true ? 'posting_created' : 'posting_rotated',
      detail:
        kind === 'rotation'
          ? `Queued again as a re-run (posting ${rotation.postings + 1}), without notifying subscribers`
          : 'Queued for its first posting',
      now
    });
    return { ok: true, queueId, kind };
  });
  return run();
}
