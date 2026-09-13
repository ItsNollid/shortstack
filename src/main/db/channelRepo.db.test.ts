import { describe, expect, it } from 'vitest';
import { createTestDb } from './testFixtures';
import { clearChannels, readActiveChannel, upsertChannel } from './channelRepo';

const NOW = new Date('2026-09-12T12:00:00.000Z');
const base = { id: 'UC1', title: 'Mine', handle: null, avatarUrl: null, subscriberCount: null };

describe('the connected channel', () => {
  it('is stored and read back', () => {
    const db = createTestDb();
    upsertChannel(db, { ...base, handle: '@mine', subscriberCount: 12, uploadsPlaylistId: 'UU1' }, NOW);

    const channel = readActiveChannel(db);
    expect(channel?.title).toBe('Mine');
    expect(channel?.handle).toBe('@mine');
    expect(channel?.subscriberCount).toBe(12);
    db.close();
  });

  it('keeps only one channel active, so a reconnect to another does not leave two', () => {
    const db = createTestDb();
    upsertChannel(db, { ...base, uploadsPlaylistId: 'UU1' }, NOW);
    upsertChannel(db, { ...base, id: 'UC2', title: 'Other', uploadsPlaylistId: 'UU2' }, NOW);

    expect(readActiveChannel(db)?.id).toBe('UC2');
    const active = db.prepare('SELECT COUNT(*) n FROM channels WHERE is_active = 1').get() as { n: number };
    expect(active.n).toBe(1);
    db.close();
  });

  it('is gone after disconnecting', () => {
    const db = createTestDb();
    upsertChannel(db, { ...base, uploadsPlaylistId: 'UU1' }, NOW);
    clearChannels(db);
    expect(readActiveChannel(db)).toBeNull();
    db.close();
  });
});

describe('the uploads playlist', () => {
  it('is stored and read back, because assisted detection cannot work without it', () => {
    const db = createTestDb();
    upsertChannel(db, { ...base, uploadsPlaylistId: 'UU1' }, NOW);
    expect(readActiveChannel(db)?.uploadsPlaylistId).toBe('UU1');
    db.close();
  });

  it('is not forgotten by a refresh that did not carry one', () => {
    // A later profile read can come back without contentDetails. Losing the playlist would switch
    // assisted detection off again, silently, exactly as a hardcoded null once did.
    const db = createTestDb();
    upsertChannel(db, { ...base, uploadsPlaylistId: 'UU1' }, NOW);
    upsertChannel(db, { ...base, uploadsPlaylistId: null }, NOW);
    expect(readActiveChannel(db)?.uploadsPlaylistId).toBe('UU1');
    db.close();
  });
});
