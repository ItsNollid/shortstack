// Renders the interface in a plain browser for visual checks. It installs itself only when the
// preload bridge is absent, so the real app (and any packaged build) never sees it.
import type { QueueItemDTO } from '../shared/dto';
import type { AppEvent, ShortStackApi } from '../shared/ipc';
import { LEGAL_VERSION } from '../shared/legal';
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
  ai_drafted_at: null,
  metadata_edited_at: null,
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
  posting_kind: 'new',
  published_before: false,
  rotation_paused: false,
  postings: 1,
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
  video({
    id: 5,
    title: 'Desk tour, finally',
    filename: 'desk_tour.mov',
    state: 'uploading',
    upload_bytes_confirmed: 22_000_000,
    posting_kind: 'rotation',
    postings: 3
  }),
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
    youtube_video_id: 'def456',
    posting_kind: 'rotation',
    published_before: true,
    postings: 4
  })
];

const SETTINGS: AppSettings = {
  ...defaultSettings(),
  shorts_folder: FOLDER,
  setup_complete: true,
  legal_accepted_version: LEGAL_VERSION,
  last_seen_version: null,
  format_title_case: 'as_written' as const,
  format_title_prefix: '',
  format_title_suffix: '',
  format_description_footer: '',
  format_tidy: false,
  format_max_hashtags: 0
};

const ACTIVITY = [
  { id: 7, queue_id: 4, action: 'remote_observed', detail: 'YouTube reports it is now scheduled', created_at: iso(-2) },
  { id: 6, queue_id: 5, action: 'begin_upload', detail: 'Upload started', created_at: iso(-3) },
  { id: 5, queue_id: 6, action: 'missed_slot', detail: 'Missed its scheduled time', created_at: iso(-5) },
  { id: 4, queue_id: 3, action: 'auto_slot', detail: 'Automatically scheduled to publish at 18:00', created_at: iso(-6) },
  { id: 3, queue_id: 3, action: 'approve', detail: 'Approved for upload', created_at: iso(-6.2) },
  { id: 2, queue_id: 1, action: 'edit_metadata', detail: 'Details edited', created_at: iso(-30) },
  { id: 1, queue_id: null, action: 'disconnect', detail: 'YouTube data removed from this video', created_at: iso(-50) }
];

const listeners = new Map<AppEvent, Set<(payload: unknown) => void>>();

// The preview has to behave like the app: a write tells the screens to refetch.
const emit = (event: AppEvent): void => {
  for (const listener of listeners.get(event) ?? []) listener(null);
};

const ok = <T>(data: T): Promise<{ ok: true; data: T }> =>
  // Structured-cloned the way IPC would, so the preview cannot hand out live references.
  Promise.resolve({ ok: true as const, data: structuredClone(data) });

