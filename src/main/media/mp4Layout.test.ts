import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { hasEditLists, indexBeforeData, readTopLevelBoxes } from './mp4Layout';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

const box = (type: string, ...children: Buffer[]): Buffer => {
  const payload = Buffer.concat(children);
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + payload.length, 0);
  header.write(type, 4, 'latin1');
  return Buffer.concat([header, payload]);
};

/** A box with a 64-bit size, the way large picture data is written. */
const largeBox = (type: string, payload: Buffer): Buffer => {
  const header = Buffer.alloc(16);
  header.writeUInt32BE(1, 0);
  header.write(type, 4, 'latin1');
  header.writeBigUInt64BE(BigInt(16 + payload.length), 8);
  return Buffer.concat([header, payload]);
};

async function file(...parts: Buffer[]): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'shortstack-mp4-'));
  dirs.push(dir);
  const target = path.join(dir, 'clip.mp4');
  await fs.writeFile(target, Buffer.concat(parts));
  return target;
}

const ftyp = box('ftyp', Buffer.from('isom0000', 'latin1'));
const picture = box('mdat', Buffer.alloc(64, 7));
const trackWithoutEdits = box('trak', box('tkhd', Buffer.alloc(20)));
const trackWithEdits = box('trak', box('tkhd', Buffer.alloc(20)), box('edts', box('elst', Buffer.alloc(16))));

describe('where the index is', () => {
  it('is at the front in a file made for streaming', async () => {
    const top = await readTopLevelBoxes(await file(ftyp, box('moov', trackWithoutEdits), picture));
    expect(top.map((entry) => entry.type)).toEqual(['ftyp', 'moov', 'mdat']);
    expect(indexBeforeData(top)).toBe(true);
  });

  // How this channel's editor writes its renders.
  it('is at the back in an editor’s render', async () => {
    const top = await readTopLevelBoxes(await file(ftyp, picture, box('moov', trackWithoutEdits)));
    expect(indexBeforeData(top)).toBe(false);
  });

  it('is found past picture data with a 64-bit size', async () => {
    const top = await readTopLevelBoxes(await file(ftyp, largeBox('mdat', Buffer.alloc(40)), box('moov')));
    expect(top.map((entry) => entry.type)).toEqual(['ftyp', 'mdat', 'moov']);
  });

  it('is missing from a file with no index at all', async () => {
    expect(indexBeforeData(await readTopLevelBoxes(await file(ftyp, picture)))).toBe(false);
  });
});

describe('edit lists', () => {
  it('are found inside a track', async () => {
    expect(await hasEditLists(await file(ftyp, box('moov', trackWithoutEdits, trackWithEdits), picture))).toBe(true);
  });

  it('are absent when no track has one', async () => {
    expect(await hasEditLists(await file(ftyp, box('moov', trackWithoutEdits), picture))).toBe(false);
  });

  it('cannot be looked for without an index', async () => {
    expect(await hasEditLists(await file(ftyp, picture))).toBeNull();
  });
});
