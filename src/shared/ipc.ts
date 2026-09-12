// The contract between the renderer and the main process. Both sides are typed from this one
// definition, so a signature can no longer drift the way the old electron.d.ts did.
import type { ChannelAnalytics } from './analytics';
import type { ActivityEntryDTO, QueueItemDTO, UploadDTO } from './dto';
import type { AppSettings } from './settings';
import type { QueueMetadataPatch } from './videoMetadata';

/** Failures are values, not thrown errors: Electron turns a rejection into an unreadable string. */
export type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

export interface AppInfo {
  profile: 'dev' | 'live';
  uploads: 'dry-run' | 'live';
  version: string;
  platform: string;
}

export interface SchedulerStatus {
  paused: boolean;
  uploadInFlight: boolean;
  auth: 'ok' | 'expired' | 'offline' | 'disconnected';
  nextPublishAt: string | null;
  apiBackoffUntil: string | null;
  uploadQuotaUntil: string | null;
  counts: Record<string, number>;
}

export interface AuthStatus {
  state: 'ok' | 'expired' | 'offline' | 'disconnected';
  hasClientSecret: boolean;
  /** False means the OS offered no secure storage, so the sign-in tokens sit on disk in the clear. */
  tokensEncrypted: boolean;
  missingScopes: string[];
  channel: { id: string; title: string; handle: string | null; avatarUrl: string | null; subscriberCount: number | null } | null;
}

export interface ScanSummary {
  status: 'ok' | 'no_folder' | 'folder_unavailable';
  added: number;
  updated: number;
  unchanged: number;
  ignored: number;
  skipped: number;
  missing: number;
  problems: string[];
}

export interface AiStatus {
  running: boolean;
  models: string[];
  message: string;
}

export interface MetadataSuggestionDTO {
  title: string;
  description: string;
  tags: string[];
}

export type AppEvent = 'queue:changed' | 'scheduler:status' | 'auth:changed' | 'upload:progress' | 'toast';

export interface ShortStackApi {
  appInfo(): Promise<AppInfo>;

  queueList(): Promise<Result<QueueItemDTO[]>>;
  queueGet(id: number): Promise<Result<QueueItemDTO>>;
  queueUpdateMetadata(id: number, patch: QueueMetadataPatch, expectedUpdatedAt?: string): Promise<Result<QueueItemDTO>>;
  queueApprove(ids: number[]): Promise<Result<QueueItemDTO[]>>;
  queueUnapprove(ids: number[]): Promise<Result<QueueItemDTO[]>>;
  queueReject(ids: number[]): Promise<Result<QueueItemDTO[]>>;
  queueRestore(ids: number[]): Promise<Result<QueueItemDTO[]>>;
  queueSchedule(id: number, publishAt: string): Promise<Result<QueueItemDTO>>;
  queueHold(id: number): Promise<Result<QueueItemDTO>>;
  queueCancelUpload(id: number): Promise<Result<QueueItemDTO>>;
  queueLinkVideo(id: number, urlOrId: string): Promise<Result<QueueItemDTO>>;
  queueResolveAttention(id: number): Promise<Result<QueueItemDTO>>;
  queueConfirmNotDuplicate(id: number): Promise<Result<QueueItemDTO>>;

  videosScan(): Promise<Result<ScanSummary>>;

  settingsGetAll(): Promise<Result<AppSettings>>;
  settingsSet(key: string, value: unknown): Promise<Result<AppSettings>>;

  schedulerStatus(): Promise<Result<SchedulerStatus>>;
  schedulerPause(): Promise<Result<SchedulerStatus>>;
  schedulerResume(): Promise<Result<SchedulerStatus>>;

  authStatus(): Promise<Result<AuthStatus>>;
  authConnect(): Promise<Result<AuthStatus>>;
  authCancel(): Promise<Result<null>>;
  authDisconnect(): Promise<Result<AuthStatus>>;
  authImportClientSecret(): Promise<Result<AuthStatus>>;
  /** Re-reads the channel behind the stored sign-in. Separate from connecting, because the sign-in
   *  can succeed while this fails, and that left the app unable to say whose channel it held. */
  authRefreshChannel(): Promise<Result<AuthStatus>>;

  aiStatus(): Promise<Result<AiStatus>>;
  aiGenerate(queueId: number): Promise<Result<MetadataSuggestionDTO>>;

  analyticsGet(days: number): Promise<Result<ChannelAnalytics>>;
  uploadsList(): Promise<Result<UploadDTO[]>>;
  activityList(queueId?: number): Promise<Result<ActivityEntryDTO[]>>;

  selectFolder(): Promise<Result<string | null>>;
  revealFile(queueId: number): Promise<Result<null>>;
  openExternal(url: string): Promise<Result<null>>;
  openStudioUpload(): Promise<Result<null>>;
  /** Copying runs in the main process: the renderer loads from file://, where the browser
   *  clipboard API is not reliably available. */
  clipboardWrite(text: string): Promise<Result<null>>;

  /** Returns an unsubscribe function: the old preload leaked a listener on every mount. */
  on(event: AppEvent, listener: (payload: unknown) => void): () => void;
}

export const IPC_METHODS: ReadonlyArray<Exclude<keyof ShortStackApi, 'on'>> = [
  'appInfo',
  'queueList',
  'queueGet',
  'queueUpdateMetadata',
  'queueApprove',
  'queueUnapprove',
  'queueReject',
  'queueRestore',
  'queueSchedule',
  'queueHold',
  'queueCancelUpload',
  'queueLinkVideo',
  'queueResolveAttention',
  'queueConfirmNotDuplicate',
  'videosScan',
  'settingsGetAll',
  'settingsSet',
  'schedulerStatus',
  'schedulerPause',
  'schedulerResume',
  'authStatus',
  'authConnect',
  'authCancel',
  'authDisconnect',
  'authImportClientSecret',
  'authRefreshChannel',
  'aiStatus',
  'aiGenerate',
  'analyticsGet',
  'uploadsList',
  'activityList',
  'selectFolder',
  'revealFile',
  'openExternal',
  'openStudioUpload',
  'clipboardWrite'
];

export const APP_EVENTS: readonly AppEvent[] = ['queue:changed', 'scheduler:status', 'auth:changed', 'upload:progress', 'toast'];

// Compile-time guard: every method on the interface must appear in IPC_METHODS, otherwise the
// preload would silently not expose it and the renderer would call undefined.
type MethodsMissingFromList = Exclude<Exclude<keyof ShortStackApi, 'on'>, (typeof IPC_METHODS)[number]>;
const _everyMethodIsListed: MethodsMissingFromList extends never ? true : never = true;
void _everyMethodIsListed;
