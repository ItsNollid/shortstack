import { describe, expect, it } from 'vitest';
import { applyDraft, getQueueItem, listTitleAngles, updateQueueMetadata } from './queueRepo';
import { createTestDb, seedQueueItem } from './testFixtures';

const ctx = () => ({ now: new Date('2026-09-14T10:00:00.000Z'), uploadMethod: 'assisted' as const });

describe('the kind of title a posting uses', () => {
  it('is recorded with a title taken from the offers, and kept through a small edit saved without it', () => {
    const db = createTestDb();
    const id = seedQueueItem(db, { filename: 'clip.mov' });
    expect(updateQueueMetadata(db, id, { title: 'Zombies take the lobby', title_angle: 'play' }, ctx())).toMatchObject({ ok: true });
    expect(getQueueItem(db, id)?.title_angle).toBe('play');

    // Review saves the title on its own, without saying which kind it is.
    expect(updateQueueMetadata(db, id, { title: 'Zombies take the whole lobby' }, ctx())).toMatchObject({ ok: true });
    expect(getQueueItem(db, id)?.title_angle).toBe('play');
  });

  it('is dropped when the title is written over', () => {
    const db = createTestDb();
    const id = seedQueueItem(db, { filename: 'clip.mov' });
    updateQueueMetadata(db, id, { title: 'Zombies take the lobby', title_angle: 'play' }, ctx());
    updateQueueMetadata(db, id, { title: 'Goodnight from the campfire crew' }, ctx());
    expect(getQueueItem(db, id)?.title_angle).toBeNull();
  });

  it('is left alone by an edit that does not touch the title', () => {
    const db = createTestDb();
    const id = seedQueueItem(db, { filename: 'clip.mov' });
    updateQueueMetadata(db, id, { title: 'Zombies take the lobby', title_angle: 'play' }, ctx());
    updateQueueMetadata(db, id, { tags: ['bo3 zombies'] }, ctx());
    expect(getQueueItem(db, id)?.title_angle).toBe('play');
  });

  it('refuses a kind that does not exist', () => {
    const db = createTestDb();
    const id = seedQueueItem(db, { filename: 'clip.mov' });
    expect(updateQueueMetadata(db, id, { title: 'Anything', title_angle: 'clickbait' as never }, ctx())).toMatchObject({ ok: false });
  });

  it('comes with a drafted title, and not with a draft that leaves the title alone', () => {
    const db = createTestDb();
    const drafted = seedQueueItem(db, { filename: 'drafted.mov' });
    expect(applyDraft(db, drafted, { title: 'He really said goodnight', titleAngle: 'reaction' }, ctx())).toMatchObject({ ok: true });
    expect(getQueueItem(db, drafted)?.title_angle).toBe('reaction');

    const untitled = seedQueueItem(db, { filename: 'untitled.mov' });
    expect(applyDraft(db, untitled, { tags: ['bo3 zombies'] }, ctx())).toMatchObject({ ok: true });
    expect(getQueueItem(db, untitled)?.title_angle).toBeNull();
  });

  it('is listed by YouTube video id, only for postings that are on YouTube and have one', () => {
    const db = createTestDb();
    const up = seedQueueItem(db, { filename: 'up.mov' });
    const upWithout = seedQueueItem(db, { filename: 'up-without.mov' });
    const waiting = seedQueueItem(db, { filename: 'waiting.mov' });
    db.prepare("UPDATE queue SET youtube_video_id = 'abc123', title_angle = 'joke' WHERE id = ?").run(up);
    db.prepare("UPDATE queue SET youtube_video_id = 'def456' WHERE id = ?").run(upWithout);
    db.prepare("UPDATE queue SET title_angle = 'play' WHERE id = ?").run(waiting);
    expect(listTitleAngles(db)).toEqual(new Map([['abc123', 'joke']]));
  });
});
