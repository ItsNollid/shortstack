import type Database from 'better-sqlite3';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, seedQueueItem } from '../db/testFixtures';
import { MAX_FRAMES, MAX_FRAME_BYTES, framePath, isJpeg, readFrames, saveFrames, videosWithFrames } from './frames';

let db: Database.Database;
let dir: string;
const dirs: string[] = [];

beforeEach(async () => {
  db = createTestDb();
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'shortstack-frames-'));
  dirs.push(dir);
});

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
});

/** Only the magic matters here; nothing decodes these. */
const jpeg = (fill = 0x20): Buffer => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(32, fill)]);
const videoIdFor = (queueId: number): number =>
  (db.prepare('SELECT video_id FROM queue WHERE id = ?').get(queueId) as { video_id: number }).video_id;

describe('isJpeg', () => {
  it('accepts a JPEG and rejects everything else', () => {
    expect(isJpeg(jpeg())).toBe(true);
    expect(isJpeg(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
    expect(isJpeg(Buffer.from('<html>'))).toBe(false);
    expect(isJpeg(Buffer.alloc(0))).toBe(false);
  });
});

describe('saving a strip', () => {
  it('stores the frames and reads them back in order', async () => {
    const queueId = seedQueueItem(db, { filename: 'clip.mov' });
    const saved = await saveFrames({ db, dir }, queueId, [jpeg(1), jpeg(2), jpeg(3)]);
    expect(saved).toMatchObject({ ok: true, count: 3 });

    const read = await readFrames({ db, dir }, queueId);
    expect(read.map((frame) => frame[3])).toEqual([1, 2, 3]);
  });

  it('is keyed by video, so every posting of a file shares one strip', async () => {
    const first = seedQueueItem(db, { filename: 'same.mov' });
    await saveFrames({ db, dir }, first, [jpeg()]);

    const second = db.prepare('INSERT INTO queue (video_id, state) VALUES (?, ?)').run(videoIdFor(first), 'pending');
    expect(await readFrames({ db, dir }, Number(second.lastInsertRowid))).toHaveLength(1);
  });

  it('refuses anything that is not a JPEG', async () => {
    const queueId = seedQueueItem(db, { filename: 'clip.mov' });
    const result = await saveFrames({ db, dir }, queueId, [jpeg(), Buffer.from('<html>not an image</html>')]);
    expect(result).toMatchObject({ ok: false });
    expect(await readFrames({ db, dir }, queueId)).toEqual([]);
  });

  it('refuses a frame that is far too large to be one', async () => {
    const queueId = seedQueueItem(db, { filename: 'clip.mov' });
    const huge = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(MAX_FRAME_BYTES, 0)]);
    expect(await saveFrames({ db, dir }, queueId, [huge])).toMatchObject({ ok: false });
  });

  it('keeps at most the number the model is given', async () => {
    const queueId = seedQueueItem(db, { filename: 'clip.mov' });
    const saved = await saveFrames({ db, dir }, queueId, [jpeg(), jpeg(), jpeg(), jpeg(), jpeg()]);
    expect(saved).toMatchObject({ ok: true, count: MAX_FRAMES });
    expect(await readFrames({ db, dir }, queueId)).toHaveLength(MAX_FRAMES);
  });

  // Without this, a re-decode that managed only one good frame would silently be read back as three,
  // two of them from a file that no longer exists on disk in any meaningful sense.
  it('does not leave frames from a previous pass behind', async () => {
    const queueId = seedQueueItem(db, { filename: 'clip.mov' });
    await saveFrames({ db, dir }, queueId, [jpeg(1), jpeg(2), jpeg(3)]);
    await saveFrames({ db, dir }, queueId, [jpeg(9)]);

    const read = await readFrames({ db, dir }, queueId);
    expect(read).toHaveLength(1);
    expect(read[0][3]).toBe(9);
    await expect(fs.access(framePath(dir, videoIdFor(queueId), 1))).rejects.toThrow();
  });

  it('refuses an empty strip and an unknown video', async () => {
    const queueId = seedQueueItem(db, { filename: 'clip.mov' });
    expect(await saveFrames({ db, dir }, queueId, [])).toMatchObject({ ok: false });
    expect(await saveFrames({ db, dir }, 9999, [jpeg()])).toMatchObject({ ok: false });
  });
});

describe('reading', () => {
  it('returns nothing for a video with no strip, and for one that is gone', async () => {
    const queueId = seedQueueItem(db, { filename: 'clip.mov' });
    expect(await readFrames({ db, dir }, queueId)).toEqual([]);
    expect(await readFrames({ db, dir }, 9999)).toEqual([]);
  });
});

describe('videosWithFrames', () => {
  it('names the videos that have been done, and copes with no folder', async () => {
    expect(await videosWithFrames(dir)).toEqual(new Set());

    const queueId = seedQueueItem(db, { filename: 'clip.mov' });
    // Stills without their times are not done: the video is drawn again, once, to get them.
    await saveFrames({ db, dir }, queueId, [jpeg(), jpeg()]);
    expect(await videosWithFrames(dir)).toEqual(new Set());
    await saveFrames({ db, dir }, queueId, [jpeg(), jpeg()], { times: [1, 2], opening: [], openingTimes: [], duration: 5 });
    expect(await videosWithFrames(dir)).toEqual(new Set([videoIdFor(queueId)]));
  });
});
