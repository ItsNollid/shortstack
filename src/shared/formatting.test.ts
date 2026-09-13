import { describe, expect, it } from 'vitest';
import {
  NO_FORMATTING,
  formatDescription,
  formatTags,
  formatTitle,
  formattingIsActive,
  stripWrappingQuotes,
  type FormattingRules
} from './formatting';
import { DESCRIPTION_MAX_BYTES, TITLE_MAX_CHARS, charCount, utf8Bytes } from './settings';

const rules = (over: Partial<FormattingRules> = {}): FormattingRules => ({ ...NO_FORMATTING, ...over });

describe('doing nothing by default', () => {
  // This shapes someone's own writing. Nothing happens until they ask for it.
  it('leaves a title and description exactly as written', () => {
    expect(formatTitle('this Is  How I Wrote It', NO_FORMATTING)).toBe('this Is  How I Wrote It');
    expect(formatDescription('line\n\n\n\nline  with   spaces', NO_FORMATTING)).toBe('line\n\n\n\nline  with   spaces');
    expect(formatTags(['a', 'A', ' a '], NO_FORMATTING)).toEqual(['a', 'A', ' a ']);
    expect(formattingIsActive(NO_FORMATTING)).toBe(false);
  });
});

describe('title case', () => {
  it('shouts when asked to', () => {
    expect(formatTitle('this zombie round broke me', rules({ titleCase: 'upper' }))).toBe('THIS ZOMBIE ROUND BROKE ME');
  });

  it('capitalises each word but leaves acronyms alone', () => {
    // Lowercasing the rest would be more consistent and would turn COD into Cod.
    expect(formatTitle('peter griffin plays COD on PC', rules({ titleCase: 'title' }))).toBe('Peter Griffin Plays COD On PC');
    expect(formatTitle('(round 100) and "the wall"', rules({ titleCase: 'title' }))).toBe('(Round 100) And "The Wall"');
  });
});

