import { describe, expect, it } from 'vitest';
import type { StillReading } from '../../shared/videoReading';
import { getQueueItem } from './queueRepo';
import { clearReading, readReading, saveReading } from './readingRepo';
import { createTestDb, seedQueueItem } from './testFixtures';

const still = (part: string, what: string): StillReading => ({ part, time: 4, scene: 'gameplay', appeal: 3, what });

describe('what the model saw in a video', () => {
  it('is kept once per video, and replaced when it is looked at again', () => {
    const db = createTestDb();
    const videoId = getQueueItem(db, seedQueueItem(db, { filename: 'clip.mov' }))?.video_id as number;
    expect(readReading(db, videoId)).toBeNull();

    saveReading(db, videoId, { model: 'qwen3-vl:8b', readAt: '2026-09-14T10:00:00.000Z', stills: [still('s0', 'first look')] });
    saveReading(db, videoId, { model: 'qwen3-vl:8b', readAt: '2026-09-14T11:00:00.000Z', stills: [still('s0', 'second look')] });

    expect(readReading(db, videoId)).toEqual({ model: 'qwen3-vl:8b', readAt: '2026-09-14T11:00:00.000Z', stills: [still('s0', 'second look')] });

    clearReading(db, videoId);
    expect(readReading(db, videoId)).toBeNull();
  });

  it('drops anything stored that is not a reading, and anything extra stored with one', () => {
    const db = createTestDb();
    const videoId = getQueueItem(db, seedQueueItem(db, { filename: 'clip.mov' }))?.video_id as number;
    db.prepare('INSERT INTO video_readings (video_id, model, read_at, stills) VALUES (?, ?, ?, ?)').run(
      videoId,
      'qwen3-vl:8b',
      '2026-09-14T10:00:00.000Z',
      JSON.stringify([{ ...still('s0', 'fine'), game: 'Rust' }, { part: 's1', scene: 'epic' }])
    );
    expect(readReading(db, videoId)?.stills).toEqual([still('s0', 'fine')]);
  });
});
