import { describe, expect, it, vi } from 'vitest';
import { resolveSource } from './sources';
import type { GatewayResult } from './youtube/gateway';

const LINK = 'https://youtu.be/EfaSgECW4CY?si=2qmO9qvxR5ijR4P-';
const URL = 'https://www.youtube.com/watch?v=EfaSgECW4CY';
const nothingStored = { title: null, url: null };
const found = (title: string) => vi.fn(async (): Promise<GatewayResult<{ title: string }>> => ({ ok: true, value: { title } }));
const unreachable = () =>
  vi.fn(async (): Promise<GatewayResult<{ title: string }>> => ({ ok: false, reason: 'offline', code: null, retryable: true }));

describe('naming a long video', () => {
  it('takes the title from YouTube when only the link is given', async () => {
    const lookup = found('ROUND 50 ATTEMPT ON KINO!');
    expect(await resolveSource({ title: '', link: LINK }, nothingStored, [], lookup)).toEqual({
      ok: true,
      source: { title: 'ROUND 50 ATTEMPT ON KINO!', url: URL }
    });
    expect(lookup).toHaveBeenCalledWith('EfaSgECW4CY');
  });

  it('prefers the real title to a name typed before the long video was up', async () => {
    const result = await resolveSource({ title: 'round 50 attempt', link: LINK }, { title: 'round 50 attempt', url: null }, [], found('ROUND 50 ATTEMPT ON KINO!'));
    expect(result).toEqual({ ok: true, source: { title: 'ROUND 50 ATTEMPT ON KINO!', url: URL } });
  });

  it('does not ask YouTube again for a link this video or another Short already has', async () => {
    const lookup = found('unused');
    expect(await resolveSource({ title: '', link: LINK }, { title: 'Kept title', url: URL }, [], lookup)).toMatchObject({
      source: { title: 'Kept title' }
    });
    expect(await resolveSource({ title: '', link: LINK }, nothingStored, [{ title: 'From another Short', url: URL }], lookup)).toMatchObject({
      source: { title: 'From another Short' }
    });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('keeps a name that was given when YouTube cannot be asked, and asks for one when there is none', async () => {
    expect(await resolveSource({ title: 'Round 50 attempt', link: LINK }, nothingStored, [], unreachable())).toEqual({
      ok: true,
      source: { title: 'Round 50 attempt', url: URL }
    });
    expect(await resolveSource({ title: '', link: LINK }, nothingStored, [], unreachable())).toMatchObject({
      ok: false,
      problem: expect.stringMatching(/Name it yourself/)
    });
  });

  it('keeps a name on its own without asking anything', async () => {
    const lookup = found('unused');
    expect(await resolveSource({ title: 'Round 50 attempt', link: '' }, nothingStored, [], lookup)).toEqual({
      ok: true,
      source: { title: 'Round 50 attempt', url: null }
    });
    expect(lookup).not.toHaveBeenCalled();
  });
});
