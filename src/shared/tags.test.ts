import { describe, expect, it } from 'vitest';
import { TAGS_MAX_CHARS, tagsCharCount } from './settings';
import { buildTags } from './tags';

const BO3 = 'Call of Duty: Black Ops 3 Zombies';

describe('tags for a Short', () => {
  it('leads with the ways the game is spelled, then the clip, then the two together', () => {
    const tags = buildTags({ game: BO3, topics: ['wonder weapon', 'easter egg'], modelTags: [], names: [] });
    // The full name is past 30 characters, so the game is carried by its shorter spellings.
    expect(tags.slice(0, 8)).toEqual([
      'black ops 3 zombies',
      'bo3 zombies',
      'codzombies',
      'blackops3',
      'call of duty',
      'wonder weapon',
      'easter egg',
      'bo3 zombies wonder weapon'
    ]);
    expect(tags).toContain('bo3 zombies easter egg');
  });

  it('keeps what the model adds, without the generic, the unrelated or anyone named', () => {
    const tags = buildTags({
      game: BO3,
      topics: [],
      modelTags: ['zombies round 30', 'Gaming', 'funny moments', 'fortnite clips', 'Dr Phuckass', 'BO3 Zombies'],
      names: ['Dr Phuckass']
    });
    expect(tags).toContain('zombies round 30');
    expect(tags).not.toContain('gaming');
    expect(tags).not.toContain('funny moments');
    expect(tags).not.toContain('fortnite clips');
    expect(tags.some((tag) => tag.includes('phuckass'))).toBe(false);
    expect(tags.filter((tag) => tag === 'bo3 zombies')).toHaveLength(1);
  });

  // Measured: taken from the game detector's aliases, a Minecraft clip was tagged "mc survival" and
  // "hardcore minecraft" — a mode and a difficulty, whatever the clip was.
  it('uses a short game name as it is, and never a mode or version the game detector listens for', () => {
    expect(buildTags({ game: 'Minecraft', topics: ['creeper'], modelTags: [], names: [] })).toEqual([
      'minecraft',
      'creeper',
      'minecraft creeper'
    ]);
    expect(buildTags({ game: 'Grand Theft Auto', topics: [], modelTags: [], names: [] })).toEqual(['grand theft auto', 'gta']);
  });

  it('names no game at all when nobody has said which one it is', () => {
    const tags = buildTags({ game: null, topics: ['clutch'], modelTags: ['cs2 clutch', 'insane clutch'], names: [] });
    expect(tags).toEqual(['clutch', 'insane clutch']);
  });

  it('fits within what YouTube allows', () => {
    const modelTags = Array.from({ length: 80 }, (_, index) => `zombie strategy number ${index}`);
    const tags = buildTags({ game: BO3, topics: ['wonder weapon'], modelTags, names: [] });
    expect(tagsCharCount(tags)).toBeLessThanOrEqual(TAGS_MAX_CHARS);
    expect(tags[0]).toBe('black ops 3 zombies');
  });
});
