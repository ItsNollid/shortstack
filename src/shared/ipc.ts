// The contract between the renderer and the main process. Both sides are typed from this one
// definition, so a signature can no longer drift the way the old electron.d.ts did.
import type { AiModel } from './aiModels';
import type { UpdateStatus } from './updates';
import type { ChannelAnalytics } from './analytics';
import type { Pulled } from './analyticsRefresh';
import type { RestyleChange, RestyleResult } from './restyle';
import type { SourceVideo } from './sourceVideo';
import type { ChannelAction, SettingChange } from './channelActions';
import type { Brief } from './insights';
import type { Affordable, QuotaMood, QuotaState } from './quota';
import type { PastUploadPage } from './pastUploads';
import type { ActivityEntryDTO, QueueItemDTO, UploadDTO } from './dto';
import type { AppSettings, IgnoredSetting } from './settings';
import type { QueueMetadataPatch } from './videoMetadata';
import type { VideoReport } from './videoReading';
import type { TitleAngle } from './titleAngles';

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
  models: AiModel[];
  message: string;
}

export interface QuotaView extends QuotaState {
  mood: QuotaMood;
  affordable: Affordable[];
  /** False in a dry-run build, where nothing real is called and the meter can only read zero. */
  counting: boolean;
}

export interface AdviceItemDTO {
  action: string;
  /** The id of the measured finding behind it. The page shows that finding's own wording. */
  basedOn: string;
  change?: ChannelAction;
}

export interface ChannelAdvice {
  headline: string;
  recommendations: AdviceItemDTO[];
}

export interface MetadataSuggestionDTO {
  title: string;
  description: string;
  tags: string[];
  /** A title of each kind, when the model offered them, in the order this channel favours. */
  titleOptions?: Array<{ angle: TitleAngle; title: string }>;
  /** The kind the title above is, when it is one of those. */
  titleAngle?: TitleAngle | null;
}

export const APP_EVENTS = [
  'queue:changed',
  'scheduler:status',
  'auth:changed',
  'upload:progress',
  'toast',
  'update:changed',
  'reading:changed'
] as const;

/**
 * Derived from the list, not declared beside it. The preload checks incoming names against
 * APP_EVENTS at runtime, so an event that exists in the type and not in the array is accepted by
 * the compiler and throws the moment a component subscribes to it — which took down the entire
 * renderer, not just the feature.
 */
export type AppEvent = (typeof APP_EVENTS)[number];

export interface ShortStackApi {
  appInfo(): Promise<AppInfo>;

  queueList(): Promise<Result<QueueItemDTO[]>>;
  queueGet(id: number): Promise<Result<QueueItemDTO>>;
  queueUpdateMetadata(id: number, patch: QueueMetadataPatch, expectedUpdatedAt?: string): Promise<Result<QueueItemDTO>>;
  /** What applying the current house style would change on waiting videos. Writes nothing. */
  queueRestylePreview(): Promise<Result<RestyleChange[]>>;
  queueRestyle(ids: number[]): Promise<Result<RestyleResult>>;
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

  /** Marks files as already published elsewhere, so their next posting is a re-run and does not
   *  announce itself. Takes queue ids; the flag lives on the video behind them. */
  rotationMarkPublishedBefore(ids: number[], publishedBefore: boolean): Promise<Result<number>>;
  rotationSetPaused(ids: number[], paused: boolean): Promise<Result<number>>;
  /** Queues another posting of each video, ignoring the limit and the pause. */
  rotationPostAgain(ids: number[]): Promise<Result<number>>;

  videosScan(): Promise<Result<ScanSummary>>;
  /** Which game a video is of. Stored on the video, so every posting of it agrees. */
  videoSetGame(queueId: number, game: string | null): Promise<Result<QueueItemDTO>>;
  /** The long video a Short was cut from: a title, and a YouTube link if there is one. Null clears it. */
  videoSetSource(queueId: number, source: { title: string; link: string } | null): Promise<Result<QueueItemDTO>>;
  sourcesKnown(): Promise<Result<SourceVideo[]>>;
  /** Games already in use on this channel, offered as suggestions alongside the built-in list. */
  gamesKnown(): Promise<Result<string[]>>;

