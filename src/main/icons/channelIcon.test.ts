import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { solidRgba } from './circle';
import {
  ICON_SIZES,
  buildIconSet,
  clearIconCache,
  fetchChannelIcons,
  readIconCache,
  writeIconCache
} from './channelIcon';

const CORAL = { r: 0xff, g: 0x4e, b: 0x45 };
const goodDecoder = (_bytes: Buffer, size: number): Buffer => solidRgba(size, CORAL);

const dirs: string[] = [];
const tempDir = async (): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'shortstack-icons-'));
  dirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('buildIconSet', () => {
  it('produces a circular PNG for every size Windows might ask for', () => {
    const set = buildIconSet(Buffer.from('avatar'), goodDecoder);
    expect(set).not.toBeNull();
    for (const size of ICON_SIZES) {
      const png = set?.pngs.get(size);
      expect(png?.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(png?.readUInt32BE(16)).toBe(size);
    }
  });

  it('gives up entirely rather than returning a half-built set', () => {
    const failsAt64 = (bytes: Buffer, size: number): Buffer | null => (size === 64 ? null : solidRgba(size, CORAL));
    expect(buildIconSet(Buffer.from('avatar'), failsAt64)).toBeNull();
  });

  it('rejects a decoder that returns the wrong number of pixels', () => {
    const wrongSize = (): Buffer => solidRgba(8, CORAL);
    expect(buildIconSet(Buffer.from('avatar'), wrongSize)).toBeNull();
  });
});

describe('the icon cache', () => {
  it('survives a round trip to disk', async () => {
    const dir = await tempDir();
    const set = buildIconSet(Buffer.from('avatar'), goodDecoder);
    await writeIconCache(dir, set as NonNullable<typeof set>);

    const loaded = await readIconCache(dir);
    expect(loaded).not.toBeNull();
    expect(loaded?.ico.equals(set?.ico as Buffer)).toBe(true);
    for (const size of ICON_SIZES) {
      expect(loaded?.pngs.get(size)?.equals(set?.pngs.get(size) as Buffer)).toBe(true);
    }
  });

  it('reports nothing cached instead of throwing when the folder is empty', async () => {
    expect(await readIconCache(await tempDir())).toBeNull();
  });

  it('leaves nothing behind when the channel is disconnected', async () => {
    const dir = await tempDir();
    const set = buildIconSet(Buffer.from('avatar'), goodDecoder);
    await writeIconCache(dir, set as NonNullable<typeof set>);
    await clearIconCache(dir);

    expect(await readIconCache(dir)).toBeNull();
    expect(await fs.readdir(dir)).toEqual([]);
  });

  it('clears cleanly when there was nothing there to begin with', async () => {
    await expect(clearIconCache(await tempDir())).resolves.toBeUndefined();
  });
});

describe('fetchChannelIcons', () => {
  it('asks for the picture at the largest size it draws', async () => {
    const asked: string[] = [];
    await fetchChannelIcons('https://yt3.googleusercontent.com/abc=s88-c-k-c0x00ffffff-no-rj', {
      get: async (url) => {
        asked.push(url);
        return Buffer.from('avatar');
      },
      decode: goodDecoder
    });
    expect(asked).toEqual(['https://yt3.googleusercontent.com/abc=s256-c-k-no-rj']);
  });

  it('keeps the existing icon when the picture cannot be fetched', async () => {
    const set = await fetchChannelIcons('https://example.test/a.png', {
      get: async () => null,
      decode: goodDecoder
    });
    expect(set).toBeNull();
  });
});
