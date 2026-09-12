import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { listActivity } from './activityRepo';
import { createTestDb, seedQueueItem } from './testFixtures';
import {
  listVideoRotation,
  markPublishedBefore,
  nextPostingKind,
  readVideoRotation,
  rotationVerdict,
  setRotationPaused
} from './rotationRepo';

const NOW = new Date('2026-09-12T12:00:00.000Z');
let db: Database.Database;
beforeEach(() => {
  db = createTestDb();
});

const videoIdFor = (queueId: number): number =>
  (db.prepare('SELECT video_id FROM queue WHERE id = ?').get(queueId) as { video_id: number }).video_id;

describe('reading rotation state', () => {
  it('counts every posting of a video, and notices one still in flight', () => {
    const first = seedQueueItem(db, { filename: 'clip.mov', state: 'published' });
    const video = videoIdFor(first);

    expect(readVideoRotation(db, video)?.postings).toBe(1);
    expect(readVideoRotation(db, video)?.hasPostingInFlight).toBe(false);

    db.prepare(
      `INSERT INTO queue (video_id, title, description, tags, category_id, privacy, platforms, state, posting_kind, attempts, upload_bytes_confirmed, remote_tombstone, notify_subscribers, made_for_kids, approved, created_at, updated_at)
       VALUES (?, 'Second run', '', '[]', '22', 'public', '["youtube"]', 'approved', 'rotation', 0, 0, 0, 0, 0, 0, ?, ?)`
    ).run(video, NOW.toISOString(), NOW.toISOString());

    const after = readVideoRotation(db, video);
    expect(after?.postings).toBe(2);
    expect(after?.hasPostingInFlight).toBe(true);
  });

  it('calls the first posting new and the next a re-run', () => {
    const queueId = seedQueueItem(db, { filename: 'once.mov', state: 'published' });
    const rotation = readVideoRotation(db, videoIdFor(queueId));
    // One posting already exists, so the next one is a re-run.
    expect(nextPostingKind(rotation as NonNullable<typeof rotation>)).toBe('rotation');
  });

  it('says nothing for a video that does not exist', () => {
    expect(readVideoRotation(db, 9999)).toBeNull();
  });
});

describe('marking an imported back catalogue', () => {
  it('makes the first posting of an already-published file a re-run', () => {
    const queueId = seedQueueItem(db, { filename: 'old-hit.mov' });
    const video = videoIdFor(queueId);

    // Before: one posting exists, so it reads as a re-run only because of the count.
    db.prepare('DELETE FROM queue WHERE id = ?').run(queueId);
    expect(nextPostingKind(readVideoRotation(db, video) as never)).toBe('new');

    markPublishedBefore(db, [video], true, NOW);
    expect(nextPostingKind(readVideoRotation(db, video) as never)).toBe('rotation');
  });

  it('records the change, because it decides whether subscribers get told', () => {
    const video = videoIdFor(seedQueueItem(db, { filename: 'a.mov' }));
    markPublishedBefore(db, [video], true, NOW);
    const actions = listActivity(db).map((entry) => entry.action);
    expect(actions).toContain('mark_published_before');
  });

  it('can be undone', () => {
    const video = videoIdFor(seedQueueItem(db, { filename: 'b.mov' }));
    markPublishedBefore(db, [video], true, NOW);
    markPublishedBefore(db, [video], false, NOW);
    expect(readVideoRotation(db, video)?.publishedBefore).toBe(false);
  });

  it('does nothing, and logs nothing, for an empty selection', () => {
    expect(markPublishedBefore(db, [], true, NOW)).toBe(0);
    expect(listActivity(db)).toHaveLength(0);
  });
});

describe('pausing rotation', () => {
  it('stops further postings whatever the limit allows', () => {
    const video = videoIdFor(seedQueueItem(db, { filename: 'paused.mov', state: 'published' }));
    setRotationPaused(db, [video], true, NOW);

    const rotation = readVideoRotation(db, video) as NonNullable<ReturnType<typeof readVideoRotation>>;
    expect(rotationVerdict(rotation, 6)).toEqual({ rotate: false, reason: 'paused' });
  });

  it('lets a video back in', () => {
    const video = videoIdFor(seedQueueItem(db, { filename: 'back.mov', state: 'published' }));
    setRotationPaused(db, [video], true, NOW);
    setRotationPaused(db, [video], false, NOW);

    const rotation = readVideoRotation(db, video) as NonNullable<ReturnType<typeof readVideoRotation>>;
    expect(rotationVerdict(rotation, 6)).toEqual({ rotate: true });
  });

  it('refuses another posting while one is still going out', () => {
    const video = videoIdFor(seedQueueItem(db, { filename: 'busy.mov', state: 'approved' }));
    const rotation = readVideoRotation(db, video) as NonNullable<ReturnType<typeof readVideoRotation>>;
    expect(rotationVerdict(rotation, 6)).toEqual({ rotate: false, reason: 'already_queued' });
  });
});

describe('listVideoRotation', () => {
  it('reports every video once', () => {
    seedQueueItem(db, { filename: 'one.mov', state: 'published' });
    seedQueueItem(db, { filename: 'two.mov', state: 'published' });
    expect(listVideoRotation(db)).toHaveLength(2);
  });
});
