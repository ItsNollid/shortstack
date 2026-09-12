// Lets the renderer read a video file without giving it filesystem access. The renderer asks for
// ss-media://video/<queue id>; the path is looked up in the database, so a compromised renderer can
// only ever reach files ShortStack already knows about.
import type Database from 'better-sqlite3';
import { protocol } from 'electron';
import * as fs from 'fs';
import { Readable } from 'stream';
import { extname } from 'path';

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

/** Pulls the queue id out of ss-media://video/<id>. Anything else is refused. */
export function queueIdFromUrl(url: string): number | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== `${MEDIA_SCHEME}:` || parsed.hostname !== 'video') return null;
    const id = Number(parsed.pathname.replace(/^\//, ''));
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export interface MediaDeps {
  db: Database.Database;
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
    const queueId = queueIdFromUrl(request.url);
    if (queueId === null) return new Response('Not found', { status: 404 });

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
        headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' }
      });
    }

    return new Response(body(range.start, range.end), {
      status: 206,
      headers: {
        'Content-Type': type,
        'Content-Length': String(range.end - range.start + 1),
        'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
        'Accept-Ranges': 'bytes'
      }
    });
  });
}
