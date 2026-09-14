import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import type { downloadVerified } from './downloads';
import { checkModelFile, installEngine, installModel, readInstalled, removeEngine, removeModel, type Extract } from './install';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function root(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'shortstack-install-'));
  dirs.push(dir);
  return dir;
}

/** Writes a stand-in for the downloaded file instead of fetching it. */
const fakeDownload: typeof downloadVerified = async (item) => {
  await fs.mkdir(path.dirname(item.dest), { recursive: true });
  await fs.writeFile(item.dest, 'downloaded');
  return { ok: true, path: item.dest };
};

/** Unpacks the way the real builds are laid out: everything in a Release folder. */
const fakeExtract =
  (files: string[]): Extract =>
  async (_zip, dest) => {
    await fs.mkdir(path.join(dest, 'Release'), { recursive: true });
    for (const file of files) await fs.writeFile(path.join(dest, 'Release', file), '');
  };

describe('installing an engine', () => {
  it('unpacks it, finds whisper-cli, and records it as installed', async () => {
    const dir = await root();
    const result = await installEngine({ root: dir, download: fakeDownload, extract: fakeExtract(['whisper-cli.exe', 'ggml-cpu-x64.dll']) }, 'cpu');
    expect(result.ok).toBe(true);
    const state = await readInstalled(dir);
    expect(state.engines.cpu?.cliPath).toBe(path.join(dir, 'engines', 'cpu', 'Release', 'whisper-cli.exe'));
    expect(state.engines.gpu).toBeUndefined();
    // The zip is gone once unpacked.
    await expect(fs.access(path.join(dir, 'downloads', 'whisper-bin-x64.zip'))).rejects.toThrow();
  });

  it('refuses a graphics card build without the NVIDIA library it needs, and installs nothing', async () => {
    const dir = await root();
    const result = await installEngine({ root: dir, download: fakeDownload, extract: fakeExtract(['whisper-cli.exe', 'ggml-cuda.dll', 'cudart64_110.dll']) }, 'gpu');
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.reason).toContain('cuBLAS');
    expect((await readInstalled(dir)).engines.gpu).toBeUndefined();
  });

  it('accepts one that has it', async () => {
    const dir = await root();
    const result = await installEngine({ root: dir, download: fakeDownload, extract: fakeExtract(['whisper-cli.exe', 'ggml-cuda.dll', 'cublas64_12.dll']) }, 'gpu');
    expect(result.ok).toBe(true);
    await removeEngine(dir, 'gpu');
    expect((await readInstalled(dir)).engines.gpu).toBeUndefined();
  });

  it('passes on a failed or cancelled download', async () => {
    const cancelled = await installEngine(
      { root: await root(), download: async () => ({ ok: false, code: 'cancelled', reason: 'The download was cancelled' }) },
      'cpu'
    );
    expect(cancelled).toEqual({ ok: false, reason: 'The download was cancelled', cancelled: true });
  });

  it('says so when the download holds no engine', async () => {
    const result = await installEngine({ root: await root(), download: fakeDownload, extract: fakeExtract(['README.md']) }, 'cpu');
    expect(result).toEqual({ ok: false, reason: 'The download has no whisper-cli.exe in it' });
  });
});

describe('installing a model', () => {
  it('counts only models it downloaded and verified, and forgets a removed one', async () => {
    const dir = await root();
    expect((await installModel({ root: dir, download: fakeDownload }, 'small.en-q5_1')).ok).toBe(true);
    // A file dropped in by hand has not been checked, so it is not listed.
    await fs.writeFile(path.join(dir, 'models', 'ggml-base.en-q5_1.bin'), 'unchecked');
    expect((await readInstalled(dir)).models).toEqual(['small.en-q5_1']);

    await removeModel(dir, 'small.en-q5_1');
    expect((await readInstalled(dir)).models).toEqual([]);
  });

  it('refuses a model that is not in the list', async () => {
    expect(await installModel({ root: await root(), download: fakeDownload }, 'mystery')).toMatchObject({ ok: false });
  });
});

describe('a model already on this computer', () => {
  it('is accepted when it looks like a whisper.cpp model, and says whether it is English only', async () => {
    const dir = await root();
    const english = path.join(dir, 'ggml-small.en.bin');
    await fs.writeFile(english, Buffer.alloc(11_000_000));
    expect(await checkModelFile(english)).toEqual({ ok: true, englishOnly: true });

    const every = path.join(dir, 'ggml-medium.bin');
    await fs.writeFile(every, Buffer.alloc(11_000_000));
    expect(await checkModelFile(every)).toEqual({ ok: true, englishOnly: false });
  });

  it('is refused when it is not one', async () => {
    const dir = await root();
    const small = path.join(dir, 'ggml-tiny.bin');
    await fs.writeFile(small, 'tiny');
    expect(await checkModelFile(small)).toMatchObject({ ok: false });
    expect(await checkModelFile(path.join(dir, 'song.mp3'))).toMatchObject({ ok: false });
    expect(await checkModelFile(path.join(dir, 'ggml-gone.bin'))).toMatchObject({ ok: false });
  });
});
