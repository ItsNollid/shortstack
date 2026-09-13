import { describe, expect, it } from 'vitest';
import { applyDraft, updateQueueMetadata } from './queueRepo';
import { TEST_NOW, createTestDb, rawQueueRow, seedQueueItem } from './testFixtures';
import { setVideoGame } from './videoRepo';

const ctx = { now: TEST_NOW, uploadMethod: 'assisted' as const };
const draft = { title: 'Drafted', description: '#shorts', tags: ['clip'] };

const gameOf = (db: ReturnType<typeof createTestDb>, videoId: number): string | null =>
  (db.prepare('SELECT game FROM videos WHERE id = ?').get(videoId) as { game: string | null }).game;

describe('setting the game', () => {
  it('stores it trimmed, and treats a blank as unknown', () => {
    const db = createTestDb();
    const videoId = rawQueueRow(db, seedQueueItem(db)).video_id as number;

    setVideoGame(db, videoId, '  Minecraft ');
    expect(gameOf(db, videoId)).toBe('Minecraft');

    setVideoGame(db, videoId, '   ');
    expect(gameOf(db, videoId)).toBeNull();
  });

  // A draft written before the game was known was written blind, and the worker never revisited it.
  it('lets a blind draft be written again once the game is known', () => {
    const db = createTestDb();
    const id = seedQueueItem(db);
    applyDraft(db, id, draft, ctx);
    expect(rawQueueRow(db, id).ai_drafted_at).not.toBeNull();

    setVideoGame(db, rawQueueRow(db, id).video_id as number, 'Minecraft');
    expect(rawQueueRow(db, id).ai_drafted_at).toBeNull();
  });

  it('leaves details a person wrote exactly where they are', () => {
    const db = createTestDb();
    const id = seedQueueItem(db);
    applyDraft(db, id, draft, ctx);
    updateQueueMetadata(db, id, { title: 'Mine' }, ctx);
    const draftedAt = rawQueueRow(db, id).ai_drafted_at;

    setVideoGame(db, rawQueueRow(db, id).video_id as number, 'Minecraft');
    expect(rawQueueRow(db, id).ai_drafted_at).toBe(draftedAt);
    expect(rawQueueRow(db, id).title).toBe('Mine');
  });

  it('does nothing when the game did not actually change', () => {
    const db = createTestDb();
    const id = seedQueueItem(db);
    const videoId = rawQueueRow(db, id).video_id as number;
    setVideoGame(db, videoId, 'Minecraft');
    applyDraft(db, id, draft, ctx);

    setVideoGame(db, videoId, 'Minecraft');
    expect(rawQueueRow(db, id).ai_drafted_at).not.toBeNull();
  });

  it('does not touch a video already on its way to YouTube', () => {
    const db = createTestDb();
    const id = seedQueueItem(db, { state: 'scheduled', youtubeVideoId: 'yt1' });
    db.prepare('UPDATE queue SET ai_drafted_at = ? WHERE id = ?').run(TEST_NOW.toISOString(), id);

    setVideoGame(db, rawQueueRow(db, id).video_id as number, 'Minecraft');
    expect(rawQueueRow(db, id).ai_drafted_at).toBe(TEST_NOW.toISOString());
  });
});
