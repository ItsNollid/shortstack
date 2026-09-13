// Gathering everything the model needs for one video. Shared by the button on the review screen and
// by the background worker, so the two can never drift into producing different suggestions for the
// same video, which would be baffling to anyone using both.
import type Database from 'better-sqlite3';
import { findModel } from '../../shared/aiModels';
import { parseBrief, writingFacts } from '../../shared/insights';
import type { PastUpload } from '../../shared/pastUploads';
import { readActiveChannel } from '../db/channelRepo';
import { getQueueItem } from '../db/queueRepo';
import { readSettings } from '../db/settingsRepo';
import { readFrames } from '../media/frames';
import { readThumbnail } from '../media/thumbnails';
import { tagVocabulary } from '../../shared/channelTags';
import { hashtagNames, mentionedIn } from '../../shared/blockedNames';
import { buildHashtagBlock, hashtagDescription } from '../../shared/hashtags';
import type { MetadataSuggestion } from './metadataSuggestion';
import { generateMetadata, listModels, type AiResult } from './ollamaClient';
import { buildTags } from '../../shared/tags';

export interface DraftDeps {
  db: Database.Database;
  thumbnailDir: string;
  /** Only needed for the examples, and a failure there is never fatal. */
  listPastUploads(playlistId: string, options: { limit: number }): Promise<{ ok: boolean; value?: { items: PastUpload[] } }>;
}

/**
 * Past uploads change over days, and a drafting run asked for them once per video — two YouTube calls
 * each, so a folder of two hundred cost four hundred calls to fetch the same six videos. Kept for half
 * an hour instead.
 */
const PAST_UPLOADS_TTL_MS = 30 * 60_000;
const pastUploadsCache = new Map<string, { at: number; items: PastUpload[] }>();

export async function cachedPastUploads(
  deps: Pick<DraftDeps, 'listPastUploads'>,
  playlistId: string,
  now: number = Date.now()
): Promise<PastUpload[]> {
  const hit = pastUploadsCache.get(playlistId);
  if (hit !== undefined && now - hit.at < PAST_UPLOADS_TTL_MS) return hit.items;

  const items = await deps
    .listPastUploads(playlistId, { limit: 6 })
    .then((result) => (result.ok ? (result.value?.items ?? []) : null))
    .catch(() => null);

  // A failure is never cached: the next video should try again rather than inherit nothing. A list
  // that was good before is better than none while YouTube is not answering.
  if (items === null) return hit?.items ?? [];
  pastUploadsCache.set(playlistId, { at: now, items });
  return items;
}

/** Cleared on disconnect: a cached list of someone's uploads must not outlive their permission. */
export const clearPastUploadsCache = (): void => pastUploadsCache.clear();

export async function draftFor(deps: DraftDeps, queueId: number): Promise<AiResult<MetadataSuggestion>> {
  const { db } = deps;
  const item = getQueueItem(db, queueId);
  if (item === undefined) return { ok: false, code: 'error', reason: 'That video is no longer in the queue' };

  const { settings } = readSettings(db);
  // Always ask what is installed: it settles which model to use when none is configured, and tells
  // us whether that model can actually read an image, which decides whether sending it frames is
  // worth anything.
  const installed = await listModels({ host: settings.ai_host });
  if (!installed.ok && settings.ai_model === '') return installed;

  const available = installed.ok ? installed.value : [];
  const chosen = findModel(available, settings.ai_model) ?? (settings.ai_model === '' ? available[0] : undefined);
  const model = chosen?.name ?? settings.ai_model;
  const channel = readActiveChannel(db);

  // The two things that turn a guess into an answer: what this channel's own uploads look like, and
  // what is actually on screen in the video.
  const playlistId = channel?.uploadsPlaylistId ?? null;
  const examples = playlistId === null ? [] : await cachedPastUploads(deps, playlistId);

  // The strip if it has been decoded, otherwise the poster, which is small but better than nothing.
  // Either way a text-only model never receives them.
  const strip = await readFrames({ db, dir: deps.thumbnailDir }, queueId);
  const stills = strip.length > 0 ? strip : [await readThumbnail({ db, dir: deps.thumbnailDir }, queueId)];

  const suggestion = await generateMetadata(
    {
      model,
      vision: chosen?.vision,
      thinking: chosen?.thinking,
      // From the last time Analytics was opened. Free: no extra call per drafted video.
      findings: writingFacts(parseBrief(settings.insight_findings) ?? { usable: [], missing: [], videoCount: 0, tooEarly: true }),
      channelName: channel?.title ?? null,
      blockedNames: settings.ai_blocked_names,
      examples,
      frames: stills.filter((image): image is Buffer => image !== null).map((image) => image.toString('base64')),
      video: {
        filename: item.filename,
        game: item.game,
        durationSeconds: item.duration_s,
        width: item.width,
        height: item.height,
        currentTitle: item.title,
        currentDescription: item.description
      }
    },
    { host: settings.ai_host }
  );
  if (!suggestion.ok) return suggestion;

  // The description is assembled, never taken from the model. On a Short it is a block of hashtags
  // for search and nothing else, and asked to write one the model copied old hashtags wholesale,
  // invented round numbers or wrote "#gaming #shorts". The model's part is only the topics.
  const standing = tagVocabulary(examples.map((example) => example.description)).standing;

  // Measured: shown a lobby with a player list, the model offered the channel's own name and a
  // friend's gamertag as topics and as tags, though told not to. So the names that must never appear —
  // the channel's own, and the person's list — are taken out after it answers, wherever they turn up.
  const names = [channel?.title ?? '', ...settings.ai_blocked_names].filter((name) => name.trim() !== '');
  const topics = (suggestion.value.topics ?? []).filter((topic) => !mentionedIn(topic, names) && !hashtagNames(topic, names));
  const block = buildHashtagBlock({
    game: item.game,
    topics,
    standing: standing.filter((tag) => !hashtagNames(tag, names)),
    exclude: names
  });
  // Built like the description: the game and this clip first, then what the model offered, once anything
  // generic, about another game or naming someone is taken out.
  const tags = buildTags({ game: item.game, topics, modelTags: suggestion.value.tags, names });
  // A title is a sentence, and cutting a name out of one leaves it broken, so a title that names
  // someone is not used at all: the video keeps the title it already had.
  const title = mentionedIn(suggestion.value.title, names) ? item.title : suggestion.value.title;
  return { ok: true, value: { ...suggestion.value, title, topics, tags, description: hashtagDescription(block) } };
}
