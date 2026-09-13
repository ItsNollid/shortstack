// A short strip of stills from each video, kept separately from the poster frame and used only as
// evidence for the local model. The poster exists to look right in a list at 216px; these exist to
// be read by something trying to work out which game this is, so they are larger, and there are
// several of them, because one moment of a Short is often a fade or a reaction shot.
import type Database from 'better-sqlite3';
import * as fs from 'fs/promises';
import * as path from 'path';

/** JPEG magic. A strip of three PNGs is megabytes; as JPEG it is tens of kilobytes. */
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff]);

export const MAX_FRAME_BYTES = 1024 * 1024;
export const MAX_FRAMES = 3;

export const isJpeg = (bytes: Buffer): boolean =>
  bytes.length > JPEG_HEADER.length && bytes.subarray(0, JPEG_HEADER.length).equals(JPEG_HEADER);

/** A subfolder so the poster files, which are listed by name elsewhere, stay on their own. */
export const framesDir = (dir: string): string => path.join(dir, 'frames');

export const framePath = (dir: string, videoId: number, index: number): string =>
  path.join(framesDir(dir), `${videoId}-${index}.jpg`);

export interface FramesDeps {
  db: Database.Database;
  dir: string;
}

const videoIdFor = (db: Database.Database, queueId: number): number | null => {
  const row = db.prepare('SELECT video_id FROM queue WHERE id = ?').get(queueId) as { video_id?: number } | undefined;
  return row?.video_id ?? null;
};

export type SaveFramesResult = { ok: true; videoId: number; count: number } | { ok: false; reason: string };

/** Keyed by video, like the poster: every posting of the same file shows the same thing. */
export async function saveFrames(deps: FramesDeps, queueId: number, frames: readonly Buffer[]): Promise<SaveFramesResult> {
  const usable = frames.slice(0, MAX_FRAMES);
  if (usable.length === 0) return { ok: false, reason: 'No frames were given' };
  if (usable.some((frame) => !isJpeg(frame))) return { ok: false, reason: 'Frames must be JPEG' };
  if (usable.some((frame) => frame.length > MAX_FRAME_BYTES)) return { ok: false, reason: 'A frame is too large' };

  const videoId = videoIdFor(deps.db, queueId);
  if (videoId === null) return { ok: false, reason: 'That video is no longer in the queue' };

  await fs.mkdir(framesDir(deps.dir), { recursive: true });
  await Promise.all(usable.map((frame, index) => fs.writeFile(framePath(deps.dir, videoId, index), frame)));
  // A re-decode that found fewer good frames must not leave the old ones behind pretending to
  // belong to this pass.
  for (let index = usable.length; index < MAX_FRAMES; index += 1) {
    await fs.rm(framePath(deps.dir, videoId, index), { force: true }).catch(() => undefined);
  }
  return { ok: true, videoId, count: usable.length };
}

export async function readFrames(deps: FramesDeps, queueId: number): Promise<Buffer[]> {
  const videoId = videoIdFor(deps.db, queueId);
  if (videoId === null) return [];

  const found: Buffer[] = [];
  for (let index = 0; index < MAX_FRAMES; index += 1) {
    try {
      found.push(await fs.readFile(framePath(deps.dir, videoId, index)));
    } catch {
      break;
    }
  }
  return found;
}

/** Which videos already have a strip, so a decode pass can skip them. */
export async function videosWithFrames(dir: string): Promise<Set<number>> {
  try {
    const files = await fs.readdir(framesDir(dir));
    return new Set(
      files
        .filter((name) => name.endsWith('-0.jpg'))
        .map((name) => Number(name.slice(0, -'-0.jpg'.length)))
        .filter((id) => Number.isInteger(id))
    );
  } catch {
    return new Set();
  }
}
