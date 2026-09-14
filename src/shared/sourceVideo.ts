// The long video a Short was cut from. On this channel one long video becomes five to ten Shorts, so
// which one is worth knowing: it tells the model what the clip is part of, gives Studio the video to
// link as related, and lets the schedule keep Shorts from one video from all going out on one day.
//
// The link is what identifies it. YouTube knows its title, so pasting the link is enough; a name typed
// by hand is only for a long video that is not up yet, and gives way to the real title once it is.
import { parseVideoId } from './youtubeUrl';

export interface SourceVideo {
  title: string;
  /** A YouTube watch link, when the long video is up. */
  url: string | null;
}

export const SOURCE_TITLE_MAX_CHARS = 100;

/** What the field sends: a link, a name for a long video not up yet, or both. */
export interface SourceInput {
  title: string;
  link: string;
}

export type ParsedSource = { ok: true; title: string | null; videoId: string | null } | { ok: false; problem: string };

export function parseSourceInput(input: SourceInput): ParsedSource {
  const title = input.title.replace(/[<>]/g, '').trim();
  const link = input.link.trim();
  if (title === '' && link === '') {
    return { ok: false, problem: 'Paste the long video’s YouTube link, or name it if it is not up yet' };
  }
  if ([...title].length > SOURCE_TITLE_MAX_CHARS) return { ok: false, problem: `Keep the name to ${SOURCE_TITLE_MAX_CHARS} characters` };
  if (link === '') return { ok: true, title, videoId: null };

  const videoId = parseVideoId(link);
  if (videoId === null) return { ok: false, problem: 'That is not a YouTube video link' };
  return { ok: true, title: title === '' ? null : title, videoId };
}

/** One form of link for a video, however it was pasted. */
export const watchUrl = (videoId: string): string => `https://www.youtube.com/watch?v=${videoId}`;

/** Shorts are from the same long video when its titles match, whatever the capitals and spacing. */
export function sourceKey(title: string | null | undefined): string | null {
  const key = (title ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  return key === '' ? null : key;
}
