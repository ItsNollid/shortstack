import { describe, expect, it } from 'vitest';
import { joinScenes } from './sceneCopy';
import { checkTitleAgainstScreen, titlePromise } from './titlePromise';
import type { Scene, StillReading, VideoReport } from './videoReading';

const report = (scenes: Scene[]): VideoReport => {
  const stills: StillReading[] = scenes.map((scene, index) => ({ part: `s${index}`, time: index * 3, scene, appeal: 3, what: '' }));
  return { model: 'qwen3-vl:8b', readAt: '2026-09-14T10:00:00.000Z', stills, cover: null, hook: null };
};

// What the model reported for four of this channel's own clips, in time order.
const ALL_LOBBY = report(['lobby', 'lobby', 'lobby', 'lobby', 'lobby']);
const LOBBY_THEN_MENUS = report(['lobby', 'menu', 'menu', 'menu', 'menu']);
const LOBBY_TEXT_DESKTOP = report(['lobby', 'lobby', 'text', 'menu', 'menu']);
const SNOWY_PLAY = report(['gameplay', 'gameplay', 'gameplay', 'gameplay', 'gameplay']);

describe('what a title promises', () => {
  it('finds the words that describe play, as they are written', () => {
    expect(titlePromise('insane clutch on nuketown')).toBe('clutch');
    expect(titlePromise('He went 1 v 5 with a pistol')).toBe('1 v 5');
    expect(titlePromise('NO SCOPE from across the map')).toBe('NO SCOPE');
    expect(titlePromise('ROUND 50 on Der Riese')).toBe('ROUND 50');
  });

  it('gives the first of several', () => {
    expect(titlePromise('1v4 CLUTCH')).toBe('1v4');
  });

  it('finds nothing in titles that are a line someone says, which is most of them here', () => {
    for (const title of [
      'ALRIGHT GUYS IM GOING TO BED',
      'Does being a zombie hurt real bad or feel real good',
      'PETER GRIFFIN IN CALL OF DUTY',
      'Thank you Donald J Trump'
    ]) {
      expect(titlePromise(title)).toBeNull();
    }
  });

  it('does not find a word inside a longer one', () => {
    expect(titlePromise('faceplant into the spaceship')).toBeNull();
    expect(titlePromise('the headshotgun theory')).toBeNull();
  });
});

describe('a title against the screen', () => {
  it('flags a promise of play on a clip that shows none, and says what it shows instead', () => {
    expect(checkTitleAgainstScreen('INSANE CLUTCH', ALL_LOBBY)).toEqual({ promise: 'CLUTCH', stills: 5, shown: ['lobby'] });
    expect(checkTitleAgainstScreen('round 50 easter egg', LOBBY_THEN_MENUS)).toEqual({ promise: 'round 50', stills: 5, shown: ['lobby', 'menu'] });
  });

  it('leaves the channel’s real titles alone on those same clips', () => {
    expect(checkTitleAgainstScreen('Does being a zombie hurt real bad or feel real good', ALL_LOBBY)).toBeNull();
    expect(checkTitleAgainstScreen('ALRIGHT GUYS IM GOING TO BED', LOBBY_TEXT_DESKTOP)).toBeNull();
  });

  // Five stills of a clip full of play can miss the one moment a title is about, so play anywhere is enough.
  it('says nothing once any still shows play or a reaction', () => {
    expect(checkTitleAgainstScreen('INSANE CLUTCH', SNOWY_PLAY)).toBeNull();
    expect(checkTitleAgainstScreen('INSANE CLUTCH', report(['lobby', 'face', 'lobby']))).toBeNull();
  });

  it('says nothing without enough stills to go on', () => {
    expect(checkTitleAgainstScreen('INSANE CLUTCH', null)).toBeNull();
    expect(checkTitleAgainstScreen('INSANE CLUTCH', report(['lobby', 'lobby']))).toBeNull();
  });
});

describe('naming what the stills showed', () => {
  it('reads as a sentence', () => {
    expect(joinScenes(['lobby'])).toBe('a lobby');
    expect(joinScenes(['lobby', 'menu'])).toBe('a lobby and a menu');
    expect(joinScenes(['lobby', 'menu', 'loading'])).toBe('a lobby, a menu and a loading screen');
  });
});
