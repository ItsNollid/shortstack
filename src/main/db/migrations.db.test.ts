import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from './connection';
import {
  LATEST_SCHEMA_VERSION,
  MIGRATIONS,
  legacyBackfill,
  migrate,
  normalizeLegacyTags,
  normalizeLegacyTimestamp,
  type Migration
} from './migrations';

const NOW = new Date('2026-09-12T12:00:00.000Z');
const tempDirs: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shortstack-db-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** The exact schema the original build created, optionally without the later `platforms` column. */
function createLegacySchema(db: Database.Database, withPlatforms: boolean): void {
  db.exec(`
    CREATE TABLE videos (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT NOT NULL, filepath TEXT NOT NULL,
      file_hash TEXT UNIQUE, status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE queue (id INTEGER PRIMARY KEY AUTOINCREMENT, video_id INTEGER REFERENCES videos(id), channel_id TEXT,
      title TEXT, description TEXT, tags TEXT, category_id TEXT DEFAULT '22', privacy TEXT DEFAULT 'public',
      notify_subscribers INTEGER DEFAULT 0, made_for_kids INTEGER DEFAULT 0, scheduled_for DATETIME,
      approved INTEGER DEFAULT 0, ${withPlatforms ? `platforms TEXT DEFAULT '["youtube"]',` : ''}
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE uploads (id INTEGER PRIMARY KEY AUTOINCREMENT, queue_id INTEGER REFERENCES queue(id), youtube_video_id TEXT,
      uploaded_at DATETIME, status TEXT, error_message TEXT, retry_count INTEGER DEFAULT 0);
    CREATE TABLE analytics (id INTEGER PRIMARY KEY AUTOINCREMENT, youtube_video_id TEXT, date DATE, views INTEGER);
    CREATE TABLE channel_analytics (id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id TEXT, date DATE, total_views INTEGER);
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE channels (id TEXT PRIMARY KEY, name TEXT, is_active INTEGER DEFAULT 1, credentials_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  `);
}

function seedLegacyRows(db: Database.Database): void {
  const video = db.prepare('INSERT INTO videos (filename, filepath, file_hash, status, created_at) VALUES (?, ?, ?, ?, ?)');
  video.run('approved-not-uploaded.mov', 'E:\\a.mov', 'h1', 'pending', '2026-09-01 10:00:00');
  video.run('uploaded-once.mov', 'E:\\b.mov', 'h2', 'uploaded', '2026-09-01 10:00:00');
  video.run('uploaded-twice.mov', 'E:\\c.mov', 'h3', 'uploaded', '2026-09-01 10:00:00');
  video.run('marked-uploaded-only.mov', 'E:\\d.mov', 'h4', 'uploaded', '2026-09-01 10:00:00');
  video.run('rejected-orphan.mov', 'E:\\e.mov', 'h5', 'pending', '2026-09-01 10:00:00');

  const queue = db.prepare(
    "INSERT INTO queue (video_id, title, description, tags, approved, scheduled_for, created_at) VALUES (?, ?, ?, ?, 1, ?, '2026-09-01 10:05:00')"
  );
  queue.run(1, 'Approved', '', '', null);
  queue.run(2, 'Once', 'desc', '["a","b"]', null);
  queue.run(3, 'Twice', 'desc', 'x, y', null);
  queue.run(4, 'Unrecorded', null, null, '2026-09-20 18:00:00');

  const upload = db.prepare("INSERT INTO uploads (queue_id, youtube_video_id, uploaded_at, status) VALUES (?, ?, ?, 'success')");
  upload.run(2, 'yt-once', '2026-09-02T09:00:00.000Z');
  upload.run(3, 'yt-first', '2026-09-02T09:00:00.000Z');
  upload.run(3, 'yt-second', '2026-09-02T10:00:00.000Z');

  db.prepare("INSERT INTO settings (key, value) VALUES ('shorts_folder', 'E:\\Youtube'), ('scheduler_paused', 'true')").run();
}

const columnsOf = (db: Database.Database, table: string) =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name);

const tableExists = (db: Database.Database, name: string) =>
  db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;

