import { describe, expect, it } from 'vitest';
import { buildReport, clipTime, judgeHook, parseStillReading, pickCover, type StillReading } from './videoReading';

const still = (part: string, overrides: Partial<StillReading> = {}): StillReading => ({
  part,
  time: part.startsWith('o') ? Number(part.slice(1)) * 0.75 + 0.25 : (Number(part.slice(1)) + 1) * 4,
  scene: 'gameplay',
  appeal: 3,
  what: 'zombies crowd a corridor',
  ...overrides
});

describe('reading what the model said about a still', () => {
  it('keeps what fits the closed list, whatever the capitals', () => {
    expect(parseStillReading({ scene: 'Gameplay', appeal: 4.6, what: '  a creeper   explodes ' })).toEqual({
      scene: 'gameplay',
      appeal: 5,
      what: 'a creeper explodes'
    });
  });

  it('turns a wild score into the nearest real one, and a missing one into the lowest', () => {
    expect(parseStillReading({ scene: 'lobby', appeal: 12, what: 'players wait' })).toMatchObject({ appeal: 5 });
    expect(parseStillReading({ scene: 'menu', appeal: 'high' })).toEqual({ scene: 'menu', appeal: 1, what: '' });
  });

  it('keeps markup out of what is shown', () => {
    expect(parseStillReading({ scene: 'text', appeal: 2, what: '<img src=x> a title card' })?.what).toBe('img src=x a title card');
  });

  it('refuses a scene that is not one of the list', () => {
    expect(parseStillReading({ scene: 'epic moment', appeal: 5 })).toBeNull();
    expect(parseStillReading('gameplay')).toBeNull();
  });
});

describe('the cover', () => {
  it('is the most eye-catching moment of play, and never a still from the opening', () => {
    const cover = pickCover([
      still('o0', { appeal: 5 }),
      still('s0', { appeal: 2 }),
      still('s1', { appeal: 5, what: 'a wonder weapon fires' }),
      still('s2', { appeal: 4 })
    ]);
    expect(cover).toEqual({ part: 's1', time: 8, scene: 'gameplay', what: 'a wonder weapon fires' });
  });

  it('prefers play or a reaction to a menu, even a more striking one', () => {
    expect(pickCover([still('s0', { scene: 'menu', appeal: 5 }), still('s1', { scene: 'face', appeal: 3 })])?.part).toBe('s1');
  });

  it('falls back to the best of the rest when nothing shows play, and says what it is', () => {
    expect(pickCover([still('s0', { scene: 'black', appeal: 5 }), still('s1', { scene: 'menu', appeal: 4 })])).toMatchObject({
      part: 's1',
      scene: 'menu'
    });
  });

  it('is nothing at all when every still is black', () => {
    expect(pickCover([still('s0', { scene: 'black' })])).toBeNull();
  });
});

describe('the first second', () => {
  it('is weak when it opens on a lobby or a loading screen', () => {
    const hook = judgeHook([still('o0', { scene: 'loading', what: 'a loading bar' }), still('o1', { scene: 'lobby', what: 'players wait' }), still('s0')]);
    expect(hook).toMatchObject({ weak: true, scene: 'lobby' });
  });

  it('is not weak once anything is happening in it', () => {
    expect(judgeHook([still('o0', { scene: 'black' }), still('o1', { scene: 'gameplay', what: 'a zombie lunges' })])).toMatchObject({
      weak: false,
      what: 'a zombie lunges'
    });
  });

  it('cannot be judged without stills from it', () => {
    expect(judgeHook([still('s0')])).toBeNull();
  });
});

describe('the whole report', () => {
  it('draws every conclusion from the same readings', () => {
    const report = buildReport('qwen3-vl:8b', '2026-09-14T10:00:00.000Z', [
      still('o0', { scene: 'lobby' }),
      still('s0'),
      still('s1', { appeal: 5 })
    ]);
    expect(report.cover?.part).toBe('s1');
    expect(report.hook?.weak).toBe(true);
    expect(report.stills).toHaveLength(3);
  });

  it('writes a time the way Studio counts it', () => {
    expect(clipTime(7.4)).toBe('0:07');
    expect(clipTime(83)).toBe('1:23');
    expect(clipTime(null)).toBeNull();
  });
});
