// A short strip of stills from each video, kept separately from the poster frame and used only as
// evidence for the local model. The poster exists to look right in a list at 216px; these exist to
// be read by something trying to work out which game this is, so they are larger, and there are
// several of them, because one moment of a Short is often a fade or a reaction shot.
//
// Each still carries the moment it came from, and two more are taken from the opening second. A
// Short's cover is chosen by time — in Studio, and in TikTok's upload — and whether the start holds a
// viewer can only be judged from the start, not from a quarter of the way in.
import type Database from 'better-sqlite3';
import { clearReading } from '../db/readingRepo';
import * as fs from 'fs/promises';
import * as path from 'path';

/** JPEG magic. A strip of three PNGs is megabytes; as JPEG it is tens of kilobytes. */
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff]);

export const MAX_FRAME_BYTES = 1024 * 1024;
export const MAX_FRAMES = 3;
/** From the first second: enough to tell a lobby from a fight without paying for more. */
export const MAX_OPENING_FRAMES = 2;
/** Moves on when what a decode pass produces changes, so stills drawn before are drawn again, once. */
export const FRAME_SET_VERSION = 2;

export const isJpeg = (bytes: Buffer): boolean =>
  bytes.length > JPEG_HEADER.length && bytes.subarray(0, JPEG_HEADER.length).equals(JPEG_HEADER);

/** A subfolder so the poster files, which are listed by name elsewhere, stay on their own. */
export const framesDir = (dir: string): string => path.join(dir, 'frames');

export const framePath = (dir: string, videoId: number, index: number): string =>
  path.join(framesDir(dir), `${videoId}-${index}.jpg`);

export const openingFramePath = (dir: string, videoId: number, index: number): string =>
  path.join(framesDir(dir), `${videoId}-open-${index}.jpg`);

export const frameMetaPath = (dir: string, videoId: number): string => path.join(framesDir(dir), `${videoId}.json`);

export interface FramesDeps {
  db: Database.Database;
  dir: string;
}

/** What a decode pass knows beyond the strip itself: when each still was taken, and the opening. */
export interface FrameSetInfo {
  /** Seconds into the video for each strip still, in the same order. */
  times: readonly number[];
  opening: readonly Buffer[];
  openingTimes: readonly number[];
  duration: number | null;
}

interface FrameMeta {
  version: number;
  times: Array<number | null>;
  openingTimes: Array<number | null>;
  duration: number | null;
}

export interface Still {
  image: Buffer;
  /** Seconds into the video, or null for a still drawn before times were kept. */
  time: number | null;
}

export interface FrameSet {
  strip: Still[];
  opening: Still[];
  duration: number | null;
}

const videoIdFor = (db: Database.Database, queueId: number): number | null => {
  const row = db.prepare('SELECT video_id FROM queue WHERE id = ?').get(queueId) as { video_id?: number } | undefined;
  return row?.video_id ?? null;
};

const seconds = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

export type SaveFramesResult = { ok: true; videoId: number; count: number } | { ok: false; reason: string };

/** Keyed by video, like the poster: every posting of the same file shows the same thing. */
export async function saveFrames(
  deps: FramesDeps,
  queueId: number,
  frames: readonly Buffer[],
  info?: FrameSetInfo
): Promise<SaveFramesResult> {
  const usable = frames.slice(0, MAX_FRAMES);
  const opening = (info?.opening ?? []).slice(0, MAX_OPENING_FRAMES);
  const every = [...usable, ...opening];
  if (usable.length === 0) return { ok: false, reason: 'No frames were given' };
  if (every.some((frame) => !isJpeg(frame))) return { ok: false, reason: 'Frames must be JPEG' };
  if (every.some((frame) => frame.length > MAX_FRAME_BYTES)) return { ok: false, reason: 'A frame is too large' };

  const videoId = videoIdFor(deps.db, queueId);
  if (videoId === null) return { ok: false, reason: 'That video is no longer in the queue' };

  await fs.mkdir(framesDir(deps.dir), { recursive: true });
  await Promise.all(usable.map((frame, index) => fs.writeFile(framePath(deps.dir, videoId, index), frame)));
  await Promise.all(opening.map((frame, index) => fs.writeFile(openingFramePath(deps.dir, videoId, index), frame)));
  // A re-decode that found fewer good frames must not leave the old ones behind pretending to
  // belong to this pass.
  for (let index = usable.length; index < MAX_FRAMES; index += 1) {
    await fs.rm(framePath(deps.dir, videoId, index), { force: true }).catch(() => undefined);
  }
  for (let index = opening.length; index < MAX_OPENING_FRAMES; index += 1) {
    await fs.rm(openingFramePath(deps.dir, videoId, index), { force: true }).catch(() => undefined);
  }

  if (info === undefined) {
    // Stills without their times are not a complete set, so the next pass draws this video again.
    await fs.rm(frameMetaPath(deps.dir, videoId), { force: true }).catch(() => undefined);
  } else {
    const meta: FrameMeta = {
      version: FRAME_SET_VERSION,
      times: usable.map((_, index) => seconds(info.times[index])),
      openingTimes: opening.map((_, index) => seconds(info.openingTimes[index])),
      duration: seconds(info.duration)
    };
    await fs.writeFile(frameMetaPath(deps.dir, videoId), JSON.stringify(meta));
  }
  // What the model said about the old stills is not about these.
  clearReading(deps.db, videoId);
  return { ok: true, videoId, count: usable.length };
}

