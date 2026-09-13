import { describe, expect, it } from 'vitest';
import { sanitizeSuggestion } from './metadataSuggestion';

describe('topics from the model', () => {
  it('keeps short phrases, with any hash the model added taken off', () => {
    const result = sanitizeSuggestion({ title: 't', topics: ['#creeper ambush', 'base destroyed'] });
    expect(result?.topics).toEqual(['creeper ambush', 'base destroyed']);
  });

  // They become hashtags, and more than a handful dilutes the block rather than adding to it.
  it('keeps at most six', () => {
    const topics = Array.from({ length: 12 }, (_, index) => `moment ${String.fromCharCode(97 + index)}`);
    expect(sanitizeSuggestion({ title: 't', topics })?.topics).toHaveLength(6);
  });

  it('drops blanks, repeats and anything too long to be a phrase', () => {
    const result = sanitizeSuggestion({
      title: 't',
      topics: ['', '   ', 'clutch', 'CLUTCH', 'x'.repeat(80), 42, null, '<b>ace</b>']
    });
    expect(result?.topics).toEqual(['clutch', 'bace/b']);
  });

  it('counts as something usable even with nothing else in the reply', () => {
    expect(sanitizeSuggestion({ topics: ['clutch'] })).not.toBeNull();
  });

  // A reply that never mentions topics must keep exactly the shape it always had.
  it('leaves the field off entirely when there are none', () => {
    expect(sanitizeSuggestion({ title: 't', description: 'd', tags: ['a'] })).toEqual({ title: 't', description: 'd', tags: ['a'] });
    expect(sanitizeSuggestion({ title: 't', topics: [] })).toEqual({ title: 't', description: '', tags: [] });
  });
});
