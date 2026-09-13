// Launches the real application against a throwaway profile, so a test never works against whatever
// happens to be in the developer's queue.
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { migrate } from '../src/main/db/migrations';

export interface SeededVideo {
  filename: string;
  privacy?: 'public' | 'unlisted' | 'private';
  state?: string;
  scheduledFor?: string | null;
}

export interface Harness {
  app: ElectronApplication;
  page: Page;
  userData: string;
  close(): Promise<void>;
}

/** Writes a database the app will open, rather than driving the UI to create one. */
function seed(userData: string, videos: readonly SeededVideo[], settings: Record<string, string>): void {
  fs.mkdirSync(userData, { recursive: true });
  const db = new Database(path.join(userData, 'shortstack.db'));
  db.pragma('foreign_keys = ON');
  migrate(db);

  const now = new Date().toISOString();
  for (const video of videos) {
    const inserted = db
      .prepare('INSERT INTO videos (filename, filepath, status, created_at, missing, file_size) VALUES (?, ?, ?, ?, 0, ?)')
      .run(video.filename, `E:/Shorts/${video.filename}`, 'pending', now, 1024);
    db.prepare(
      `INSERT INTO queue (video_id, title, description, tags, category_id, privacy, notify_subscribers, made_for_kids,
                          approved, platforms, state, posting_kind, scheduled_for, attempts, upload_bytes_confirmed,
                          remote_tombstone, created_at, updated_at)
       VALUES (?, ?, '', '[]', '22', ?, 0, 0, 0, '["youtube"]', ?, 'new', ?, 0, 0, 0, ?, ?)`
    ).run(
      inserted.lastInsertRowid,
      video.filename.replace(/\.[^.]+$/, ''),
      video.privacy ?? 'public',
      video.state ?? 'pending',
      video.scheduledFor ?? null,
      now,
      now
    );
  }

  const write = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  // Past the first-run gate, so a test starts on the screen it is about.
  write.run('legal_accepted_version', JSON.stringify('2026-09-12').slice(1, -1));
  write.run('setup_complete', 'true');
  write.run('shorts_folder', 'E:/Shorts');
  for (const [key, value] of Object.entries(settings)) write.run(key, value);
  db.close();
}

export async function launch(videos: readonly SeededVideo[] = [], settings: Record<string, string> = {}): Promise<Harness> {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'shortstack-e2e-'));
  seed(userData, videos, settings);

  const app = await electron.launch({
    args: [path.join(__dirname, '..')],
    env: { ...process.env, SHORTSTACK_USER_DATA: userData, NODE_ENV: 'test' }
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  return {
    app,
    page,
    userData,
    close: async () => {
      await app.close().catch(() => undefined);
      fs.rmSync(userData, { recursive: true, force: true });
    }
  };
}

/** The app routes on the hash, so this is how a test gets to a screen. */
export async function goTo(page: Page, route: string): Promise<void> {
  await page.evaluate((target) => {
    window.location.hash = target;
  }, route);
  await page.waitForTimeout(400);
}
