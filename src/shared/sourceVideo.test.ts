import { describe, expect, it } from 'vitest';
import { parseSourceInput, sourceKey, watchUrl } from './sourceVideo';

describe('what the long-video field sends', () => {
  it('accepts a link on its own, however it was shared', () => {
    expect(parseSourceInput({ title: '', link: 'https://youtu.be/EfaSgECW4CY?si=2qmO9qvxR5ijR4P-' })).toEqual({
      ok: true,
      title: null,
      videoId: 'EfaSgECW4CY'
    });
    expect(parseSourceInput({ title: '', link: 'https://www.youtube.com/watch?v=EfaSgECW4CY&t=42s' })).toMatchObject({ videoId: 'EfaSgECW4CY' });
  });

  it('accepts a name on its own, for a long video that is not up yet', () => {
    expect(parseSourceInput({ title: '  Round 50 attempt  ', link: '' })).toEqual({ ok: true, title: 'Round 50 attempt', videoId: null });
  });

  it('refuses nothing at all, a link that is not YouTube, and a name too long to be one', () => {
    expect(parseSourceInput({ title: '', link: '' })).toMatchObject({ ok: false, problem: expect.stringMatching(/YouTube link, or name it/) });
    expect(parseSourceInput({ title: '', link: 'https://example.com/video' })).toMatchObject({ ok: false, problem: expect.stringMatching(/not a YouTube/) });
    expect(parseSourceInput({ title: 'a'.repeat(101), link: '' })).toMatchObject({ ok: false, problem: expect.stringMatching(/100 characters/) });
  });

  it('writes every link to a video the same way', () => {
    expect(watchUrl('EfaSgECW4CY')).toBe('https://www.youtube.com/watch?v=EfaSgECW4CY');
  });

  it('treats names that differ only in capitals and spacing as the same video', () => {
    expect(sourceKey('  Round  50 Attempt ')).toBe(sourceKey('round 50 attempt'));
    expect(sourceKey('')).toBeNull();
    expect(sourceKey(null)).toBeNull();
  });
});
