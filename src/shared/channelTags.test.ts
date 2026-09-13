import { describe, expect, it } from 'vitest';
import { hashtagsIn, tagVocabulary, withoutOneOffTags } from './channelTags';

// The real shape: every upload carries the channel's tags, each carries one of its own.
const descriptions = [
  '#blackops3zombies #codzombies #shorts #round100',
  '#blackops3zombies #codzombies #shorts #easteregg',
  '#blackops3zombies #codzombies #shorts #firstgame'
];

describe('tagVocabulary', () => {
  it('separates what the channel always says from what one video claimed', () => {
    const vocabulary = tagVocabulary(descriptions);
    expect(vocabulary.standing.sort()).toEqual(['#blackops3zombies', '#codzombies', '#shorts']);
    expect(vocabulary.oneOff.sort()).toEqual(['#easteregg', '#firstgame', '#round100']);
  });

  it('counts a tag once per description, so repeating it in one does not make it a habit', () => {
    expect(tagVocabulary(['#solo #solo #solo']).standing).toEqual([]);
  });

  it('treats case as the same tag and keeps the first spelling', () => {
    expect(tagVocabulary(['#BlackOps3Zombies', '#blackops3zombies']).standing).toEqual(['#BlackOps3Zombies']);
  });

  it('calls nothing standing when there is only one upload to go on', () => {
    const vocabulary = tagVocabulary(['#blackops3zombies #round100']);
    expect(vocabulary.standing).toEqual([]);
    expect(vocabulary.oneOff.sort()).toEqual(['#blackops3zombies', '#round100']);
  });

  it('copes with descriptions that have no hashtags at all', () => {
    expect(tagVocabulary(['just words', ''])).toEqual({ standing: [], oneOff: [] });
  });
});

describe('withoutOneOffTags', () => {
  it('removes what one video claimed and leaves the rest readable', () => {
    const vocabulary = tagVocabulary(descriptions);
    expect(withoutOneOffTags('#blackops3zombies #round100 #codzombies', vocabulary)).toBe('#blackops3zombies #codzombies');
  });

  it('leaves the surrounding words alone', () => {
    const vocabulary = tagVocabulary(descriptions);
    expect(withoutOneOffTags('Round 100 finally.\n\n#blackops3zombies #round100', vocabulary)).toBe(
      'Round 100 finally.\n\n#blackops3zombies'
    );
  });

  it('changes nothing when there is nothing one-off to remove', () => {
    expect(withoutOneOffTags('#a #b', { standing: ['#a', '#b'], oneOff: [] })).toBe('#a #b');
  });
});

describe('hashtagsIn', () => {
  it('finds hashtags anywhere, and nothing that is not one', () => {
    expect(hashtagsIn('a #one, then #two_3 and a # alone')).toEqual(['#one', '#two_3']);
    expect(hashtagsIn('none here')).toEqual([]);
  });
});
