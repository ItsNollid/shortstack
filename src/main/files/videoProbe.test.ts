import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseMoov, probeVideoFile } from './videoProbe';

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function box(type: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(payload.length + 8, 0);
  header.write(type, 4, 'latin1');
  return Buffer.concat([header, payload]);
}

function mvhd({ timescale = 600, duration = 6000 } = {}): Buffer {
  const payload = Buffer.alloc(100);
  payload.writeUInt32BE(timescale, 12);
  payload.writeUInt32BE(duration, 16);
  return box('mvhd', payload);
}

function tkhd({ width = 1080, height = 1920, rotated = false } = {}): Buffer {
  const payload = Buffer.alloc(84);
  const matrix = 40;
  if (rotated) {
    payload.writeInt32BE(0, matrix); // a
    payload.writeInt32BE(65536, matrix + 4); // b = 1.0
  } else {
    payload.writeInt32BE(65536, matrix); // a = 1.0
    payload.writeInt32BE(0, matrix + 4);
  }
  payload.writeUInt32BE(width * 65536, 76);
  payload.writeUInt32BE(height * 65536, 80);
  return box('tkhd', payload);
}

function hdlr(kind: string): Buffer {
  const payload = Buffer.alloc(24);
  payload.write(kind, 8, 'latin1');
  return box('hdlr', payload);
}

const trak = (kind: string, dimensions: Parameters<typeof tkhd>[0]) =>
  box('trak', Buffer.concat([tkhd(dimensions), box('mdia', hdlr(kind))]));

describe('parseMoov', () => {
  it('reads the duration from the movie header', () => {
    expect(parseMoov(Buffer.concat([mvhd({ timescale: 600, duration: 6000 })]))).toMatchObject({ durationS: 10 });
    expect(parseMoov(Buffer.concat([mvhd({ timescale: 1000, duration: 42_500 })]))).toMatchObject({ durationS: 42.5 });
  });

  it('reads display dimensions from the video track', () => {
    const moov = Buffer.concat([mvhd(), trak('vide', { width: 1080, height: 1920 })]);
    expect(parseMoov(moov)).toMatchObject({ width: 1080, height: 1920, durationS: 10 });
  });

  it('swaps dimensions for a quarter-turn rotation matrix', () => {
    // Stored landscape, displayed portrait: reporting the stored numbers would call a Short landscape.
    const moov = Buffer.concat([mvhd(), trak('vide', { width: 1920, height: 1080, rotated: true })]);
    expect(parseMoov(moov)).toMatchObject({ width: 1080, height: 1920 });
  });

  it('ignores audio tracks', () => {
    const moov = Buffer.concat([mvhd(), trak('soun', { width: 0, height: 0 }), trak('vide', { width: 720, height: 1280 })]);
    expect(parseMoov(moov)).toMatchObject({ width: 720, height: 1280 });
  });

  it('returns nulls rather than throwing on truncated or unexpected data', () => {
    expect(parseMoov(Buffer.alloc(0))).toEqual({ durationS: null, width: null, height: null });
    expect(parseMoov(Buffer.from('not a container at all'))).toEqual({ durationS: null, width: null, height: null });
    expect(parseMoov(box('mvhd', Buffer.alloc(4)).subarray(0, 10))).toMatchObject({ durationS: null });
  });
});

describe('probeVideoFile', () => {
  const writeFile = (contents: Buffer): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shortstack-probe-'));
    temps.push(dir);
    const file = path.join(dir, 'clip.mov');
    fs.writeFileSync(file, contents);
    return file;
  };

  it('finds a moov box that sits after the media data, as exported files do', async () => {
    const moov = box('moov', Buffer.concat([mvhd(), trak('vide', { width: 1080, height: 1920 })]));
    const file = writeFile(Buffer.concat([box('ftyp', Buffer.alloc(16)), box('mdat', Buffer.alloc(4096)), moov]));
    await expect(probeVideoFile(file)).resolves.toMatchObject({ durationS: 10, width: 1080, height: 1920 });
  });

  it('returns nulls for a file that is not a video, without throwing', async () => {
    const file = writeFile(Buffer.from('just some text'));
    await expect(probeVideoFile(file)).resolves.toEqual({ durationS: null, width: null, height: null });
  });

  it('returns nulls for a file that does not exist', async () => {
    await expect(probeVideoFile('E:/nope/missing.mov')).resolves.toEqual({ durationS: null, width: null, height: null });
  });
});
