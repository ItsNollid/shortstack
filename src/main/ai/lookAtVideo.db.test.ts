import type Database from 'better-sqlite3';
import * as fs from 'fs/promises';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { StillReading } from '../../shared/videoReading';
import { writeSetting } from '../db/settingsRepo';
import { createTestDb, seedQueueItem } from '../db/testFixtures';
import { saveFrames } from '../media/frames';
import { lookAtVideo, storedReport } from './lookAtVideo';

let db: Database.Database;
let dir: string;
const cleanups: Array<() => Promise<void>> = [];

beforeEach(async () => {
  db = createTestDb();
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'shortstack-look-'));
  const made = dir;
  cleanups.push(() => fs.rm(made, { recursive: true, force: true }));
});

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

const jpeg = (fill: number): Buffer => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(32, fill)]);

interface Asked {
  model: string;
  images: string[];
}

/** A stand-in for Ollama: lists the models it is given, and answers each still in turn. */
async function startOllama(models: readonly object[], answers: readonly object[]): Promise<{ asked: Asked[] }> {
  const asked: Asked[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      if (req.url === '/api/tags') {
        res.end(JSON.stringify({ models }));
        return;
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Asked;
      asked.push({ model: body.model, images: body.images });
      const answer = answers[Math.min(asked.length, answers.length) - 1];
      res.end(JSON.stringify({ response: JSON.stringify(answer) }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      })
  );
  writeSetting(db, 'ai_host', `http://127.0.0.1:${(server.address() as { port: number }).port}`);
  return { asked };
}

const VISION = { name: 'qwen3-vl:8b', capabilities: ['vision', 'completion', 'thinking'] };
const TEXT_ONLY = { name: 'llama3.2:latest', capabilities: ['completion'] };

const ANSWERS = [
  { scene: 'gameplay', appeal: 4, what: 'a creeper sneaks up' },
  { scene: 'gameplay', appeal: 5, what: 'a creeper explodes' },
  { scene: 'menu', appeal: 2, what: 'the pause menu' },
  { scene: 'loading', appeal: 1, what: 'a loading bar' },
  { scene: 'lobby', appeal: 1, what: 'players wait to start' }
];

async function videoWithStills(): Promise<number> {
  const queueId = seedQueueItem(db, { filename: 'clip.mov' });
  const saved = await saveFrames({ db, dir }, queueId, [jpeg(1), jpeg(2), jpeg(3)], {
    times: [2, 5, 8],
    opening: [jpeg(4), jpeg(5)],
    openingTimes: [0.25, 1],
    duration: 10
  });
  expect(saved.ok).toBe(true);
  return queueId;
}

const played = (part: string, time: number | null): StillReading => ({ part, time, scene: 'gameplay', appeal: 3, what: 'play' });

describe('looking at a video', () => {
  it('asks about each still on its own, with a model that can see, and keeps what it said', async () => {
    const queueId = await videoWithStills();
    // The model chosen for writing cannot see, so the installed one that can is used instead.
    writeSetting(db, 'ai_model', 'llama3.2:latest');
    const ollama = await startOllama([TEXT_ONLY, VISION], ANSWERS);

    const result = await lookAtVideo({ db, thumbnailDir: dir, now: () => new Date('2026-09-14T10:00:00.000Z') }, queueId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(ollama.asked.map((ask) => [ask.model, ask.images.length])).toEqual(Array(5).fill(['qwen3-vl:8b', 1]));
    // The strip first, then the opening.
    expect(ollama.asked[0]?.images[0]).toBe(jpeg(1).toString('base64'));
    expect(ollama.asked[3]?.images[0]).toBe(jpeg(4).toString('base64'));

    expect(result.value.cover).toEqual({ part: 's1', time: 5, scene: 'gameplay', what: 'a creeper explodes' });
    expect(result.value.hook).toMatchObject({ weak: true, scene: 'lobby' });
    expect(storedReport(db, queueId)).toEqual(result.value);
  });

  it('keeps going past one muddled answer, and stops when every still after would fail the same way', async () => {
    const queueId = await videoWithStills();
    await startOllama([VISION], []);

    let calls = 0;
    const muddled = await lookAtVideo(
      {
        db,
        thumbnailDir: dir,
        read: async (question) => {
          calls += 1;
          return question.part === 's0'
            ? { ok: false, code: 'bad_output', reason: 'The model did not describe the still in a usable way' }
            : { ok: true, value: played(question.part, question.time) };
        }
      },
      queueId
    );
    expect(calls).toBe(5);
    expect(muddled.ok && muddled.value.stills.map((still) => still.part)).toEqual(['s1', 's2', 'o0', 'o1']);

    calls = 0;
    const gone = await lookAtVideo(
      {
        db,
        thumbnailDir: dir,
        read: async () => {
          calls += 1;
          return { ok: false, code: 'timeout', reason: 'The model took too long to answer' };
        }
      },
      queueId
    );
    expect(calls).toBe(1);
    expect(gone).toMatchObject({ ok: false, code: 'timeout' });
    // A failed second look does not throw away the first.
    expect(storedReport(db, queueId)?.stills).toHaveLength(4);
  });

  it('needs a model that can see', async () => {
    const queueId = await videoWithStills();
    const ollama = await startOllama([TEXT_ONLY], ANSWERS);
    expect(await lookAtVideo({ db, thumbnailDir: dir }, queueId)).toMatchObject({ ok: false, code: 'model_unsupported' });
    expect(ollama.asked).toEqual([]);
  });

  it('says there is nothing to look at yet, without asking the model', async () => {
    const queueId = seedQueueItem(db, { filename: 'clip.mov' });
    const ollama = await startOllama([VISION], ANSWERS);
    expect(await lookAtVideo({ db, thumbnailDir: dir }, queueId)).toMatchObject({ ok: false, code: 'error' });
    expect(ollama.asked).toEqual([]);
  });

  it('forgets what it saw once the stills are drawn again', async () => {
    const queueId = await videoWithStills();
    await startOllama([VISION], ANSWERS);
    expect((await lookAtVideo({ db, thumbnailDir: dir }, queueId)).ok).toBe(true);

    await saveFrames({ db, dir }, queueId, [jpeg(9)], { times: [3], opening: [], openingTimes: [], duration: 10 });
    expect(storedReport(db, queueId)).toBeNull();
  });
});
