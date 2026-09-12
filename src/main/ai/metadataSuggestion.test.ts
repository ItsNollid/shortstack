import { describe, expect, it } from 'vitest';
import { DESCRIPTION_MAX_BYTES, TAGS_MAX_CHARS, tagsCharCount } from '../../shared/settings';
import { extractJson, sanitizeSuggestion } from './metadataSuggestion';

describe('extractJson', () => {
  it('reads plain JSON', () => {
    expect(extractJson('{"title":"hi"}')).toEqual({ title: 'hi' });
  });

  it('copes with the wrappers models add anyway', () => {
    expect(extractJson('```json\n{"title":"fenced"}\n```')).toEqual({ title: 'fenced' });
    expect(extractJson('Sure! Here you go: {"title":"chatty"} Hope that helps.')).toEqual({ title: 'chatty' });
  });

  it('returns null rather than throwing on nonsense', () => {
    expect(extractJson('no json here')).toBeNull();
    expect(extractJson('{ broken')).toBeNull();
    expect(extractJson('')).toBeNull();
  });
});

describe('sanitizeSuggestion', () => {
  it('keeps a sensible suggestion as is', () => {
    expect(sanitizeSuggestion({ title: 'Peter plays CoD', description: 'A clip', tags: ['gaming', 'shorts'] })).toEqual({
      title: 'Peter plays CoD',
      description: 'A clip',
      tags: ['gaming', 'shorts']
    });
  });

  it('enforces the limits YouTube would reject', () => {
    const result = sanitizeSuggestion({
      title: 'x'.repeat(150),
      description: 'y'.repeat(DESCRIPTION_MAX_BYTES + 500),
      tags: ['ok']
    });
    expect([...(result?.title ?? '')]).toHaveLength(100);
    expect(new TextEncoder().encode(result?.description ?? '').length).toBeLessThanOrEqual(DESCRIPTION_MAX_BYTES);
  });

  it('clamps descriptions by bytes without splitting a character', () => {
    const emoji = '\u{1F3AE}';
    const result = sanitizeSuggestion({ title: 't', description: emoji.repeat(DESCRIPTION_MAX_BYTES), tags: [] });
    const description = result?.description ?? '';
    expect(new TextEncoder().encode(description).length).toBeLessThanOrEqual(DESCRIPTION_MAX_BYTES);
    expect(description.endsWith(emoji)).toBe(true);
  });

  it('strips characters YouTube refuses', () => {
    const result = sanitizeSuggestion({ title: 'A <b>bold</b> clip', description: '<script>x</script>', tags: ['<tag>'] });
    expect(result?.title).toBe('A bbold/b clip');
    expect(result?.description).not.toContain('<');
    expect(result?.tags).toEqual(['tag']);
  });

  it('drops junk tags, duplicates and leading hashes', () => {
    const result = sanitizeSuggestion({ title: 't', description: '', tags: ['#shorts', 'Shorts', '', '  ', 42, 'gaming'] });
    expect(result?.tags).toEqual(['shorts', 'gaming']);
  });

  it('trims the tag list to the budget YouTube actually counts', () => {
    const many = Array.from({ length: 80 }, (_, index) => `tag-number-${index}`);
    const result = sanitizeSuggestion({ title: 't', description: '', tags: many });
    expect(tagsCharCount(result?.tags ?? [])).toBeLessThanOrEqual(TAGS_MAX_CHARS);
    expect((result?.tags ?? []).length).toBeGreaterThan(0);
  });

  it('returns null when there is nothing usable', () => {
    expect(sanitizeSuggestion(null)).toBeNull();
    expect(sanitizeSuggestion('a string')).toBeNull();
    expect(sanitizeSuggestion({ title: '', description: '', tags: [] })).toBeNull();
    expect(sanitizeSuggestion({ unrelated: true })).toBeNull();
  });
});
