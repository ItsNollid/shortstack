// Walks the watched folder and reconciles it with the library. Every file is handled
// independently: one locked or unreadable file can never abort the scan, which is what the
// previous version did.
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import type Database from 'better-sqlite3';
import { renderTitleTemplate } from '../../shared/settings';
import { applyQueueEvent } from '../db/queueRepo';
import { readSettings } from '../db/settingsRepo';
import {
  findVideoByHash,
  findVideoByPath,
  insertVideoWithQueueItem,
  listKnownVideos,
  queueIdForVideo,
  setVideoMissing,
  setVideoProbe,
  updateVideoStats
} from '../db/videoRepo';
import { HASH_ALGO, decideIdentity, isStable, needsHashing, type ScannedFile } from './fileIdentity';
import { probeVideoFile, type VideoProbe } from './videoProbe';

export const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi'];
const HASH_WINDOW = 4 * 1024 * 1024;

export interface ScanResult {
  status: 'ok' | 'no_folder' | 'folder_unavailable';
  added: number;
  updated: number;
  unchanged: number;
  ignored: number;
  skipped: number;
  missing: number;
  problems: string[];
}

export interface ScanDeps {
  now?: () => Date;
  wait?: (ms: number) => Promise<void>;
  stabilityDelayMs?: number;
  probe?: (filePath: string) => Promise<VideoProbe>;
}

/** Size plus the first and last 4 MiB: enough to tell videos apart without reading gigabytes. */
async function hashFile(filePath: string, size: number): Promise<string> {
  const hash = crypto.createHash('sha1');
  hash.update(String(size));
  const handle = await fs.open(filePath, 'r');
  try {
    const window = Math.min(HASH_WINDOW, size);
    const head = Buffer.alloc(window);
    await handle.read(head, 0, window, 0);
    hash.update(head);
    if (size > window) {
      const tail = Buffer.alloc(window);
      await handle.read(tail, 0, window, size - window);
      hash.update(tail);
    }
  } finally {
    await handle.close();
  }
  return hash.digest('hex');
}

const emptyResult = (status: ScanResult['status']): ScanResult => ({
  status,
  added: 0,
  updated: 0,
  unchanged: 0,
  ignored: 0,
  skipped: 0,
  missing: 0,
  problems: []
});

async function statTwice(
  filePath: string,
  wait: (ms: number) => Promise<void>,
  delayMs: number
): Promise<{ size: number; mtimeMs: number } | null> {
  const first = await fs.stat(filePath);
  if (delayMs > 0) await wait(delayMs);
  const second = await fs.stat(filePath);
  const a = { size: first.size, mtimeMs: first.mtimeMs };
  const b = { size: second.size, mtimeMs: second.mtimeMs };
  return isStable(a, b) ? b : null;
}

export async function scanFolder(db: Database.Database, deps: ScanDeps = {}): Promise<ScanResult> {
  const now = deps.now ?? (() => new Date());
  const wait = deps.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const stabilityDelayMs = deps.stabilityDelayMs ?? 1500;
  const probe = deps.probe ?? probeVideoFile;

  const { settings } = readSettings(db);
  const folder = settings.shorts_folder.trim();
  if (folder === '') return emptyResult('no_folder');

  let entries: string[];
  try {
    entries = await fs.readdir(folder);
  } catch {
    // A removed drive or a renamed folder: report it rather than marking every video missing.
    return emptyResult('folder_unavailable');
  }

  const result = emptyResult('ok');
  const autoApprove = settings.auto_approve && settings.auto_approve_consented_at !== null;
  const ctx = { now: now(), uploadMethod: settings.upload_method };
  const seen = new Set<string>();

  for (const entry of entries) {
    const filePath = path.join(folder, entry);
    if (!VIDEO_EXTENSIONS.includes(path.extname(entry).toLowerCase())) continue;

    try {
      const stats = await statTwice(filePath, wait, stabilityDelayMs);
      if (stats === null) {
        // Still being written or copied. It will be picked up on a later scan.
        result.skipped += 1;
        continue;
      }
      seen.add(filePath);
      const file: ScannedFile = { filename: entry, filepath: filePath, size: stats.size, mtimeMs: stats.mtimeMs };
      const byPath = findVideoByPath(db, filePath);

      if (!needsHashing(file, byPath) && byPath !== undefined) {
        result.unchanged += 1;
        continue;
      }

      const hash = await hashFile(filePath, stats.size);
      const outcome = decideIdentity(file, hash, byPath, findVideoByHash(db, hash));

      if (outcome.action === 'ignore') {
        result.ignored += 1;
        continue;
      }
      if (outcome.action === 'unchanged') {
        result.unchanged += 1;
        continue;
      }
      if (outcome.action === 'touch') {
        updateVideoStats(db, outcome.videoId, { fileHash: hash, hashAlgo: HASH_ALGO, fileSize: stats.size, mtimeMs: stats.mtimeMs });
        result.unchanged += 1;
        continue;
      }
      if (outcome.action === 'update') {
        updateVideoStats(db, outcome.videoId, { fileHash: hash, hashAlgo: HASH_ALGO, fileSize: stats.size, mtimeMs: stats.mtimeMs });
        setVideoProbe(db, outcome.videoId, await probe(filePath));
        const queueId = queueIdForVideo(db, outcome.videoId);
        if (queueId !== undefined) applyQueueEvent(db, queueId, { type: 'flag', code: 'file_changed', error: outcome.reason }, ctx);
        result.updated += 1;
        continue;
      }

      // insert, or insert_flagged when this filename was already uploaded as a different cut.
      const { videoId, queueId } = insertVideoWithQueueItem(
        db,
        { filename: entry, filepath: filePath, fileHash: hash, hashAlgo: HASH_ALGO, fileSize: stats.size, mtimeMs: stats.mtimeMs },
        {
          title: renderTitleTemplate(settings.default_title_template, entry),
          description: settings.default_description,
          tags: settings.default_tags,
          categoryId: settings.default_category_id,
          privacy: settings.default_privacy,
          notifySubscribers: settings.notify_subscribers,
          madeForKids: settings.made_for_kids,
          platforms: ['youtube']
        },
        ctx.now
      );
      setVideoProbe(db, videoId, await probe(filePath));
      if (outcome.action === 'insert_flagged') {
        applyQueueEvent(db, queueId, { type: 'flag', code: 'file_changed', error: outcome.reason }, ctx);
      } else if (autoApprove) {
        // Recorded in the activity log like any other approval, so the consent trail is intact.
        applyQueueEvent(db, queueId, { type: 'approve' }, ctx);
      }
      result.added += 1;
    } catch (error) {
      result.problems.push(`${entry}: ${error instanceof Error ? error.message : String(error)}`);
      result.skipped += 1;
    }
  }

  // Videos that used to be in this folder and are not there now.
  for (const known of listKnownVideos(db)) {
    if (path.dirname(known.filepath) !== path.resolve(folder) && path.dirname(known.filepath) !== folder) continue;
    if (seen.has(known.filepath)) continue;
    setVideoMissing(db, known.id, true);
    const queueId = queueIdForVideo(db, known.id);
    if (queueId !== undefined) {
      applyQueueEvent(db, queueId, { type: 'flag', code: 'file_missing', error: 'The video file is no longer in the watched folder' }, ctx);
    }
    result.missing += 1;
  }

  return result;
}
