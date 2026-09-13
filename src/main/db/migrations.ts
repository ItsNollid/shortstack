import type Database from 'better-sqlite3';
import * as path from 'path';
import type { AttentionCode, QueueState, RemoteSync, ScheduleSource } from '../../shared/queue';

export interface MigrationContext {
  now: Date;
}

export interface Migration {
  version: number;
  name: string;
  up(db: Database.Database, ctx: MigrationContext): void;
}

export interface MigrateOptions {
  migrations?: readonly Migration[];
  /** When set, a consistent copy of an existing database is written here before migrating. */
  backupDir?: string;
  baseName?: string;
  now?: () => Date;
}

export interface MigrateResult {
  migratedFrom: number;
  migratedTo: number;
  backupPath: string | null;
}

function columnNames(db: Database.Database, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

/** SQLite has no ADD COLUMN IF NOT EXISTS, and fresh and legacy databases differ in which columns exist. */
function addColumn(db: Database.Database, table: string, column: string, type: string): void {
  if (!columnNames(db, table).has(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

/** Rewrites SQLite CURRENT_TIMESTAMP values ("YYYY-MM-DD HH:MM:SS", UTC) as ISO 8601. */
function normalizeTimestampColumn(db: Database.Database, table: string, column: string): void {
  db.exec(`
    UPDATE ${table}
    SET ${column} = strftime('%Y-%m-%dT%H:%M:%fZ', ${column})
    WHERE ${column} IS NOT NULL
      AND ${column} NOT LIKE '%T%'
      AND strftime('%Y-%m-%dT%H:%M:%fZ', ${column}) IS NOT NULL
  `);
}

function hasUserTables(db: Database.Database): boolean {
  const row = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get() as { n: number };
  return row.n > 0;
}

export function normalizeLegacyTags(raw: string | null): string {
  if (raw === null || raw.trim() === '') return '[]';
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return JSON.stringify(parsed.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean));
    }
  } catch {
    // Not JSON: treat as a comma-separated list below.
  }
  return JSON.stringify(raw.split(',').map((tag) => tag.trim()).filter(Boolean));
}

export function normalizeLegacyTimestamp(raw: string | null): string | null {
  if (raw === null || raw.trim() === '') return null;
  const sqliteFormat = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(raw);
  const parsed = Date.parse(sqliteFormat ? `${raw.replace(' ', 'T')}Z` : raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export interface LegacyQueueRow {
  scheduled_for: string | null;
  tags: string | null;
  video_status: string | null;
  success_count: number;
  last_video_id: string | null;
}

export interface LegacyBackfill {
  state: QueueState;
  youtube_video_id: string | null;
  attention_code: AttentionCode | null;
  attention_from_state: QueueState | null;
  last_error: string | null;
  scheduled_for: string | null;
  schedule_source: ScheduleSource | null;
  remote_sync: RemoteSync | null;
  tags: string;
}

/**
 * Maps a row from the original build onto the explicit lifecycle. Nothing approved under the old,
 * unsafe scheduler stays approved, and anything that may already be on YouTube is never re-uploaded.
 */
export function legacyBackfill(row: LegacyQueueRow): LegacyBackfill {
  const base = {
    tags: normalizeLegacyTags(row.tags),
    youtube_video_id: null,
    attention_code: null,
    attention_from_state: null,
    last_error: null,
    remote_sync: null
  };

  if (row.success_count > 1) {
    return {
      ...base,
      state: 'needs_attention',
      youtube_video_id: row.last_video_id,
      attention_code: 'duplicate_uploads',
      attention_from_state: 'uploaded',
      last_error: `The previous version uploaded this video ${row.success_count} times`,
      scheduled_for: null,
      schedule_source: 'hold',
      remote_sync: row.last_video_id !== null ? 'pending' : null
    };
  }
  if (row.success_count === 1 && row.last_video_id !== null) {
    return { ...base, state: 'uploaded', youtube_video_id: row.last_video_id, scheduled_for: null, schedule_source: 'hold', remote_sync: 'pending' };
  }
  if (row.success_count === 1 || row.video_status === 'uploaded') {
    return {
      ...base,
      state: 'needs_attention',
      attention_code: 'legacy_unrecorded_upload',
      attention_from_state: 'pending',
      last_error: 'The previous version may have uploaded this video without recording which YouTube video it became',
      scheduled_for: null,
      schedule_source: 'hold'
    };
  }
  const scheduledFor = normalizeLegacyTimestamp(row.scheduled_for);
  return { ...base, state: 'pending', scheduled_for: scheduledFor, schedule_source: scheduledFor !== null ? 'manual' : null };
}

const v1Baseline: Migration = {
  version: 1,
  name: 'baseline schema inherited from the original build',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS videos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        filepath TEXT NOT NULL,
        file_hash TEXT UNIQUE,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        video_id INTEGER REFERENCES videos(id),
        channel_id TEXT,
        title TEXT,
        description TEXT,
        tags TEXT,
        category_id TEXT DEFAULT '22',
        privacy TEXT DEFAULT 'public',
        notify_subscribers INTEGER DEFAULT 0,
        made_for_kids INTEGER DEFAULT 0,
        scheduled_for DATETIME,
        approved INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS uploads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        queue_id INTEGER REFERENCES queue(id),
        youtube_video_id TEXT,
        uploaded_at DATETIME,
        status TEXT,
        error_message TEXT,
        retry_count INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        youtube_video_id TEXT,
        date DATE,
        views INTEGER,
        watch_time_minutes REAL,
        avg_view_duration_seconds REAL,
        impressions INTEGER,
        ctr REAL,
        likes INTEGER,
        comments INTEGER,
        shares INTEGER,
        subscriber_change INTEGER,
        traffic_source TEXT
      );

      CREATE TABLE IF NOT EXISTS channel_analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id TEXT,
        date DATE,
        total_views INTEGER,
        total_watch_time REAL,
        subscriber_count INTEGER,
        top_traffic_sources TEXT,
        audience_demographics TEXT
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS channels (
        id TEXT PRIMARY KEY,
        name TEXT,
        is_active INTEGER DEFAULT 1,
        credentials_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }
};

const QUEUE_COLUMNS_V2: ReadonlyArray<readonly [string, string]> = [
  ['platforms', 'TEXT'],
  ['state', 'TEXT'],
  ['schedule_source', 'TEXT'],
  ['youtube_video_id', 'TEXT'],
  ['remote_tombstone', 'INTEGER'],
  ['upload_session_uri', 'TEXT'],
  ['upload_bytes_confirmed', 'INTEGER'],
  ['remote_publish_at', 'TEXT'],
  ['remote_sync', 'TEXT'],
  ['remote_error', 'TEXT'],
  ['attempts', 'INTEGER'],
  ['last_error', 'TEXT'],
  ['next_attempt_at', 'TEXT'],
  ['attention_code', 'TEXT'],
  ['attention_from_state', 'TEXT'],
  ['updated_at', 'TEXT']
];

const VIDEO_COLUMNS_V2: ReadonlyArray<readonly [string, string]> = [
  ['file_size', 'INTEGER'],
  ['mtime_ms', 'INTEGER'],
  ['hash_algo', 'TEXT'],
  ['duration_s', 'REAL'],
  ['width', 'INTEGER'],
  ['height', 'INTEGER'],
  ['missing', 'INTEGER']
];

const CHANNEL_COLUMNS_V2: ReadonlyArray<readonly [string, string]> = [
  ['handle', 'TEXT'],
  ['avatar_url', 'TEXT'],
  ['subscriber_count', 'INTEGER'],
  ['updated_at', 'TEXT']
];

const UPLOAD_COLUMNS_V2: ReadonlyArray<readonly [string, string]> = [
  ['method', 'TEXT'],
  ['error_code', 'TEXT']
];

const v2Lifecycle: Migration = {
  version: 2,
  name: 'explicit queue lifecycle, remote sync, and activity log',
  up(db, { now }) {
    const nowIso = now.toISOString();

    for (const [column, type] of QUEUE_COLUMNS_V2) addColumn(db, 'queue', column, type);
    for (const [column, type] of VIDEO_COLUMNS_V2) addColumn(db, 'videos', column, type);
    for (const [column, type] of CHANNEL_COLUMNS_V2) addColumn(db, 'channels', column, type);
    for (const [column, type] of UPLOAD_COLUMNS_V2) addColumn(db, 'uploads', column, type);

    db.exec(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        queue_id INTEGER REFERENCES queue(id),
        action TEXT NOT NULL,
        detail TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_queue_state ON queue(state, scheduled_for);
      CREATE INDEX IF NOT EXISTS idx_queue_video ON queue(video_id);
      CREATE INDEX IF NOT EXISTS idx_videos_filepath ON videos(filepath);
      CREATE INDEX IF NOT EXISTS idx_uploads_queue ON uploads(queue_id);
      CREATE INDEX IF NOT EXISTS idx_activity_queue ON activity_log(queue_id, created_at);
    `);

    normalizeTimestampColumn(db, 'videos', 'created_at');
    normalizeTimestampColumn(db, 'queue', 'created_at');
    normalizeTimestampColumn(db, 'channels', 'created_at');
    normalizeTimestampColumn(db, 'uploads', 'uploaded_at');

    db.prepare(`UPDATE queue SET platforms = '["youtube"]' WHERE platforms IS NULL OR trim(platforms) = ''`).run();
    db.prepare(`
      UPDATE queue SET
        title = COALESCE(title, ''),
        description = COALESCE(description, ''),
        attempts = COALESCE(attempts, 0),
        upload_bytes_confirmed = COALESCE(upload_bytes_confirmed, 0),
        remote_tombstone = COALESCE(remote_tombstone, 0),
        updated_at = COALESCE(updated_at, created_at, ?)
    `).run(nowIso);
    db.prepare(`
      UPDATE videos SET
        missing = COALESCE(missing, 0),
        hash_algo = COALESCE(hash_algo, CASE WHEN file_hash IS NULL THEN NULL ELSE 'legacy-md5-1mib-size' END)
    `).run();

    const legacyRows = db.prepare(`
      SELECT
        q.id,
        q.scheduled_for,
        q.tags,
        v.status AS video_status,
        (SELECT COUNT(*) FROM uploads u WHERE u.queue_id = q.id AND u.status = 'success') AS success_count,
        (SELECT u.youtube_video_id FROM uploads u
          WHERE u.queue_id = q.id AND u.status = 'success' AND u.youtube_video_id IS NOT NULL
          ORDER BY u.id DESC LIMIT 1) AS last_video_id
      FROM queue q
      LEFT JOIN videos v ON v.id = q.video_id
      WHERE q.state IS NULL
    `).all() as Array<LegacyQueueRow & { id: number }>;

    const applyBackfill = db.prepare(`
      UPDATE queue SET
        state = @state,
        youtube_video_id = @youtube_video_id,
        attention_code = @attention_code,
        attention_from_state = @attention_from_state,
        last_error = @last_error,
        scheduled_for = @scheduled_for,
        schedule_source = @schedule_source,
        remote_sync = @remote_sync,
        tags = @tags
      WHERE id = @id
    `);
    for (const row of legacyRows) applyBackfill.run({ id: row.id, ...legacyBackfill(row) });

    // The original build deleted queue rows on reject, orphaning the video forever. Bring them back as rejected.
    const orphans = db.prepare(`
      SELECT v.id, v.filename, v.status FROM videos v
      WHERE NOT EXISTS (SELECT 1 FROM queue q WHERE q.video_id = v.id)
    `).all() as Array<{ id: number; filename: string; status: string | null }>;
    const insertOrphan = db.prepare(`
      INSERT INTO queue (
        video_id, title, description, tags, category_id, privacy, notify_subscribers, made_for_kids, approved,
        platforms, state, schedule_source, attention_code, attention_from_state, last_error,
        attempts, upload_bytes_confirmed, remote_tombstone, created_at, updated_at
      ) VALUES (
        @video_id, @title, '', '[]', '22', 'private', 0, 0, 0,
        '["youtube"]', @state, @schedule_source, @attention_code, @attention_from_state, @last_error,
        0, 0, 0, @now, @now
      )
    `);
    for (const orphan of orphans) {
      const uploaded = orphan.status === 'uploaded';
      insertOrphan.run({
        video_id: orphan.id,
        title: path.parse(orphan.filename).name,
        state: uploaded ? 'needs_attention' : 'rejected',
        schedule_source: uploaded ? 'hold' : null,
        attention_code: uploaded ? 'legacy_unrecorded_upload' : null,
        attention_from_state: uploaded ? 'pending' : null,
        last_error: uploaded ? 'The previous version may have uploaded this video without recording which YouTube video it became' : null,
        now: nowIso
      });
    }

    // Old builds upload anything with approved = 1. After this migration nothing qualifies.
    db.prepare('UPDATE queue SET approved = 0').run();
  }
};


/** A video can be posted more than once on purpose. The columns that make that a first-class idea
 *  rather than something inferred after the fact. */
const VIDEO_COLUMNS_V3: ReadonlyArray<[string, string]> = [
  // Set at intake for a back catalogue: files already published before ShortStack existed, whose
  // first posting here is a re-run and must not be announced to subscribers.
  ['published_before', 'INTEGER NOT NULL DEFAULT 0'],
  // Taken out of rotation by hand, regardless of how many postings remain.
  ['rotation_paused', 'INTEGER NOT NULL DEFAULT 0']
];

const QUEUE_COLUMNS_V3: ReadonlyArray<[string, string]> = [
  // Fixed when the posting is created: whether it is the announcement or a re-run. Deriving it at
  // read time would rewrite history every time another posting was added.
  ['posting_kind', "TEXT NOT NULL DEFAULT 'new'"]
];

const v3Rotation: Migration = {
  version: 3,
  name: 'rotation: a video can be posted more than once',
  up(db) {
    for (const [column, type] of VIDEO_COLUMNS_V3) addColumn(db, 'videos', column, type);
    for (const [column, type] of QUEUE_COLUMNS_V3) addColumn(db, 'queue', column, type);

    // Everything that already exists was a single posting, so it is the announcement. Later
    // postings of the same video get their kind at creation.
    db.prepare("UPDATE queue SET posting_kind = 'new' WHERE posting_kind IS NULL OR trim(posting_kind) = ''").run();

    db.exec('CREATE INDEX IF NOT EXISTS idx_queue_posting ON queue(video_id, posting_kind);');
  }
};

/** Where the channel keeps its uploads. Without it, a video uploaded in Studio can never be matched
 *  back to the file it came from, which is the whole of assisted mode. */
const CHANNEL_COLUMNS_V4: ReadonlyArray<[string, string]> = [['uploads_playlist_id', 'TEXT']];

const v4UploadsPlaylist: Migration = {
  version: 4,
  name: 'remember the channel uploads playlist',
  up(db) {
    for (const [column, type] of CHANNEL_COLUMNS_V4) addColumn(db, 'channels', column, type);
  }
};
/** Two dates that between them say who last wrote a video's details, and when. */
const QUEUE_COLUMNS_V5: ReadonlyArray<[string, string]> = [
  ['ai_drafted_at', 'TEXT'],
  ['metadata_edited_at', 'TEXT']
];

const v5AiDrafts: Migration = {
  version: 5,
  name: 'remember what the model drafted and what the user changed',
  up(db) {
    for (const [column, type] of QUEUE_COLUMNS_V5) addColumn(db, 'queue', column, type);

    // Anything already in the queue predates auto-drafting. Treating it as edited is the safe way
    // round: the worker leaves it alone rather than rewriting details someone may have typed.
    db.prepare("UPDATE queue SET metadata_edited_at = created_at WHERE metadata_edited_at IS NULL").run();
  }
};

/**
 * Which game a video is of. On the video rather than the posting: the game does not change between
 * one posting of a file and the next.
 *
 * Measured reason for storing it rather than asking the model: shown the same lobby frame four
 * times, qwen3-vl:8b answered "The Last of Us", "Left 4 Dead", "ARK: Survival Evolved" and "The
 * Forest". It cannot tell, and every tag built on a wrong answer is wrong.
 */
const VIDEO_COLUMNS_V6: ReadonlyArray<[string, string]> = [['game', 'TEXT']];

const v6Game: Migration = {
  version: 6,
  name: 'remember which game a video is of',
  up(db) {
    for (const [column, type] of VIDEO_COLUMNS_V6) addColumn(db, 'videos', column, type);
  }
};

/**
 * What ShortStack has spent of the daily YouTube allowance. There is no API that reports usage — the
 * real figure exists only in the Cloud console — so the only way to show it in the app is to count
 * each call as it is made, at its published price.
 */
const v7ApiSpend: Migration = {
  version: 7,
  name: 'count what the YouTube API allowance is spent on',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS api_spend (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        method TEXT NOT NULL,
        units INTEGER NOT NULL,
        at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_api_spend_at ON api_spend(at);
    `);
  }
};

export const MIGRATIONS: readonly Migration[] = [
  v1Baseline,
  v2Lifecycle,
  v3Rotation,
  v4UploadsPlaylist,
  v5AiDrafts,
  v6Game,
  v7ApiSpend
];
export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

export function migrate(db: Database.Database, options: MigrateOptions = {}): MigrateResult {
  const migrations = options.migrations ?? MIGRATIONS;
  const latest = migrations.length > 0 ? migrations[migrations.length - 1].version : 0;
  const from = db.pragma('user_version', { simple: true }) as number;

  if (from > latest) {
    throw new Error(`This database was created by a newer version of ShortStack (schema ${from}). Update ShortStack to open it.`);
  }
  const pending = migrations.filter((migration) => migration.version > from);
  if (pending.length === 0) return { migratedFrom: from, migratedTo: from, backupPath: null };

  const now = options.now ?? (() => new Date());
  let backupPath: string | null = null;
  if (options.backupDir !== undefined && hasUserTables(db)) {
    const stamp = now().toISOString().replace(/[:.]/g, '-');
    backupPath = path.join(options.backupDir, `${options.baseName ?? 'shortstack.db'}.schema-v${from}.${stamp}.bak`);
    db.prepare('VACUUM INTO ?').run(backupPath);
  }

  for (const migration of pending) {
    db.transaction(() => {
      migration.up(db, { now: now() });
      db.pragma(`user_version = ${migration.version}`);
    })();
  }
  return { migratedFrom: from, migratedTo: latest, backupPath };
}