describe('migrate', () => {
  it('builds the full schema on a fresh database', () => {
    const db = new Database(':memory:');
    const result = migrate(db, { now: () => NOW });
    expect(result).toEqual({ migratedFrom: 0, migratedTo: LATEST_SCHEMA_VERSION, backupPath: null });
    expect(db.pragma('user_version', { simple: true })).toBe(LATEST_SCHEMA_VERSION);
    expect(columnsOf(db, 'queue')).toEqual(expect.arrayContaining(['platforms', 'state', 'youtube_video_id', 'remote_tombstone', 'attention_code']));
    expect(tableExists(db, 'activity_log')).toBe(true);
  });

  for (const withPlatforms of [true, false]) {
    it(`migrates a legacy database with rows (${withPlatforms ? 'with' : 'without'} the platforms column)`, () => {
      const db = new Database(':memory:');
      createLegacySchema(db, withPlatforms);
      seedLegacyRows(db);

      migrate(db, { now: () => NOW });

      const rows = db.prepare('SELECT * FROM queue ORDER BY video_id').all() as Array<Record<string, unknown>>;
      expect(rows).toHaveLength(5);
      const byTitle = Object.fromEntries(rows.map((r) => [r.title, r]));

      expect(byTitle['Approved']).toMatchObject({ state: 'pending', approved: 0, tags: '[]', platforms: '["youtube"]' });
      expect(byTitle['Once']).toMatchObject({ state: 'uploaded', youtube_video_id: 'yt-once', schedule_source: 'hold', remote_sync: 'pending' });
      expect(byTitle['Twice']).toMatchObject({
        state: 'needs_attention',
        attention_code: 'duplicate_uploads',
        youtube_video_id: 'yt-second',
        tags: '["x","y"]'
      });
      expect(byTitle['Unrecorded']).toMatchObject({ state: 'needs_attention', attention_code: 'legacy_unrecorded_upload', description: '' });
      expect(byTitle['rejected-orphan']).toMatchObject({ state: 'rejected', privacy: 'private', video_id: 5 });

      expect(rows.every((r) => r.approved === 0)).toBe(true);
      expect(byTitle['Approved'].created_at).toBe('2026-09-01T10:05:00.000Z');
      expect(byTitle['Approved'].updated_at).toBe('2026-09-01T10:05:00.000Z');
      expect(db.prepare("SELECT value FROM settings WHERE key = 'shorts_folder'").get()).toEqual({ value: 'E:\\Youtube' });
      expect(db.prepare('SELECT hash_algo, missing FROM videos WHERE id = 1').get()).toEqual({ hash_algo: 'legacy-md5-1mib-size', missing: 0 });
    });
  }

  it('is idempotent', () => {
    const db = new Database(':memory:');
    createLegacySchema(db, false);
    seedLegacyRows(db);
    migrate(db, { now: () => NOW });
    const snapshot = db.prepare('SELECT * FROM queue ORDER BY id').all();

    expect(migrate(db, { now: () => NOW })).toEqual({ migratedFrom: LATEST_SCHEMA_VERSION, migratedTo: LATEST_SCHEMA_VERSION, backupPath: null });
    expect(db.prepare('SELECT * FROM queue ORDER BY id').all()).toEqual(snapshot);
  });

  it('refuses databases from a newer version', () => {
    const db = new Database(':memory:');
    db.pragma(`user_version = ${LATEST_SCHEMA_VERSION + 1}`);
    expect(() => migrate(db)).toThrow(/newer version/);
  });

  it('rolls back a failing migration, including its version bump', () => {
    const db = new Database(':memory:');
    const good: Migration = { version: 1, name: 'good', up: (d) => d.exec('CREATE TABLE a (x)') };
    const bad: Migration = {
      version: 2,
      name: 'bad',
      up: (d) => {
        d.exec('CREATE TABLE b (x)');
        throw new Error('boom');
      }
    };
    expect(() => migrate(db, { migrations: [good, bad] })).toThrow('boom');
    expect(db.pragma('user_version', { simple: true })).toBe(1);
    expect(tableExists(db, 'a')).toBe(true);
    expect(tableExists(db, 'b')).toBe(false);
  });

  it('writes a pre-migration backup for existing databases only', () => {
    const dir = tempDir();
    const file = path.join(dir, 'shortstack.db');
    const legacy = new Database(file);
    createLegacySchema(legacy, false);
    seedLegacyRows(legacy);
    legacy.close();

    const { db, migration } = openDatabase(file, () => NOW);
    expect(migration.migratedFrom).toBe(0);
    expect(migration.backupPath).not.toBeNull();
    expect(fs.existsSync(migration.backupPath!)).toBe(true);
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    db.close();

    const backup = new Database(migration.backupPath!, { readonly: true });
    expect(backup.pragma('user_version', { simple: true })).toBe(0);
    expect(columnsOf(backup, 'queue')).not.toContain('state');
    expect(backup.prepare('SELECT COUNT(*) AS n FROM queue').get()).toEqual({ n: 4 });
    backup.close();

    const fresh = openDatabase(path.join(dir, 'fresh.db'), () => NOW);
    expect(fresh.migration.backupPath).toBeNull();
    fresh.db.close();
  });
});

