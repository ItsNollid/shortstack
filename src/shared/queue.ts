// Queue lifecycle vocabulary shared by the main process and the renderer.

export const QUEUE_STATES = [
  'pending',
  'approved',
  'awaiting_manual_upload',
  'uploading',
  'uploaded',
  'scheduled',
  'published',
  'failed',
  'needs_attention',
  'rejected'
] as const;
export type QueueState = (typeof QUEUE_STATES)[number];

export const ATTENTION_CODES = [
  'missed_slot',
  'file_missing',
  'file_changed',
  'possible_duplicate',
  'duplicate_uploads',
  'locked_private',
  'validation_error',
  'retries_exhausted',
  'set_schedule_in_studio',
  'channel_mismatch',
  'legacy_unrecorded_upload'
] as const;
export type AttentionCode = (typeof ATTENTION_CODES)[number];

export const PRIVACIES = ['public', 'unlisted', 'private'] as const;
export type Privacy = (typeof PRIVACIES)[number];

export const SCHEDULE_SOURCES = ['auto', 'manual', 'hold'] as const;
export type ScheduleSource = (typeof SCHEDULE_SOURCES)[number];

export const REMOTE_SYNC_STATES = ['synced', 'pending', 'error'] as const;
export type RemoteSync = (typeof REMOTE_SYNC_STATES)[number];

export const UPLOAD_METHODS = ['assisted', 'api'] as const;
export type UploadMethod = (typeof UPLOAD_METHODS)[number];

export const PLATFORMS = ['youtube', 'tiktok', 'instagram'] as const;
export type Platform = (typeof PLATFORMS)[number];

/** Minimum gap between "now" and any publish slot, for both manual and automatic scheduling. */
export const MIN_SCHEDULE_LEAD_MS = 30 * 60 * 1000;
