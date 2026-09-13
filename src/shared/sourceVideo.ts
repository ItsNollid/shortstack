// The long video a Short was cut from. On this channel one long video becomes five to ten Shorts, so
// which one is worth knowing: it tells the model what the clip is part of, gives Studio the video to
// link as related, and lets the schedule keep Shorts from one video from all going out on one day.
import { parseVideoId } from './youtubeUrl';

export interface SourceVideo {
  title: string;
  /** A YouTube watch link, when known. */
  url: string | null;
}

export const SOURCE_TITLE_MAX_CHARS = 100;

export type CheckedSource = { ok: true; source: SourceVideo } | { ok: false; problem: string };

/** A title, and a link if there is one. The title is what matters; the link has to be a YouTube video. */
export function checkSource(input: { title: string; link: string }): CheckedSource {
  const title = input.title.replace(/[<>]/g, '').trim();
  const link = input.link.trim();
  if (title === '') {
    return { ok: false, problem: link === '' ? 'Give the long video a title' : 'Give the long video a title as well as its link' };
  }
  if ([...title].length > SOURCE_TITLE_MAX_CHARS) return { ok: false, problem: `Keep the title to ${SOURCE_TITLE_MAX_CHARS} characters` };
  if (link === '') return { ok: true, source: { title, url: null } };

  const id = parseVideoId(link);
  if (id === null) return { ok: false, problem: 'That is not a YouTube video link' };
  return { ok: true, source: { title, url: `https://www.youtube.com/watch?v=${id}` } };
}

/** Shorts are from the same long video when its titles match, whatever the capitals and spacing. */
export function sourceKey(title: string | null | undefined): string | null {
  const key = (title ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  return key === '' ? null : key;
}
