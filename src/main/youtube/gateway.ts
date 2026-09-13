// The only code that talks to the YouTube Data API. Everything goes through one interface so a
// dry-run implementation can stand in during development and tests.
import type { Privacy } from '../../shared/queue';
import type { ChannelAnalytics } from '../../shared/analytics';
import type { PastUpload, PastUploadPage } from '../../shared/pastUploads';
import { ANALYTICS_METRICS, parseAnalyticsReport, reportRange } from './analyticsReport';
import { classifyFailure } from './resumableUpload';

export const API_BASE = 'https://www.googleapis.com/youtube/v3';
// Analytics lives on its own host and its own API, hence the second base.
export const ANALYTICS_BASE = 'https://youtubeanalytics.googleapis.com/v2';

export interface ChannelProfile {
  id: string;
  title: string;
  handle: string | null;
  avatarUrl: string | null;
  subscriberCount: number | null;
  uploadsPlaylistId: string | null;
}

export interface VideoStatusSnapshot {
  privacyStatus: Privacy;
  publishAt: string | null;
  uploadStatus: string | null;
  rejectionReason: string | null;
}

export interface RecentUpload {
  videoId: string;
  title: string;
  publishedAt: string | null;
  fileName: string | null;
  fileSize: number | null;
}

export type GatewayFailure = {
  ok: false;
  reason: string;
  code: string | null;
  retryable: boolean;
  hold?: 'api' | 'upload_quota';
  /** YouTube refused the publish time itself, so the user has to set it in Studio. */
  scheduleRefused?: boolean;
};

export type GatewayResult<T> = { ok: true; value: T } | GatewayFailure;

export interface YouTubeGateway {
  fetchChannelProfile(): Promise<GatewayResult<ChannelProfile>>;
  fetchVideoStatus(videoId: string): Promise<GatewayResult<VideoStatusSnapshot>>;
  setPublishPlan(videoId: string, plan: { privacyStatus: Privacy; publishAt: string | null }): Promise<GatewayResult<VideoStatusSnapshot>>;
  listRecentUploads(playlistId: string, limit?: number): Promise<GatewayResult<RecentUpload[]>>;
  fetchChannelAnalytics(days: number, now?: Date): Promise<GatewayResult<ChannelAnalytics>>;
  /** Previously published videos, with the details a new posting might reuse. */
  listPastUploads(playlistId: string, options?: { limit?: number; pageToken?: string }): Promise<GatewayResult<PastUploadPage>>;
}

export interface GatewayDeps {
  accessToken(): Promise<string>;
  fetch?: typeof fetch;
  baseUrl?: string;
  analyticsBaseUrl?: string;
}

const SCHEDULE_REFUSAL_CODES = new Set(['invalidPublishAt', 'forbiddenPrivacySetting', 'forbidden', 'insufficientPermissions']);

function failure(status: number, body: string, what: string): GatewayFailure {
  const classified = classifyFailure(status, body);
  return {
    ok: false,
    reason: `${what} failed (${status})`,
    ...classified,
    scheduleRefused: classified.code !== null && SCHEDULE_REFUSAL_CODES.has(classified.code)
  };
}

const asPrivacy = (value: unknown): Privacy =>
  value === 'public' || value === 'unlisted' || value === 'private' ? value : 'private';

export class HttpYouTubeGateway implements YouTubeGateway {
  private readonly doFetch: typeof fetch;
  private readonly baseUrl: string;
  private readonly analyticsBaseUrl: string;

