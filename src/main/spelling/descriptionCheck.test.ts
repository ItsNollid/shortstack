// The description checker, run with the real dictionary on the kind of text this channel writes.
import { describe, expect, it } from 'vitest';
import {
  applyReplacement,
  checkDescription,
  fixAll,
  type CheckContext,
  type CheckRule
} from '../../shared/descriptionCheck';
import { realLexicon } from './dictionaryForTests';

const BO3 = 'Call of Duty: Black Ops 3 Zombies';
const lexicon = realLexicon();
const context = (overrides: Partial<CheckContext> = {}): CheckContext => ({ lexicon, game: null, maxHashtags: 0, ...overrides });
const rules = (text: string, overrides?: Partial<CheckContext>): CheckRule[] =>
  checkDescription(text, context(overrides)).map((issue) => issue.rule);
const fixed = (text: string, overrides?: Partial<CheckContext>): string => fixAll(text, context(overrides)).text;

/** The footer saved on the channel's real settings, word for word. */
const REAL_FOOTER =
  'Subscribe\n\n#funnycontent #funny #funnymoments #viral #shorts #funnyshorts #funnycomedyshorts #funny #funnyvideo #ytshorts ##shorts #short #comedyshorts #viralcomedyshorts #youtubeshorts #fun #funnymoments #funny #funnyvideos #funnyfails #btsfunnymoments #repofunnymoments #funnymoment #funnymemes #funnytiktoks #funnyshorts #viralshorts #shorts #shortsviral #viral #short #viralshort #youtubeshorts #trendingshorts #shortsviralkaisekare #shortscreator #ytshorts #tiktok #viraltiktok #tiktokviral #viral #viralshorts #shortsviral #howtogoviraltiktok #tiktokdance #tiktoktrending #tradangtiktok';

describe('a clean description', () => {
  it('has nothing to say about a good block of hashtags', () => {
    expect(checkDescription('#blackops3zombies #bo3zombies #codzombies #shorts #packapunch', context({ game: BO3 }))).toEqual([]);
  });

  it('leaves links, handles and email addresses alone', () => {
    expect(checkDescription('Check https://youtube.com/@nollidofficial and nollid.gg or mail me at hi@nollid.com', context())).toEqual([]);
  });
});

describe('hashtags', () => {
  it('removes repeats however they are capitalised, keeping the first', () => {
    expect(fixed('#bo3 #Shorts #shorts #BO3')).toBe('#bo3 #Shorts');
  });

  it('takes the extra # off', () => {
    expect(fixed('##shorts #bo3')).toBe('#shorts #bo3');
  });

  it('swaps commas between hashtags for spaces', () => {
    expect(fixed('#blackops3zombies, #blackops3zombiesmap, #codzombies,')).toBe('#blackops3zombies #blackops3zombiesmap #codzombies');
  });

  it('joins a hashtag YouTube would cut short at a hyphen or full stop', () => {
    expect(fixed('#pack-a-punch #r.e.p.o')).toBe('#packapunch #repo');
  });

  it("removes another app's hashtags", () => {
    expect(fixed('#bo3zombies #tiktok #fyp #viraltiktok #shorts')).toBe('#bo3zombies #shorts');
  });

  it('flags another game only once it knows which game the video is', () => {
    expect(rules('#fortnite #bo3zombies', { game: BO3 })).toEqual(['other_game']);
    expect(rules('#callofduty #codzombies', { game: BO3 })).toEqual([]);
    expect(rules('#fortnite', { game: null })).not.toContain('other_game');
    // #reposted begins like #repo, but naming a game takes more than a matching start.
    expect(rules('#reposted', { game: 'Counter-Strike 2' })).not.toContain('other_game');
  });

  it('keeps to the house-style limit, and to YouTube’s own', () => {
    expect(fixed('#zombies #shorts #gaming #funny #clips', { maxHashtags: 3 })).toBe('#zombies #shorts #gaming');
    const sixtyOne = Array.from({ length: 61 }, (_, index) => `#zombies${index}`).join(' ');
    expect(rules(sixtyOne).filter((rule) => rule === 'too_many_hashtags')).toHaveLength(1);
  });

  it('corrects a misspelled hashtag', () => {
    expect(fixed('#funnymoemnts #zombeis')).toBe('#funnymoments #zombies');
  });
});

