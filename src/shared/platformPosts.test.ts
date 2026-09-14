import { describe, expect, it } from 'vitest';
import { approvedForPosting, captionFor, nextPostState, parsePostLink } from './platformPosts';

// Shaped like this channel's own descriptions: a block of hashtags, one of them YouTube's.
const DETAILS = {
  title: 'Does being a zombie hurt real bad or feel real good',
  description: '#blackops3 #bo3zombies #zombies #campfire #shorts #BO3Zombies'
};

describe('the caption for TikTok and Instagram', () => {
  it('is the title and its hashtags, without the ones that only mean something on YouTube or repeat', () => {
    expect(captionFor(DETAILS, 'tiktok')).toBe('Does being a zombie hurt real bad or feel real good\n\n#blackops3 #bo3zombies #zombies #campfire');
    expect(captionFor(DETAILS, 'instagram')).toBe(captionFor(DETAILS, 'tiktok'));
  });

  it('leaves out what is not a hashtag, such as a link to the long video', () => {
    expect(captionFor({ title: 'Round 50', description: 'Full video: https://youtu.be/abc123\n#bo3' }, 'tiktok')).toBe('Round 50\n\n#bo3');
  });

  it('keeps Instagram to 30 hashtags, counting any in the title', () => {
    const many = Array.from({ length: 40 }, (_, index) => `#tag${index}`).join(' ');
    const caption = captionFor({ title: 'Clutch #bo3', description: many }, 'instagram');
    expect(caption.match(/#/g)).toHaveLength(30);
    expect(captionFor({ title: 'Clutch #bo3', description: many }, 'tiktok').match(/#/g)).toHaveLength(41);
  });

  it('stops adding hashtags before the caption runs past 2,200 characters', () => {
    const long = captionFor({ title: 'x'.repeat(2190), description: '#bo3 #zombies' }, 'tiktok');
    expect([...long].length).toBeLessThanOrEqual(2200);
    expect(long.endsWith('#bo3')).toBe(true);
  });

  it('is only the hashtags when there is no title, and only the title when there are none', () => {
    expect(captionFor({ title: '', description: '#bo3' }, 'tiktok')).toBe('#bo3');
    expect(captionFor({ title: 'Just a title', description: '' }, 'instagram')).toBe('Just a title');
  });
});

describe('a link to a post', () => {
  it('is tidied for TikTok, keeping short links as they are', () => {
    expect(parsePostLink('tiktok', 'https://www.tiktok.com/@nollid/video/7412345678901234567?is_from_webapp=1&sender_device=pc')).toBe(
      'https://www.tiktok.com/@nollid/video/7412345678901234567'
    );
    expect(parsePostLink('tiktok', 'https://vm.tiktok.com/ZMabc123/')).toBe('https://vm.tiktok.com/ZMabc123/');
    expect(parsePostLink('tiktok', 'https://www.tiktok.com/t/ZTabc123')).toBe('https://www.tiktok.com/t/ZTabc123/');
  });

  it('is tidied for Instagram, from a reel, the reels tab or a profile', () => {
    expect(parsePostLink('instagram', 'https://www.instagram.com/reel/C9xYz12AbCd/?igsh=abc')).toBe('https://www.instagram.com/reel/C9xYz12AbCd/');
    expect(parsePostLink('instagram', 'https://instagram.com/reels/C9xYz12AbCd')).toBe('https://www.instagram.com/reel/C9xYz12AbCd/');
    expect(parsePostLink('instagram', 'https://www.instagram.com/nollid/reel/C9xYz12AbCd/')).toBe('https://www.instagram.com/reel/C9xYz12AbCd/');
    expect(parsePostLink('instagram', 'https://www.instagram.com/p/C9xYz12AbCd/')).toBe('https://www.instagram.com/p/C9xYz12AbCd/');
  });

  it('is refused when it is somewhere else, or not a post', () => {
    expect(parsePostLink('tiktok', 'https://www.instagram.com/reel/C9xYz12AbCd/')).toBeNull();
    expect(parsePostLink('instagram', 'https://www.tiktok.com/@nollid/video/7412345678901234567')).toBeNull();
    expect(parsePostLink('tiktok', 'https://www.tiktok.com/@nollid')).toBeNull();
    expect(parsePostLink('instagram', 'https://www.instagram.com/nollid/')).toBeNull();
    expect(parsePostLink('tiktok', 'javascript:alert(1)')).toBeNull();
    expect(parsePostLink('instagram', 'not a link')).toBeNull();
  });
});

describe('posting to another platform', () => {
  it('waits for the video to be approved, which covers every platform it goes to', () => {
    expect(approvedForPosting({ state: 'pending', attention_from_state: null })).toBe(false);
    expect(approvedForPosting({ state: 'rejected', attention_from_state: null })).toBe(false);
    expect(approvedForPosting({ state: 'approved', attention_from_state: null })).toBe(true);
    expect(approvedForPosting({ state: 'published', attention_from_state: null })).toBe(true);
    // A problem found before approval is still before approval.
    expect(approvedForPosting({ state: 'needs_attention', attention_from_state: 'pending' })).toBe(false);
    expect(approvedForPosting({ state: 'needs_attention', attention_from_state: 'scheduled' })).toBe(true);
  });

  it('moves between waiting, posted and skipped, and will not skip what is already out', () => {
    expect(nextPostState('waiting', { type: 'posted', url: null })).toEqual({ ok: true, state: 'posted' });
    expect(nextPostState('waiting', { type: 'skip' })).toEqual({ ok: true, state: 'skipped' });
    expect(nextPostState('posted', { type: 'skip' })).toMatchObject({ ok: false });
    expect(nextPostState('posted', { type: 'restore' })).toEqual({ ok: true, state: 'waiting' });
    expect(nextPostState('skipped', { type: 'restore' })).toEqual({ ok: true, state: 'waiting' });
    expect(nextPostState('waiting', { type: 'restore' })).toMatchObject({ ok: false });
  });
});
