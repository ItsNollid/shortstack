// Shapes crossing the IPC bridge. Columns stay snake_case to match the database, but the
// types are real: booleans are booleans and JSON columns arrive parsed.
import type { AttentionCode, Platform, Privacy, QueueState, RemoteSync, ScheduleSource } from './queue';
import type { PostingKind } from './rotation';
import type { TitleAngle } from './titleAngles';

export interface QueueItemDTO {
  id: number;
  video_id: number;
  channel_id: string | null;
  title: string;
  description: string;
  tags: string[];
  category_id: string;
  privacy: Privacy;
  notify_subscribers: boolean;
  made_for_kids: boolean;
  platforms: Platform[];
  state: QueueState;
  schedule_source: ScheduleSource | null;
  scheduled_for: string | null;
  youtube_video_id: string | null;
  remote_tombstone: boolean;
  remote_publish_at: string | null;
  remote_sync: RemoteSync | null;
  remote_error: string | null;
  upload_session_uri: string | null;
  upload_bytes_confirmed: number;
  attempts: number;
  last_error: string | null;
  next_attempt_at: string | null;
  attention_code: AttentionCode | null;
  attention_from_state: QueueState | null;
  created_at: string;
  updated_at: string;
  filename: string;
  filepath: string;
  file_size: number | null;
  duration_s: number | null;
  width: number | null;
  height: number | null;
  missing: boolean;
  /** Whether this posting is the announcement or a re-run. Fixed when the posting was created. */
  posting_kind: PostingKind;
  /** Set at intake for a file already published before ShortStack saw it. */
  published_before: boolean;
  /** Taken out of rotation by hand. */
  rotation_paused: boolean;
  /** How many postings of this video exist in total, this one included. */
  postings: number;
  /** Which game this is of, as the user set it or as the file name suggested. Null when unknown. */
  game: string | null;
  /** The long video this Short was cut from, by title. Null when nobody has said. */
  source_title: string | null;
  /** That long video on YouTube, as a watch link, when known. */
  source_url: string | null;
  /** When the local model last wrote these details, if it ever did. */
  ai_drafted_at: string | null;
  /** When a person last changed them. Null means nobody has, so drafting is free to write here. */
  metadata_edited_at: string | null;
  /** Which kind of suggested title this posting uses. Null for a title written by hand. */
  title_angle: TitleAngle | null;
}

export interface VideoDTO {
  id: number;
  filename: string;
  filepath: string;
  file_hash: string | null;
  hash_algo: string | null;
  file_size: number | null;
  mtime_ms: number | null;
  duration_s: number | null;
  width: number | null;
  height: number | null;
  missing: boolean;
  created_at: string;
}

export interface UploadDTO {
  id: number;
  queue_id: number;
  youtube_video_id: string | null;
  uploaded_at: string | null;
  status: string;
  method: string | null;
  error_message: string | null;
  error_code: string | null;
  retry_count: number;
  title: string | null;
  filename: string | null;
}

export interface ActivityEntryDTO {
  id: number;
  queue_id: number | null;
  action: string;
  detail: string | null;
  created_at: string;
}