describe('sentences', () => {
  it('fixes spelling, the capital I, and the spaces around punctuation', () => {
    expect(fixed('i think this is teh best clip,right ?')).toBe('I think this is the best clip, right?');
  });

  it('picks "a" or "an" by sound, not by letter', () => {
    expect(fixed('this is a apple and an banana')).toBe('This is an apple and a banana');
    expect(rules('An hour, a unicorn and a one shot kill')).not.toContain('article');
  });

  it('takes out a word typed twice, but not one doubled on purpose', () => {
    expect(fixed('This is the the best')).toBe('This is the best');
    expect(rules('No no no')).not.toContain('repeated_word');
  });

  it('fixes words that are real but wrong', () => {
    expect(fixed('You could of won. Its not over. dont loose it')).toBe("You could have won. It's not over. Don't lose it");
  });

  it('collapses runs of spaces', () => {
    expect(fixed('Nice  clip')).toBe('Nice clip');
  });

  it("capitalises I in contractions", () => {
    expect(fixed("i'm here")).toBe("I'm here");
  });

  it('flags a name it does not know but never changes it', () => {
    const text = 'Big thanks to Drphuckass for the clip';
    const issue = checkDescription(text, context()).find((each) => each.rule === 'misspelled');
    expect(issue?.found).toBe('Drphuckass');
    expect(issue?.auto).toBe(false);
    expect(fixed(text)).toBe(text);
  });

  it('knows the names it has been given', () => {
    expect(checkDescription('Subscribe to Nollid', { lexicon: realLexicon(['Nollid']), game: null, maxHashtags: 0 })).toEqual([]);
  });
});

describe('what YouTube refuses', () => {
  it('replaces angle brackets with look-alikes where there is one', () => {
    expect(fixed('I <3 this -> go')).toBe('I ❤ this → go');
  });
});

describe('fixing everything', () => {
  it('cleans the real footer: no repeats, no stray #, no other app’s hashtags', () => {
    const result = fixed(REAL_FOOTER);
    const tags = result.match(/#+[\p{L}\p{N}_]+/gu) ?? [];
    const keys = tags.map((tag) => tag.replace(/^#+/, '').toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
    expect(tags.some((tag) => tag.startsWith('##'))).toBe(false);
    expect(keys.some((key) => key.includes('tiktok'))).toBe(false);
    expect(result.startsWith('Subscribe\n\n#funnycontent #funny #funnymoments')).toBe(true);
  });

  it('leaves nothing safe to fix, and changes nothing a second time', () => {
    for (const text of [REAL_FOOTER, 'i think this is teh best clip,right ?', '#pack-a-punch, ##shorts, #shorts']) {
      const once = fixed(text);
      expect(checkDescription(once, context()).filter((issue) => issue.auto)).toEqual([]);
      expect(fixed(once)).toBe(once);
    }
  });

  it('is quick enough to run while someone types', () => {
    const fresh = { lexicon: realLexicon(), game: BO3, maxHashtags: 0 };
    let started = performance.now();
    checkDescription(REAL_FOOTER, fresh);
    const first = performance.now() - started;
    started = performance.now();
    checkDescription(`${REAL_FOOTER} `, fresh);
    const again = performance.now() - started;
    expect(first).toBeLessThan(1500);
    expect(again).toBeLessThan(60);
  });

  it('will not apply a fix to text that has changed since it was checked', () => {
    const issue = checkDescription('teh clip', context()).find((each) => each.rule === 'misspelled');
    expect(issue).toBeDefined();
    if (issue !== undefined) expect(applyReplacement('a different text', issue, 'the')).toBe('a different text');
  });
});
