import { describe, expect, it } from 'vitest';
import { chooseTitles, type TitleChoiceInput } from './titleChoice';

const OFFERS: TitleChoiceInput['offered'] = [
  { angle: 'reaction', title: 'He really said goodnight' },
  { angle: 'play', title: 'Zombies take the lobby' },
  { angle: 'joke', title: 'Bedtime is not optional' }
];

const input = (over: Partial<TitleChoiceInput> = {}): TitleChoiceInput => ({
  offered: OFFERS,
  single: '',
  names: [],
  previous: [],
  leader: null,
  current: 'ALRIGHT GUYS IM GOING TO BED',
  ...over
});

describe('which title a video gets', () => {
  it('offers the kinds in the usual order and takes the first', () => {
    expect(chooseTitles(input())).toEqual({ title: 'He really said goodnight', titleOptions: OFFERS, titleAngle: 'reaction' });
  });

  it('puts the kind the numbers favour first', () => {
    expect(chooseTitles(input({ leader: 'joke' }))).toMatchObject({ title: 'Bedtime is not optional', titleAngle: 'joke' });
  });

  it('leaves out a title that names someone, whole', () => {
    const chosen = chooseTitles(input({ names: ['goodnight'] }));
    expect(chosen.titleOptions.map((option) => option.angle)).toEqual(['play', 'joke']);
    expect(chosen.title).toBe('Zombies take the lobby');
  });

  // A re-run under the title it already went out with looks like the same video posted twice.
  it('leaves out a title the video already went out under, whatever its capitals', () => {
    const chosen = chooseTitles(input({ previous: ['HE REALLY SAID GOODNIGHT'] }));
    expect(chosen).toMatchObject({ title: 'Zombies take the lobby', titleAngle: 'play' });
  });

  it('keeps the title the video has when every offer is left out', () => {
    expect(chooseTitles(input({ names: ['zombies', 'goodnight', 'bedtime'] }))).toEqual({
      title: 'ALRIGHT GUYS IM GOING TO BED',
      titleOptions: [],
      titleAngle: null
    });
  });

  it('uses a single title when that is all the model sent, unless it cannot be used either', () => {
    expect(chooseTitles(input({ offered: [], single: 'Goodnight from the campfire' }))).toEqual({
      title: 'Goodnight from the campfire',
      titleOptions: [],
      titleAngle: null
    });
    expect(chooseTitles(input({ offered: [], single: '' })).title).toBe('ALRIGHT GUYS IM GOING TO BED');
    expect(chooseTitles(input({ offered: [], single: 'Same as before', previous: ['same as before'] })).title).toBe('ALRIGHT GUYS IM GOING TO BED');
  });
});
