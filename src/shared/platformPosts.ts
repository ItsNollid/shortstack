// Posting to TikTok and Instagram with ShortStack's help: the person posts in the platform's own app or website,
// and ShortStack prepares a file the platform takes, writes the caption, and keeps track of what went where.
import type { QueueItemDTO } from './dto';
import type { Platform, QueueState } from './queue';

export const OTHER_PLATFORMS = ['tiktok', 'instagram'] as const;
export type OtherPlatform = (typeof OTHER_PLATFORMS)[number];
export const isOtherPlatform = (value: unknown): value is OtherPlatform => value === 'tiktok' || value === 'instagram';

export const PLATFORM_NAMES: Record<Platform, string> = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram' };

export const POST_STATES = ['waiting', 'posted', 'skipped'] as const;
export type PostState = (typeof POST_STATES)[number];
export const isPostState = (value: unknown): value is PostState => (POST_STATES as readonly unknown[]).includes(value);

export interface PlatformPostDTO {
  queueId: number;
  platform: OtherPlatform;
  state: PostState;
  /** The post on the platform, when the person gave its link. */
  url: string | null;
  postedAt: string | null;
}

/** Each platform's own upload page, opened in the person's browser. ShortStack never signs in to them itself. */
export const UPLOAD_PAGES: Record<OtherPlatform, string> = {
  tiktok: 'https://www.tiktok.com/tiktokstudio/upload',
  instagram: 'https://www.instagram.com/'
};

/** TikTok's Content Posting API allows a 2,200-character caption; Instagram's media reference, 2,200 and 30 hashtags. */
export const CAPTION_LIMITS: Record<OtherPlatform, { maxChars: number; maxHashtags: number | null }> = {
  tiktok: { maxChars: 2200, maxHashtags: null },
  instagram: { maxChars: 2200, maxHashtags: 30 }
};

/** Hashtags that only mean something on YouTube. */
const YOUTUBE_ONLY: ReadonlySet<string> = new Set(['shorts', 'short', 'youtubeshorts', 'ytshorts', 'youtube', 'youtuber', 'subscribe']);

const hashtagsIn = (text: string): string[] => [...text.matchAll(/#[\p{L}\p{N}_]+/gu)].map((match) => match[0]);
const length = (text: string): number => [...text].length;

/**
 * The caption for TikTok or Instagram, from the video's YouTube details: the title, then its hashtags without the ones
 * that only mean something on YouTube, within the platform's limits. The rest of a YouTube description — links, most
 * of all — is left out: neither platform makes links in a caption clickable.
 */
export function captionFor(details: { title: string; description: string }, platform: OtherPlatform): string {
  const limits = CAPTION_LIMITS[platform];
  const title = [...details.title.trim()].slice(0, limits.maxChars).join('');

  const seen = new Set(hashtagsIn(title).map((tag) => tag.slice(1).toLowerCase()));
  const candidates: string[] = [];
  for (const tag of hashtagsIn(details.description)) {
    const key = tag.slice(1).toLowerCase();
    if (YOUTUBE_ONLY.has(key) || seen.has(key)) continue;
    seen.add(key);
    candidates.push(tag);
  }
  const room = limits.maxHashtags === null ? candidates.length : Math.max(0, limits.maxHashtags - hashtagsIn(title).length);

  const kept: string[] = [];
  let used = length(title);
  for (const tag of candidates.slice(0, room)) {
    const separator = kept.length === 0 ? (title === '' ? 0 : 2) : 1;
    if (used + separator + length(tag) > limits.maxChars) break;
    kept.push(tag);
    used += separator + length(tag);
  }
  if (kept.length === 0) return title;
  return title === '' ? kept.join(' ') : `${title}\n\n${kept.join(' ')}`;
}

const TIKTOK_HOSTS = new Set(['www.tiktok.com', 'tiktok.com', 'm.tiktok.com']);
const TIKTOK_SHORT_HOSTS = new Set(['vm.tiktok.com', 'vt.tiktok.com']);
const INSTAGRAM_HOSTS = new Set(['www.instagram.com', 'instagram.com']);

/** A link to a post on the platform in one tidy form, without tracking parameters, or null when it is not one. */
export function parsePostLink(platform: OtherPlatform, raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter((part) => part !== '');

  if (platform === 'tiktok') {
    const [first, second, third] = parts;
    if (TIKTOK_SHORT_HOSTS.has(host)) return parts.length === 1 && /^[A-Za-z0-9]+$/.test(first ?? '') ? `https://${host}/${first}/` : null;
    if (!TIKTOK_HOSTS.has(host)) return null;
    if (first === 't' && parts.length === 2 && /^[A-Za-z0-9]+$/.test(second ?? '')) return `https://www.tiktok.com/t/${second}/`;
    if (parts.length === 3 && /^@[\w.]+$/.test(first ?? '') && second === 'video' && /^\d{8,25}$/.test(third ?? '')) {
      return `https://www.tiktok.com/${first}/video/${third}`;
    }
    return null;
  }

  if (!INSTAGRAM_HOSTS.has(host)) return null;
  const at = parts.findIndex((part) => part === 'reel' || part === 'reels' || part === 'p');
  const code = at === -1 ? undefined : parts[at + 1];
  if (at === -1 || at > 1 || code === undefined || !/^[A-Za-z0-9_-]{5,40}$/.test(code)) return null;
  return `https://www.instagram.com/${parts[at] === 'p' ? 'p' : 'reel'}/${code}/`;
}

const BEFORE_APPROVAL: ReadonlySet<QueueState> = new Set(['pending', 'rejected']);

/** Whether the person has approved this video, which covers every platform it is going to. */
export function approvedForPosting(item: Pick<QueueItemDTO, 'state' | 'attention_from_state'>): boolean {
  if (item.state === 'needs_attention') return item.attention_from_state !== null && !BEFORE_APPROVAL.has(item.attention_from_state);
  return !BEFORE_APPROVAL.has(item.state);
}

export type PostEvent = { type: 'posted'; url: string | null } | { type: 'skip' } | { type: 'restore' };

export function nextPostState(current: PostState, event: PostEvent): { ok: true; state: PostState } | { ok: false; reason: string } {
  if (event.type === 'posted') return { ok: true, state: 'posted' };
  if (event.type === 'skip') {
    return current === 'posted'
      ? { ok: false, reason: 'It is already posted there. Delete it on the platform if it should not be, then undo it here.' }
      : { ok: true, state: 'skipped' };
  }
  return current === 'waiting' ? { ok: false, reason: 'There is nothing to undo' } : { ok: true, state: 'waiting' };
}

/** The file made for TikTok and Instagram, as the screen receives it. */
export interface PreparedFileDTO {
  sizeBytes: number | null;
  /** True when it was made earlier from this same file and reused. */
  reused: boolean;
  /** Anything either platform would still refuse about it. Empty when both take it. */
  problems: Record<OtherPlatform, string[]>;
}
