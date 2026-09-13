import { describe, expect, it } from 'vitest';
import { decodeSettings, defaultSettings } from './settings';

const FOOTER_OF_47 = `Subscribe\n\n${Array.from({ length: 47 }, (_, index) => `#tag${index}`).join(' ')}`;

describe('stored settings that can no longer be used', () => {
  // The footer on the real channel: saved before the 40-hashtag rule, then silently not used.
  it('names the setting, keeps exactly what was stored, and gives the reason saving it would get today', () => {
    const { settings, ignored } = decodeSettings([{ key: 'format_description_footer', value: FOOTER_OF_47 }]);
    expect(settings.format_description_footer).toBe(defaultSettings().format_description_footer);
    expect(ignored).toEqual([
      { key: 'format_description_footer', stored: FOOTER_OF_47, reason: expect.stringContaining('40 hashtags') }
    ]);
  });

  it('explains a number out of range, and a list that is not a list', () => {
    const { ignored } = decodeSettings([
      { key: 'format_max_hashtags', value: '99' },
      { key: 'spell_words', value: 'not a list' }
    ]);
    expect(ignored.map((entry) => entry.key)).toEqual(['format_max_hashtags', 'spell_words']);
    expect(ignored[0]?.reason).toContain('0 to 60');
    expect(ignored[1]?.reason).toBe('Expected a list of text values');
  });

  it('reports nothing when everything stored can be used', () => {
    expect(decodeSettings([{ key: 'format_max_hashtags', value: '30' }]).ignored).toEqual([]);
  });
});
