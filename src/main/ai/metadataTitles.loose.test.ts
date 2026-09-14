import { describe, expect, it } from 'vitest';
import { sanitizeSuggestion } from './metadataSuggestion';

describe('titles offered with the kinds got wrong', () => {
  // What llama3.2 sent in two replies of three: one title, of the kind "0".
  it('keeps the title the model wrote, with no kind rather than a guessed one', () => {
    const result = sanitizeSuggestion({ titles: [{ angle: '0', title: 'I just got killed by a zombie' }], tags: ['cod zombies'] });
    expect(result).toEqual({ title: 'I just got killed by a zombie', description: '', tags: ['cod zombies'] });
  });

  it('does not take a placeholder with no words in it for a title', () => {
    const result = sanitizeSuggestion({
      titles: [
        { angle: 'reaction', title: '...' },
        { angle: 'play', title: '…' },
        { angle: 'joke', title: 'Bedtime is not optional' }
      ]
    });
    expect(result?.titleOptions).toEqual([{ angle: 'joke', title: 'Bedtime is not optional' }]);
    expect(result?.title).toBe('Bedtime is not optional');
    expect(sanitizeSuggestion({ titles: [{ angle: '0', title: '...' }] })).toBeNull();
  });
});
