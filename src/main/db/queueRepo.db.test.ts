import { describe, expect, it } from 'vitest';
import { listActivity } from './activityRepo';
import { applyDraft, applyQueueEvent, countQueueByState, getQueueItem, listQueueItems, updateQueueMetadata } from './queueRepo';
import { TEST_NOW, createTestDb, rawQueueRow, seedQueueItem } from './testFixtures';

const ctx = { now: TEST_NOW, uploadMethod: 'assisted' as const };
const later = (minutes: number) => new Date(TEST_NOW.getTime() + minutes * 60_000).toISOString();

describe('queue rows become typed values', () => {
  it('returns booleans, arrays and joined video fields', () => {
    const db = createTestDb();
    const id = seedQueueItem(db, { filename: 'peter.mov' });
    const item = getQueueItem(db, id);
    expect(item).toMatchObject({
      id,
      title: 'peter',
      tags: [],
      platforms: ['youtube'],
      notify_subscribers: false,
      made_for_kids: false,
      remote_tombstone: false,
      missing: false,
      filename: 'peter.mov',
      filepath: 'E:/Shorts/peter.mov',
      file_size: 1024,
      state: 'pending'
    });
    expect(listQueueItems(db)).toHaveLength(1);
  });

  it('survives rows the old build could produce', () => {
    const db = createTestDb();
    const id = seedQueueItem(db);
    db.prepare("UPDATE queue SET tags = 'not json', platforms = NULL, state = 'bogus', privacy = 'friends' WHERE id = ?").run(id);
    expect(getQueueItem(db, id)).toMatchObject({ tags: [], platforms: ['youtube'], state: 'pending', privacy: 'private' });
  });
});

describe('applyQueueEvent', () => {
  it('applies a transition, bumps updated_at and records the action', () => {
    const db = createTestDb();
    const id = seedQueueItem(db);
    const result = applyQueueEvent(db, id, { type: 'approve' }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.item.state).toBe('approved');
      expect(result.item.updated_at).toBe(TEST_NOW.toISOString());
    }
    expect(listActivity(db, { queueId: id }).map((entry) => entry.detail)).toEqual(['Approved for upload']);
  });

  it('returns the refusal reason and changes nothing', () => {
    const db = createTestDb();
    const id = seedQueueItem(db, { state: 'approved' });
    const before = rawQueueRow(db, id);
    const result = applyQueueEvent(db, id, { type: 'approve' }, ctx);
    expect(result).toEqual({ ok: false, reason: expect.stringMatching(/Only pending/) });
    expect(rawQueueRow(db, id)).toEqual(before);
    expect(listActivity(db, { queueId: id })).toHaveLength(0);
  });

  it('stores booleans as integers and arrays as JSON', () => {
    const db = createTestDb();
    const id = seedQueueItem(db, { state: 'uploading' });
    applyQueueEvent(db, id, { type: 'upload_completed', videoId: 'yt1' }, { ...ctx, uploadMethod: 'api' });
    applyQueueEvent(db, id, { type: 'disconnect' }, ctx);
    const row = rawQueueRow(db, id);
    expect(row.remote_tombstone).toBe(1);
    expect(row.youtube_video_id).toBeNull();
    expect(typeof row.remote_tombstone).toBe('number');
  });

  it('refuses an edit based on a stale view of the row', () => {
    const db = createTestDb();
    const id = seedQueueItem(db);
    const stale = getQueueItem(db, id)!.updated_at;
    applyQueueEvent(db, id, { type: 'approve' }, { ...ctx, now: new Date(TEST_NOW.getTime() - 60_000) });
    const result = applyQueueEvent(db, id, { type: 'unapprove' }, { ...ctx, expectedUpdatedAt: stale });
    expect(result).toEqual({ ok: false, reason: expect.stringMatching(/changed while you were working/) });
    expect(getQueueItem(db, id)!.state).toBe('approved');
  });

  it('reports a missing row instead of throwing', () => {
    const db = createTestDb();
    expect(applyQueueEvent(db, 999, { type: 'approve' }, ctx)).toEqual({ ok: false, reason: expect.stringMatching(/no longer/) });
  });

  it('counts by state', () => {
    const db = createTestDb();
    seedQueueItem(db, { filename: 'a.mov' });
    const second = seedQueueItem(db, { filename: 'b.mov' });
    applyQueueEvent(db, second, { type: 'approve' }, ctx);
    expect(countQueueByState(db)).toEqual({ pending: 1, approved: 1 });
  });
});

