// YouTube resumable upload. Chunked so a dropped connection resumes instead of restarting,
// and deliberately cautious about one case: if a session disappears after the final chunk was
// attempted, the upload may actually have succeeded, so it is never retried blindly.
import * as fs from 'fs/promises';

export const CHUNK_MULTIPLE = 256 * 1024;
export const DEFAULT_CHUNK_SIZE = 32 * CHUNK_MULTIPLE; // 8 MiB, a multiple of 256 KiB as required
export const UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';

export interface UploadRequest {
  filePath: string;
  fileSize: number;
  mimeType: string;
  metadata: Record<string, unknown>;
  /** A session to resume, and how much of it YouTube already confirmed. */
  sessionUri?: string | null;
  bytesConfirmed?: number;
}

export interface UploaderDeps {
  accessToken(): Promise<string>;
  fetch?: typeof fetch;
  readChunk?(filePath: string, start: number, length: number): Promise<Buffer>;
  /** Called with the session URI before the first byte is sent, so a crash can resume. */
  onSession?(sessionUri: string): void | Promise<void>;
  onProgress?(bytesConfirmed: number): void;
  sleep?(ms: number): Promise<void>;
  chunkSize?: number;
  attemptsPerChunk?: number;
  endpoint?: string;
}

export type UploadOutcome =
  | { status: 'completed'; videoId: string; sessionUri: string }
  | { status: 'failed'; retryable: boolean; error: string; code: string | null; hold?: 'api' | 'upload_quota' }
  | { status: 'session_lost' }
  | { status: 'possible_duplicate'; error: string };

const defaultReadChunk = async (filePath: string, start: number, length: number): Promise<Buffer> => {
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, start);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Google returns "bytes=0-N", where N is the last stored byte, so the confirmed length is N + 1. */
export function parseConfirmedBytes(rangeHeader: string | null): number {
  if (rangeHeader === null) return 0;
  const match = /bytes=0-(\d+)/.exec(rangeHeader);
  return match === null ? 0 : Number(match[1]) + 1;
}

export function classifyFailure(
  status: number,
  body: string
): { retryable: boolean; code: string | null; hold?: 'api' | 'upload_quota' } {
  let code: string | null = null;
  try {
    const parsed = JSON.parse(body) as { error?: { errors?: Array<{ reason?: string }> } };
    code = parsed.error?.errors?.[0]?.reason ?? null;
  } catch {
    code = null;
  }
  if (code === 'quotaExceeded' || code === 'uploadLimitExceeded') return { retryable: false, code, hold: 'upload_quota' };
  if (status === 429 || status >= 500) return { retryable: true, code, hold: 'api' };
  return { retryable: false, code };
}

export function videoIdFrom(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { id?: string };
    return typeof parsed.id === 'string' ? parsed.id : null;
  } catch {
    return null;
  }
}

async function createSession(request: UploadRequest, deps: UploaderDeps, doFetch: typeof fetch): Promise<string | UploadOutcome> {
  const response = await doFetch(deps.endpoint ?? UPLOAD_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await deps.accessToken()}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(request.fileSize),
      'X-Upload-Content-Type': request.mimeType
    },
    body: JSON.stringify(request.metadata)
  });
  if (!response.ok) {
    const body = await response.text();
    return { status: 'failed', error: `Could not start the upload (${response.status})`, ...classifyFailure(response.status, body) };
  }
  const sessionUri = response.headers.get('location');
  return sessionUri ?? { status: 'failed', retryable: true, error: 'YouTube did not return an upload session', code: null };
}

export async function uploadVideoResumable(request: UploadRequest, deps: UploaderDeps): Promise<UploadOutcome> {
  const doFetch = deps.fetch ?? fetch;
  const readChunk = deps.readChunk ?? defaultReadChunk;
  const sleep = deps.sleep ?? defaultSleep;
  const chunkSize = deps.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const attempts = deps.attemptsPerChunk ?? 5;
  const total = request.fileSize;

  let sessionUri = request.sessionUri ?? null;
  let confirmed = request.bytesConfirmed ?? 0;

  if (sessionUri === null) {
    const created = await createSession(request, deps, doFetch);
    if (typeof created !== 'string') return created;
    sessionUri = created;
    confirmed = 0;
    await deps.onSession?.(sessionUri); // persisted before any byte is sent
  } else {
    const probe = await doFetch(sessionUri, {
      method: 'PUT',
      // fetch sets Content-Length itself; it is a forbidden header to set by hand.
      headers: { 'Content-Range': `bytes */${total}` }
    });
    if (probe.status === 200 || probe.status === 201) {
      const videoId = videoIdFrom(await probe.text());
      return videoId === null
        ? { status: 'possible_duplicate', error: 'YouTube reported the upload finished but returned no video id' }
        : { status: 'completed', videoId, sessionUri };
    }
    if (probe.status === 308) {
      confirmed = parseConfirmedBytes(probe.headers.get('range'));
      deps.onProgress?.(confirmed);
    } else if (probe.status === 404) {
      // The session is gone. If the final chunk had already been attempted, the upload may have
      // completed before it expired, so this needs a person to check before any retry.
      return confirmed >= total - chunkSize
        ? { status: 'possible_duplicate', error: 'The upload session expired after the final chunk was sent' }
        : { status: 'session_lost' };
    } else {
      const body = await probe.text();
      return { status: 'failed', error: `Could not resume the upload (${probe.status})`, ...classifyFailure(probe.status, body) };
    }
  }

  while (confirmed < total) {
    const length = Math.min(chunkSize, total - confirmed);
    const chunk = await readChunk(request.filePath, confirmed, length);
    if (chunk.length === 0) {
      return { status: 'failed', retryable: false, error: 'The video file ended sooner than expected', code: 'file_shrank' };
    }
    const isFinalChunk = confirmed + chunk.length >= total;

    let lastError = 'Upload failed';
    let accepted = false;
    for (let attempt = 1; attempt <= attempts && !accepted; attempt += 1) {
      const response = await doFetch(sessionUri, {
        method: 'PUT',
        headers: {
          'Content-Type': request.mimeType,
          'Content-Range': `bytes ${confirmed}-${confirmed + chunk.length - 1}/${total}`
        },
        body: chunk
      });

      if (response.status === 200 || response.status === 201) {
        const videoId = videoIdFrom(await response.text());
        return videoId === null
          ? { status: 'possible_duplicate', error: 'YouTube accepted the upload but returned no video id' }
          : { status: 'completed', videoId, sessionUri };
      }
      if (response.status === 308) {
        // Never assume the server kept everything that was sent.
        confirmed = Math.max(parseConfirmedBytes(response.headers.get('range')), confirmed);
        deps.onProgress?.(confirmed);
        accepted = true;
        break;
      }
      if (response.status === 404) {
        return isFinalChunk
          ? { status: 'possible_duplicate', error: 'The upload session expired while the final chunk was in flight' }
          : { status: 'session_lost' };
      }

      const body = await response.text();
      const classified = classifyFailure(response.status, body);
      lastError = `Upload failed (${response.status})`;
      if (!classified.retryable || attempt === attempts) return { status: 'failed', error: lastError, ...classified };
      await sleep(Math.min(2 ** attempt * 1000, 60_000));
    }
    if (!accepted) return { status: 'failed', retryable: true, error: lastError, code: null };
  }

  return { status: 'possible_duplicate', error: 'Every byte was sent but YouTube never confirmed the video' };
}
