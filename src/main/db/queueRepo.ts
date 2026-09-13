import type Database from 'better-sqlite3';
import type { QueueItemDTO } from '../../shared/dto';
import type { QueueState, UploadMethod } from '../../shared/queue';
import { formatDescription, formatTags, formatTitle } from '../../shared/formatting';
import { formattingRules } from '../../shared/settings';
import { validateMetadataPatch, type QueueMetadataPatch } from '../../shared/videoMetadata';
import { transition, type QueueEvent, type QueueStateFields } from '../domain/queueState';
import { appendActivity } from './activityRepo';
import { readSettings } from './settingsRepo';
import { toDbValue, toQueueItemDTO, toStateFields } from './rows';

const SELECT_ITEM = `
  SELECT q.*, v.filename, v.filepath, v.file_size, v.duration_s, v.width, v.height, v.missing,
         v.published_before, v.rotation_paused,
         (SELECT COUNT(*) FROM queue p WHERE p.video_id = q.video_id) AS postings
  FROM queue q JOIN videos v ON v.id = q.video_id
`;

/** Columns a transition may write. Keys outside this list can never reach the SQL. */
const STATE_COLUMNS: readonly string[] = [
  'state',
  'scheduled_for',
  'schedule_source',
  'youtube_video_id',
  'remote_tombstone',
  'remote_publish_at',
  'remote_sync',
  'remote_error',
  'upload_session_uri',
  'upload_bytes_confirmed',
  'attempts',
  'last_error',
  'next_attempt_at',
  'attention_code',
  'attention_from_state'
];

const METADATA_COLUMNS: readonly string[] = [
  'title',
  'description',
  'tags',
  'category_id',
  'privacy',
  'notify_subscribers',
  'made_for_kids',
  'platforms'
];

/** Only ever written alongside a metadata write, never on its own. */
const PROVENANCE_COLUMNS: readonly string[] = ['ai_drafted_at', 'metadata_edited_at'];

/**
 * House style, applied here rather than at each call site. Every write to a title or description
 * goes through this file, so this is the one place that cannot be forgotten — and formatting that
 * applies to typed details but not drafted ones (or the reverse) would be worse than none.
 */
function formatted(db: Database.Database, patch: QueueMetadataPatch): QueueMetadataPatch {
  const rules = formattingRules(readSettings(db).settings);
  const result = { ...patch };
  if (typeof result.title === 'string') result.title = formatTitle(result.title, rules);
  if (typeof result.description === 'string') result.description = formatDescription(result.description, rules);
  if (Array.isArray(result.tags)) result.tags = formatTags(result.tags, rules);
  return result;
}

const CONFLICT = 'This video changed while you were working on it. Try again.';
const GONE = 'That video is no longer in the queue';

export interface QueueContext {
  now: Date;
  uploadMethod: UploadMethod;
  /** The updated_at the caller last saw. Supplied by the UI so a stale edit is refused, not silently applied. */
  expectedUpdatedAt?: string;
}

export type QueueEventResult = { ok: true; item: QueueItemDTO } | { ok: false; reason: string };

export function getQueueItem(db: Database.Database, id: number): QueueItemDTO | undefined {
  const row = db.prepare(`${SELECT_ITEM} WHERE q.id = ?`).get(id) as Record<string, unknown> | undefined;
  return row === undefined ? undefined : toQueueItemDTO(row);
}

export function listQueueItems(db: Database.Database): QueueItemDTO[] {
  const rows = db
    .prepare(`${SELECT_ITEM} ORDER BY COALESCE(q.scheduled_for, q.created_at), q.id`)
    .all() as Array<Record<string, unknown>>;
  return rows.map(toQueueItemDTO);
}

export function countQueueByState(db: Database.Database): Partial<Record<QueueState, number>> {
  const rows = db.prepare('SELECT state, COUNT(*) AS n FROM queue GROUP BY state').all() as Array<{ state: string; n: number }>;
  return Object.fromEntries(rows.map((row) => [row.state, row.n])) as Partial<Record<QueueState, number>>;
}