describe('prefix and suffix', () => {
  it('wraps the title', () => {
    expect(formatTitle('round 100', rules({ titlePrefix: 'BO3: ', titleSuffix: ' #shorts' }))).toBe('BO3: round 100 #shorts');
  });

  // Formatting runs on every save. Stacking another copy each time is the obvious way to get this
  // wrong, and the one a user would notice only after their title was ruined.
  it('does not stack when run again on its own output', () => {
    const applied = rules({ titlePrefix: 'BO3: ', titleSuffix: ' #shorts', titleCase: 'upper' });
    const once = formatTitle('round 100', applied);
    expect(formatTitle(once, applied)).toBe(once);
    expect(formatTitle(formatTitle(once, applied), applied)).toBe(once);
  });

  it('gives up the middle rather than the parts the user named', () => {
    const applied = rules({ titlePrefix: 'START ', titleSuffix: ' END' });
    // Within the limit on its own; it is the prefix and suffix that do not fit alongside it.
    const result = formatTitle('word '.repeat(19).trim(), applied);
    expect(charCount(result)).toBeLessThanOrEqual(TITLE_MAX_CHARS);
    expect(result.startsWith('START ')).toBe(true);
    expect(result.endsWith(' END')).toBe(true);
  });

  it('never exceeds the limit even when the prefix and suffix alone fill it', () => {
    const applied = rules({ titlePrefix: 'x'.repeat(80), titleSuffix: 'y'.repeat(80) });
    expect(charCount(formatTitle('anything', applied))).toBeLessThanOrEqual(TITLE_MAX_CHARS);
  });

  it('trims at a word boundary rather than mid-word', () => {
    const applied = rules({ titleSuffix: ' #shorts' });
    const result = formatTitle('alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november', applied);
    expect(charCount(result)).toBeLessThanOrEqual(TITLE_MAX_CHARS);
    expect(result.endsWith(' #shorts')).toBe(true);
    // The cut lands between words, not through one.
    expect(result.replace(' #shorts', '').endsWith(' ')).toBe(false);
    expect(result).not.toMatch(/nove #shorts$/);
  });
});

describe('the description footer', () => {
  it('goes underneath, separated by a blank line', () => {
    expect(formatDescription('A clip.', rules({ descriptionFooter: 'Subscribe\n#shorts' }))).toBe('A clip.\n\nSubscribe\n#shorts');
  });

  it('is not added twice', () => {
    const applied = rules({ descriptionFooter: 'Subscribe' });
    const once = formatDescription('A clip.', applied);
    expect(formatDescription(once, applied)).toBe(once);
  });

  it('stands alone when there is nothing above it', () => {
    expect(formatDescription('', rules({ descriptionFooter: 'Subscribe' }))).toBe('Subscribe');
  });

  it('survives a description that is already at the limit', () => {
    const applied = rules({ descriptionFooter: 'Subscribe' });
    const result = formatDescription('x'.repeat(DESCRIPTION_MAX_BYTES), applied);
    expect(utf8Bytes(result)).toBeLessThanOrEqual(DESCRIPTION_MAX_BYTES);
    expect(result.endsWith('Subscribe')).toBe(true);
  });

  it('counts bytes, not characters', () => {
    const applied = rules({ descriptionFooter: 'Subscribe' });
    // Emoji are four bytes each, so 1248 of them is 4992 bytes: inside the limit until the footer
    // is added. A clamp that counted characters would think there were 3752 to spare.
    const body = '🎮'.repeat(1248);
    expect(utf8Bytes(body)).toBeLessThanOrEqual(DESCRIPTION_MAX_BYTES);

    const result = formatDescription(body, applied);
    expect(utf8Bytes(result)).toBeLessThanOrEqual(DESCRIPTION_MAX_BYTES);
    expect(result.endsWith('Subscribe')).toBe(true);
    // Cut between whole emoji, never through one into a broken code unit.
    expect(result).not.toContain('�');
    expect([...result].every((character) => character !== '�')).toBe(true);
  });
});

describe('tidying up', () => {
  it('strips the quotes a model wraps its answer in', () => {
    expect(stripWrappingQuotes('"THIS ZOMBIE ROUND BROKE ME"')).toBe('THIS ZOMBIE ROUND BROKE ME');
    expect(stripWrappingQuotes('“Curly”')).toBe('Curly');
    expect(stripWrappingQuotes('`code`')).toBe('code');
    // A quote that is part of the title is not a wrapper.
    expect(stripWrappingQuotes('He said "hi" to me')).toBe('He said "hi" to me');
    expect(formatTitle('"Quoted"', rules({ tidy: true }))).toBe('Quoted');
  });

  it('collapses runs of blank lines and doubled spaces', () => {
    expect(formatDescription('one\n\n\n\ntwo   three  ', rules({ tidy: true }))).toBe('one\n\ntwo three');
  });

  it('drops repeated hashtags, keeping the first', () => {
    expect(formatDescription('#zombies #bo3 #Zombies #cod', rules({ tidy: true }))).toBe('#zombies #bo3 #cod');
  });

  it('drops repeated tags, keeping the first spelling', () => {
    expect(formatTags(['cod zombies', 'COD Zombies', '  bo3  ', '', 'bo3'], rules({ tidy: true }))).toEqual(['cod zombies', 'bo3']);
  });
});

describe('the hashtag limit', () => {
  it('keeps the first few and drops the rest', () => {
    const many = '#a #b #c #d #e #f';
    expect(formatDescription(many, rules({ maxHashtags: 3 }))).toBe('#a #b #c');
  });

  it('works without tidying, for someone who wants only the cap', () => {
    expect(formatDescription('text #a #b #c', rules({ maxHashtags: 2 }))).toBe('text #a #b');
  });

  it('leaves everything alone at zero, which means no limit', () => {
    expect(formatDescription('#a #b #c #d', rules({ maxHashtags: 0 }))).toBe('#a #b #c #d');
  });
});

describe('formattingIsActive', () => {
  it('notices any rule that would change something', () => {
    expect(formattingIsActive(rules({ titleCase: 'upper' }))).toBe(true);
    expect(formattingIsActive(rules({ titleSuffix: ' #shorts' }))).toBe(true);
    expect(formattingIsActive(rules({ descriptionFooter: '  ' }))).toBe(false);
    expect(formattingIsActive(rules({ tidy: true }))).toBe(true);
    expect(formattingIsActive(rules({ maxHashtags: 5 }))).toBe(true);
  });
});

describe('who broke the limit', () => {
  // The character counter exists to tell someone their title is too long. Quietly cutting it to fit
  // hides exactly the thing they need to see, so an over-long title comes back over-long and the
  // save is refused with a reason.
  it('leaves a title the user made too long alone, so validation can refuse it', () => {
    const tooLong = 'x'.repeat(TITLE_MAX_CHARS + 20);
    expect(charCount(formatTitle(tooLong, rules({ titleCase: 'upper' })))).toBeGreaterThan(TITLE_MAX_CHARS);
  });

  it('clamps when a suffix is what pushed a valid title over', () => {
    const justFits = 'x'.repeat(TITLE_MAX_CHARS);
    const result = formatTitle(justFits, rules({ titleSuffix: ' #shorts' }));
    expect(charCount(result)).toBeLessThanOrEqual(TITLE_MAX_CHARS);
    expect(result.endsWith(' #shorts')).toBe(true);
  });

  it('does the same for descriptions, counted in bytes', () => {
    const tooLong = 'x'.repeat(DESCRIPTION_MAX_BYTES + 100);
    expect(utf8Bytes(formatDescription(tooLong, rules({ tidy: true })))).toBeGreaterThan(DESCRIPTION_MAX_BYTES);

    const justFits = 'x'.repeat(DESCRIPTION_MAX_BYTES);
    expect(utf8Bytes(formatDescription(justFits, rules({ descriptionFooter: 'Subscribe' })))).toBeLessThanOrEqual(
      DESCRIPTION_MAX_BYTES
    );
  });
});

describe('what the preview showed was wrong', () => {
  // Typing " #shorts" as the suffix and getting " #SHORTS" back overrides a deliberate choice.
  it('leaves the prefix and suffix exactly as typed, whatever the case rule says', () => {
    const applied = rules({ titleCase: 'upper', titlePrefix: 'bo3: ', titleSuffix: ' #shorts' });
    expect(formatTitle('round 100', applied)).toBe('bo3: ROUND 100 #shorts');
  });

  it('is still idempotent with a case rule that would change its own suffix', () => {
    const applied = rules({ titleCase: 'upper', titleSuffix: ' #shorts' });
    const once = formatTitle('round 100', applied);
    expect(once).toBe('ROUND 100 #shorts');
    expect(formatTitle(once, applied)).toBe(once);
    expect(formatTitle(formatTitle(once, applied), applied)).toBe(once);
  });

  // A footer carrying the same hashtags as the body puts each one on the video twice.
  it('does not repeat a hashtag the footer already carries', () => {
    const applied = rules({ tidy: true, descriptionFooter: 'Subscribe\n\n#blackops3zombies #codzombies' });
    const result = formatDescription('Round 87.\n\n#blackops3zombies #round100', applied);
    expect(result).toBe('Round 87.\n\n#round100\n\nSubscribe\n\n#blackops3zombies #codzombies');
  });

  // Past 60, YouTube ignores every hashtag on the video. The footer used to be added after every other
  // limit, so a long enough one switched them all off without a word.
  it('never lets the whole description pass sixty hashtags, and gives way in the body', () => {
    const body = Array.from({ length: 50 }, (_, index) => `#body${index}x`).join(' ');
    const footer = Array.from({ length: 20 }, (_, index) => `#foot${index}x`).join(' ');
    const result = formatDescription(body, rules({ descriptionFooter: footer }));

    expect((result.match(/#[\p{L}\p{N}_]+/gu) ?? []).length).toBeLessThanOrEqual(60);
    expect(result.endsWith(footer)).toBe(true);
    // The leading hashtags — the game and #shorts, in a built description — are the ones kept.
    expect(result).toContain('#body0x');
    expect(result).not.toContain('#body49x');
  });

  it('caps a description with no footer as well', () => {
    const body = Array.from({ length: 80 }, (_, index) => `#t${index}x`).join(' ');
    expect((formatDescription(body, NO_FORMATTING).match(/#[\p{L}\p{N}_]+/gu) ?? []).length).toBe(60);
  });

  it('is still idempotent once it has capped', () => {
    const body = Array.from({ length: 70 }, (_, index) => `#t${index}x`).join(' ');
    const applied = rules({ descriptionFooter: '#footer' });
    const once = formatDescription(body, applied);
    expect(formatDescription(once, applied)).toBe(once);
  });

  it('still only adds that footer once, however many times it runs', () => {
    const applied = rules({ tidy: true, descriptionFooter: 'Subscribe\n\n#blackops3zombies' });
    const once = formatDescription('Round 87. #blackops3zombies', applied);
    expect(formatDescription(once, applied)).toBe(once);
    expect(formatDescription(formatDescription(once, applied), applied)).toBe(once);
  });
});
