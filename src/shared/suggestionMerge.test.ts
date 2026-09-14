import { describe, expect, it } from 'vitest';
import { describeMerge, mergeDescription, mergeTags } from './suggestionMerge';

// Shaped like this channel's own: a line of words, then a block of hashtags.
const WRITTEN = 'Subscribe\n\n#funny #shorts #viral';

describe('adding a suggested description', () => {
  it('joins the hashtag line at the end, without repeating a hashtag already there', () => {
    expect(mergeDescription(WRITTEN, '#cs2 #Shorts #dustii', 'end')).toEqual({
      value: 'Subscribe\n\n#funny #shorts #viral #cs2 #dustii',
      added: 2,
      alreadyThere: 1,
      leftOut: 0,
      textAdded: false
    });
  });

  it('puts it before the description at the start, on its own when the description starts with words', () => {
    expect(mergeDescription(WRITTEN, '#cs2 #viral', 'start').value).toBe('#cs2\n\nSubscribe\n\n#funny #shorts #viral');
    expect(mergeDescription('#funny #shorts', '#cs2 #shorts', 'start').value).toBe('#cs2 #funny #shorts');
  });

  it('keeps words from the suggestion, but not a line the description already has', () => {
    expect(mergeDescription('Subscribe', 'Subscribe\n#cs2', 'end')).toMatchObject({ value: 'Subscribe\n\n#cs2', added: 1 });
    expect(mergeDescription('#cs2', 'Full match on the channel', 'end')).toMatchObject({
      value: '#cs2\n\nFull match on the channel',
      added: 0,
      textAdded: true
    });
  });

  it('is just the suggestion when there was no description, and changes nothing when nothing is new', () => {
    expect(mergeDescription('', '#cs2 #dustii', 'end').value).toBe('#cs2 #dustii');
    expect(mergeDescription(WRITTEN, '#funny #SHORTS', 'end')).toMatchObject({ value: WRITTEN, added: 0, alreadyThere: 2 });
  });

  it('leaves out the last hashtags that would take it past 5,000 bytes, never what was written', () => {
    const long = 'x'.repeat(4990);
    const merged = mergeDescription(long, '#aa #bb #cc', 'end');
    expect(merged).toMatchObject({ value: `${long}\n\n#aa #bb`, added: 2, leftOut: 1 });
    expect(mergeDescription('y'.repeat(5000), '#aa', 'start')).toMatchObject({ value: 'y'.repeat(5000), added: 0, leftOut: 1 });
  });

  it('replaces it outright when asked', () => {
    expect(mergeDescription(WRITTEN, '#cs2', 'replace')).toMatchObject({ value: '#cs2', added: 1 });
  });
});

describe('adding suggested tags', () => {
  it('adds the new ones to the end or the start, skipping any the video has in any capitals', () => {
    expect(mergeTags(['bo3', 'zombies'], ['BO3', 'cod zombies', 'round 50'], 'end')).toEqual({
      value: ['bo3', 'zombies', 'cod zombies', 'round 50'],
      added: 2,
      alreadyThere: 1,
      leftOut: 0
    });
    expect(mergeTags(['bo3'], ['cod zombies', 'bo3'], 'start').value).toEqual(['cod zombies', 'bo3']);
  });

  it('keeps every tag already there and leaves out new ones that do not fit 500 characters', () => {
    const existing = ['a'.repeat(490)];
    const merged = mergeTags(existing, ['bb', 'this one is far too long to fit', 'cc'], 'end');
    expect(merged.value).toEqual([existing[0], 'bb', 'cc']);
    expect(merged).toMatchObject({ added: 2, leftOut: 1 });
  });

  it('replaces them outright when asked', () => {
    expect(mergeTags(['bo3'], ['cs2'], 'replace').value).toEqual(['cs2']);
  });
});

describe('saying what adding did', () => {
  it('counts what went in, what was already there and what did not fit', () => {
    expect(describeMerge({ added: 2, alreadyThere: 1, leftOut: 0 }, 'end', 'hashtag')).toBe('Added 2 hashtags to the end; 1 hashtag was already there.');
    expect(describeMerge({ added: 1, alreadyThere: 0, leftOut: 3 }, 'start', 'tag')).toBe('Added 1 tag to the start; 3 tags did not fit YouTube’s limit.');
    expect(describeMerge({ added: 0, alreadyThere: 4, leftOut: 0 }, 'end', 'tag')).toBe('Nothing new to add; 4 tags were already there.');
    expect(describeMerge({ added: 0, alreadyThere: 0, leftOut: 0, textAdded: true }, 'end', 'hashtag')).toBe('Added to the end.');
    expect(describeMerge({ added: 5, alreadyThere: 0, leftOut: 0 }, 'replace', 'tag')).toBeNull();
  });
});
