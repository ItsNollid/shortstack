import { describe, expect, it } from 'vitest';
import { costOf, methodFor } from './quota';

describe('methodFor', () => {
  // The same path costs 1 or 50 depending on the verb, which is the whole reason this exists.
  it('tells a read of a video from a change to one', () => {
    expect(methodFor('/videos?part=status&id=abc', 'GET')).toBe('videos.list');
    expect(methodFor('/videos?part=status', 'PUT')).toBe('videos.update');
    expect(costOf(methodFor('/videos?part=status', 'GET'))).toBe(1);
    expect(costOf(methodFor('/videos?part=status', 'PUT'))).toBe(50);
  });

  it('names the other resources the gateway reaches', () => {
    expect(methodFor('/channels?part=snippet&mine=true')).toBe('channels.list');
    expect(methodFor('/playlistItems?part=contentDetails&playlistId=UU1')).toBe('playlistItems.list');
    expect(methodFor('/search?q=zombies')).toBe('search.list');
    expect(methodFor('/thumbnails/set?videoId=abc', 'POST')).toBe('thumbnails.set');
  });

  it('defaults to a read when no verb is given, as fetch does', () => {
    expect(methodFor('/videos?id=abc')).toBe('videos.list');
  });

  it('copes with a path with no leading slash or no query', () => {
    expect(methodFor('videos', 'PUT')).toBe('videos.update');
    expect(methodFor('/channels')).toBe('channels.list');
  });

  // Anything unrecognised is priced as the cheapest thing it could be, never zero.
  it('still costs something for a resource it does not know', () => {
    expect(costOf(methodFor('/somethingNew?x=1'))).toBe(1);
  });
});
