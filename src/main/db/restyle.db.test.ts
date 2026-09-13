import { describe, expect, it } from 'vitest';
import { listActivity } from './activityRepo';
import { applyRestyle, getQueueItem, previewRestyle } from './queueRepo';
import { writeSetting } from './settingsRepo';
import { TEST_NOW, createTestDb, seedQueueItem } from './testFixtures';

const ctx = { now: TEST_NOW, uploadMethod: 'assisted' as const };

describe('bringing waiting videos into line with the house style', () => {
  // As on the live channel: ALL CAPS titles switched on after some titles were written.
  it('shows what would change, and changes nothing until asked', () => {
    const db = createTestDb();
    const id = seedQueueItem(db, { filename: 'does being a zombie hurt.mov' });
    writeSetting(db, 'format_title_case', 'upper');

    expect(previewRestyle(db)).toEqual([
      { id, title: { before: 'does being a zombie hurt', after: 'DOES BEING A ZOMBIE HURT' }, description: null, tagsChanged: false }
    ]);
    expect(getQueueItem(db, id)?.title).toBe('does being a zombie hurt');
  });

  it('applies it without marking the details as written by the person, and records it', () => {
    const db = createTestDb();
    const id = seedQueueItem(db, { filename: 'does being a zombie hurt.mov' });
    writeSetting(db, 'format_title_case', 'upper');

    expect(applyRestyle(db, [id], ctx)).toEqual({ changed: 1, skipped: 0 });
    const item = getQueueItem(db, id);
    expect(item?.title).toBe('DOES BEING A ZOMBIE HURT');
    // Formatting is not authorship: a video nobody wrote for must still be drafted.
    expect(item?.metadata_edited_at).toBeNull();
    expect(listActivity(db, { queueId: id }).map((entry) => entry.action)).toContain('house_style');
    expect(previewRestyle(db)).toEqual([]);
  });

  it('leaves videos already on YouTube, and rejected ones, alone', () => {
    const db = createTestDb();
    const uploaded = seedQueueItem(db, { filename: 'already up.mov', state: 'uploaded', youtubeVideoId: 'abc123' });
    const rejected = seedQueueItem(db, { filename: 'not this one.mov', state: 'rejected' });
    writeSetting(db, 'format_title_case', 'upper');

    expect(previewRestyle(db)).toEqual([]);
    expect(applyRestyle(db, [uploaded, rejected], ctx)).toEqual({ changed: 0, skipped: 2 });
    expect(getQueueItem(db, uploaded)?.title).toBe('already up');
  });

  it('does nothing a second time', () => {
    const db = createTestDb();
    const id = seedQueueItem(db, { filename: 'clip.mov' });
    writeSetting(db, 'format_title_case', 'upper');
    applyRestyle(db, [id], ctx);
    expect(applyRestyle(db, [id], ctx)).toEqual({ changed: 0, skipped: 0 });
  });
});
