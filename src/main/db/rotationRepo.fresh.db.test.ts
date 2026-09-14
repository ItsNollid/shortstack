import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { listOtherPostingTitles } from './queueRepo';
import { createPosting } from './rotationRepo';
import { createTestDb, seedQueueItem } from './testFixtures';

const NOW = new Date('2026-09-12T12:00:00.000Z');
let db: Database.Database;
beforeEach(() => {
  db = createTestDb();
});

const videoIdFor = (queueId: number): number =>
  (db.prepare('SELECT video_id FROM queue WHERE id = ?').get(queueId) as { video_id: number }).video_id;

const provenance = (queueId: number): { title: string; ai_drafted_at: string | null; metadata_edited_at: string | null } =>
  db.prepare('SELECT title, ai_drafted_at, metadata_edited_at FROM queue WHERE id = ?').get(queueId) as {
    title: string;
    ai_drafted_at: string | null;
    metadata_edited_at: string | null;
  };

/** A first posting that is out, with details drafted and then edited by hand. */
function publishedByHand(filename: string): number {
  const first = seedQueueItem(db, { filename, state: 'published' });
  db.prepare("UPDATE queue SET title = 'ALRIGHT GUYS IM GOING TO BED', ai_drafted_at = ?, metadata_edited_at = ? WHERE id = ?").run(
    '2026-09-01T10:00:00.000Z',
    '2026-09-02T10:00:00.000Z',
    first
  );
  return first;
}

describe('a re-run drafted afresh', () => {
  it('copies the details but starts as though nobody had written them, so drafting writes new ones', () => {
    const first = publishedByHand('bed.mov');
    const result = createPosting(db, videoIdFor(first), { notifyOnNew: false, maxPostings: 6, freshDetails: true }, NOW);
    expect(result).toMatchObject({ ok: true, kind: 'rotation' });
    if (!result.ok) return;

    expect(provenance(result.queueId)).toEqual({ title: 'ALRIGHT GUYS IM GOING TO BED', ai_drafted_at: null, metadata_edited_at: null });
    // The earlier posting keeps what was written for it.
    expect(provenance(first).metadata_edited_at).toBe('2026-09-02T10:00:00.000Z');

    const logged = db.prepare('SELECT detail FROM activity_log WHERE queue_id = ?').get(result.queueId) as { detail: string };
    expect(logged.detail).toContain('with new details to be drafted');
  });

  it('keeps who wrote the details, as before, unless chosen', () => {
    const first = publishedByHand('kept.mov');
    const result = createPosting(db, videoIdFor(first), { notifyOnNew: false, maxPostings: 6 }, NOW);
    if (!result.ok) throw new Error(result.reason);
    expect(provenance(result.queueId)).toMatchObject({
      ai_drafted_at: '2026-09-01T10:00:00.000Z',
      metadata_edited_at: '2026-09-02T10:00:00.000Z'
    });
    const logged = db.prepare('SELECT detail FROM activity_log WHERE queue_id = ?').get(result.queueId) as { detail: string };
    expect(logged.detail).not.toContain('drafted');
  });
});

describe('the titles a video already went out under', () => {
  it('come from its other postings, newest first and each once, leaving out blanks and the posting asking', () => {
    const first = publishedByHand('titles.mov');
    const video = videoIdFor(first);
    const insert = db.prepare(
      `INSERT INTO queue (video_id, title, description, tags, category_id, privacy, platforms, state, posting_kind, attempts,
                          upload_bytes_confirmed, remote_tombstone, notify_subscribers, made_for_kids, approved, created_at, updated_at)
       VALUES (?, ?, '', '[]', '22', 'public', '["youtube"]', 'published', 'rotation', 0, 0, 0, 0, 0, 0, ?, ?)`
    );
    const at = NOW.toISOString();
    insert.run(video, 'He really said goodnight', at, at);
    insert.run(video, '   ', at, at);
    insert.run(video, 'He really said goodnight', at, at);
    const asking = Number(insert.run(video, 'Zombies take the lobby', at, at).lastInsertRowid);

    expect(listOtherPostingTitles(db, video, asking)).toEqual(['He really said goodnight', 'ALRIGHT GUYS IM GOING TO BED']);
  });

  it('are none for a video posted once', () => {
    const only = seedQueueItem(db, { filename: 'once.mov' });
    expect(listOtherPostingTitles(db, videoIdFor(only), only)).toEqual([]);
  });
});
