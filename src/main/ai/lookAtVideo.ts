// Has the local model look at a video's stills, one at a time, and keeps what it saw.
//
// Asked for, never automatic: every still is a request to a 6GB model — about a second each with the
// graphics card to itself, nearer twenty when something else is using it — and the draft worker may be
// using it too. The conclusions are drawn in code from what is kept, so they can be shown again without
// asking the model anything.
import type Database from 'better-sqlite3';
import { findModel } from '../../shared/aiModels';
import { buildReport, type StillReading, type VideoReport } from '../../shared/videoReading';
import { getQueueItem } from '../db/queueRepo';
import { readReading, saveReading } from '../db/readingRepo';
import { readSettings } from '../db/settingsRepo';
import { readFrameSet, type Still } from '../media/frames';
import { listModels, type AiResult, type OllamaDeps } from './ollamaClient';
import { readStill, type StillQuestion } from './stillReader';

export interface LookDeps {
  db: Database.Database;
  thumbnailDir: string;
  now?: () => Date;
  /** Overridden in tests, to count the questions asked. */
  read?: (question: StillQuestion, deps: OllamaDeps) => Promise<AiResult<StillReading>>;
}

/** What was kept for a video, with the conclusions drawn again. Null when it has not been looked at. */
export function storedReport(db: Database.Database, queueId: number): VideoReport | null {
  const item = getQueueItem(db, queueId);
  if (item === undefined) return null;
  const stored = readReading(db, item.video_id);
  return stored === null ? null : buildReport(stored.model, stored.readAt, stored.stills);
}

const looking = new Set<number>();

export async function lookAtVideo(deps: LookDeps, queueId: number): Promise<AiResult<VideoReport>> {
  const { db } = deps;
  const item = getQueueItem(db, queueId);
  if (item === undefined) return { ok: false, code: 'error', reason: 'That video is no longer in the queue' };
  if (looking.has(item.video_id)) return { ok: false, code: 'error', reason: 'ShortStack is already looking at this video' };

  looking.add(item.video_id);
  try {
    const set = await readFrameSet({ db, dir: deps.thumbnailDir }, queueId);
    const stills: Array<Still & { part: string }> = [
      ...(set?.strip ?? []).map((still, index) => ({ ...still, part: `s${index}` })),
      ...(set?.opening ?? []).map((still, index) => ({ ...still, part: `o${index}` }))
    ];
    if (stills.length === 0) {
      return {
        ok: false,
        code: 'error',
        reason: 'There are no stills from this video yet. ShortStack draws them in the background while it is open.'
      };
    }

    const { settings } = readSettings(db);
    const host = { host: settings.ai_host };
    const installed = await listModels(host);
    if (!installed.ok) return installed;

    // Only a model that can see is any use here. The one chosen for writing is preferred when it can.
    const chosen = findModel(installed.value, settings.ai_model);
    const model = chosen?.vision === true ? chosen : installed.value.find((each) => each.vision);
    if (model === undefined) {
      return {
        ok: false,
        code: 'model_unsupported',
        reason: 'Looking at a video needs a model that can see images, such as qwen3-vl:8b. None is installed.'
      };
    }

    const read = deps.read ?? readStill;
    const readings: StillReading[] = [];
    let failure: Extract<AiResult<never>, { ok: false }> | null = null;
    for (const still of stills) {
      const answer = await read({ model: model.name, thinking: model.thinking, image: still.image, part: still.part, time: still.time }, host);
      if (answer.ok) {
        readings.push(answer.value);
        continue;
      }
      failure ??= answer;
      // One muddled answer is that still's problem. Anything else — Ollama gone, the model too big for
      // memory, a timeout — will be the same for every still after it.
      if (answer.code !== 'bad_output') break;
    }
    if (readings.length === 0) return failure ?? { ok: false, code: 'error', reason: 'The model could not look at the video' };

    const readAt = (deps.now?.() ?? new Date()).toISOString();
    saveReading(db, item.video_id, { model: model.name, readAt, stills: readings });
    return { ok: true, value: buildReport(model.name, readAt, readings) };
  } finally {
    looking.delete(item.video_id);
  }
}
