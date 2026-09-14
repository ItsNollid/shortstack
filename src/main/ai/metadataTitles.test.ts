import { describe, expect, it } from 'vitest';
import { TITLE_MAX_CHARS } from '../../shared/settings';
import { sanitizeSuggestion } from './metadataSuggestion';

const OFFERS = [
  { angle: 'joke', title: 'Bedtime is not optional' },
  { angle: 'reaction', title: 'He really said goodnight' },
  { angle: 'play', title: 'Zombies take the lobby' }
];

describe('titles offered in three kinds', () => {
  it('keeps one of each kind, in the order given, and takes the first as the title', () => {
    expect(sanitizeSuggestion({ titles: OFFERS, tags: ['bo3'] })).toEqual({
      title: 'Bedtime is not optional',
      description: '',
      tags: ['bo3'],
      titleOptions: OFFERS,
      titleAngle: 'joke'
    });
  });

  it('drops kinds it does not know, a second title of one kind, a repeated title and an empty one', () => {
    const result = sanitizeSuggestion({
      titles: [
        { angle: 'clickbait', title: 'YOU WONT BELIEVE THIS' },
        { angle: 'play', title: 'Zombies take the lobby' },
        { angle: 'play', title: 'Another title about the play' },
        { angle: 'joke', title: 'zombies take the lobby' },
        { angle: 'reaction', title: '   ' },
        'a string',
        null
      ]
    });
    expect(result?.titleOptions).toEqual([{ angle: 'play', title: 'Zombies take the lobby' }]);
  });

  it('cleans each offered title like any other', () => {
    const result = sanitizeSuggestion({ titles: [{ angle: 'play', title: `<b>${'x'.repeat(150)}</b>` }] });
    expect([...(result?.titleOptions?.[0]?.title ?? '')]).toHaveLength(TITLE_MAX_CHARS);
    expect(result?.title).not.toContain('<');
  });

  it('keeps its old shape when the model sends a single title', () => {
    expect(sanitizeSuggestion({ title: 'Just one', tags: [] })).toEqual({ title: 'Just one', description: '', tags: [] });
  });

  it('prefers a title sent on its own, and knows its kind when it is one of the offers', () => {
    expect(sanitizeSuggestion({ title: 'Zombies take the lobby', titles: OFFERS })).toMatchObject({
      title: 'Zombies take the lobby',
      titleAngle: 'play'
    });
    expect(sanitizeSuggestion({ title: 'Something else entirely', titles: OFFERS })).toMatchObject({ titleAngle: null });
  });
});
