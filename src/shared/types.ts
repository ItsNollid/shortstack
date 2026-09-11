// Shared types between main and renderer processes

// ============================================================
// Database Models
// ============================================================

export interface Video {
  id: number
  filename: string
  filepath: string
  file_hash: string | null
  status: VideoStatus
  created_at: string
}

export type VideoStatus = 'pending' | 'queued' | 'approved' | 'uploading' | 'uploaded' | 'failed' | 'archived'

export type Platform = 'youtube' | 'tiktok' | 'instagram'

export interface QueueItem {
  id: number
  video_id: number
  channel_id: string | null
  title: string
  description: string
  tags: string // JSON array string
  category_id: string
  privacy: 'public' | 'unlisted' | 'private'
  notify_subscribers: boolean
  made_for_kids: boolean
  scheduled_for: string | null
  approved: boolean
  platforms: string // JSON array string of Platform names
  created_at: string
  // Joined fields from video
  filename?: string
  filepath?: string
  video_status?: VideoStatus
}

export interface Upload {
  id: number
  queue_id: number
  youtube_video_id: string | null
  uploaded_at: string | null
  status: UploadStatus
  error_message: string | null
  retry_count: number
  // Joined fields
  title?: string
  filename?: string
}

export type UploadStatus = 'success' | 'failed' | 'retrying' | 'uploading'

export interface AnalyticsData {
  id: number
  youtube_video_id: string
  date: string
  views: number
  watch_time_minutes: number
  avg_view_duration_seconds: number
  impressions: number
  ctr: number
  likes: number
  comments: number
  shares: number
  subscriber_change: number
  traffic_source: string // JSON
}

export interface ChannelAnalytics {
  id: number
  channel_id: string
  date: string
  total_views: number
  total_watch_time: number
  subscriber_count: number
  top_traffic_sources: string // JSON
  audience_demographics: string // JSON
}

export interface Channel {
  id: string
  name: string
  is_active: boolean
  credentials_path: string
  created_at: string
}

// ============================================================
// App Settings
// ============================================================

export interface AppSettings {
  shorts_folder: string
  archive_folder: string
  default_title_template: string // e.g. "{filename}" or "Short #{number}"
  default_description: string
  default_tags: string[] // Base tags always included
  default_category_id: string
  default_privacy: 'public' | 'unlisted' | 'private'
  notify_subscribers: boolean
  made_for_kids: boolean
  upload_times: string[] // e.g. ["09:00", "13:00", "18:00", "22:00"]
  auto_approve: boolean // If true, skip manual approval
  auto_retry_max: number // Max retry attempts for failed uploads
  analytics_pull_time: string // e.g. "06:00"
  setup_complete: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  shorts_folder: '',
  archive_folder: '',
  default_title_template: '{filename}',
  default_description: '',
  default_tags: ['#shorts'],
  default_category_id: '22', // People & Blogs
  default_privacy: 'public',
  notify_subscribers: false,
  made_for_kids: false,
  upload_times: ['09:00', '13:00', '18:00', '22:00'],
  auto_approve: false,
  auto_retry_max: 3,
  analytics_pull_time: '06:00',
  setup_complete: false
}

// ============================================================
// IPC Channel Names
// ============================================================

export const IPC_CHANNELS = {
  // Videos
  GET_VIDEOS: 'videos:getAll',
  SCAN_FOLDER: 'videos:scan',

  // Queue
  GET_QUEUE: 'queue:getAll',
  APPROVE_QUEUE_ITEM: 'queue:approve',
  REJECT_QUEUE_ITEM: 'queue:reject',
  UPDATE_QUEUE_ITEM: 'queue:update',
  BULK_UPDATE_QUEUE: 'queue:bulkUpdate',

  // Uploads
  GET_UPLOADS: 'uploads:getAll',
  RETRY_UPLOAD: 'uploads:retry',

  // Analytics
  GET_ANALYTICS: 'analytics:get',
  GET_CHANNEL_ANALYTICS: 'analytics:getChannel',

  // AI
  GENERATE_METADATA: 'ai:generateMetadata',

  // Settings
  GET_SETTINGS: 'settings:getAll',
  SET_SETTING: 'settings:set',

  // Schedule
  PAUSE_SCHEDULE: 'schedule:pause',
  RESUME_SCHEDULE: 'schedule:resume',
  GET_SCHEDULE_STATUS: 'schedule:status',

  // Auth
  START_OAUTH: 'auth:start',
  START_TIKTOK_AUTH: 'auth:startTikTok',
  START_INSTAGRAM_AUTH: 'auth:startInstagram',
  GET_AUTH_STATUS: 'auth:status',

  // Folder
  SELECT_FOLDER: 'dialog:selectFolder',

  // Notifications (main -> renderer)
  NOTIFICATION: 'app:notification',
  UPLOAD_PROGRESS: 'app:uploadProgress',
} as const

// ============================================================
// Schedule Status
// ============================================================

export interface ScheduleStatus {
  paused: boolean
  nextUpload: string | null
  uploadsToday: number
  totalScheduled: number
}
