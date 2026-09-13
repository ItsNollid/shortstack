// Gathering everything the model needs for one video. Shared by the button on the review screen and
// by the background worker, so the two can never drift into producing different suggestions for the
// same video, which would be baffling to anyone using both.
import type Database from 'better-sqlite3';
import { findModel } from '../../shared/aiModels';
import type { PastUpload } from '../../shared/pastUploads';
import { readActiveChannel } from '../db/channelRepo';
import { getQueueItem } from '../db/queueRepo';
import { readSettings } from '../db/settingsRepo';
import { readFrames } from '../media/frames';
import { readThumbnail } from '../media/thumbnails';
import type { MetadataSuggestion } from './metadataSuggestion';
import { generateMetadata, listModels, type AiResult } from './ollamaClient';

export interface DraftDeps {
  db: Database.Database;
  thumbnailDir: string;
  /** Only needed for the examples, and a failure there is never fatal. */
  listPastUploads(playlistId: string, options: { limit: number }): Promise<{ ok: boolean; value?: { items: PastUpload[] } }>;
}

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
  const examples =
    playlistId === null
      ? []
      : await deps
          .listPastUploads(playlistId, { limit: 6 })
          .then((result) => (result.ok ? (result.value?.items ?? []) : []))
          .catch(() => []);

  // The strip if it has been decoded, otherwise the poster, which is small but better than nothing.
  // Either way a text-only model never receives them.
  const strip = await readFrames({ db, dir: deps.thumbnailDir }, queueId);
  const stills = strip.length > 0 ? strip : [await readThumbnail({ db, dir: deps.thumbnailDir }, queueId)];

  return generateMetadata(
    {
      model,
      vision: chosen?.vision,
      channelName: channel?.title ?? null,
      examples,
      frames: stills.filter((image): image is Buffer => image !== null).map((image) => image.toString('base64')),
      video: {
        filename: item.filename,
        durationSeconds: item.duration_s,
        width: item.width,
        height: item.height,
        currentTitle: item.title,
        currentDescription: item.description
      }
    },
    { host: settings.ai_host }
  );
}