  constructor(private readonly deps: GatewayDeps) {
    this.doFetch = deps.fetch ?? fetch;
    this.baseUrl = deps.baseUrl ?? API_BASE;
    this.analyticsBaseUrl = deps.analyticsBaseUrl ?? ANALYTICS_BASE;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    return this.doFetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${await this.deps.accessToken()}`,
        'Content-Type': 'application/json'
      }
    });
  }

  async fetchChannelProfile(): Promise<GatewayResult<ChannelProfile>> {
    const response = await this.request('/channels?part=snippet,statistics,contentDetails&mine=true');
    const body = await response.text();
    if (!response.ok) return failure(response.status, body, 'Reading the channel');

    const parsed = JSON.parse(body) as {
      items?: Array<{
        id?: string;
        snippet?: { title?: string; customUrl?: string; thumbnails?: Record<string, { url?: string }> };
        statistics?: { subscriberCount?: string };
        contentDetails?: { relatedPlaylists?: { uploads?: string } };
      }>;
    };
    const item = parsed.items?.[0];
    if (item?.id === undefined) {
      return { ok: false, reason: 'That account has no YouTube channel', code: 'no_channel', retryable: false };
    }
    const thumbnails = item.snippet?.thumbnails ?? {};
    const subscribers = Number(item.statistics?.subscriberCount ?? '');
    return {
      ok: true,
      value: {
        id: item.id,
        title: item.snippet?.title ?? 'Your channel',
        handle: item.snippet?.customUrl ?? null,
        avatarUrl: thumbnails.high?.url ?? thumbnails.medium?.url ?? thumbnails.default?.url ?? null,
        subscriberCount: Number.isFinite(subscribers) ? subscribers : null,
        uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads ?? null
      }
    };
  }

  async fetchVideoStatus(videoId: string): Promise<GatewayResult<VideoStatusSnapshot>> {
    const response = await this.request(`/videos?part=status&id=${encodeURIComponent(videoId)}`);
    const body = await response.text();
    if (!response.ok) return failure(response.status, body, 'Reading the video');

    const parsed = JSON.parse(body) as { items?: Array<{ status?: Record<string, unknown> }> };
    const status = parsed.items?.[0]?.status;
    if (status === undefined) {
      return { ok: false, reason: 'That video is no longer on the channel', code: 'not_found', retryable: false };
    }
    return {
      ok: true,
      value: {
        privacyStatus: asPrivacy(status.privacyStatus),
        publishAt: typeof status.publishAt === 'string' ? status.publishAt : null,
        uploadStatus: typeof status.uploadStatus === 'string' ? status.uploadStatus : null,
        rejectionReason: typeof status.rejectionReason === 'string' ? status.rejectionReason : null
      }
    };
  }

  /**
   * videos.update deletes any mutable field left out of the part it is given, so the current
   * status is read first and written back whole with only the publish plan changed. Sending just
   * publishAt would silently clear made-for-kids, embeddable and the rest.
   */
  async setPublishPlan(
    videoId: string,
    plan: { privacyStatus: Privacy; publishAt: string | null }
  ): Promise<GatewayResult<VideoStatusSnapshot>> {
    const current = await this.request(`/videos?part=status&id=${encodeURIComponent(videoId)}`);
    const currentBody = await current.text();
    if (!current.ok) return failure(current.status, currentBody, 'Reading the video');

    const parsedCurrent = JSON.parse(currentBody) as { items?: Array<{ status?: Record<string, unknown> }> };
    const existing = parsedCurrent.items?.[0]?.status;
    if (existing === undefined) {
      return { ok: false, reason: 'That video is no longer on the channel', code: 'not_found', retryable: false };
    }

    const status: Record<string, unknown> = { ...existing, privacyStatus: plan.privacyStatus };
    if (plan.publishAt === null) delete status.publishAt;
    else status.publishAt = plan.publishAt;
    // Read-only fields would be rejected if echoed back.
    delete status.uploadStatus;
    delete status.rejectionReason;
    delete status.failureReason;

    const response = await this.request('/videos?part=status', { method: 'PUT', body: JSON.stringify({ id: videoId, status }) });
    const body = await response.text();
    if (!response.ok) return failure(response.status, body, 'Updating the video');

    const updated = (JSON.parse(body) as { status?: Record<string, unknown> }).status ?? {};
    return {
      ok: true,
      value: {
        privacyStatus: asPrivacy(updated.privacyStatus),
        publishAt: typeof updated.publishAt === 'string' ? updated.publishAt : null,
        uploadStatus: typeof updated.uploadStatus === 'string' ? updated.uploadStatus : null,
        rejectionReason: typeof updated.rejectionReason === 'string' ? updated.rejectionReason : null
      }
    };
  }

  /** Used by assisted mode to spot a video the user just uploaded in Studio. */
  async listRecentUploads(playlistId: string, limit = 10): Promise<GatewayResult<RecentUpload[]>> {
    const playlist = await this.request(
      `/playlistItems?part=contentDetails,snippet&maxResults=${limit}&playlistId=${encodeURIComponent(playlistId)}`
    );
    const playlistBody = await playlist.text();
    if (!playlist.ok) return failure(playlist.status, playlistBody, 'Listing recent uploads');

    const items = (
      JSON.parse(playlistBody) as {
        items?: Array<{ contentDetails?: { videoId?: string; videoPublishedAt?: string }; snippet?: { title?: string } }>;
      }
    ).items ?? [];
    const ids = items.map((item) => item.contentDetails?.videoId).filter((id): id is string => typeof id === 'string');
    if (ids.length === 0) return { ok: true, value: [] };

    // fileDetails carries the original filename and size, which is how an upload is matched
    // back to the file on disk without asking the user to paste a link.
    const details = await this.request(`/videos?part=fileDetails,snippet&id=${ids.map(encodeURIComponent).join(',')}`);
    const detailsBody = await details.text();
    const byId = new Map<string, { fileName: string | null; fileSize: number | null }>();
    if (details.ok) {
      const parsed = JSON.parse(detailsBody) as {
        items?: Array<{ id?: string; fileDetails?: { fileName?: string; fileSize?: string } }>;
      };
      for (const item of parsed.items ?? []) {
        if (typeof item.id !== 'string') continue;
        const size = Number(item.fileDetails?.fileSize ?? '');
        byId.set(item.id, {
          fileName: item.fileDetails?.fileName ?? null,
          fileSize: Number.isFinite(size) ? size : null
        });
      }
    }

    return {
      ok: true,
      value: items
        .filter((item) => typeof item.contentDetails?.videoId === 'string')
        .map((item) => {
          const videoId = item.contentDetails?.videoId as string;
          const extra = byId.get(videoId);
          return {
            videoId,
            title: item.snippet?.title ?? '',
            publishedAt: item.contentDetails?.videoPublishedAt ?? null,
            fileName: extra?.fileName ?? null,
            fileSize: extra?.fileSize ?? null
          };
        })
    };
  }

  /** Analytics is a separate API on a separate host, so it does not go through request(). */
  async fetchChannelAnalytics(days: number, now: Date = new Date()): Promise<GatewayResult<ChannelAnalytics>> {
    const { startDate, endDate } = reportRange(now, days);
    const query = new URLSearchParams({
      ids: 'channel==MINE',
      startDate,
      endDate,
      metrics: ANALYTICS_METRICS.join(','),
      dimensions: 'day',
      sort: 'day'
    });
    const response = await this.doFetch(`${this.analyticsBaseUrl}/reports?${query.toString()}`, {
      headers: { Authorization: `Bearer ${await this.deps.accessToken()}` }
    });
    const body = await response.text();
    if (!response.ok) return failure(response.status, body, 'Reading your analytics');

    try {
      return { ok: true, value: parseAnalyticsReport(JSON.parse(body), startDate, endDate) };
    } catch {
      return {
        ok: false,
        reason: 'Your analytics came back in a form ShortStack could not read',
        code: 'bad_report',
        retryable: false
      };
    }
  }

  async listPastUploads(
    playlistId: string,
    options: { limit?: number; pageToken?: string } = {}
  ): Promise<GatewayResult<PastUploadPage>> {
    const limit = Math.min(50, Math.max(1, options.limit ?? 25));
    const page = options.pageToken === undefined ? '' : `&pageToken=${encodeURIComponent(options.pageToken)}`;
    const playlist = await this.request(
      `/playlistItems?part=contentDetails&maxResults=${limit}&playlistId=${encodeURIComponent(playlistId)}${page}`
    );
    const playlistBody = await playlist.text();
    if (!playlist.ok) return failure(playlist.status, playlistBody, 'Listing your uploads');

    const parsedPlaylist = JSON.parse(playlistBody) as {
      nextPageToken?: string;
      items?: Array<{ contentDetails?: { videoId?: string } }>;
    };
    const ids = (parsedPlaylist.items ?? [])
      .map((item) => item.contentDetails?.videoId)
      .filter((id): id is string => typeof id === 'string');
    const nextPageToken = parsedPlaylist.nextPageToken ?? null;
    if (ids.length === 0) return { ok: true, value: { items: [], nextPageToken } };

    const details = await this.request(`/videos?part=snippet,status&id=${ids.map(encodeURIComponent).join(',')}`);
    const detailsBody = await details.text();
    if (!details.ok) return failure(details.status, detailsBody, 'Reading your uploads');

    const parsed = JSON.parse(detailsBody) as {
      items?: Array<{
        id?: string;
        snippet?: {
          title?: string;
          description?: string;
          tags?: string[];
          categoryId?: string;
          publishedAt?: string;
          thumbnails?: Record<string, { url?: string }>;
        };
        status?: { privacyStatus?: string };
      }>;
    };

    const items: PastUpload[] = (parsed.items ?? [])
      .filter((item) => typeof item.id === 'string')
      .map((item) => {
        const thumbnails = item.snippet?.thumbnails ?? {};
        return {
          videoId: item.id as string,
          title: item.snippet?.title ?? '',
          description: item.snippet?.description ?? '',
          tags: Array.isArray(item.snippet?.tags) ? item.snippet.tags.filter((tag) => typeof tag === 'string') : [],
          categoryId: typeof item.snippet?.categoryId === 'string' ? item.snippet.categoryId : null,
          thumbnailUrl:
            thumbnails.medium?.url ?? thumbnails.default?.url ?? thumbnails.high?.url ?? null,
          publishedAt: item.snippet?.publishedAt ?? null,
          privacy: asPrivacy(item.status?.privacyStatus)
        };
      });

    return { ok: true, value: { items, nextPageToken } };
  }
}

/** Used whenever uploads are in dry-run: reads are refused rather than silently faked. */
export class DryRunYouTubeGateway implements YouTubeGateway {
  private readonly refusal: GatewayFailure = {
    ok: false,
    reason: 'ShortStack is running in dry-run mode, so it is not talking to YouTube',
    code: 'dry_run',
    retryable: false
  };

  async fetchChannelProfile(): Promise<GatewayResult<ChannelProfile>> {
    return this.refusal;
  }

  async fetchVideoStatus(): Promise<GatewayResult<VideoStatusSnapshot>> {
    return this.refusal;
  }

  async setPublishPlan(): Promise<GatewayResult<VideoStatusSnapshot>> {
    return this.refusal;
  }

  async listRecentUploads(): Promise<GatewayResult<RecentUpload[]>> {
    return this.refusal;
  }

  async fetchChannelAnalytics(): Promise<GatewayResult<ChannelAnalytics>> {
    return this.refusal;
  }

  async listPastUploads(): Promise<GatewayResult<PastUploadPage>> {
    return this.refusal;
  }
}
