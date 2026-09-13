import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, seedQueueItem } from '../db/testFixtures';
import { getQueueItem, updateQueueMetadata } from '../db/queueRepo';
import { listActivity } from '../db/activityRepo';
import { writeSetting } from '../db/settingsRepo';
import type { MetadataSuggestion } from './metadataSuggestion';
import type { AiResult } from './ollamaClient';
import { DraftWorker } from './draftWorker';

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
  writeSetting(db, 'ai_model', 'llava:13b');
  writeSetting(db, 'ai_auto_draft', true);
});

const suggestion = (title: string): AiResult<MetadataSuggestion> => ({
  ok: true,
  value: { title, description: '#zombies #bo3', tags: ['cod zombies'] }
});

const worker = (draft: (deps: unknown, id: number) => Promise<AiResult<MetadataSuggestion>>): DraftWorker =>
  new DraftWorker({
    db,
    draftDeps: { db, thumbnailDir: 'unused', listPastUploads: async () => ({ ok: false }) },
    draft: draft as never
  });

const ctx = { now: new Date('2026-09-12T12:00:00.000Z'), uploadMethod: 'assisted' as const };

describe('the drafting worker', () => {
  it('writes details for videos nobody has written details for', async () => {
    const first = seedQueueItem(db, { filename: 'a.mov' });
    const second = seedQueueItem(db, { filename: 'b.mov' });

    const drafted = await worker(async (_deps, id) => suggestion(`Title ${id}`)).runTick();

    expect(drafted).toBe(2);
    expect(getQueueItem(db, first)?.title).toBe(`Title ${first}`);
    expect(getQueueItem(db, second)?.description).toBe('#zombies #bo3');
    expect(getQueueItem(db, first)?.ai_drafted_at).not.toBeNull();
    // Drafting is not editing: the record of a person having written here stays empty.
    expect(getQueueItem(db, first)?.metadata_edited_at).toBeNull();
  });

  it('does nothing while the setting is off', async () => {
    seedQueueItem(db, { filename: 'a.mov' });
    writeSetting(db, 'ai_auto_draft', false);
    expect(await worker(async () => suggestion('Should not happen')).runTick()).toBe(0);
  });

  it('leaves a video alone once someone has edited it', async () => {
    const queueId = seedQueueItem(db, { filename: 'a.mov' });
    updateQueueMetadata(db, queueId, { title: 'Mine' }, ctx);

    expect(await worker(async () => suggestion('Not mine')).runTick()).toBe(0);
    expect(getQueueItem(db, queueId)?.title).toBe('Mine');
  });

  it('does not draft the same posting twice', async () => {
    seedQueueItem(db, { filename: 'a.mov' });
    const only = worker(async () => suggestion('First pass'));

    expect(await only.runTick()).toBe(1);
    expect(await only.runTick()).toBe(0);
  });

  // Ollama not running is the normal state on most machines. Carrying on would mean one failed
  // request per video, every tick, forever.
  it('stops the tick as soon as the model stops answering', async () => {
    seedQueueItem(db, { filename: 'a.mov' });
    seedQueueItem(db, { filename: 'b.mov' });

    let asked = 0;
    const drafted = await worker(async () => {
      asked += 1;
      return { ok: false, code: 'not_running', reason: 'Ollama is not answering' };
    }).runTick();

    expect(drafted).toBe(0);
    expect(asked).toBe(1);
  });

  it('records what it did, as something ShortStack did rather than the user', async () => {
    const queueId = seedQueueItem(db, { filename: 'a.mov' });
    await worker(async () => suggestion('Drafted')).runTick();

    const entries = listActivity(db, { queueId });
    expect(entries.some((entry) => entry.action === 'ai_drafted')).toBe(true);
  });

  it('only announces a change when there was one', async () => {
    seedQueueItem(db, { filename: 'a.mov' });
    let changes = 0;
    const options = {
      db,
      draftDeps: { db, thumbnailDir: 'unused', listPastUploads: async () => ({ ok: false }) },
      onChange: () => {
        changes += 1;
      }
    };

    await new DraftWorker({ ...options, draft: (async () => suggestion('One')) as never }).runTick();
    expect(changes).toBe(1);

    await new DraftWorker({ ...options, draft: (async () => suggestion('Two')) as never }).runTick();
    expect(changes).toBe(1);
  });
});

describe('choosing which details are drafted', () => {
  it('writes only the chosen details and leaves the rest alone', async () => {
    const queueId = seedQueueItem(db, { filename: 'a.mov' });
    const before = getQueueItem(db, queueId);
    writeSetting(db, 'ai_auto_draft_fields', ['description']);

    expect(await worker(async () => suggestion('Not wanted')).runTick()).toBe(1);

    const after = getQueueItem(db, queueId);
    expect(after?.description).toBe('#zombies #bo3');
    expect(after?.title).toBe(before?.title);
    expect(after?.tags).toEqual(before?.tags);
  });

  it('writes all three when all three are chosen, which is the default', async () => {
    const queueId = seedQueueItem(db, { filename: 'a.mov' });
    await worker(async () => suggestion('All of it')).runTick();
    expect(getQueueItem(db, queueId)).toMatchObject({ title: 'All of it', description: '#zombies #bo3', tags: ['cod zombies'] });
  });

  it('refuses to be left with nothing chosen', () => {
    expect(writeSetting(db, 'ai_auto_draft_fields', []).ok).toBe(false);
  });
});
