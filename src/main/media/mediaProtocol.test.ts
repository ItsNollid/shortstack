import { describe, expect, it } from 'vitest';
import { mimeFor, parseMediaUrl, parseRange, queueIdFromUrl } from './mediaProtocol';

describe('queueIdFromUrl', () => {
  it('accepts the shape the renderer asks for', () => {
    expect(queueIdFromUrl('ss-media://video/12')).toBe(12);
  });

  it('refuses anything that is not a positive whole id', () => {
    for (const url of [
      'ss-media://video/0',
      'ss-media://video/-1',
      'ss-media://video/1.5',
      'ss-media://video/abc',
      'ss-media://video/',
      'ss-media://other/1',
      'file:///etc/passwd',
      'https://example.test/1',
      'not a url'
    ]) {
      expect(queueIdFromUrl(url), url).toBeNull();
    }
  });

  it('cannot be walked out of, because only an id is ever read', () => {
    // The path is never used as a path: it is parsed as a number and looked up in the database.
    expect(queueIdFromUrl('ss-media://video/../../secret')).toBeNull();
    expect(queueIdFromUrl('ss-media://video/1/../../secret')).toBeNull();
  });
});

describe('parseRange', () => {
  it('treats no header as the whole file', () => {
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange('', 100)).toBeNull();
  });

  it('reads an ordinary range', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 });
    expect(parseRange('bytes=500-', 1000)).toEqual({ start: 500, end: 999 });
  });

  it('clamps an end past the file to the last byte', () => {
    expect(parseRange('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999 });
  });

  it('reads a suffix range, which players use to find the moov at the end', () => {
    expect(parseRange('bytes=-500', 1000)).toEqual({ start: 500, end: 999 });
    expect(parseRange('bytes=-5000', 1000)).toEqual({ start: 0, end: 999 });
  });

  it('refuses what it cannot satisfy rather than sending the whole file', () => {
    // A player seeking past the end should get a 416, not silently get byte zero.
    expect(parseRange('bytes=1000-', 1000)).toBeUndefined();
    expect(parseRange('bytes=-0', 1000)).toBeUndefined();
    expect(parseRange('bytes=50-10', 1000)).toBeUndefined();
    expect(parseRange('bytes=-', 1000)).toBeUndefined();
    expect(parseRange('items=0-10', 1000)).toBeUndefined();
    expect(parseRange('bytes=0-10, 20-30', 1000)).toBeUndefined();
  });
});

describe('mimeFor', () => {
  it('names the container so Chromium knows what it is being handed', () => {
    expect(mimeFor('C:/a/b.mov')).toBe('video/quicktime');
    expect(mimeFor('C:/a/b.MP4')).toBe('video/mp4');
    expect(mimeFor('C:/a/b.webm')).toBe('video/webm');
  });

  it('does not guess at something it does not know', () => {
    expect(mimeFor('C:/a/b.txt')).toBe('application/octet-stream');
  });
});

describe('parseMediaUrl', () => {
  it('tells the two kinds apart', () => {
    expect(parseMediaUrl('ss-media://video/7')).toEqual({ kind: 'video', queueId: 7 });
    expect(parseMediaUrl('ss-media://thumb/7')).toEqual({ kind: 'thumb', queueId: 7 });
  });

  it('refuses any other host, so the scheme cannot be used to reach something else', () => {
    for (const url of ['ss-media://file/7', 'ss-media://../7', 'ss-media://7']) {
      expect(parseMediaUrl(url), url).toBeNull();
    }
  });

  it('still refuses a thumbnail id that is not a positive whole number', () => {
    expect(parseMediaUrl('ss-media://thumb/0')).toBeNull();
    expect(parseMediaUrl('ss-media://thumb/abc')).toBeNull();
  });
});
