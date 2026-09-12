import { describe, expect, it } from 'vitest';
import { HASH_ALGO } from '../files/fileIdentity';
import { applyQueueEvent, getQueueItem } from './queueRepo';
import { TEST_NOW, createTestDb } from './testFixtures';
import {
  findVideoByHash,
  findVideoByPath,
  insertVideoWithQueueItem,
  listKnownVideos,
  queueIdForVideo,
  setVideoMissing,
  setVideoProbe,
  updateVideoStats,
  type NewVideo,
  type QueueDefaults
} from './videoRepo';

const video = (overrides: Partial<NewVideo> = {}): NewVideo => ({
  filename: 'clip.mov',
  filepath: 'E:/Shorts/clip.mov',
  fileHash: 'hash-a',
  hashAlgo: HASH_ALGO,
  fileSize: 1000,
  mtimeMs: 500,
  ...overrides
});

const defaults = (overrides: Partial<QueueDefaults> = {}): QueueDefaults => ({
  title: 'clip',
  description: 'from settings',
  tags: ['shorts'],
  categoryId: '22',
  privacy: 'private',
  notifySubscribers: false,
  madeForKids: false,
  platforms: ['youtube'],
  ...overrides
});

describe('insertVideoWithQueueItem', () => {
  it('creates the video and its queue row together, applying the user defaults', () => {
    const db = createTestDb();
    const { videoId, queueId } = insertVideoWithQueueItem(db, video(), defaults(), TEST_NOW);

    expect(queueIdForVideo(db, videoId)).toBe(queueId);
    expect(getQueueItem(db, queueId)).toMatchObject({
      state: 'pending',
      title: 'clip',
      description: 'from settings',
      tags: ['shorts'],
      privacy: 'private',
      notify_subscribers: false,
      made_for_kids: false,
      platforms: ['youtube'],
      filename: 'clip.mov',
      missing: false
    });
  });

  it('applies the private default rather than the old build hardcoded public', () => {
    const db = createTestDb();
    const { queueId } = insertVideoWithQueueItem(db, video(), defaults({ privacy: 'private' }), TEST_NOW);
    expect(getQueueItem(db, queueId)?.privacy).toBe('private');
  });

  it('rolls back both rows when the insert cannot complete', () => {
    const db = createTestDb();
    insertVideoWithQueueItem(db, video(), defaults(), TEST_NOW);
    // file_hash is unique: a second insert of the same content must leave nothing behind.
    expect(() => insertVideoWithQueueItem(db, video({ filepath: 'E:/Shorts/copy.mov' }), defaults(), TEST_NOW)).toThrow();
    expect(db.prepare('SELECT COUNT(*) AS n FROM videos').get()).toEqual({ n: 1 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM queue').get()).toEqual({ n: 1 });
  });
});

describe('lookups', () => {
  it('finds videos by path and by content hash', () => {
    const db = createTestDb();
    const { videoId } = insertVideoWithQueueItem(db, video(), defaults(), TEST_NOW);
    expect(findVideoByPath(db, 'E:/Shorts/clip.mov')?.id).toBe(videoId);
    expect(findVideoByHash(db, 'hash-a')?.id).toBe(videoId);
    expect(findVideoByPath(db, 'E:/Shorts/missing.mov')).toBeUndefined();
    expect(listKnownVideos(db)).toHaveLength(1);
  });

  it('reports whether a video already reached YouTube', () => {
    const db = createTestDb();
    const { videoId, queueId } = insertVideoWithQueueItem(db, video(), defaults(), TEST_NOW);
    expect(findVideoByPath(db, 'E:/Shorts/clip.mov')?.reachedYouTube).toBe(false);

    applyQueueEvent(db, queueId, { type: 'upload_completed', videoId: 'yt-1' }, { now: TEST_NOW, uploadMethod: 'api' });
    expect(findVideoByPath(db, 'E:/Shorts/clip.mov')?.reachedYouTube).toBe(true);

    applyQueueEvent(db, queueId, { type: 'disconnect' }, { now: TEST_NOW, uploadMethod: 'api' });
    // A tombstone still counts: the video was on YouTube even though the id is gone.
    expect(listKnownVideos(db).find((v) => v.id === videoId)?.reachedYouTube).toBe(true);
  });
});

describe('updates', () => {
  it('records new stats and clears the missing flag', () => {
    const db = createTestDb();
    const { videoId } = insertVideoWithQueueItem(db, video(), defaults(), TEST_NOW);
    setVideoMissing(db, videoId, true);
    expect(db.prepare('SELECT missing FROM videos WHERE id = ?').get(videoId)).toEqual({ missing: 1 });

    updateVideoStats(db, videoId, { fileHash: 'hash-b', hashAlgo: HASH_ALGO, fileSize: 2000, mtimeMs: 900 });
    const row = findVideoByPath(db, 'E:/Shorts/clip.mov');
    expect(row).toMatchObject({ file_hash: 'hash-b', file_size: 2000, mtime_ms: 900 });
    expect(db.prepare('SELECT missing FROM videos WHERE id = ?').get(videoId)).toEqual({ missing: 0 });
  });

  it('stores probed duration and dimensions for the queue view', () => {
    const db = createTestDb();
    const { videoId, queueId } = insertVideoWithQueueItem(db, video(), defaults(), TEST_NOW);
    setVideoProbe(db, videoId, { durationS: 42.5, width: 1080, height: 1920 });
    expect(getQueueItem(db, queueId)).toMatchObject({ duration_s: 42.5, width: 1080, height: 1920 });
  });
});
