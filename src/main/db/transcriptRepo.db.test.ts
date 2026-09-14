import { describe, expect, it } from 'vitest';
import { getQueueItem } from './queueRepo';
import { createTestDb, seedQueueItem } from './testFixtures';
import { clearTranscripts, readTranscript, saveTranscript } from './transcriptRepo';

const SEGMENTS = [{ from: 13960, to: 15240, text: "I'm going to bed, guys." }];

function video(): { db: ReturnType<typeof createTestDb>; videoId: number } {
  const db = createTestDb();
  const videoId = getQueueItem(db, seedQueueItem(db, { filename: 'bed.mov' }))?.video_id as number;
  db.prepare('UPDATE videos SET file_size = 19330257, mtime_ms = 1757800000000 WHERE id = ?').run(videoId);
  return { db, videoId };
}

describe('what was said in a video', () => {
  it('is kept once per video and read back', () => {
    const { db, videoId } = video();
    expect(readTranscript(db, videoId)).toBeNull();
    saveTranscript(db, videoId, { model: 'medium.en-q5_0', backend: 'gpu', madeAt: '2026-09-14T10:00:00.000Z', segments: SEGMENTS });
    expect(readTranscript(db, videoId)).toEqual({ model: 'medium.en-q5_0', backend: 'gpu', madeAt: '2026-09-14T10:00:00.000Z', segments: SEGMENTS });
  });

  it('stops counting once the file is rendered again', () => {
    const { db, videoId } = video();
    saveTranscript(db, videoId, { model: 'small.en-q5_1', backend: 'cpu', madeAt: '2026-09-14T10:00:00.000Z', segments: SEGMENTS });
    db.prepare('UPDATE videos SET file_size = 20000000 WHERE id = ?').run(videoId);
    expect(readTranscript(db, videoId)).toBeNull();
  });

  it('drops anything stored that is not a segment, and can all be removed', () => {
    const { db, videoId } = video();
    saveTranscript(db, videoId, { model: 'small.en-q5_1', backend: 'cpu', madeAt: '2026-09-14T10:00:00.000Z', segments: SEGMENTS });
    db.prepare('UPDATE video_transcripts SET segments = ? WHERE video_id = ?').run(JSON.stringify([...SEGMENTS, { text: 'no times' }]), videoId);
    expect(readTranscript(db, videoId)?.segments).toEqual(SEGMENTS);
    expect(clearTranscripts(db)).toBe(1);
    expect(readTranscript(db, videoId)).toBeNull();
  });
});
