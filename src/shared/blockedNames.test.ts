import { describe, expect, it } from 'vitest';
import { checkBlockedNames, hashtagNames, mentionedIn } from './blockedNames';

describe('a name in a title, tag or topic', () => {
  it('is found as a word, however it is capitalised or joined', () => {
    expect(mentionedIn('Clutch with DrPhuckass!', ['drphuckass'])).toBe(true);
    expect(mentionedIn('clutch with dr_phuckass', ['Dr Phuckass'])).toBe(true);
    expect(mentionedIn('clutch with Dr Phuckass', ['Dr Phuckass'])).toBe(true);
    expect(mentionedIn('NOLLID GOES OFF', ['Nollid'])).toBe(true);
  });

  it('is not found inside a longer word', () => {
    expect(mentionedIn('what a catch', ['Cat'])).toBe(false);
    expect(mentionedIn('space station', ['Ace'])).toBe(false);
    expect(mentionedIn('PETER GRIFFIN IN CALL OF DUTY?', ['Nollid', 'Dr Phuckass'])).toBe(false);
  });

  it('treats characters that mean something in a pattern as plain text', () => {
    expect(mentionedIn('gg x.x.x', ['x.x.x'])).toBe(true);
    expect(mentionedIn('gg xaxbx', ['x.x.x'])).toBe(false);
    expect(mentionedIn('gg (cheese)', ['(cheese)'])).toBe(true);
  });
});

describe('a name inside a hashtag', () => {
  it('is found run together with other words', () => {
    expect(hashtagNames('#nollidclips', ['Nollid'])).toBe(true);
    expect(hashtagNames('#drphuckassmoments', ['Dr Phuckass'])).toBe(true);
    expect(hashtagNames('#blackops3zombies', ['Nollid'])).toBe(false);
  });

  it('must match whole when the name is under four letters', () => {
    expect(hashtagNames('#spacestation', ['Ace'])).toBe(false);
    expect(hashtagNames('#ace', ['Ace'])).toBe(true);
  });
});

describe('the list', () => {
  it('accepts names, and refuses what cannot be one', () => {
    expect(checkBlockedNames(['Dr Phuckass', 'xX_Sniper_Xx'])).toBeNull();
    expect(checkBlockedNames(['***'])).toMatch(/letter or number/);
    expect(checkBlockedNames(['<b>'])).toMatch(/< or >/);
    expect(checkBlockedNames(['x'.repeat(41)])).toMatch(/too long/);
    expect(checkBlockedNames(['Dr Phuckass', 'drphuckass'])).toMatch(/twice/);
  });
});
