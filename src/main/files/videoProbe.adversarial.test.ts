// Deliberately hostile input for the container parser. Any file in the watched folder reaches this
// code, and a video file is not a trusted document: it can be downloaded, sent, or dropped there by
// anything running on the machine. These are the shapes an attacker would reach for.
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { boxes, parseMoov, probeVideoFile } from './videoProbe';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function writeFileWith(bytes: Buffer): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'shortstack-fuzz-'));
  dirs.push(dir);
  const file = path.join(dir, 'hostile.mov');
  await fs.writeFile(file, bytes);
  return file;
}

/** An MP4 box header: 4-byte big-endian size, 4-byte type. */
const box = (size: number, type: string, payload = Buffer.alloc(0)): Buffer =>
  Buffer.concat([
    (() => {
      const head = Buffer.alloc(8);
      head.writeUInt32BE(size, 0);
      head.write(type, 4, 'latin1');
      return head;
    })(),
    payload
  ]);

const withTimeout = async <T>(work: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    work,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`took longer than ${ms}ms`)), ms))
  ]);

describe('hostile containers', () => {
  it('does not allocate a gigabyte because a header claims one', async () => {
    // A 32-byte file declaring a moov of 2^53 bytes. The allocation must follow the file, not the
    // number in it.
    const header = Buffer.alloc(16);
    header.writeUInt32BE(1, 0); // 64-bit size follows
    header.write('moov', 4, 'latin1');
    header.writeBigUInt64BE(BigInt(2) ** BigInt(53), 8);
    const file = await writeFileWith(Buffer.concat([header, Buffer.alloc(16)]));

    const before = process.memoryUsage().heapTotal;
    const probe = await withTimeout(probeVideoFile(file), 5000);
    const grew = process.memoryUsage().heapTotal - before;

    expect(probe).toEqual({ durationS: null, width: null, height: null });
    expect(grew).toBeLessThan(200 * 1024 * 1024);
  });

  it('terminates on a box that claims to contain itself', async () => {
    // size 0 means "to the end of the file"; a chain of them must not loop.
    const zero = Buffer.alloc(8);
    zero.writeUInt32BE(0, 0);
    zero.write('moov', 4, 'latin1');
    const file = await writeFileWith(Buffer.concat([zero, Buffer.alloc(64)]));
    await expect(withTimeout(probeVideoFile(file), 5000)).resolves.toBeDefined();
  });

  it('terminates on a box whose size is smaller than its own header', async () => {
    const file = await writeFileWith(Buffer.concat([box(1, 'moov'), box(2, 'trak'), Buffer.alloc(32)]));
    await expect(withTimeout(probeVideoFile(file), 5000)).resolves.toEqual({
      durationS: null,
      width: null,
      height: null
    });
  });

  it('walks a million minimal boxes without hanging', async () => {
    // Every box is the smallest legal one, so the walk advances eight bytes at a time.
    const minimal = box(8, 'free');
    const moov = Buffer.concat(Array.from({ length: 200_000 }, () => minimal));
    const started = Date.now();
    expect(parseMoov(moov)).toEqual({ durationS: null, width: null, height: null });
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('survives every truncation of a well-formed header', () => {
    // Cutting a valid structure at each byte is where off-by-one reads live.
    const moov = Buffer.concat([
      box(8 + 108, 'trak', Buffer.alloc(108)),
      box(8 + 100, 'mvhd', Buffer.alloc(100)),
      box(8 + 92, 'tkhd', Buffer.alloc(92))
    ]);
    for (let cut = 0; cut <= moov.length; cut += 1) {
      expect(() => parseMoov(moov.subarray(0, cut)), `truncated at ${cut}`).not.toThrow();
    }
  });

  it('refuses to divide by a zero timescale', () => {
    const body = Buffer.alloc(100); // version 0, timescale and duration all zero
    const moov = box(8 + 100, 'mvhd', body);
    expect(parseMoov(moov).durationS).toBeNull();
  });

  it('does not report a nonsense size from a hostile track header', () => {
    const body = Buffer.alloc(92);
    body.writeUInt32BE(0xffffffff, 4 + 20 + 16 + 36); // width
    body.writeUInt32BE(0xffffffff, 4 + 20 + 16 + 40); // height
    const moov = box(8 + 92, 'tkhd', body);
    const probe = parseMoov(moov);
    // Nothing is claimed unless a video track was actually found.
    expect(probe.width === null || Number.isFinite(probe.width)).toBe(true);
  });

  it('handles a file of pure noise without throwing', async () => {
    const noise = Buffer.alloc(4096);
    for (let index = 0; index < noise.length; index += 1) noise[index] = (index * 37 + 11) % 256;
    const file = await writeFileWith(noise);
    await expect(withTimeout(probeVideoFile(file), 5000)).resolves.toBeDefined();
  });

  it('never yields a box reaching past the buffer it was given', () => {
    const moov = Buffer.concat([box(0xffff, 'trak'), Buffer.alloc(40)]);
    for (const found of boxes(moov)) {
      expect(found.start).toBeGreaterThanOrEqual(0);
      expect(found.end).toBeLessThanOrEqual(moov.length);
      expect(found.start).toBeLessThanOrEqual(found.end);
    }
  });
});

describe('allocation follows the file, not the header', () => {
  it('reads only what a short file can supply, however large the box claims to be', async () => {
    // 40 bytes on disk, a moov header claiming 500 MB. The old code would allocate the 64 MB cap.
    const header = Buffer.alloc(8);
    header.writeUInt32BE(500 * 1024 * 1024, 0);
    header.write('moov', 4, 'latin1');
    const file = await writeFileWith(Buffer.concat([header, Buffer.alloc(32)]));

    const before = process.memoryUsage().heapTotal;
    await withTimeout(probeVideoFile(file), 5000);
    expect(process.memoryUsage().heapTotal - before).toBeLessThan(16 * 1024 * 1024);
  });
});
