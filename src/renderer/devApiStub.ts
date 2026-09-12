// Renders the interface in a plain browser for visual checks. It installs itself only when the
// preload bridge is absent, so the real app (and any packaged build) never sees it.
import type { QueueItemDTO } from '../shared/dto';
import type { AppEvent, ShortStackApi } from '../shared/ipc';
import { defaultSettings, type AppSettings } from '../shared/settings';

const FOLDER = String.raw`E:\Youtube\Rendered\ShortStack`;

const iso = (hoursFromNow: number): string => new Date(Date.now() + hoursFromNow * 3600_000).toISOString();

const video = (over: Partial<QueueItemDTO> & Pick<QueueItemDTO, 'id' | 'title' | 'filename' | 'state'>): QueueItemDTO => ({
  video_id: over.id,
  channel_id: 'UC_sample',
  description: '',
  tags: [],
  category_id: '22',
  privacy: 'public',
  notify_subscribers: true,
  made_for_kids: false,
  platforms: ['youtube'],
  schedule_source: null,
  scheduled_for: null,
  youtube_video_id: null,
  remote_tombstone: false,
  remote_publish_at: null,
  remote_sync: null,
  remote_error: null,
  upload_session_uri: null,
  upload_bytes_confirmed: 0,
  attempts: 0,
  last_error: null,
  next_attempt_at: null,
  attention_code: null,
  attention_from_state: null,
  created_at: iso(-40),
  updated_at: iso(-1),
  filepath: `${FOLDER}\\${over.filename}`,
  file_size: 48_300_000,
  duration_s: 41.5,
  width: 1080,
  height: 1920,
  missing: false,
  ...over
});

const SAMPLE: QueueItemDTO[] = [
  video({ id: 1, title: 'Cat refuses to move off the keyboard', filename: 'clip_0417.mov', state: 'pending' }),
  video({ id: 2, title: 'Three minutes of rain on a tent', filename: 'rain_tent.mov', state: 'pending', duration_s: 191 }),
  video({
    id: 3,
    title: 'How I edit Shorts in under ten minutes',
    filename: 'editing_flow.mov',
    state: 'approved',
    scheduled_for: iso(6),
    schedule_source: 'auto'
  }),
  video({
    id: 4,
    title: 'The one setting nobody changes',
    filename: 'one_setting.mov',
    state: 'scheduled',
    scheduled_for: iso(30),
    schedule_source: 'manual',
    youtube_video_id: 'abc123',
    remote_sync: 'synced'
  }),
  video({ id: 5, title: 'Desk tour, finally', filename: 'desk_tour.mov', state: 'uploading', upload_bytes_confirmed: 22_000_000 }),
  video({
    id: 6,
    title: 'Why this render kept failing',
    filename: 'render_fail.mov',
    state: 'needs_attention',
    attention_code: 'missed_slot',
    scheduled_for: iso(-3),
    schedule_source: 'manual'
  }),
  video({
    id: 7,
    title: 'Answering your questions about lenses',
    filename: 'lens_qa.mov',
    state: 'published',
    scheduled_for: iso(-52),
    youtube_video_id: 'def456'
  })
];

const SETTINGS: AppSettings = { ...defaultSettings(), shorts_folder: FOLDER, setup_complete: true };

const ACTIVITY = [
  { id: 7, queue_id: 4, action: 'remote_observed', detail: 'YouTube reports it is now scheduled', created_at: iso(-2) },
  { id: 6, queue_id: 5, action: 'begin_upload', detail: 'Upload started', created_at: iso(-3) },
  { id: 5, queue_id: 6, action: 'missed_slot', detail: 'Missed its scheduled time', created_at: iso(-5) },
  { id: 4, queue_id: 3, action: 'auto_slot', detail: 'Automatically scheduled to publish at 18:00', created_at: iso(-6) },
  { id: 3, queue_id: 3, action: 'approve', detail: 'Approved for upload', created_at: iso(-6.2) },
  { id: 2, queue_id: 1, action: 'edit_metadata', detail: 'Details edited', created_at: iso(-30) },
  { id: 1, queue_id: null, action: 'disconnect', detail: 'YouTube data removed from this video', created_at: iso(-50) }
];

const ok = <T>(data: T): Promise<{ ok: true; data: T }> => Promise.resolve({ ok: true as const, data });

export function installDevApiStub(): void {
  const stub: Partial<ShortStackApi> = {
    appInfo: () => Promise.resolve({ profile: 'dev', uploads: 'dry-run', version: '1.0.0-preview', platform: 'win32' }),
    queueList: () => ok(SAMPLE),
    queueGet: (id: number) => ok(SAMPLE.find((item) => item.id === id) ?? SAMPLE[0]!),
    queueApprove: (ids: number[]) => {
      for (const item of SAMPLE) if (ids.includes(item.id) && item.state === 'pending') item.state = 'approved';
      return ok(SAMPLE.filter((item) => ids.includes(item.id)));
    },
    queueUpdateMetadata: (id: number, patch: Record<string, unknown>) => {
      const item = SAMPLE.find((entry) => entry.id === id) ?? SAMPLE[0]!;
      Object.assign(item, patch, { updated_at: new Date().toISOString() });
      return ok(item);
    },
    settingsGetAll: () => ok(SETTINGS),
    settingsSet: (key: string, value: unknown) => {
      (SETTINGS as unknown as Record<string, unknown>)[key] = value;
      return ok(SETTINGS);
    },
    schedulerStatus: () =>
      ok({
        paused: false,
        uploadInFlight: true,
        auth: 'ok' as const,
        nextPublishAt: iso(6),
        apiBackoffUntil: null,
        uploadQuotaUntil: null,
        counts: { pending: 2, approved: 1, uploading: 1, scheduled: 1, needs_attention: 1, published: 1 }
      }),
    authStatus: () =>
      ok({
        state: 'ok' as const,
        hasClientSecret: true,
        missingScopes: [],
        channel: { id: 'UC_sample', title: 'Sample Channel', handle: '@samplechannel', avatarUrl: null, subscriberCount: 12400 }
      }),
    aiStatus: () => ok({ running: true, models: ['llama3.2'], message: 'Ready' }),
    aiGenerate: () =>
      ok({
        title: 'Rain on a tent for three straight minutes',
        description: 'Recorded on a wet night in the Peaks. Headphones recommended.',
        tags: ['rain sounds', 'camping', 'asmr']
      }),
    clipboardWrite: () => ok(null),
    queueLinkVideo: () => Promise.resolve({ ok: false as const, error: { code: 'preview', message: 'Not available in the browser preview' } }),
    activityList: () => ok(ACTIVITY),
    uploadsList: () => ok([]),
    on: (_event: AppEvent, _listener: (payload: unknown) => void) => () => undefined
  };

  window.api = new Proxy(stub as ShortStackApi, {
    get: (target, key: string) =>
      key in target
        ? (target as unknown as Record<string, unknown>)[key]
        : () => Promise.resolve({ ok: false, error: { code: 'preview', message: 'Not available in the browser preview' } })
  });
}
