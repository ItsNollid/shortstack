import type Database from 'better-sqlite3';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { encodePng } from '../brandIcon';
import { createTestDb, seedQueueItem } from '../db/testFixtures';
import { saveFrames } from './frames';
import { clearThumbnails, isPng, missingThumbnails, readThumbnail, saveThumbnail, thumbnailPath } from './thumbnails';

let db: Database.Database;
let dir: string;
const dirs: string[] = [];

beforeEach(async () => {
  db = createTestDb();
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'shortstack-thumbs-'));
  dirs.push(dir);
});

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
});

const png = (): Buffer => encodePng(4, 4, Buffer.alloc(4 * 4 * 4, 0x40));
const jpeg = (): Buffer => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(64, 0x20)]);
const videoIdFor = (queueId: number): number =>
  (db.prepare('SELECT video_id FROM queue WHERE id = ?').get(queueId) as { video_id: number }).video_id;

describe('saving a poster frame', () => {
  it('stores it and hands it back', async () => {
    const queueId = seedQueueItem(db, { filename: 'clip.mov' });
    const saved = await saveThumbnail({ db, dir }, queueId, png());
    expect(saved.ok).toBe(true);

    const read = await readThumbnail({ db, dir }, queueId);
    expect(read?.equals(png())).toBe(true);
  });

  it('keys by video, so every posting of a file shares one frame', async () => {
    const first = seedQueueItem(db, { filename: 'shared.mov' });
    const video = videoIdFor(first);
    await saveThumbnail({ db, dir }, first, png());

    // A second posting of the same file.
    db.prepare(
      `INSERT INTO queue (video_id, title, description, tags, category_id, privacy, platforms, state, attempts,
                          upload_bytes_confirmed, remote_tombstone, notify_subscribers, made_for_kids, approved,
                          created_at, updated_at)
       VALUES (?, 'Again', '', '[]', '22', 'public', '["youtube"]', 'pending', 0, 0, 0, 0, 0, 0, ?, ?)`
    ).run(video, '2026-09-12T12:00:00.000Z', '2026-09-12T12:00:00.000Z');
    const second = db.prepare('SELECT id FROM queue ORDER BY id DESC LIMIT 1').get() as { id: number };

    expect(await readThumbnail({ db, dir }, second.id)).not.toBeNull();
    expect(await fs.readdir(dir)).toEqual([`${video}.png`]);
  });

  it('refuses anything that is not a PNG', async () => {
    const queueId = seedQueueItem(db, { filename: 'bad.mov' });
    const result = await saveThumbnail({ db, dir }, queueId, Buffer.from('<html>not an image</html>'));
    expect(result.ok).toBe(false);
    expect(await fs.readdir(dir)).toEqual([]);
  });

  it('refuses one far larger than a poster frame could be', async () => {
    const queueId = seedQueueItem(db, { filename: 'huge.mov' });
    const huge = Buffer.concat([png(), Buffer.alloc(3 * 1024 * 1024)]);
    const result = await saveThumbnail({ db, dir }, queueId, huge);
    expect(result.ok).toBe(false);
  });

  it('refuses an id that is not in the queue', async () => {
    expect((await saveThumbnail({ db, dir }, 9999, png())).ok).toBe(false);
  });
});

describe('finding what still needs one', () => {
  it('lists videos with nothing decoded yet, one entry per file', async () => {
    const a = seedQueueItem(db, { filename: 'a.mov' });
    seedQueueItem(db, { filename: 'b.mov' });

    expect(await missingThumbnails({ db, dir })).toHaveLength(2);

    await saveThumbnail({ db, dir }, a, png());
    await saveFrames({ db, dir }, a, [jpeg()], { times: [1], opening: [], openingTimes: [], duration: 5 });
    const remaining = await missingThumbnails({ db, dir });
    expect(remaining).toHaveLength(1);
    expect(remaining).not.toContain(a);
  });

  // A video posterised before the model frames existed has to come back round, or it would never
  // get a strip and the model would keep working from a 216px thumbnail.
  it('still asks for a video that has a poster but no frames', async () => {
    const only = seedQueueItem(db, { filename: 'poster-only.mov' });
    await saveThumbnail({ db, dir }, only, png());
    expect(await missingThumbnails({ db, dir })).toEqual([only]);
  });

  it('skips files that are no longer there', async () => {
    const gone = seedQueueItem(db, { filename: 'gone.mov' });
    db.prepare('UPDATE videos SET missing = 1 WHERE id = ?').run(videoIdFor(gone));
    expect(await missingThumbnails({ db, dir })).toEqual([]);
  });

  it('copes with the folder not existing yet', async () => {
    seedQueueItem(db, { filename: 'first.mov' });
    expect(await missingThumbnails({ db, dir: path.join(dir, 'not-made-yet') })).toHaveLength(1);
  });
});

describe('clearing', () => {
  it('leaves nothing behind', async () => {
    const queueId = seedQueueItem(db, { filename: 'x.mov' });
    await saveThumbnail({ db, dir }, queueId, png());
    await clearThumbnails(dir);
    expect(await readThumbnail({ db, dir }, queueId)).toBeNull();
  });

  it('does not mind being asked twice', async () => {
    await clearThumbnails(dir);
    await expect(clearThumbnails(dir)).resolves.toBeUndefined();
  });
});

describe('isPng', () => {
  it('knows the magic bytes', () => {
    expect(isPng(png())).toBe(true);
    expect(isPng(Buffer.from('PNG'))).toBe(false);
    expect(isPng(Buffer.alloc(0))).toBe(false);
  });
});

describe('thumbnailPath', () => {
  it('names the file after the video', () => {
    expect(thumbnailPath('C:/thumbs', 42)).toBe(path.join('C:/thumbs', '42.png'));
  });
});