function writePatch(
  db: Database.Database,
  id: number,
  patch: Record<string, unknown>,
  allowedColumns: readonly string[],
  now: Date,
  expectedUpdatedAt: string
): boolean {
  const entries = Object.entries(patch).filter(([column]) => allowedColumns.includes(column));
  const assignments = entries.map(([column]) => `${column} = @${column}`);
  const params: Record<string, unknown> = { id, updated_at: now.toISOString(), expected: expectedUpdatedAt };
  for (const [column, value] of entries) params[column] = toDbValue(value);
  const sql = `UPDATE queue SET ${[...assignments, 'updated_at = @updated_at'].join(', ')} WHERE id = @id AND updated_at = @expected`;
  return db.prepare(sql).run(params).changes === 1;
}

const isSilent = (event: QueueEvent): boolean => event.type === 'upload_progress' || event.type === 'method_changed';

function describeEvent(event: QueueEvent, before: QueueStateFields, patch: Partial<QueueStateFields>): string | null {
  switch (event.type) {
    case 'approve':
      return 'Approved for upload';
    case 'unapprove':
      return 'Approval removed';
    case 'reject':
      return 'Rejected';
    case 'restore':
      return 'Restored to the queue';
    case 'schedule':
      return `Scheduled to publish at ${event.at}`;
    case 'hold':
      return 'Taken off the schedule';
    case 'auto_slot':
      return `Automatically scheduled to publish at ${event.at}`;
    case 'edit_metadata':
      return 'Details edited';
    case 'begin_manual_upload':
      return 'Waiting to be uploaded in YouTube Studio';
    case 'link_video':
      return `Linked to YouTube video ${event.videoId}`;
    case 'begin_upload':
      return before.attempts > 0 ? `Upload restarted (attempt ${before.attempts + 1})` : 'Upload started';
    case 'upload_completed':
      return `Uploaded to YouTube as ${event.videoId}`;
    case 'upload_failed':
      return `Upload failed: ${event.error}`;
    case 'upload_session_lost':
      return 'Upload session expired, so the upload will start over';
    case 'upload_possible_duplicate':
      return 'Upload may have finished: needs checking before any retry';
    case 'upload_cancelled':
      return 'Upload cancelled';
    case 'remote_sync_failed':
      return `Could not update YouTube: ${event.error}`;
    case 'missed_slot':
      return patch.state === 'needs_attention' ? 'Missed its scheduled time' : 'Missed its automatic slot, so a new one will be picked';
    case 'flag':
      return `Flagged (${event.code}): ${event.error}`;
    case 'resolve_attention':
      return 'Issue marked resolved';
    case 'confirm_not_duplicate':
      return 'Confirmed this video never reached YouTube';
    case 'disconnect':
      return 'YouTube data removed from this video';
    case 'remote_observed':
      return patch.state !== undefined && patch.state !== before.state ? `YouTube reports it is now ${patch.state}` : null;
    default:
      return null;
  }
}

/** The single path for lifecycle changes: load, decide, write under an optimistic guard, log. */
export function applyQueueEvent(db: Database.Database, id: number, event: QueueEvent, ctx: QueueContext): QueueEventResult {
  const run = db.transaction((): QueueEventResult => {
    const row = db.prepare(`${SELECT_ITEM} WHERE q.id = ?`).get(id) as Record<string, unknown> | undefined;
    if (row === undefined) return { ok: false, reason: GONE };

    const before = toStateFields(row);
    const result = transition(before, event, { now: ctx.now, uploadMethod: ctx.uploadMethod });
    if (!result.ok) return { ok: false, reason: result.reason };

    const current = typeof row.updated_at === 'string' ? row.updated_at : '';
    if (ctx.expectedUpdatedAt !== undefined && ctx.expectedUpdatedAt !== current) return { ok: false, reason: CONFLICT };
    if (!writePatch(db, id, result.patch, STATE_COLUMNS, ctx.now, current)) return { ok: false, reason: CONFLICT };

    const detail = isSilent(event) ? null : describeEvent(event, before, result.patch);
    if (detail !== null) appendActivity(db, { queueId: id, action: event.type, detail, now: ctx.now });

    return { ok: true, item: getQueueItem(db, id) as QueueItemDTO };
  });
  return run();
}

/** Stores the upload session as soon as YouTube issues it, before any bytes are sent, so a
 *  crash can resume the same upload instead of starting a second one. */
