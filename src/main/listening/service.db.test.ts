import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeSetting } from '../db/settingsRepo';
import { createTestDb, seedQueueItem } from '../db/testFixtures';
import type { downloadVerified } from './downloads';
import { installEngine, installModel, type Extract } from './install';
import { ListeningService } from './service';
import type { transcribeFile } from './transcribe';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

const fakeDownload: typeof downloadVerified = async (item) => {
  await fs.mkdir(path.dirname(item.dest), { recursive: true });
  await fs.writeFile(item.dest, 'downloaded');
  return { ok: true, path: item.dest };
};
const fakeExtract: Extract = async (_zip, dest) => {
  await fs.mkdir(path.join(dest, 'Release'), { recursive: true });
  for (const file of ['whisper-cli.exe', 'cublas64_12.dll']) await fs.writeFile(path.join(dest, 'Release', file), '');
};

async function service(overrides: { transcribe?: typeof transcribeFile; failDownload?: boolean } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'shortstack-listening-'));
  dirs.push(root);
  const db = createTestDb();
  let changes = 0;
  const heardFiles: string[] = [];
  const listening = new ListeningService({
    db,
    root,
    machine: async () => ({ hasNvidia: true, memoryBytes: 32 * 1024 ** 3, cards: ['NVIDIA GeForce RTX 3080'] }),
    findTools: async () => ({ ffmpeg: 'ffmpeg.exe', ffprobe: 'ffprobe.exe' }),
    installEngine: (deps, kind) => installEngine({ ...deps, download: fakeDownload, extract: fakeExtract }, kind),
    installModel: (deps, id) =>
      overrides.failDownload === true
        ? Promise.resolve({ ok: false, reason: 'huggingface.co answered 503' })
        : installModel({ ...deps, download: fakeDownload }, id),
    transcribe:
      overrides.transcribe ??
      (async (_deps, filePath) => {
        heardFiles.push(filePath);
        return { ok: true, segments: [{ from: 0, to: 1200, text: "I'm going to bed, guys." }], backend: 'gpu', elapsedMs: 900 };
      }),
    onChange: () => {
      changes += 1;
    },
    now: () => new Date('2026-09-14T10:00:00.000Z')
  });
  return { db, root, listening, heardFiles, changes: () => changes };
}

describe('setting listening up', () => {
  it('offers the graphics card and a larger model on a PC with an NVIDIA card, and says what is missing', async () => {
    const { listening } = await service();
    const status = await listening.status();
    expect(status.recommended).toEqual({ engine: 'gpu', modelId: 'medium.en-q5_0' });
    expect(status.resolved).toBeNull();
    expect(status.notReady).toBe('Download a listening engine first');
  });

  it('downloads one thing at a time, and is ready once an engine and the chosen model are in', async () => {
    const { db, listening } = await service();
    expect(listening.start({ engine: 'gpu' })).toEqual({ ok: true });
    expect(listening.start({ model: 'medium.en-q5_0' })).toEqual({ ok: false, reason: 'Another download is still going' });
    expect((await listening.status()).downloading).toMatchObject({ engine: 'gpu', label: 'NVIDIA graphics card engine' });
    await listening.settled();

    expect(listening.start({ model: 'medium.en-q5_0' })).toEqual({ ok: true });
    await listening.settled();
    writeSetting(db, 'listen_model', 'medium.en-q5_0');

    const status = await listening.status();
    expect(status).toMatchObject({ engines: ['gpu'], models: ['medium.en-q5_0'], downloading: null, problem: null, notReady: null });
    expect(status.resolved).toMatchObject({ engine: 'gpu', modelId: 'medium.en-q5_0', englishOnly: true });
  });

  it('keeps the reason a download failed, until the next one starts', async () => {
    const { listening } = await service({ failDownload: true });
    listening.start({ model: 'small.en-q5_1' });
    await listening.settled();
    expect((await listening.status()).problem).toBe('huggingface.co answered 503');
  });

  it('refuses a model that is not in the list', async () => {
    const { listening } = await service();
    expect(listening.start({ model: 'mystery' })).toMatchObject({ ok: false });
  });
});

describe('listening to a video', () => {
  async function ready() {
    const setup = await service();
    setup.listening.start({ engine: 'gpu' });
    await setup.listening.settled();
    setup.listening.start({ model: 'small.en-q5_1' });
    await setup.listening.settled();
    writeSetting(setup.db, 'listen_model', 'small.en-q5_1');
    return setup;
  }

  it('listens once and keeps what was said, and says where it ran', async () => {
    const { db, listening, heardFiles } = await ready();
    const queueId = seedQueueItem(db, { filename: 'bed.mov' });

    expect(await listening.speechFor(queueId)).toBe("I'm going to bed, guys.");
    expect(await listening.speechFor(queueId)).toBe("I'm going to bed, guys.");
    expect(heardFiles).toHaveLength(1);
    expect((await listening.status()).lastBackend).toBe('gpu');
  });

  it('does not listen when only asked for what is kept', async () => {
    const { db, listening, heardFiles } = await ready();
    const queueId = seedQueueItem(db, { filename: 'kept.mov' });
    expect(await listening.transcriptFor(queueId, false)).toEqual({ ok: true, transcript: null });
    expect(heardFiles).toHaveLength(0);
  });

  it('says why it cannot listen yet', async () => {
    const { db, listening } = await service();
    const queueId = seedQueueItem(db, { filename: 'clip.mov' });
    expect(await listening.transcriptFor(queueId, true)).toEqual({ ok: false, reason: 'Download a listening engine first' });
    expect(await listening.speechFor(queueId)).toBeNull();
  });

  it('passes on what went wrong while listening, and keeps nothing', async () => {
    const setup = await service({ transcribe: async () => ({ ok: false, reason: 'This video has no sound to listen to' }) });
    setup.listening.start({ engine: 'cpu' });
    await setup.listening.settled();
    setup.listening.start({ model: 'base.en-q5_1' });
    await setup.listening.settled();
    writeSetting(setup.db, 'listen_model', 'base.en-q5_1');
    const queueId = seedQueueItem(setup.db, { filename: 'silent.mov' });
    expect(await setup.listening.transcriptFor(queueId, true)).toEqual({ ok: false, reason: 'This video has no sound to listen to' });
    expect(await setup.listening.transcriptFor(queueId, false)).toEqual({ ok: true, transcript: null });
  });
});
