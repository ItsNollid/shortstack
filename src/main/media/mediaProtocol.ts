// Lets the renderer read a video file without giving it filesystem access. The renderer asks for
// ss-media://video/<queue id>; the path is looked up in the database, so a compromised renderer can
// only ever reach files ShortStack already knows about.
import type Database from 'better-sqlite3';
import { protocol } from 'electron';
import * as fs from 'fs';
import { Readable } from 'stream';
import { extname } from 'path';
import { readFramePart } from './frames';
import { readThumbnail } from './thumbnails';

export const MEDIA_SCHEME = 'ss-media';

/** Must run before the app is ready, or the scheme is not privileged and range requests fail. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true }
    }
  ]);
}

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo'
};

/**
 * Without this, drawing one of these videos into a canvas taints it and the poster frame cannot be
 * read back. The scheme only ever serves files this app already knows about, so letting the app's
 * own page read them widens nothing.
 */
const ALLOW_READING = { 'Access-Control-Allow-Origin': '*' } as const;

export const mimeFor = (filePath: string): string => MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream';

export interface ByteRange {
  start: number;
  end: number;
}

/**
 * Parses a Range header against a known size. Returns null for a whole-file request, and undefined
 * for one that cannot be satisfied — a player seeking past the end should get a 416, not the file.
 */
export function parseRange(header: string | null, size: number): ByteRange | null | undefined {
  if (header === null || header.trim() === '') return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (match === null) return undefined;

  const rawStart = match[1] as string;
  const rawEnd = match[2] as string;
  if (rawStart === '' && rawEnd === '') return undefined;

  // "bytes=-500" means the last 500 bytes.
  if (rawStart === '') {
    const length = Number(rawEnd);
    if (!Number.isFinite(length) || length <= 0) return undefined;
    return { start: Math.max(0, size - length), end: size - 1 };
  }

  const start = Number(rawStart);
  if (!Number.isFinite(start) || start >= size) return undefined;
  const end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1);
  return end < start ? undefined : { start, end };
}

export type MediaKind = 'video' | 'thumb' | 'frame';

export type MediaRequest = { kind: 'video' | 'thumb'; queueId: number } | { kind: 'frame'; queueId: number; part: string };

/**
 * Pulls the kind and queue id out of ss-media://video/<id> or ss-media://thumb/<id>, and the still
 * out of ss-media://frame/<id>/<still>.
 */
export function parseMediaUrl(url: string): MediaRequest | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== `${MEDIA_SCHEME}:`) return null;
    // pathname always begins with a slash, so splitting it is clearer than a regex.
    const segments = parsed.pathname.split('/').filter((segment) => segment !== '');
    const id = Number(segments[0]);
    if (!Number.isInteger(id) || id <= 0) return null;

    if (parsed.hostname === 'frame') {
      const part = segments[1];
      return segments.length === 2 && part !== undefined && /^[so]\d$/.test(part) ? { kind: 'frame', queueId: id, part } : null;
    }
    if (parsed.hostname !== 'video' && parsed.hostname !== 'thumb') return null;
    return segments.length === 1 ? { kind: parsed.hostname, queueId: id } : null;
  } catch {
    return null;
  }
}

/** The video case specifically, which is the one with range handling. */
export function queueIdFromUrl(url: string): number | null {
  const parsed = parseMediaUrl(url);
  return parsed === null || parsed.kind !== 'video' ? null : parsed.queueId;
}

export interface MediaDeps {
  db: Database.Database;
  /** Where poster frames are cached. */
  thumbnailDir: string;
  /** Overridable so the lookup can be tested without a real database. */
  filePathFor?(queueId: number): string | null;
}

const lookup = (db: Database.Database, queueId: number): string | null => {
  const row = db
    .prepare('SELECT v.filepath FROM queue q JOIN videos v ON v.id = q.video_id WHERE q.id = ?')
    .get(queueId) as { filepath?: string } | undefined;
  return row?.filepath ?? null;
};

export function handleMediaRequests(deps: MediaDeps): void {
  const filePathFor = deps.filePathFor ?? ((queueId: number) => lookup(deps.db, queueId));

  protocol.handle(MEDIA_SCHEME, async (request) => {
    const asked = parseMediaUrl(request.url);
    if (asked === null) return new Response('Not found', { status: 404 });

    if (asked.kind === 'thumb') {
      const image = await readThumbnail({ db: deps.db, dir: deps.thumbnailDir }, asked.queueId);
      return image === null
        ? new Response('No thumbnail yet', { status: 404 })
        : new Response(image, { status: 200, headers: { 'Content-Type': 'image/png', ...ALLOW_READING } });
    }

    if (asked.kind === 'frame') {
      const image = await readFramePart({ db: deps.db, dir: deps.thumbnailDir }, asked.queueId, asked.part);
      return image === null
        ? new Response('No still yet', { status: 404 })
        : new Response(image, { status: 200, headers: { 'Content-Type': 'image/jpeg', ...ALLOW_READING } });
    }

    const queueId = asked.queueId;
    const filePath = filePathFor(queueId);
    if (filePath === null) return new Response('Not found', { status: 404 });

    let size: number;
    try {
      size = (await fs.promises.stat(filePath)).size;
    } catch {
      return new Response('The file is no longer there', { status: 404 });
    }

    const type = mimeFor(filePath);
    const range = parseRange(request.headers.get('range'), size);
    if (range === undefined) {
      return new Response('Range not satisfiable', { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }

    const body = (start?: number, end?: number): ReadableStream =>
      Readable.toWeb(fs.createReadStream(filePath, { start, end })) as ReadableStream;

    if (range === null) {
      return new Response(body(), {
        status: 200,
        headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes', ...ALLOW_READING }
      });
    }

    return new Response(body(range.start, range.end), {
      status: 206,
      headers: {
        'Content-Type': type,
        'Content-Length': String(range.end - range.start + 1),
        'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
        'Accept-Ranges': 'bytes',
        ...ALLOW_READING
      }
    });
  });
}
