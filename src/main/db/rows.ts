// Converts raw SQLite rows into typed values, and typed values back into ones SQLite accepts.
import {
  ATTENTION_CODES,
  PLATFORMS,
  PRIVACIES,
  QUEUE_STATES,
  REMOTE_SYNC_STATES,
  SCHEDULE_SOURCES,
  type AttentionCode,
  type Platform,
  type Privacy,
  type QueueState,
  type RemoteSync,
  type ScheduleSource
} from '../../shared/queue';
import type { ActivityEntryDTO, QueueItemDTO, UploadDTO, VideoDTO } from '../../shared/dto';
import type { QueueStateFields } from '../domain/queueState';

export type SqlValue = string | number | null | Buffer;

/** better-sqlite3 throws on booleans and stores undefined as NULL without complaint. */
export function toDbValue(value: unknown): SqlValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) return JSON.stringify(value);
  throw new TypeError(`Unsupported database value of type ${typeof value}`);
}

const asBool = (value: unknown): boolean => value === 1 || value === true || value === '1';
const asInt = (value: unknown, fallback = 0): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const asText = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const asNullableText = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
const asNullableNumber = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

function asStringArray(raw: unknown): string[] {
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

function asOneOf<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

function asOneOfOrNull<T extends string>(raw: unknown, allowed: readonly T[]): T | null {
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw) ? (raw as T) : null;
}

export function toStateFields(row: Record<string, unknown>): QueueStateFields {
  return {
    state: asOneOf<QueueState>(row.state, QUEUE_STATES, 'pending'),
    privacy: asOneOf<Privacy>(row.privacy, PRIVACIES, 'private'),
    scheduled_for: asNullableText(row.scheduled_for),
    schedule_source: asOneOfOrNull<ScheduleSource>(row.schedule_source, SCHEDULE_SOURCES),
    youtube_video_id: asNullableText(row.youtube_video_id),
    remote_tombstone: asBool(row.remote_tombstone),
    remote_publish_at: asNullableText(row.remote_publish_at),
    remote_sync: asOneOfOrNull<RemoteSync>(row.remote_sync, REMOTE_SYNC_STATES),
    remote_error: asNullableText(row.remote_error),
    upload_session_uri: asNullableText(row.upload_session_uri),
    upload_bytes_confirmed: asInt(row.upload_bytes_confirmed),
    attempts: asInt(row.attempts),
    last_error: asNullableText(row.last_error),
    next_attempt_at: asNullableText(row.next_attempt_at),
    attention_code: asOneOfOrNull<AttentionCode>(row.attention_code, ATTENTION_CODES),
    attention_from_state: asOneOfOrNull<QueueState>(row.attention_from_state, QUEUE_STATES)
  };
}

export function toQueueItemDTO(row: Record<string, unknown>): QueueItemDTO {
  const platforms = asStringArray(row.platforms).filter((entry): entry is Platform =>
    (PLATFORMS as readonly string[]).includes(entry)
  );
  return {
    ...toStateFields(row),
    id: asInt(row.id),
    video_id: asInt(row.video_id),
    channel_id: asNullableText(row.channel_id),
    title: asText(row.title),
    description: asText(row.description),
    tags: asStringArray(row.tags),
    category_id: asText(row.category_id, '22'),
    notify_subscribers: asBool(row.notify_subscribers),
    made_for_kids: asBool(row.made_for_kids),
    platforms: platforms.length > 0 ? platforms : ['youtube'],
    created_at: asText(row.created_at),
    updated_at: asText(row.updated_at),
    filename: asText(row.filename),
    filepath: asText(row.filepath),
    posting_kind: row.posting_kind === 'rotation' ? 'rotation' : 'new',
    published_before: asBool(row.published_before),
    rotation_paused: asBool(row.rotation_paused),
    postings: asInt(row.postings),
    game: asNullableText(row.game),
    ai_drafted_at: asNullableText(row.ai_drafted_at),
    metadata_edited_at: asNullableText(row.metadata_edited_at),
    file_size: asNullableNumber(row.file_size),
    duration_s: asNullableNumber(row.duration_s),
    width: asNullableNumber(row.width),
    height: asNullableNumber(row.height),
    missing: asBool(row.missing)
  };
}

export function toVideoDTO(row: Record<string, unknown>): VideoDTO {
  return {
    id: asInt(row.id),
    filename: asText(row.filename),
    filepath: asText(row.filepath),
    file_hash: asNullableText(row.file_hash),
    hash_algo: asNullableText(row.hash_algo),
    file_size: asNullableNumber(row.file_size),
    mtime_ms: asNullableNumber(row.mtime_ms),
    duration_s: asNullableNumber(row.duration_s),
    width: asNullableNumber(row.width),
    height: asNullableNumber(row.height),
    missing: asBool(row.missing),
    created_at: asText(row.created_at)
  };
}

export function toUploadDTO(row: Record<string, unknown>): UploadDTO {
  return {
    id: asInt(row.id),
    queue_id: asInt(row.queue_id),
    youtube_video_id: asNullableText(row.youtube_video_id),
    uploaded_at: asNullableText(row.uploaded_at),
    status: asText(row.status, 'unknown'),
    method: asNullableText(row.method),
    error_message: asNullableText(row.error_message),
    error_code: asNullableText(row.error_code),
    retry_count: asInt(row.retry_count),
    title: asNullableText(row.title),
    filename: asNullableText(row.filename)
  };
}

export function toActivityDTO(row: Record<string, unknown>): ActivityEntryDTO {
  return {
    id: asInt(row.id),
    queue_id: asNullableNumber(row.queue_id),
    action: asText(row.action),
    detail: asNullableText(row.detail),
    created_at: asText(row.created_at)
  };
}
