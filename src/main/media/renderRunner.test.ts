import * as fsSync from 'fs';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { findTools, renderForPlatforms, toolFolders } from './renderRunner';

describe('finding ffmpeg', () => {
  it('looks on PATH first, then where Windows installs end up', () => {
    const folders = toolFolders({ PATH: ['D:\\tools', 'E:\\bin'].join(path.delimiter), LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' }, 'win32');
    expect(folders.slice(0, 3)).toEqual(['D:\\tools', 'E:\\bin', 'C:\\ffmpeg\\bin']);
    expect(folders[3]).toContain(path.join('Microsoft', 'WinGet', 'Links'));
  });

  it('wants both tools in the same folder', async () => {
    const present = new Set([path.join('A', 'ffmpeg.exe'), path.join('B', 'ffmpeg.exe'), path.join('B', 'ffprobe.exe')]);
    const tools = await findTools({ PATH: ['A', 'B'].join(path.delimiter) }, async (candidate) => present.has(candidate), 'win32');
    expect(tools).toEqual({ ffmpeg: path.join('B', 'ffmpeg.exe'), ffprobe: path.join('B', 'ffprobe.exe') });
  });

  it('says so when it is nowhere', async () => {
    expect(await findTools({ PATH: 'nowhere' }, async () => false, 'linux')).toBeNull();
  });
});

// Against a real render of this channel's, where this computer has ffmpeg and the sample clips.
const sampleConfig = path.join(__dirname, '..', '..', '..', 'e2e', 'sample-dir.txt');
const sampleFolder = fsSync.existsSync(sampleConfig) ? fsSync.readFileSync(sampleConfig, 'utf8').trim() : '';
const sample =
  sampleFolder !== '' && fsSync.existsSync(sampleFolder)
    ? fsSync
        .readdirSync(sampleFolder)
        .filter((name) => name.toLowerCase().endsWith('.mov'))
        .map((name) => path.join(sampleFolder, name))
        .sort((a, b) => fsSync.statSync(a).size - fsSync.statSync(b).size)[0]
    : undefined;
const tools = await findTools();
const scratch: string[] = [];
afterAll(async () => {
  await Promise.all(scratch.map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe.skipIf(tools === null || sample === undefined)('rendering a real clip', () => {
  it('makes a file both platforms take, and reuses it while the source is unchanged', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'shortstack-render-'));
    scratch.push(dir);
    const deps = { tools: tools as NonNullable<typeof tools>, dir };

    const first = await renderForPlatforms(deps, { videoId: 1, filePath: sample as string });
    if (!first.ok) throw new Error(first.reason);
    expect(first.reused).toBe(false);
    expect(first.info.video?.codec).toBe('h264');
    expect(first.info.audio?.codec).toBe('aac');
    expect(first.problems).toEqual({ tiktok: [], instagram: [] });

    const again = await renderForPlatforms(deps, { videoId: 1, filePath: sample as string });
    expect(again).toMatchObject({ ok: true, reused: true });
  }, 120_000);
});