describe('updateQueueMetadata', () => {
  it('writes allowed fields and marks uploaded videos for remote sync', () => {
    const db = createTestDb();
    const id = seedQueueItem(db, { state: 'uploaded', youtubeVideoId: 'yt1' });
    const result = updateQueueMetadata(db, id, { title: 'New title', tags: ['shorts', 'call of duty'], made_for_kids: true }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.item).toMatchObject({ title: 'New title', tags: ['shorts', 'call of duty'], made_for_kids: true, remote_sync: 'pending' });
    }
    const row = rawQueueRow(db, id);
    expect(row.tags).toBe('["shorts","call of duty"]');
    expect(row.made_for_kids).toBe(1);
  });

  it('rejects values YouTube would refuse', () => {
    const db = createTestDb();
    const id = seedQueueItem(db);
    expect(updateQueueMetadata(db, id, { title: 'x'.repeat(101) }, ctx)).toEqual({ ok: false, reason: expect.stringMatching(/100 characters/) });
    expect(updateQueueMetadata(db, id, { title: 'a <b>' }, ctx)).toEqual({ ok: false, reason: expect.stringMatching(/< or >/) });
    expect(getQueueItem(db, id)!.title).toBe('clip');
  });

  it('never lets an unknown key reach the SQL', () => {
    const db = createTestDb();
    const id = seedQueueItem(db);
    const attack = { 'state = \'approved\' WHERE 1=1 --': 'x' } as unknown as { title?: string };
    expect(updateQueueMetadata(db, id, attack, ctx)).toEqual({ ok: false, reason: expect.stringMatching(/can't be edited/) });
    expect(getQueueItem(db, id)!.state).toBe('pending');
  });

  it('refuses edits while an upload is in flight', () => {
    const db = createTestDb();
    const id = seedQueueItem(db, { state: 'uploading' });
    expect(updateQueueMetadata(db, id, { title: 'nope' }, ctx)).toEqual({ ok: false, reason: expect.stringMatching(/upload to finish/) });
  });

  it('schedules only what the state machine allows', () => {
    const db = createTestDb();
    const id = seedQueueItem(db, { state: 'approved' });
    expect(applyQueueEvent(db, id, { type: 'schedule', at: later(120) }, ctx).ok).toBe(true);
    expect(getQueueItem(db, id)).toMatchObject({ scheduled_for: later(120), schedule_source: 'manual' });
    expect(applyQueueEvent(db, id, { type: 'schedule', at: later(5) }, ctx)).toEqual({
      ok: false,
      reason: expect.stringMatching(/30 minutes/)
    });
  });
});

describe('applyDraft', () => {
  const draft = { title: 'Drafted title', description: '#zombies #bo3', tags: ['cod zombies'] };

  it('writes the details and records that the model wrote them', () => {
    const db = createTestDb();
    const id = seedQueueItem(db);

    const result = applyDraft(db, id, draft, ctx);

    expect(result.ok).toBe(true);
    expect(getQueueItem(db, id)).toMatchObject({ title: 'Drafted title', tags: ['cod zombies'] });
    expect(rawQueueRow(db, id).ai_drafted_at).toBe(TEST_NOW.toISOString());
    // The distinction the whole feature rests on: this is not a person editing.
    expect(rawQueueRow(db, id).metadata_edited_at).toBeNull();
    expect(listActivity(db, { queueId: id }).some((entry) => entry.action === 'ai_drafted')).toBe(true);
  });

  // A draft takes seconds. Someone can type into the video while it is in flight, and what they
  // typed has to win.
  it('refuses once the video has been edited, even if the request was already under way', () => {
    const db = createTestDb();
    const id = seedQueueItem(db);
    updateQueueMetadata(db, id, { title: 'Mine' }, ctx);

    const result = applyDraft(db, id, draft, ctx);

    expect(result).toEqual({ ok: false, reason: expect.stringMatching(/edited this video/) });
    expect(getQueueItem(db, id)?.title).toBe('Mine');
  });

  it('refuses a video that is gone, and details YouTube would not take', () => {
    const db = createTestDb();
    const id = seedQueueItem(db);
    expect(applyDraft(db, 9999, draft, ctx).ok).toBe(false);
    expect(applyDraft(db, id, { ...draft, title: 'x'.repeat(101) }, ctx).ok).toBe(false);
  });
});

describe('applyDraft writes only what it is given', () => {
  it('writes a chosen field and leaves the others as they were', () => {
    const db = createTestDb();
    const id = seedQueueItem(db);
    const before = getQueueItem(db, id);

    const result = applyDraft(db, id, { description: '#minecraft #shorts' }, ctx);

    expect(result.ok).toBe(true);
    const after = getQueueItem(db, id);
    expect(after?.description).toBe('#minecraft #shorts');
    expect(after?.title).toBe(before?.title);
    expect(after?.tags).toEqual(before?.tags);
  });

  it('says in the record exactly which details it wrote', () => {
    const db = createTestDb();
    const id = seedQueueItem(db);
    applyDraft(db, id, { title: 'Drafted', tags: ['clip'] }, ctx);
    const entry = listActivity(db, { queueId: id }).find((each) => each.action === 'ai_drafted');
    expect(entry?.detail).toBe('Title and tags written by the local model');
  });

  // Marking a video drafted when nothing was written would stop the worker ever coming back to it.
  it('refuses a draft with nothing in it, rather than marking the video drafted', () => {
    const db = createTestDb();
    const id = seedQueueItem(db);
    expect(applyDraft(db, id, {}, ctx).ok).toBe(false);
    expect(rawQueueRow(db, id).ai_drafted_at).toBeNull();
  });
});
