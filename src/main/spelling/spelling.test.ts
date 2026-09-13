// Measured against the real dictionary, because the point of the lexicon is how it behaves on the
// words this channel actually writes.
import { describe, expect, it } from 'vitest';
import { realLexicon } from './dictionaryForTests';

describe('words in a sentence', () => {
  const lexicon = realLexicon();

  it('knows the gaming words the dictionary does not', () => {
    for (const word of ['gameplay', 'headshot', 'respawn', 'noob', 'speedrun', 'youtube', 'friendslop']) {
      expect(lexicon.knows(word), word).toBe(true);
    }
  });

  it('accepts a capital at the start of a sentence, and shouting', () => {
    expect(lexicon.knows('Zombies')).toBe(true);
    expect(lexicon.knows('ZOMBIES')).toBe(true);
  });

  it.each([
    ['teh', 'the'],
    ['mroe', 'more'],
    ['recieve', 'receive'],
    ['zombeis', 'zombies'],
    ['subscibe', 'subscribe'],
    ['untill', 'until'],
    ['funy', 'funny'],
    ['gamplay', 'gameplay']
  ])('fixes "%s" as "%s" without asking', (typed, meant) => {
    const advice = lexicon.suggest(typed);
    expect(advice.suggestions[0]).toBe(meant);
    expect(advice.confident).toBe(true);
  });

  it('offers, but does not apply, a guess when several fixes are as likely', () => {
    const advice = lexicon.suggest('thn');
    expect(advice.suggestions).toEqual(expect.arrayContaining(['then', 'than']));
    expect(advice.confident).toBe(false);
  });

  it('suggests the space someone left out', () => {
    expect(lexicon.suggest('subscribenow').suggestions).toContain('subscribe now');
  });

  it('keeps the shape of what was typed', () => {
    expect(lexicon.suggest('Zombeis').suggestions[0]).toBe('Zombies');
    expect(lexicon.suggest('ZOMBEIS').suggestions[0]).toBe('ZOMBIES');
  });

  it('knows the names it is given', () => {
    const withName = realLexicon(['Nollid']);
    expect(withName.knows('Nollid')).toBe(true);
    expect(withName.hashtag('nollid')).toBeNull();
  });

  // The dictionary's own suggester took 0.4 seconds on "gamertag". This must never stall typing.
  it('stays quick on a word it has never seen', () => {
    const started = performance.now();
    lexicon.suggest('skibidigyatt');
    expect(performance.now() - started).toBeLessThan(250);
  });
});

describe('hashtags', () => {
  const lexicon = realLexicon();

  it.each([
    'blackops3zombies',
    'bo3zombies',
    'codzombies',
    'packapunch',
    'wonderweapon',
    'round30',
    'easteregg',
    'ytshorts',
    'funnyshorts',
    'callofdutyzombies',
    'blackops3zombiesxpfarm',
    'petergriffin',
    'thankyoudonaldtrump',
    'zombiegameplay',
    'howtogo'
  ])('reads #%s as words', (body) => {
    expect(lexicon.hashtag(body)).toBeNull();
  });

  it.each([
    ['funnymoemnts', 'funnymoments'],
    ['zombeis', 'zombies'],
    ['subscirbe', 'subscribe'],
    ['zombiegamplay', 'zombiegameplay'],
    ['pacapunch', 'packapunch']
  ])('corrects #%s to #%s', (typed, meant) => {
    const advice = lexicon.hashtag(typed);
    expect(advice?.suggestions[0]).toBe(meant);
    expect(advice?.confident).toBe(true);
  });

  it('says nothing about a hashtag it cannot read and cannot improve', () => {
    expect(lexicon.hashtag('xqzvbn')).toBeNull();
  });

  // Both from the channel's real footer. The first was once "corrected" to #shortsviralkaiserare, a k
  // swapped for an r two rows away; the second drew #tbs and #bats for an initialism.
  it('does not turn a word from another language, or an initialism, into an English one', () => {
    expect(lexicon.hashtag('shortsviralkaisekare')).toBeNull();
    expect(lexicon.hashtag('btsfunnymoments')).toBeNull();
  });
});