async function readNumbered(pathFor: (index: number) => string, limit: number): Promise<Buffer[]> {
  const found: Buffer[] = [];
  for (let index = 0; index < limit; index += 1) {
    try {
      found.push(await fs.readFile(pathFor(index)));
    } catch {
      break;
    }
  }
  return found;
}

export async function readFrames(deps: FramesDeps, queueId: number): Promise<Buffer[]> {
  const videoId = videoIdFor(deps.db, queueId);
  if (videoId === null) return [];
  return readNumbered((index) => framePath(deps.dir, videoId, index), MAX_FRAMES);
}

async function readMeta(dir: string, videoId: number): Promise<FrameMeta | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(frameMetaPath(dir, videoId), 'utf8')) as Partial<FrameMeta>;
    if (typeof parsed.version !== 'number' || !Array.isArray(parsed.times) || !Array.isArray(parsed.openingTimes)) return null;
    return {
      version: parsed.version,
      times: parsed.times.map(seconds),
      openingTimes: parsed.openingTimes.map(seconds),
      duration: seconds(parsed.duration)
    };
  } catch {
    return null;
  }
}

/** The strip and the opening, each still with the moment it came from. */
export async function readFrameSet(deps: FramesDeps, queueId: number): Promise<FrameSet | null> {
  const videoId = videoIdFor(deps.db, queueId);
  if (videoId === null) return null;
  const [strip, opening, meta] = await Promise.all([
    readNumbered((index) => framePath(deps.dir, videoId, index), MAX_FRAMES),
    readNumbered((index) => openingFramePath(deps.dir, videoId, index), MAX_OPENING_FRAMES),
    readMeta(deps.dir, videoId)
  ]);
  return {
    strip: strip.map((image, index) => ({ image, time: meta?.times[index] ?? null })),
    opening: opening.map((image, index) => ({ image, time: meta?.openingTimes[index] ?? null })),
    duration: meta?.duration ?? null
  };
}

/**
 * One still by name, for showing on screen: "s0" to "s2" from the strip, "o0" and "o1" from the
 * opening. Anything else is not a still, which is what keeps a made-up name from reaching the disk.
 */
export async function readFramePart(deps: FramesDeps, queueId: number, part: string): Promise<Buffer | null> {
  const match = /^([so])(\d)$/.exec(part);
  if (match === null) return null;
  const index = Number(match[2]);
  const fromStrip = match[1] === 's';
  if (index >= (fromStrip ? MAX_FRAMES : MAX_OPENING_FRAMES)) return null;
  const videoId = videoIdFor(deps.db, queueId);
  if (videoId === null) return null;
  try {
    return await fs.readFile(fromStrip ? framePath(deps.dir, videoId, index) : openingFramePath(deps.dir, videoId, index));
  } catch {
    return null;
  }
}

/** Checks what the renderer sent about a pass. Null when it sent nothing; 'invalid' when it is not usable. */
export function parseFrameSetInfo(value: unknown): FrameSetInfo | null | 'invalid' {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object') return 'invalid';
  const record = value as Record<string, unknown>;
  const numbers = (list: unknown): number[] | null =>
    Array.isArray(list) && list.every((entry) => typeof entry === 'number' && Number.isFinite(entry)) ? (list as number[]) : null;
  const times = numbers(record.times);
  const openingTimes = numbers(record.openingTimes);
  const opening = record.opening;
  if (times === null || openingTimes === null || !Array.isArray(opening) || opening.some((frame) => !(frame instanceof Uint8Array))) {
    return 'invalid';
  }
  const duration = record.duration === null ? null : seconds(record.duration);
  return { times, openingTimes, opening: (opening as Uint8Array[]).map((frame) => Buffer.from(frame)), duration };
}

/** Which videos already have a complete, current set of stills, so a decode pass can skip them. */
export async function videosWithFrames(dir: string): Promise<Set<number>> {
  let files: string[];
  try {
    files = await fs.readdir(framesDir(dir));
  } catch {
    return new Set();
  }
  const names = new Set(files);
  const complete = new Set<number>();
  for (const name of files) {
    if (!name.endsWith('.json')) continue;
    const id = Number(name.slice(0, -'.json'.length));
    if (!Number.isInteger(id) || !names.has(`${id}-0.jpg`)) continue;
    const meta = await readMeta(dir, id);
    if (meta !== null && meta.version >= FRAME_SET_VERSION) complete.add(id);
  }
  return complete;
}
