// Stills that carry the moment they came from, and stills from the opening second.
import type Database from 'better-sqlite3';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, seedQueueItem } from '../db/testFixtures';
import { parseFrameSetInfo, readFramePart, readFrameSet, saveFrames, videosWithFrames } from './frames';

let db: Database.Database;
let dir: string;

beforeEach(async () => {
  db = createTestDb();
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'shortstack-frames-v2-'));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const jpeg = (fill: number): Buffer => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(32, fill)]);

describe('a complete set of stills', () => {
  it('keeps when each still was taken, and the opening second', async () => {
    const queueId = seedQueueItem(db, { filename: 'clip.mov' });
    const saved = await saveFrames({ db, dir }, queueId, [jpeg(1), jpeg(2), jpeg(3)], {
      times: [3.1, 7.4, 11.8],
      opening: [jpeg(8), jpeg(9)],
      openingTimes: [0.25, 1],
      duration: 15.6
    });
    expect(saved).toMatchObject({ ok: true, count: 3 });

    const set = await readFrameSet({ db, dir }, queueId);
    expect(set?.strip.map((still) => [still.image[3], still.time])).toEqual([
      [1, 3.1],
      [2, 7.4],
      [3, 11.8]
    ]);
    expect(set?.opening.map((still) => [still.image[3], still.time])).toEqual([
      [8, 0.25],
      [9, 1]
    ]);
    expect(set?.duration).toBe(15.6);
  });

  // Stills drawn before times were kept have to be drawn again, once, or no cover could ever be named.
  it('counts as done only when it is complete and current', async () => {
    const old = seedQueueItem(db, { filename: 'old.mov' });
    const current = seedQueueItem(db, { filename: 'current.mov' });
    await saveFrames({ db, dir }, old, [jpeg(1)]);
    const saved = await saveFrames({ db, dir }, current, [jpeg(1)], { times: [2], opening: [], openingTimes: [], duration: 10 });
    const done = await videosWithFrames(dir);
    expect(done.has(saved.ok ? saved.videoId : -1)).toBe(true);
    expect(done.size).toBe(1);
  });

  it('serves one still by name, and nothing for a name that is not one', async () => {
    const queueId = seedQueueItem(db, { filename: 'clip.mov' });
    await saveFrames({ db, dir }, queueId, [jpeg(1), jpeg(2)], { times: [1, 2], opening: [jpeg(7)], openingTimes: [0.25], duration: 5 });
    expect((await readFramePart({ db, dir }, queueId, 's1'))?.[3]).toBe(2);
    expect((await readFramePart({ db, dir }, queueId, 'o0'))?.[3]).toBe(7);
    expect(await readFramePart({ db, dir }, queueId, 'o1')).toBeNull();
    expect(await readFramePart({ db, dir }, queueId, 's9')).toBeNull();
    expect(await readFramePart({ db, dir }, queueId, '../../secrets')).toBeNull();
  });
});

describe('what the window sends about a pass', () => {
  it('accepts times and opening stills, and nothing at all', () => {
    const parsed = parseFrameSetInfo({ times: [1], opening: [new Uint8Array([0xff, 0xd8, 0xff, 1])], openingTimes: [0.25], duration: 9 });
    expect(parsed).toMatchObject({ times: [1], openingTimes: [0.25], duration: 9 });
    expect(parseFrameSetInfo(undefined)).toBeNull();
  });

  it('refuses anything else', () => {
    expect(parseFrameSetInfo('times')).toBe('invalid');
    expect(parseFrameSetInfo({ times: ['1'], opening: [], openingTimes: [] })).toBe('invalid');
    expect(parseFrameSetInfo({ times: [1], opening: ['not bytes'], openingTimes: [] })).toBe('invalid');
  });
});
