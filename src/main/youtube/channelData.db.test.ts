import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { readActiveChannel, upsertChannel } from '../db/channelRepo';
import { getQueueItem } from '../db/queueRepo';
import { readSettings, writeSetting } from '../db/settingsRepo';
import { createTestDb, seedQueueItem } from '../db/testFixtures';
import { forgetChannelData, type ForgetReason } from './channelData';

const NOW = new Date('2026-09-19T12:00:00.000Z');

function channelWithFindings() {
  const db = createTestDb();
  upsertChannel(
    db,
    { id: 'UC_nollid', title: 'Nollid', handle: '@nollid', avatarUrl: null, subscriberCount: 1234, uploadsPlaylistId: 'UU_nollid' },
    NOW
  );
  writeSetting(db, 'insight_findings', JSON.stringify({ usable: [], missing: [], videoCount: 34, tooEarly: false }));
  db.prepare("INSERT INTO analytics (youtube_video_id, date, views) VALUES ('yt-1', '2026-09-01', 900)").run();
  const queueId = seedQueueItem(db, { filename: 'posted.mov', state: 'uploaded', youtubeVideoId: 'yt-1' });
  return { db, queueId };
}

const forget = (db: ReturnType<typeof createTestDb>, reason: ForgetReason) =>
  forgetChannelData(
    {
      db,
      thumbnailDir: path.join(os.tmpdir(), 'shortstack-forget-test-thumbs'),
      appIcon: { clear: () => Promise.resolve() },
      analytics: { clear: () => undefined },
      now: NOW,
      uploadMethod: 'assisted'
    },
    reason
  );

describe('taking the channel’s data off this computer', () => {
  it.each<ForgetReason>(['access_gone', 'unconfirmed'])('removes the findings worked out from its analytics (%s)', async (reason) => {
    const { db } = channelWithFindings();
    await forget(db, reason);
    expect(readActiveChannel(db)).toBeNull();
    expect(readSettings(db).settings.insight_findings).toBe('');
    expect(db.prepare('SELECT COUNT(*) AS rows FROM analytics').get()).toEqual({ rows: 0 });
  });

  it('marks uploaded videos as no longer ours only when access is gone, not after a quiet month', async () => {
    const gone = channelWithFindings();
    await forget(gone.db, 'access_gone');
    expect(getQueueItem(gone.db, gone.queueId)).toMatchObject({ youtube_video_id: null, remote_tombstone: true });

    const quiet = channelWithFindings();
    await forget(quiet.db, 'unconfirmed');
    expect(getQueueItem(quiet.db, quiet.queueId)).toMatchObject({ youtube_video_id: 'yt-1', remote_tombstone: false });
  });
});
