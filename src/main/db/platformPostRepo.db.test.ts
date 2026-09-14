import { describe, expect, it } from 'vitest';
import { listActivity } from './activityRepo';
import { applyPlatformPost, listPlatformPosts } from './platformPostRepo';
import { createTestDb, seedQueueItem } from './testFixtures';

const NOW = new Date('2026-09-14T10:00:00.000Z');

function posting(state: string, platforms: string[] = ['youtube', 'tiktok', 'instagram']): { db: ReturnType<typeof createTestDb>; queueId: number } {
  const db = createTestDb();
  const queueId = seedQueueItem(db, { filename: 'bed.mov', state: state as never });
  db.prepare('UPDATE queue SET platforms = ? WHERE id = ?').run(JSON.stringify(platforms), queueId);
  return { db, queueId };
}

describe('what went to TikTok and Instagram', () => {
  it('lists every other platform a posting is going to, waiting until something happens', () => {
    const { db, queueId } = posting('approved');
    expect(listPlatformPosts(db, queueId)).toEqual([
      { queueId, platform: 'tiktok', state: 'waiting', url: null, postedAt: null },
      { queueId, platform: 'instagram', state: 'waiting', url: null, postedAt: null }
    ]);
    expect(listPlatformPosts(db, 9999)).toBeNull();
  });

  it('records a post with its link, and says so in the history', () => {
    const { db, queueId } = posting('scheduled');
    const result = applyPlatformPost(db, queueId, 'tiktok', { type: 'posted', url: 'https://www.tiktok.com/@nollid/video/7412345678901234567' }, NOW);
    expect(result).toEqual({
      ok: true,
      post: { queueId, platform: 'tiktok', state: 'posted', url: 'https://www.tiktok.com/@nollid/video/7412345678901234567', postedAt: NOW.toISOString() }
    });
    expect(listPlatformPosts(db, queueId)?.[0]).toMatchObject({ state: 'posted' });
    expect(listActivity(db, { queueId }).map((entry) => entry.detail)).toContain('Marked as posted to TikTok: https://www.tiktok.com/@nollid/video/7412345678901234567');
  });

  it('will not mark anything posted before the video is approved', () => {
    const { db, queueId } = posting('pending');
    expect(applyPlatformPost(db, queueId, 'instagram', { type: 'posted', url: null }, NOW)).toEqual({ ok: false, reason: 'Approve the video first' });
    // Deciding not to post there needs no approval.
    expect(applyPlatformPost(db, queueId, 'instagram', { type: 'skip' }, NOW)).toMatchObject({ ok: true, post: { state: 'skipped' } });
  });

  it('refuses a platform the video is not going to', () => {
    const { db, queueId } = posting('approved', ['youtube', 'tiktok']);
    expect(applyPlatformPost(db, queueId, 'instagram', { type: 'posted', url: null }, NOW)).toEqual({
      ok: false,
      reason: 'This video is not set to go to Instagram'
    });
  });

  it('undoes a post marked by mistake, but will not skip one already out', () => {
    const { db, queueId } = posting('published');
    applyPlatformPost(db, queueId, 'tiktok', { type: 'posted', url: null }, NOW);
    expect(applyPlatformPost(db, queueId, 'tiktok', { type: 'skip' }, NOW)).toMatchObject({ ok: false });
    expect(applyPlatformPost(db, queueId, 'tiktok', { type: 'restore' }, NOW)).toMatchObject({ ok: true, post: { state: 'waiting', url: null } });
  });
});
