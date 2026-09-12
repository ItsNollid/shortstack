// Decides what a file found on disk means for the library. Pure, so the awkward cases
// (a re-render replacing an uploaded video, a copy under a new name, a file still being
// written) are settled by tests rather than by whatever the filesystem happened to do.

/** Bumped when the hashing scheme changes, so old rows are rehashed once rather than mismatching forever. */
export const HASH_ALGO = 'sha1-size-head-tail-4mib';

export interface ScannedFile {
  filename: string;
  filepath: string;
  size: number;
  mtimeMs: number;
}

export interface KnownVideo {
  id: number;
  filepath: string;
  file_hash: string | null;
  hash_algo: string | null;
  file_size: number | null;
  mtime_ms: number | null;
  /** The queue item for this video has a YouTube id or a tombstone. */
  reachedYouTube: boolean;
}

export type IdentityOutcome =
  | { action: 'unchanged'; videoId: number }
  | { action: 'touch'; videoId: number }
  | { action: 'insert' }
  | { action: 'update'; videoId: number; reason: string }
  | { action: 'insert_flagged'; previousVideoId: number; reason: string }
  | { action: 'ignore'; videoId: number; reason: string };

/** Hashing a large file is expensive, so only do it when the cheap stats say something changed. */
export function needsHashing(file: ScannedFile, known: KnownVideo | undefined): boolean {
  if (known === undefined) return true;
  if (known.file_hash === null || known.hash_algo !== HASH_ALGO) return true;
  return known.file_size !== file.size || known.mtime_ms !== file.mtimeMs;
}

/**
 * A file is considered ready only once its size and modification time stop moving. A video still
 * being rendered or copied would otherwise be hashed mid-write and land in the queue twice.
 */
export function isStable(first: { size: number; mtimeMs: number }, second: { size: number; mtimeMs: number }): boolean {
  return first.size === second.size && first.mtimeMs === second.mtimeMs && second.size > 0;
}

export function decideIdentity(
  file: ScannedFile,
  hash: string,
  byPath: KnownVideo | undefined,
  byHash: KnownVideo | undefined
): IdentityOutcome {
  if (byHash !== undefined && byHash.filepath !== file.filepath) {
    return { action: 'ignore', videoId: byHash.id, reason: 'The same video is already in the queue under another name' };
  }
  if (byPath === undefined) return { action: 'insert' };
  if (byPath.file_hash === hash) {
    return byPath.hash_algo === HASH_ALGO && byPath.file_size === file.size && byPath.mtime_ms === file.mtimeMs
      ? { action: 'unchanged', videoId: byPath.id }
      : { action: 'touch', videoId: byPath.id };
  }
  // Same path, different content.
  return byPath.reachedYouTube
    ? {
        action: 'insert_flagged',
        previousVideoId: byPath.id,
        reason: 'This filename was already uploaded, so the new version was added as a separate video'
      }
    : { action: 'update', videoId: byPath.id, reason: 'The file changed since it was added, so its details may be out of date' };
}