describe('legacy value normalization', () => {
  it('normalizes tags from JSON, comma lists, and blanks', () => {
    expect(normalizeLegacyTags(null)).toBe('[]');
    expect(normalizeLegacyTags('  ')).toBe('[]');
    expect(normalizeLegacyTags('[" a ", 3, "b", ""]')).toBe('["a","b"]');
    expect(normalizeLegacyTags('shorts, gaming,,')).toBe('["shorts","gaming"]');
  });

  it('normalizes timestamps to ISO and drops garbage', () => {
    expect(normalizeLegacyTimestamp('2026-09-20 18:00:00')).toBe('2026-09-20T18:00:00.000Z');
    expect(normalizeLegacyTimestamp('2026-09-20T18:00:00.000Z')).toBe('2026-09-20T18:00:00.000Z');
    expect(normalizeLegacyTimestamp('next tuesday')).toBeNull();
    expect(normalizeLegacyTimestamp(null)).toBeNull();
  });

  it('keeps a legacy schedule only for items that were never uploaded', () => {
    const base = { tags: null, video_status: 'pending', success_count: 0, last_video_id: null };
    expect(legacyBackfill({ ...base, scheduled_for: '2026-09-20 18:00:00' })).toMatchObject({
      state: 'pending',
      scheduled_for: '2026-09-20T18:00:00.000Z',
      schedule_source: 'manual'
    });
    expect(legacyBackfill({ ...base, scheduled_for: '2026-09-20 18:00:00', success_count: 1, last_video_id: 'yt' })).toMatchObject({
      state: 'uploaded',
      scheduled_for: null,
      schedule_source: 'hold'
    });
  });
});

