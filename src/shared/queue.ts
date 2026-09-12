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

export type Privacy = 'public' | 'unlisted' | 'private';
export type ScheduleSource = 'auto' | 'manual' | 'hold';
export type RemoteSync = 'synced' | 'pending' | 'error';
export type UploadMethod = 'assisted' | 'api';

/** Minimum gap between "now" and any publish slot, for both manual and automatic scheduling. */
export const MIN_SCHEDULE_LEAD_MS = 30 * 60 * 1000;
