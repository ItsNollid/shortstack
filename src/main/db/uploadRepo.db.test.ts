import { describe, expect, it } from 'vitest';
import { TEST_NOW, createTestDb, seedQueueItem } from './testFixtures';
import { listUploads, recordUpload } from './uploadRepo';

describe('uploadRepo', () => {
  it('records a successful upload with its video id', () => {
    const db = createTestDb();
    const queueId = seedQueueItem(db, { filename: 'peter.mov' });
    recordUpload(db, { queueId, youtubeVideoId: 'yt-1', status: 'success', method: 'api', now: TEST_NOW });

    expect(listUploads(db)).toEqual([
      expect.objectContaining({
        queue_id: queueId,
        youtube_video_id: 'yt-1',
        status: 'success',
        method: 'api',
        uploaded_at: TEST_NOW.toISOString(),
        filename: 'peter.mov',
        retry_count: 0
      })
    ]);
  });

  it('records failures too, which the old build never did', () => {
    const db = createTestDb();
    const queueId = seedQueueItem(db);
    recordUpload(db, {
      queueId,
      youtubeVideoId: null,
      status: 'failed',
      method: 'api',
      errorMessage: 'Upload failed (503)',
      errorCode: 'backendError',
      now: TEST_NOW
    });

    const [entry] = listUploads(db);
    expect(entry).toMatchObject({ status: 'failed', error_message: 'Upload failed (503)', error_code: 'backendError', uploaded_at: null });
  });

  it('counts attempts so History can show a retry number', () => {
    const db = createTestDb();
    const queueId = seedQueueItem(db);
    recordUpload(db, { queueId, youtubeVideoId: null, status: 'failed', method: 'api', now: TEST_NOW });
    recordUpload(db, { queueId, youtubeVideoId: null, status: 'failed', method: 'api', now: TEST_NOW });
    recordUpload(db, { queueId, youtubeVideoId: 'yt-2', status: 'success', method: 'api', now: TEST_NOW });

    expect(listUploads(db).map((entry) => entry.retry_count)).toEqual([2, 1, 0]);
  });

  it('lists newest first with the title and filename joined in', () => {
    const db = createTestDb();
    const first = seedQueueItem(db, { filename: 'a.mov' });
    const second = seedQueueItem(db, { filename: 'b.mov' });
    recordUpload(db, { queueId: first, youtubeVideoId: 'yt-a', status: 'success', method: 'api', now: TEST_NOW });
    recordUpload(db, { queueId: second, youtubeVideoId: 'yt-b', status: 'success', method: 'assisted', now: TEST_NOW });

    expect(listUploads(db).map((entry) => entry.filename)).toEqual(['b.mov', 'a.mov']);
    expect(listUploads(db)[0]).toMatchObject({ method: 'assisted', title: 'b' });
  });
});
