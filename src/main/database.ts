import Database from 'better-sqlite3';
import { app } from 'electron';
import * as path from 'path';

let db: Database.Database;

export const initDatabase = () => {
  const dbPath = path.join(app.getPath('userData'), 'shortstack.db');
  db = new Database(dbPath);
  
  // Run migrations
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
      platforms TEXT DEFAULT '["youtube"]',
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
};

export const getDb = () => db;

// Basic typed queries would go here
export const getAllVideos = () => db.prepare('SELECT * FROM videos').all();
export const getVideoById = (id: number) => db.prepare('SELECT * FROM videos WHERE id = ?').get(id);
export const insertVideo = (video: any) => {
  const stmt = db.prepare('INSERT INTO videos (filename, filepath, file_hash, status) VALUES (@filename, @filepath, @file_hash, @status)');
  return stmt.run(video);
};
export const updateVideoStatus = (id: number, status: string) => db.prepare('UPDATE videos SET status = ? WHERE id = ?').run(status, id);

export const getAllQueueItems = () => db.prepare('SELECT q.*, v.filename FROM queue q JOIN videos v ON q.video_id = v.id').all();
export const getQueueItem = (id: number) => db.prepare('SELECT * FROM queue WHERE id = ?').get(id);
export const insertQueueItem = (item: any) => {
  const cols = Object.keys(item).join(', ');
  const vals = Object.keys(item).map(k => '@' + k).join(', ');
  const stmt = db.prepare(`INSERT INTO queue (${cols}) VALUES (${vals})`);
  return stmt.run(item);
};
export const updateQueueItem = (id: number, item: any) => {
  const set = Object.keys(item).map(k => `${k} = @${k}`).join(', ');
  const stmt = db.prepare(`UPDATE queue SET ${set} WHERE id = @id`);
  return stmt.run({ ...item, id });
};
export const approveQueueItem = (id: number) => db.prepare('UPDATE queue SET approved = 1 WHERE id = ?').run(id);
export const rejectQueueItem = (id: number) => {
  const queueItem: any = db.prepare('SELECT video_id FROM queue WHERE id = ?').get(id);
  if (queueItem) {
    db.prepare('UPDATE videos SET status = ? WHERE id = ?').run('pending', queueItem.video_id);
    db.prepare('DELETE FROM queue WHERE id = ?').run(id);
  }
};

export const getAllUploads = () => db.prepare('SELECT u.*, q.title, v.filename FROM uploads u JOIN queue q ON u.queue_id = q.id JOIN videos v ON q.video_id = v.id').all();
export const insertUpload = (upload: any) => {
  const cols = Object.keys(upload).join(', ');
  const vals = Object.keys(upload).map(k => '@' + k).join(', ');
  const stmt = db.prepare(`INSERT INTO uploads (${cols}) VALUES (${vals})`);
  return stmt.run(upload);
};
export const updateUpload = (id: number, upload: any) => {
  const set = Object.keys(upload).map(k => `${k} = @${k}`).join(', ');
  const stmt = db.prepare(`UPDATE uploads SET ${set} WHERE id = @id`);
  return stmt.run({ ...upload, id });
};

export const getSettings = () => {
  const rows: any[] = db.prepare('SELECT * FROM settings').all();
  const settings: any = {};
  for (const row of rows) {
    if (row.value === 'true') settings[row.key] = true;
    else if (row.value === 'false') settings[row.key] = false;
    else settings[row.key] = row.value;
  }
  return settings;
};
export const getSetting = (key: string) => {
  const row: any = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return null;
  if (row.value === 'true') return true;
  if (row.value === 'false') return false;
  return row.value;
};
export const setSetting = (key: string, value: any) => {
  let valStr = String(value);
  if (typeof value === 'object' && value !== null) valStr = JSON.stringify(value);
  const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?');
  return stmt.run(key, valStr, valStr);
};

export const getAllChannels = () => db.prepare('SELECT * FROM channels').all();
export const insertChannel = (channel: any) => {
  const cols = Object.keys(channel).join(', ');
  const vals = Object.keys(channel).map(k => '@' + k).join(', ');
  const stmt = db.prepare(`INSERT INTO channels (${cols}) VALUES (${vals})`);
  return stmt.run(channel);
};
