import { describe, expect, it } from 'vitest';
import { HASH_ALGO, decideIdentity, isStable, needsHashing, type KnownVideo, type ScannedFile } from './fileIdentity';

const file: ScannedFile = { filename: 'clip.mov', filepath: 'E:/Shorts/clip.mov', size: 1000, mtimeMs: 500 };

const known = (overrides: Partial<KnownVideo> = {}): KnownVideo => ({
  id: 1,
  filepath: file.filepath,
  file_hash: 'hash-a',
  hash_algo: HASH_ALGO,
  file_size: file.size,
  mtime_ms: file.mtimeMs,
  reachedYouTube: false,
  ...overrides
});

describe('needsHashing', () => {
  it('hashes anything new, changed, or hashed by an older scheme', () => {
    expect(needsHashing(file, undefined)).toBe(true);
    expect(needsHashing(file, known({ file_size: 999 }))).toBe(true);
    expect(needsHashing(file, known({ mtime_ms: 1 }))).toBe(true);
    expect(needsHashing(file, known({ hash_algo: 'legacy-md5-1mib-size' }))).toBe(true);
    expect(needsHashing(file, known({ file_hash: null }))).toBe(true);
  });

  it('skips the expensive read when nothing moved', () => {
    expect(needsHashing(file, known())).toBe(false);
  });
});

describe('isStable', () => {
  it('accepts a file only once its size and timestamp stop moving', () => {
    expect(isStable({ size: 1000, mtimeMs: 5 }, { size: 1000, mtimeMs: 5 })).toBe(true);
    expect(isStable({ size: 900, mtimeMs: 5 }, { size: 1000, mtimeMs: 5 })).toBe(false);
    expect(isStable({ size: 1000, mtimeMs: 4 }, { size: 1000, mtimeMs: 5 })).toBe(false);
  });

  it('never accepts an empty file', () => {
    expect(isStable({ size: 0, mtimeMs: 5 }, { size: 0, mtimeMs: 5 })).toBe(false);
  });
});

describe('decideIdentity', () => {
  it('adds a video it has never seen', () => {
    expect(decideIdentity(file, 'hash-a', undefined, undefined)).toEqual({ action: 'insert' });
  });

  it('ignores the same content found under another name', () => {
    const elsewhere = known({ id: 7, filepath: 'E:/Shorts/copy.mov' });
    expect(decideIdentity(file, 'hash-a', undefined, elsewhere)).toMatchObject({ action: 'ignore', videoId: 7 });
  });

  it('does nothing when the file is genuinely unchanged', () => {
    expect(decideIdentity(file, 'hash-a', known(), known())).toEqual({ action: 'unchanged', videoId: 1 });
  });

  it('refreshes stored stats when only the bookkeeping is stale', () => {
    const legacy = known({ hash_algo: 'legacy-md5-1mib-size' });
    expect(decideIdentity(file, 'hash-a', legacy, legacy)).toEqual({ action: 'touch', videoId: 1 });
  });

  it('updates in place when a video changed before it was uploaded', () => {
    const outcome = decideIdentity(file, 'hash-b', known(), undefined);
    expect(outcome).toMatchObject({ action: 'update', videoId: 1 });
  });

  it('adds a re-render as its own video instead of overwriting the uploaded one', () => {
    const uploaded = known({ reachedYouTube: true });
    const outcome = decideIdentity(file, 'hash-b', uploaded, undefined);
    expect(outcome).toMatchObject({ action: 'insert_flagged', previousVideoId: 1 });
  });
});