describe('v3 rotation', () => {
  const migrated = (): Database.Database => {
    const db = new Database(':memory:');
    migrate(db, { now: () => NOW });
    return db;
  };

  const columns = (db: Database.Database, table: string): string[] =>
    (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((row) => row.name);

  it('adds the rotation columns', () => {
    const db = migrated();
    expect(columns(db, 'videos')).toContain('published_before');
    expect(columns(db, 'videos')).toContain('rotation_paused');
    expect(columns(db, 'queue')).toContain('posting_kind');
    db.close();
  });

  it('treats everything that already existed as an announcement, not a re-run', () => {
    // Upgrading must not retroactively decide that past uploads were rotation, which would be the
    // difference between having announced them and not.
    const db = new Database(':memory:');
    migrate(db, { now: () => NOW, migrations: MIGRATIONS.filter((m) => m.version <= 2) });
    db.prepare("INSERT INTO videos (filename, filepath, status, created_at) VALUES ('old.mov', 'E:/old.mov', 'pending', ?)").run(
      NOW.toISOString()
    );
    db.prepare(
      "INSERT INTO queue (video_id, title, description, tags, category_id, privacy, created_at, updated_at) VALUES (1, 'Old', '', '[]', '22', 'public', ?, ?)"
    ).run(NOW.toISOString(), NOW.toISOString());

    migrate(db, { now: () => NOW });

    const rows = db.prepare('SELECT posting_kind FROM queue').all() as Array<{ posting_kind: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.posting_kind).toBe('new');
    db.close();
  });

  it('defaults a new video to rotating and never previously published', () => {
    const db = migrated();
    db.prepare("INSERT INTO videos (filename, filepath, status, created_at) VALUES ('fresh.mov', 'E:/fresh.mov', 'pending', ?)").run(
      NOW.toISOString()
    );
    const video = db.prepare('SELECT published_before, rotation_paused FROM videos').get() as Record<string, number>;
    expect(video.published_before).toBe(0);
    expect(video.rotation_paused).toBe(0);
    db.close();
  });
});

describe('v5 drafting provenance', () => {
  const columns = (db: Database.Database, table: string): string[] =>
    (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((row) => row.name);

  it('adds the two dates', () => {
    const db = new Database(':memory:');
    migrate(db, { now: () => NOW });
    expect(columns(db, 'queue')).toContain('ai_drafted_at');
    expect(columns(db, 'queue')).toContain('metadata_edited_at');
    db.close();
  });

  // The safe way round. A video already in someone's queue may have details they typed, and the
  // upgrade has no way to tell; treating it as edited means the worker leaves it alone.
  it('treats everything that already existed as written by a person', () => {
    const db = new Database(':memory:');
    migrate(db, { now: () => NOW, migrations: MIGRATIONS.filter((m) => m.version <= 4) });
    db.prepare("INSERT INTO videos (filename, filepath, status, created_at) VALUES ('old.mov', 'E:/old.mov', 'pending', ?)").run(
      NOW.toISOString()
    );
    db.prepare(
      "INSERT INTO queue (video_id, title, description, tags, category_id, privacy, created_at, updated_at) VALUES (1, 'Mine', 'Mine too', '[]', '22', 'public', ?, ?)"
    ).run(NOW.toISOString(), NOW.toISOString());

    migrate(db, { now: () => NOW });

    const row = db.prepare('SELECT ai_drafted_at, metadata_edited_at FROM queue').get() as Record<string, unknown>;
    expect(row.metadata_edited_at).toBe(NOW.toISOString());
    expect(row.ai_drafted_at).toBeNull();
    db.close();
  });
});

describe('v8 guessing the game for older videos', () => {
  const insertVideo = (db: Database.Database, filename: string): void => {
    db.prepare("INSERT INTO videos (filename, filepath, status, created_at) VALUES (?, ?, 'pending', ?)").run(
      filename,
      'E:/' + filename,
      NOW.toISOString()
    );
  };

  // One of this channel's four videos predated the Game field, so it had none, and so its description
  // lost every game hashtag.
  it('fills in a guess from the file name where the game is missing, and leaves unknowns unknown', () => {
    const db = new Database(':memory:');
    migrate(db, { now: () => NOW, migrations: MIGRATIONS.filter((m) => m.version <= 7) });
    insertVideo(db, 'INSANE CS2 CLUTCH.mov');
    insertVideo(db, 'ALRIGHT GUYS IM GOING TO BED.mov');

    migrate(db, { now: () => NOW });

    const games = db.prepare('SELECT filename, game FROM videos ORDER BY id').all();
    expect(games).toEqual([
      { filename: 'INSANE CS2 CLUTCH.mov', game: 'Counter-Strike 2' },
      { filename: 'ALRIGHT GUYS IM GOING TO BED.mov', game: null }
    ]);
    db.close();
  });

  it('never replaces a game that was already set', () => {
    const db = new Database(':memory:');
    migrate(db, { now: () => NOW, migrations: MIGRATIONS.filter((m) => m.version <= 7) });
    insertVideo(db, 'INSANE CS2 CLUTCH.mov');
    db.prepare("UPDATE videos SET game = 'Minecraft'").run();

    migrate(db, { now: () => NOW });

    expect((db.prepare('SELECT game FROM videos').get() as { game: string }).game).toBe('Minecraft');
    db.close();
  });
});
