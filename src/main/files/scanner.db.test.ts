import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listActivity } from '../db/activityRepo';
import { listQueueItems } from '../db/queueRepo';
import { writeSetting } from '../db/settingsRepo';
import { TEST_NOW, createTestDb } from '../db/testFixtures';
import { scanFolder } from './scanner';

const temps: string[] = [];
let db: Database.Database;
let folder: string;

beforeEach(() => {
  db = createTestDb();
  folder = fs.mkdtempSync(path.join(os.tmpdir(), 'shortstack-scan-'));
  temps.push(folder);
  writeSetting(db, 'shorts_folder', folder);
});

afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const write = (name: string, contents: string | Buffer) => fs.writeFileSync(path.join(folder, name), contents);
const scan = () =>
  scanFolder(db, {
    now: () => TEST_NOW,
    stabilityDelayMs: 0,
    probe: async () => ({ durationS: 12, width: 1080, height: 1920 })
  });

describe('scanning a folder', () => {
  it('adds new videos with the user defaults and ignores other files', async () => {
    writeSetting(db, 'default_title_template', '{filename} #shorts');
    writeSetting(db, 'default_tags', ['gaming']);
    writeSetting(db, 'default_privacy', 'private');
    write('peter.mov', 'video-bytes');
    write('notes.txt', 'not a video');

    const result = await scan();
    expect(result).toMatchObject({ status: 'ok', added: 1, skipped: 0, problems: [] });

    const items = listQueueItems(db);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: 'peter #shorts',
      tags: ['gaming'],
      privacy: 'private',
      state: 'pending',
      filename: 'peter.mov',
      duration_s: 12,
      width: 1080,
      height: 1920
    });
  });

  it('is idempotent: a second scan changes nothing', async () => {
    write('clip.mov', 'video-bytes');
    await scan();
    const second = await scan();
    expect(second).toMatchObject({ added: 0, unchanged: 1 });
    expect(listQueueItems(db)).toHaveLength(1);
  });

  it('ignores a copy of a video that is already queued', async () => {
    write('clip.mov', 'identical');
    await scan();
    write('clip-copy.mov', 'identical');
    const result = await scan();
    expect(result).toMatchObject({ added: 0, ignored: 1 });
    expect(listQueueItems(db)).toHaveLength(1);
  });

  it('skips a file that is still being written', async () => {
    write('growing.mov', 'first');
    let call = 0;
    const result = await scanFolder(db, {
      now: () => TEST_NOW,
      stabilityDelayMs: 1,
      // Simulate a render still appending between the two checks.
      wait: async () => {
        call += 1;
        if (call === 1) write('growing.mov', 'first-plus-more');
      },
      probe: async () => ({ durationS: null, width: null, height: null })
    });
    expect(result).toMatchObject({ added: 0, skipped: 1 });
    expect(listQueueItems(db)).toHaveLength(0);
  });

  it('flags a video whose file changed before it was uploaded', async () => {
    write('clip.mov', 'first cut');
    await scan();
    write('clip.mov', 'second cut, longer');
    const result = await scan();

    expect(result).toMatchObject({ updated: 1, added: 0 });
    const item = listQueueItems(db)[0];
    expect(item).toMatchObject({ state: 'needs_attention', attention_code: 'file_changed' });
  });

  it('flags a video whose file disappeared', async () => {
    write('clip.mov', 'bytes');
    await scan();
    fs.rmSync(path.join(folder, 'clip.mov'));
    const result = await scan();

    expect(result.missing).toBe(1);
    expect(listQueueItems(db)[0]).toMatchObject({ state: 'needs_attention', attention_code: 'file_missing', missing: true });
  });

  it('reports an unavailable folder without touching the library', async () => {
    write('clip.mov', 'bytes');
    await scan();
    writeSetting(db, 'shorts_folder', path.join(folder, 'gone'));

    const result = await scan();
    expect(result.status).toBe('folder_unavailable');
    expect(listQueueItems(db)[0]).toMatchObject({ state: 'pending', missing: false });
  });

  it('reports no folder before setup is finished', async () => {
    writeSetting(db, 'shorts_folder', '');
    expect(await scan()).toMatchObject({ status: 'no_folder', added: 0 });
  });

  it('auto-approves only when consent was recorded, and logs it', async () => {
    write('a.mov', 'bytes-a');
    await scan();
    expect(listQueueItems(db)[0].state).toBe('pending');

    writeSetting(db, 'auto_approve_consented_at', TEST_NOW.toISOString());
    writeSetting(db, 'auto_approve', true);
    write('b.mov', 'bytes-b');
    await scan();

    const approved = listQueueItems(db).find((item) => item.filename === 'b.mov');
    expect(approved?.state).toBe('approved');
    expect(listActivity(db, { queueId: approved?.id }).map((entry) => entry.action)).toContain('approve');
  });
});
