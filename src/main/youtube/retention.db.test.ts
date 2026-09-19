import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { KEEP_WITHOUT_REFRESH_MS } from '../../shared/retention';
import { readActiveChannel, upsertChannel } from '../db/channelRepo';
import { getQueueItem } from '../db/queueRepo';
import { createTestDb, seedQueueItem } from '../db/testFixtures';
import type { AuthState } from './authService';
import { checkChannelRetention } from './retention';
import type { ChannelProfile, GatewayResult } from './gateway';

const NOW = new Date('2026-09-18T12:00:00.000Z');
const PROFILE: ChannelProfile = {
  id: 'UC_nollid',
  title: 'Nollid',
  handle: '@nollid',
  avatarUrl: 'https://example.invalid/avatar.jpg',
  subscriberCount: 1234,
  uploadsPlaylistId: 'UU_nollid'
};

const offline = { ok: false as const, reason: 'No network', code: null, retryable: true };

function setup(options: { confirmedAt: Date; authState: AuthState; answer: GatewayResult<ChannelProfile> }) {
  const db = createTestDb();
  upsertChannel(db, PROFILE, options.confirmedAt);
  const queueId = seedQueueItem(db, { filename: 'posted.mov', state: 'uploaded', youtubeVideoId: 'yt-1' });
  const cleared: string[] = [];
  const deps = {
    db,
    gateway: { fetchChannelProfile: () => Promise.resolve(options.answer) },
    authState: () => options.authState,
    appIcon: {
      refresh: () => {
        cleared.push('icon refreshed');
        return Promise.resolve(true);
      },
      clear: () => {
        cleared.push('icon cleared');
        return Promise.resolve();
      }
    },
    analytics: { clear: () => cleared.push('analytics cleared') },
    thumbnailDir: path.join(os.tmpdir(), 'shortstack-retention-test-thumbs'),
    uploadMethod: () => 'assisted' as const,
    now: () => NOW
  };
  return { db, deps, queueId, cleared };
}

describe('keeping channel details only as long as promised', () => {
  it('confirms them with YouTube and keeps them, refreshing the date and the picture', async () => {
    const { db, deps, cleared } = setup({
      confirmedAt: new Date(NOW.getTime() - KEEP_WITHOUT_REFRESH_MS * 2),
      authState: 'ok',
      answer: { ok: true, value: { ...PROFILE, title: 'Nollid Clips' } }
    });
    const result = await checkChannelRetention(deps);
    expect(result).toEqual({ outcome: 'refreshed', verdict: { forget: false } });
    expect(readActiveChannel(db)).toMatchObject({ title: 'Nollid Clips', updatedAt: NOW.toISOString() });
    expect(cleared).toEqual(['icon refreshed']);
  });

  it('deletes them the moment access is gone, and marks what is already on the channel as no longer ours', async () => {
    const { db, deps, queueId, cleared } = setup({ confirmedAt: NOW, authState: 'expired', answer: offline });
    const result = await checkChannelRetention(deps);
    expect(result.verdict).toEqual({ forget: true, because: 'access_gone' });
    expect(readActiveChannel(db)).toBeNull();
    expect(cleared).toContain('icon cleared');
    // The tombstone is what keeps a video from ever being uploaded a second time.
    expect(getQueueItem(db, queueId)).toMatchObject({ youtube_video_id: null, remote_tombstone: true });
  });

  it('leaves everything alone while it simply cannot reach YouTube', async () => {
    const { db, deps, queueId } = setup({
      confirmedAt: new Date(NOW.getTime() - KEEP_WITHOUT_REFRESH_MS + 60_000),
      authState: 'ok',
      answer: offline
    });
    const result = await checkChannelRetention(deps);
    expect(result).toEqual({ outcome: 'unreachable', verdict: { forget: false } });
    expect(readActiveChannel(db)).not.toBeNull();
    expect(getQueueItem(db, queueId)).toMatchObject({ youtube_video_id: 'yt-1', remote_tombstone: false });
  });

  it('deletes details a month unconfirmed, without touching what the queue uploaded', async () => {
    const { db, deps, queueId, cleared } = setup({
      confirmedAt: new Date(NOW.getTime() - KEEP_WITHOUT_REFRESH_MS),
      authState: 'ok',
      answer: offline
    });
    const result = await checkChannelRetention(deps);
    expect(result.verdict).toEqual({ forget: true, because: 'unconfirmed' });
    expect(readActiveChannel(db)).toBeNull();
    expect(cleared).toEqual(['icon cleared', 'analytics cleared']);
    // Being offline for a month is not permission being taken away: the videos stay linked.
    expect(getQueueItem(db, queueId)).toMatchObject({ youtube_video_id: 'yt-1', remote_tombstone: false });
  });

  it('has nothing to do, and asks YouTube nothing, when no channel is stored', async () => {
    const db = createTestDb();
    let asked = 0;
    const result = await checkChannelRetention({
      db,
      gateway: {
        fetchChannelProfile: () => {
          asked += 1;
          return Promise.resolve({ ok: true as const, value: PROFILE });
        }
      },
      authState: () => 'ok',
      appIcon: { refresh: () => Promise.resolve(true), clear: () => Promise.resolve() },
      analytics: { clear: () => undefined },
      thumbnailDir: path.join(os.tmpdir(), 'shortstack-retention-test-thumbs'),
      uploadMethod: () => 'assisted',
      now: () => NOW
    });
    expect(result).toEqual({ outcome: 'nothing_stored', verdict: { forget: false } });
    expect(asked).toBe(0);
  });
});