export function installDevApiStub(): void {
  const stub: Partial<ShortStackApi> = {
    appInfo: () => Promise.resolve({ profile: 'dev', uploads: 'dry-run', version: '1.0.0-preview', platform: 'win32' }),
    queueList: () => ok(SAMPLE),
    queueGet: (id: number) => ok(SAMPLE.find((item) => item.id === id) ?? SAMPLE[0]!),
    queueApprove: (ids: number[]) => {
      for (const item of SAMPLE) if (ids.includes(item.id) && item.state === 'pending') item.state = 'approved';
      emit('queue:changed');
      return ok(SAMPLE.filter((item) => ids.includes(item.id)));
    },
    queueUpdateMetadata: (id: number, patch: Record<string, unknown>) => {
      const item = SAMPLE.find((entry) => entry.id === id) ?? SAMPLE[0]!;
      Object.assign(item, patch, { updated_at: new Date().toISOString() });
      emit('queue:changed');
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
        tokensEncrypted: true,
        missingScopes: [],
        channel: { id: 'UC_sample', title: 'Sample Channel', handle: '@samplechannel', avatarUrl: null, subscriberCount: 12400 }
      }),
    pastUploadsList: () =>
      ok({
        items: [
          {
            videoId: 'past1',
            title: 'Zombie map guide, round 100',
            description: 'The strategy I use every time.',
            tags: ['blackops3', 'zombies'],
            categoryId: '20',
            thumbnailUrl: null,
            publishedAt: iso(-720),
            privacy: 'public' as const
          }
        ],
        nextPageToken: null
      }),
    thumbnailsMissing: () => ok([] as number[]),
    thumbnailSave: () => ok(null),
    framesSave: () => ok(null),
    rotationMarkPublishedBefore: (ids: number[], publishedBefore: boolean) => {
      for (const item of SAMPLE) if (ids.includes(item.id)) item.published_before = publishedBefore;
      emit('queue:changed');
      return ok(ids.length);
    },
    rotationSetPaused: (ids: number[], paused: boolean) => {
      for (const item of SAMPLE) if (ids.includes(item.id)) item.rotation_paused = paused;
      emit('queue:changed');
      return ok(ids.length);
    },
    rotationPostAgain: (ids: number[]) => {
      emit('queue:changed');
      return ok(ids.length);
    },
    authRefreshChannel: () =>
      Promise.resolve({ ok: false as const, error: { code: 'preview', message: 'Not available in the browser preview' } }),
    aiStatus: () => ok({ running: true, models: [{ name: 'llava:13b', vision: true, thinking: false }], message: 'Ready' }),
    updateStatus: () => ok({ channel: 'development' as const, state: { kind: 'idle' as const } }),
    updateCheck: () => ok({ channel: 'development' as const, state: { kind: 'idle' as const } }),
    updateDownload: () => ok(null),
    updateInstall: () => ok(null),
    updateRebuild: () => ok(null),
    aiTest: () => ok(null),
    aiGenerate: () =>
      ok({
        title: 'Rain on a tent for three straight minutes',
        description: 'Recorded on a wet night in the Peaks. Headphones recommended.',
        tags: ['rain sounds', 'camping', 'asmr']
      }),
    clipboardWrite: () => ok(null),
    queueLinkVideo: () =>
      Promise.resolve({ ok: false as const, error: { code: 'preview', message: 'Not available in the browser preview' } }),
    queueSchedule: (id: number, at: string) => {
      const item = SAMPLE.find((entry) => entry.id === id);
      if (item === undefined) return Promise.resolve({ ok: false as const, error: { code: 'gone', message: 'Not found' } });
      item.scheduled_for = at;
      item.schedule_source = 'manual';
      emit('queue:changed');
      return ok(item);
    },
    queueHold: (id: number) => {
      const item = SAMPLE.find((entry) => entry.id === id);
      if (item === undefined) return Promise.resolve({ ok: false as const, error: { code: 'gone', message: 'Not found' } });
      item.scheduled_for = null;
      item.schedule_source = 'hold';
      emit('queue:changed');
      return ok(item);
    },
    activityList: () => ok(ACTIVITY),
    analyticsGet: (days: number) => {
      const end = new Date(Date.now() - 86_400_000);
      const list = Array.from({ length: days }, (_, index) => {
        const date = new Date(end.getTime() - (days - 1 - index) * 86_400_000).toISOString().slice(0, 10);
        const views = Math.round(400 + 260 * Math.sin(index / 3) + index * 9);
        return { date, views, minutesWatched: Math.round(views * 0.7), subscribersGained: index % 4, subscribersLost: index % 7 === 0 ? 1 : 0 };
      });
      const sum = (pick: (day: (typeof list)[number]) => number): number => list.reduce((total, day) => total + pick(day), 0);
      const gained = sum((day) => day.subscribersGained);
      const lost = sum((day) => day.subscribersLost);
      return ok({
        startDate: list[0]!.date,
        endDate: list[list.length - 1]!.date,
        totals: {
          views: sum((day) => day.views),
          minutesWatched: sum((day) => day.minutesWatched),
          likes: Math.round(sum((day) => day.views) * 0.04),
          subscribersGained: gained,
          subscribersLost: lost,
          netSubscribers: gained - lost,
          comments: Math.round(sum((day) => day.views) * 0.006),
          shares: Math.round(sum((day) => day.views) * 0.011),
          averageViewDuration: 9.4,
          averageViewPercentage: 61.2
        },
        days: list,
        subscriberSplit: {
          subscribedViews: Math.round(sum((day) => day.views) * 0.18),
          unsubscribedViews: Math.round(sum((day) => day.views) * 0.82),
          subscribedRetention: 68.1,
          unsubscribedRetention: 58.9
        },
        topVideos: [
          { videoId: 'v1', title: 'THIS ZOMBIE ROUND BROKE ME', views: 18400, minutesWatched: 2900, averageViewPercentage: 74.2, likes: 940, subscribersGained: 61 },
          { videoId: 'v2', title: 'PETER GRIFFIN IN CALL OF DUTY?', views: 9100, minutesWatched: 1300, averageViewPercentage: 63.5, likes: 410, subscribersGained: 22 },
          { videoId: 'v3', title: 'I SHOULD NOT HAVE OPENED THAT DOOR', views: 3300, minutesWatched: 420, averageViewPercentage: 51.8, likes: 130, subscribersGained: 4 }
        ],
        trafficSources: [
          { key: 'SHORTS', views: Math.round(sum((day) => day.views) * 0.79) },
          { key: 'SUBSCRIBER', views: Math.round(sum((day) => day.views) * 0.12) },
          { key: 'YT_SEARCH', views: Math.round(sum((day) => day.views) * 0.06) },
          { key: 'RELATED_VIDEO', views: Math.round(sum((day) => day.views) * 0.03) }
        ],
        countries: [
          { key: 'US', views: 5200 },
          { key: 'GB', views: 1400 },
          { key: 'CA', views: 900 },
          { key: 'AU', views: 500 }
        ],
        demographics: [
          { ageGroup: 'age18-24', gender: 'male', viewerPercentage: 34.1 },
          { ageGroup: 'age25-34', gender: 'male', viewerPercentage: 27.6 },
          { ageGroup: 'age13-17', gender: 'male', viewerPercentage: 14.2 },
          { ageGroup: 'age18-24', gender: 'female', viewerPercentage: 9.8 },
          { ageGroup: 'age35-44', gender: 'male', viewerPercentage: 7.3 }
        ]
      });
    },
    insightsGet: () =>
      ok({
        videoCount: 46,
        tooEarly: false,
        usable: [
          { id: 'game', statement: 'Counter-Strike 2 gets the most views: a median of 4,100 across 14 videos, against 900 for Minecraft. But Minecraft brings more subscribers per view: 3.8 per thousand against 1.1.', sampleSize: 31, confidence: 'strong' },
          { id: 'conversion', statement: 'A video earns 1.9 subscribers per thousand views. The ones that travel furthest convert worst, which is what reaching strangers looks like.', sampleSize: 46, confidence: 'strong' },
          { id: 'time-of-day', statement: 'Videos posted in the evening (5pm to 9pm) get a median of 3,200 views, against 1,100 for the morning (9am to noon) — 191% higher, across 11 and 9 videos.', sampleSize: 46, confidence: 'strong' },
          { id: 'retention', statement: 'The half of videos people watch furthest through (median 71%) get 3,900 views; the half they drop out of soonest (median 38%) get 640.', sampleSize: 46, confidence: 'strong' },
          { id: 'shouted-title', statement: 'Videos where the title is in capitals get a median of 2,800 views against 1,400 where it is not — 100% higher, across 25 and 21 videos.', sampleSize: 46, confidence: 'weak' }
        ],
        missing: [
          { id: 'weekday', statement: 'No day of the week yet has 3 videos to compare against another.', sampleSize: 46, confidence: 'insufficient' },
          { id: 'cadence', statement: 'Uploads are too evenly spaced to compare a short gap against a long one.', sampleSize: 46, confidence: 'insufficient' }
        ]
      }),
    insightsAdvise: () =>
      ok({
        headline: 'Your reach and your subscribers are coming from different games.',
        recommendations: [
          { action: 'Keep recording CS2 for reach, but cut more Shorts out of the Minecraft sessions.', because: 'CS2 gets four times the views, while Minecraft earns three times the subscribers per view.' },
          { action: 'Move your 9am slot to the evening.', because: 'Evening posts get 191% more views across 11 and 9 videos.' },
          { action: 'Cut the first three seconds harder on the weaker half.', because: 'The videos people watch furthest through get six times the views of the ones they drop out of.' },
          { action: 'Post on a different day of the week for a few weeks.', because: 'No day yet has enough videos to compare, so there is nothing to act on.' }
        ]
      }),
    uploadsList: () => ok([]),
    on: (event: AppEvent, listener: (payload: unknown) => void) => {
      const set = listeners.get(event) ?? new Set();
      set.add(listener);
      listeners.set(event, set);
      return () => set.delete(listener);
    }
  };

  window.api = new Proxy(stub as ShortStackApi, {
    get: (target, key: string) =>
      key in target
        ? (target as unknown as Record<string, unknown>)[key]
        : () => Promise.resolve({ ok: false, error: { code: 'preview', message: 'Not available in the browser preview' } })
  });
}
