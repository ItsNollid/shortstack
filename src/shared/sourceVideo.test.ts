import { describe, expect, it } from 'vitest';
import { checkSource, sourceKey } from './sourceVideo';

describe('the long video a Short was cut from', () => {
  it('needs only a title', () => {
    expect(checkSource({ title: '  Round 50 attempt  ', link: '' })).toEqual({ ok: true, source: { title: 'Round 50 attempt', url: null } });
  });

  it('keeps a YouTube link in one form, however it was pasted', () => {
    const expected = { ok: true, source: { title: 'Round 50 attempt', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } };
    expect(checkSource({ title: 'Round 50 attempt', link: 'https://youtu.be/dQw4w9WgXcQ' })).toEqual(expected);
    expect(checkSource({ title: 'Round 50 attempt', link: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s' })).toEqual(expected);
  });

  it('refuses a link with no title, a link that is not YouTube, and a title too long to be one', () => {
    expect(checkSource({ title: '', link: 'https://youtu.be/dQw4w9WgXcQ' })).toMatchObject({ ok: false, problem: expect.stringMatching(/as well as its link/) });
    expect(checkSource({ title: 'Round 50', link: 'https://example.com/video' })).toMatchObject({ ok: false, problem: expect.stringMatching(/not a YouTube/) });
    expect(checkSource({ title: 'a'.repeat(101), link: '' })).toMatchObject({ ok: false, problem: expect.stringMatching(/100 characters/) });
  });

  it('treats titles that differ only in capitals and spacing as the same video', () => {
    expect(sourceKey('  Round  50 Attempt ')).toBe(sourceKey('round 50 attempt'));
    expect(sourceKey('')).toBeNull();
    expect(sourceKey(null)).toBeNull();
  });
});
