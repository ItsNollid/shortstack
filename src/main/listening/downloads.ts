// Downloads a file the app will run or load, and keeps it only if it is exactly the file expected: the size and
// SHA-256 its official source publishes. It is written to a .part file first, so a download that stopped halfway
// is never mistaken for a finished one.
import { createHash } from 'crypto';
import { once } from 'events';
import { createWriteStream } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface VerifiedDownload {
  url: string;
  bytes: number;
  sha256: string;
  /** Where the finished file goes. */
  dest: string;
}

export interface DownloadOptions {
  fetch?: typeof fetch;
  signal?: AbortSignal;
  /** Called about every megabyte, and once at the end. */
  onProgress?(received: number, total: number): void;
}

export type DownloadFailure = 'network' | 'size' | 'checksum' | 'cancelled' | 'disk';
export type DownloadResult = { ok: true; path: string } | { ok: false; code: DownloadFailure; reason: string };

class TooLarge extends Error {}

const REPORT_EVERY_BYTES = 1_000_000;
const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

export async function downloadVerified(item: VerifiedDownload, options: DownloadOptions = {}): Promise<DownloadResult> {
  const doFetch = options.fetch ?? fetch;
  const partial = `${item.dest}.part`;
  const cancelled: DownloadResult = { ok: false, code: 'cancelled', reason: 'The download was cancelled' };
  const discard = (): Promise<void> => fs.rm(partial, { force: true }).catch(() => undefined);

  try {
    await fs.mkdir(path.dirname(item.dest), { recursive: true });
  } catch (error) {
    return { ok: false, code: 'disk', reason: `Could not make the folder for it: ${error instanceof Error ? error.message : String(error)}` };
  }

  let response: Response;
  try {
    response = await doFetch(item.url, { signal: options.signal, redirect: 'follow' });
  } catch {
    return options.signal?.aborted === true ? cancelled : { ok: false, code: 'network', reason: `Could not reach ${hostOf(item.url)}` };
  }
  if (!response.ok || response.body === null) {
    return { ok: false, code: 'network', reason: `${hostOf(item.url)} answered ${response.status}` };
  }

  const hash = createHash('sha256');
  const file = createWriteStream(partial);
  let received = 0;
  let reported = 0;
  try {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      // Stops at once rather than filling the disk with something that is already known to be wrong.
      if (received > item.bytes) throw new TooLarge();
      hash.update(value);
      if (!file.write(value)) await once(file, 'drain');
      if (received - reported >= REPORT_EVERY_BYTES) {
        reported = received;
        options.onProgress?.(received, item.bytes);
      }
    }
    await new Promise<void>((resolve, reject) => {
      file.once('error', reject);
      file.end(() => resolve());
    });
  } catch (error) {
    file.destroy();
    await discard();
    if (options.signal?.aborted === true) return cancelled;
    if (error instanceof TooLarge) return { ok: false, code: 'size', reason: 'The download is larger than the file it should be' };
    return { ok: false, code: 'network', reason: `The download stopped: ${error instanceof Error ? error.message : String(error)}` };
  }

  if (received !== item.bytes) {
    await discard();
    return { ok: false, code: 'size', reason: `Only ${received} of ${item.bytes} bytes arrived` };
  }
  if (hash.digest('hex') !== item.sha256.toLowerCase()) {
    await discard();
    return { ok: false, code: 'checksum', reason: 'The file does not match its published checksum, so it was not kept' };
  }
  options.onProgress?.(received, item.bytes);

  try {
    await fs.rm(item.dest, { force: true });
    await fs.rename(partial, item.dest);
  } catch (error) {
    await discard();
    return { ok: false, code: 'disk', reason: `Could not save it: ${error instanceof Error ? error.message : String(error)}` };
  }
  return { ok: true, path: item.dest };
}
