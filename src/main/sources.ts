// Turning what was typed into the long-video field into a long video: a title and, when it is up, a link.
import { parseSourceInput, watchUrl, type SourceInput, type SourceVideo } from '../shared/sourceVideo';
import type { GatewayResult } from './youtube/gateway';

export type ResolvedSource = { ok: true; source: SourceVideo } | { ok: false; problem: string };

/**
 * A link is named by YouTube, since it already knows the title — asking someone to retype it was the
 * wrong way round. It is only asked when it has to be: a link this video already has keeps its title,
 * and a link another Short already uses borrows that title, both for nothing. Asking costs one unit.
 * If YouTube cannot answer, a name the person gave will do; without one, they are asked for it.
 */
export async function resolveSource(
  input: SourceInput,
  stored: { title: string | null; url: string | null },
  known: readonly SourceVideo[],
  lookupTitle: (videoId: string) => Promise<GatewayResult<{ title: string }>>
): Promise<ResolvedSource> {
  const parsed = parseSourceInput(input);
  if (!parsed.ok) return parsed;
  if (parsed.videoId === null) return { ok: true, source: { title: parsed.title as string, url: null } };

  const url = watchUrl(parsed.videoId);
  if (url === stored.url && stored.title !== null) return { ok: true, source: { title: stored.title, url } };
  const already = known.find((source) => source.url === url);
  if (already !== undefined) return { ok: true, source: { title: already.title, url } };

  const found = await lookupTitle(parsed.videoId);
  if (found.ok) return { ok: true, source: { title: found.value.title, url } };
  if (parsed.title !== null) return { ok: true, source: { title: parsed.title, url } };
  return { ok: false, problem: `ShortStack could not get that video’s title from YouTube (${found.reason}). Name it yourself for now.` };
}