export function recordUploadSession(db: Database.Database, id: number, sessionUri: string, now: Date): void {
  const row = db.prepare('SELECT updated_at FROM queue WHERE id = ?').get(id) as { updated_at?: string } | undefined;
  if (row === undefined) return;
  writePatch(db, id, { upload_session_uri: sessionUri }, STATE_COLUMNS, now, row.updated_at ?? '');
}

export interface DraftedMetadata {
  title: string;
  description: string;
  tags: string[];
}

/**
 * The background worker's write. Deliberately not updateQueueMetadata: that one stamps
 * metadata_edited_at, which is the record of a person having written something, and the whole
 * arrangement falls apart if the machine can set it.
 */
export function applyDraft(db: Database.Database, id: number, draft: DraftedMetadata, ctx: QueueContext): QueueEventResult {
  const patch = formatted(db, { title: draft.title, description: draft.description, tags: draft.tags });
  const problem = validateMetadataPatch(patch);
  if (problem !== null) return { ok: false, reason: problem };

  const run = db.transaction((): QueueEventResult => {
    const row = db.prepare(`${SELECT_ITEM} WHERE q.id = ?`).get(id) as Record<string, unknown> | undefined;
    if (row === undefined) return { ok: false, reason: GONE };

    // Checked again inside the transaction: the request took seconds, and someone may have typed
    // into this video while it was in flight.
    if (typeof row.metadata_edited_at === 'string' && row.metadata_edited_at !== '') {
      return { ok: false, reason: 'You edited this video while the model was working on it, so it was left alone' };
    }

    const result = transition(toStateFields(row), { type: 'edit_metadata' }, { now: ctx.now, uploadMethod: ctx.uploadMethod });
    if (!result.ok) return { ok: false, reason: result.reason };

    const current = typeof row.updated_at === 'string' ? row.updated_at : '';
    const combined = { ...result.patch, ...patch, ai_drafted_at: ctx.now.toISOString() } as Record<string, unknown>;
    if (!writePatch(db, id, combined, [...STATE_COLUMNS, ...METADATA_COLUMNS, ...PROVENANCE_COLUMNS], ctx.now, current)) {
      return { ok: false, reason: CONFLICT };
    }
    appendActivity(db, { queueId: id, action: 'ai_drafted', detail: `Title, description and tags written by the local model`, now: ctx.now });
    return { ok: true, item: getQueueItem(db, id) as QueueItemDTO };
  });
  return run();
}

export function updateQueueMetadata(
  db: Database.Database,
  id: number,
  patch: QueueMetadataPatch,
  ctx: QueueContext
): QueueEventResult {
  const shaped = formatted(db, patch);
  const problem = validateMetadataPatch(shaped);
  if (problem !== null) return { ok: false, reason: problem };

  const run = db.transaction((): QueueEventResult => {
    const row = db.prepare(`${SELECT_ITEM} WHERE q.id = ?`).get(id) as Record<string, unknown> | undefined;
    if (row === undefined) return { ok: false, reason: GONE };

    const before = toStateFields(row);
    const result = transition(before, { type: 'edit_metadata' }, { now: ctx.now, uploadMethod: ctx.uploadMethod });
    if (!result.ok) return { ok: false, reason: result.reason };

    const current = typeof row.updated_at === 'string' ? row.updated_at : '';
    if (ctx.expectedUpdatedAt !== undefined && ctx.expectedUpdatedAt !== current) return { ok: false, reason: CONFLICT };
    // Stamped here and nowhere else: this is the one path a person's own edit comes through, and
    // it is what stops the drafting worker from overwriting it later.
    const combined = { ...result.patch, ...shaped, metadata_edited_at: ctx.now.toISOString() } as Record<string, unknown>;
    if (!writePatch(db, id, combined, [...STATE_COLUMNS, ...METADATA_COLUMNS, ...PROVENANCE_COLUMNS], ctx.now, current)) {
      return { ok: false, reason: CONFLICT };
    }
    appendActivity(db, { queueId: id, action: 'edit_metadata', detail: 'Details edited', now: ctx.now });
    return { ok: true, item: getQueueItem(db, id) as QueueItemDTO };
  });
  return run();
}