  /** Queue ids whose video still needs decoding, one per file. */
  thumbnailsMissing(): Promise<Result<number[]>>;
  /** Stores a poster frame the renderer drew, as raw PNG bytes. */
  thumbnailSave(queueId: number, png: Uint8Array): Promise<Result<null>>;
  /** Stores the strip of stills the local model reads, as raw JPEG bytes. */
  /** The strip, and with it when each still was taken, the opening stills, and how long the video is. */
  framesSave(
    queueId: number,
    frames: Uint8Array[],
    info?: { times: number[]; opening: Uint8Array[]; openingTimes: number[]; duration: number | null }
  ): Promise<Result<null>>;

  settingsGetAll(): Promise<Result<AppSettings>>;
  settingsSet(key: string, value: unknown): Promise<Result<AppSettings>>;
  /** Stored settings that could not be used, with what was stored and why, so none is lost in silence. */
  settingsIgnored(): Promise<Result<IgnoredSetting[]>>;

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
  /** Loads a model and asks it one question, so a choice can be checked before it is relied on. */
  aiTest(model: string): Promise<Result<null>>;
  /** What the local model saw in a video's stills last time, with the cover and the opening drawn from it. */
  videoReading(queueId: number): Promise<Result<VideoReport | null>>;
  /** Has the model look at each still now. Seconds per still, so only ever when asked. */
  videoLook(queueId: number): Promise<Result<VideoReport>>;

  /** What the app knows about newer versions right now, without going and looking. */
  updateStatus(): Promise<Result<UpdateStatus>>;
  /** Goes and looks. Both channels: the release feed, and how far the source has moved. */
  updateCheck(): Promise<Result<UpdateStatus>>;
  /** Downloads a release the user has been told about. Never happens on its own. */
  updateDownload(): Promise<Result<null>>;
  /** Restarts into a downloaded release. */
  updateInstall(): Promise<Result<null>>;
  /** The development equivalent: hands over to the build script, which closes this app. */
  updateRebuild(): Promise<Result<null>>;

  /**
   * A range's numbers. A kept answer no older than `maxAgeMs` comes back instead of asking YouTube;
   * `null` returns only what is kept, and nothing when nothing is. Left out, any kept answer will do.
   */
  analyticsGet(days: number, maxAgeMs?: number | null): Promise<Result<Pulled<ChannelAnalytics> | null>>;
  /** What the channel's own numbers say, measured in code. No model involved. */
  insightsGet(days: number, maxAgeMs?: number | null): Promise<Result<Brief | null>>;
  /** Turns those findings into things to do. Asked for explicitly, because it takes seconds. */
  insightsAdvise(days: number): Promise<Result<ChannelAdvice>>;
  /** What ShortStack has spent of today's YouTube allowance, and what the rest will still buy. */
  quotaGet(): Promise<Result<QuotaView>>;
  /** What a proposed change would do, against the settings as they are now. Null if nothing. */
  actionPreview(action: ChannelAction): Promise<Result<SettingChange | null>>;
  /** Makes it. Validated again here: the renderer is not what decides an action is allowed. */
  actionApply(action: ChannelAction): Promise<Result<SettingChange>>;
  /** Previously published videos, so their details can be reused on a new posting. */
  pastUploadsList(pageToken?: string): Promise<Result<PastUploadPage>>;
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
  'queueRestylePreview',
  'queueRestyle',
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
  'rotationMarkPublishedBefore',
  'rotationSetPaused',
  'rotationPostAgain',
  'videosScan',
  'videoSetGame',
  'videoSetSource',
  'sourcesKnown',
  'gamesKnown',
  'thumbnailsMissing',
  'thumbnailSave',
  'framesSave',
  'settingsGetAll',
  'settingsSet',
  'settingsIgnored',
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
  'videoReading',
  'videoLook',
  'aiTest',
  'updateStatus',
  'updateCheck',
  'updateDownload',
  'updateInstall',
  'updateRebuild',
  'analyticsGet',
  'insightsGet',
  'insightsAdvise',
  'quotaGet',
  'actionPreview',
  'actionApply',
  'pastUploadsList',
  'uploadsList',
  'activityList',
  'selectFolder',
  'revealFile',
  'openExternal',
  'openStudioUpload',
  'clipboardWrite'
];


// Compile-time guard: every method on the interface must appear in IPC_METHODS, otherwise the
// preload would silently not expose it and the renderer would call undefined.
type MethodsMissingFromList = Exclude<Exclude<keyof ShortStackApi, 'on'>, (typeof IPC_METHODS)[number]>;
const _everyMethodIsListed: MethodsMissingFromList extends never ? true : never = true;
void _everyMethodIsListed;
