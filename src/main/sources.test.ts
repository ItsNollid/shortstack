import { describe, expect, it, vi } from 'vitest';
import { resolveSource, type TitleLookup } from './sources';

const LINK = 'https://youtu.be/EfaSgECW4CY?si=2qmO9qvxR5ijR4P-';
const URL = 'https://www.youtube.com/watch?v=EfaSgECW4CY';
const MINE = 'UC_nollid';
const nothingStored = { title: null, url: null };
const found = (title: string, channelId: string = MINE) => vi.fn<TitleLookup>(async () => ({ ok: true, value: { title, channelId } }));
const unreachable = () => vi.fn<TitleLookup>(async () => ({ ok: false, reason: 'offline', code: null, retryable: true }));

describe('naming a long video', () => {
  it('takes the title from YouTube when only the link is given', async () => {
    const lookup = found('ROUND 50 ATTEMPT ON KINO!');
    expect(await resolveSource({ title: '', link: LINK }, nothingStored, [], MINE, lookup)).toEqual({
      ok: true,
      source: { title: 'ROUND 50 ATTEMPT ON KINO!', url: URL }
    });
    expect(lookup).toHaveBeenCalledWith('EfaSgECW4CY');
  });

  it('prefers the real title to a name typed before the long video was up', async () => {
    const result = await resolveSource(
      { title: 'round 50 attempt', link: LINK },
      { title: 'round 50 attempt', url: null },
      [],
      MINE,
      found('ROUND 50 ATTEMPT ON KINO!')
    );
    expect(result).toEqual({ ok: true, source: { title: 'ROUND 50 ATTEMPT ON KINO!', url: URL } });
  });

  // A Short's related video is one of the channel's own, and the privacy policy says ShortStack reads
  // this channel's videos — not anyone else's.
  it('refuses a video from another channel', async () => {
    expect(await resolveSource({ title: '', link: LINK }, nothingStored, [], MINE, found('Someone else’s video', 'UC_other'))).toMatchObject({
      ok: false,
      problem: expect.stringMatching(/another channel/)
    });
  });

  it('does not ask YouTube again for a link this video or another Short already has', async () => {
    const lookup = found('unused');
    expect(await resolveSource({ title: '', link: LINK }, { title: 'Kept title', url: URL }, [], MINE, lookup)).toMatchObject({
      source: { title: 'Kept title' }
    });
    expect(
      await resolveSource({ title: '', link: LINK }, nothingStored, [{ title: 'From another Short', url: URL }], MINE, lookup)
    ).toMatchObject({ source: { title: 'From another Short' } });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('keeps a name that was given when YouTube cannot be asked, and asks for one when there is none', async () => {
    expect(await resolveSource({ title: 'Round 50 attempt', link: LINK }, nothingStored, [], MINE, unreachable())).toEqual({
      ok: true,
      source: { title: 'Round 50 attempt', url: URL }
    });
    expect(await resolveSource({ title: '', link: LINK }, nothingStored, [], MINE, unreachable())).toMatchObject({
      ok: false,
      problem: expect.stringMatching(/Name it yourself/)
    });
  });

  it('keeps a name on its own without asking anything', async () => {
    const lookup = found('unused');
    expect(await resolveSource({ title: 'Round 50 attempt', link: '' }, nothingStored, [], MINE, lookup)).toEqual({
      ok: true,
      source: { title: 'Round 50 attempt', url: null }
    });
    expect(lookup).not.toHaveBeenCalled();
  });
});
