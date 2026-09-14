import { describe, expect, it } from 'vitest';
import { isTitleAngle, keepsAngle, orderAngles } from './titleAngles';

describe('whether an edited title keeps its style', () => {
  it('keeps it through a fixed typo, a changed word or an added one', () => {
    expect(keepsAngle('ALRIGHT GUYS IM GOING TO BED', 'ALRIGHT GUYS I’M GOING TO BED')).toBe(true);
    expect(keepsAngle('alright guys im going to bed', 'alright guys im going to sleep')).toBe(true);
    expect(keepsAngle('going to bed now', 'going to bed now guys')).toBe(true);
  });

  it('loses it when the title is written over', () => {
    expect(keepsAngle('Thank you Donald J Trump', 'The zombies got him on round 12')).toBe(false);
    // Two words become five: most of what it says now is new.
    expect(keepsAngle('INSANE CLUTCH', 'INSANE 1v4 CLUTCH on nuketown')).toBe(false);
  });

  it('never keeps it for an empty title', () => {
    expect(keepsAngle('', 'anything')).toBe(false);
    expect(keepsAngle('something', '  ')).toBe(false);
  });
});

describe('the order styles are offered in', () => {
  it('puts the one the numbers favour first, and otherwise keeps the usual order', () => {
    expect(orderAngles('joke')).toEqual(['joke', 'reaction', 'play']);
    expect(orderAngles(null)).toEqual(['reaction', 'play', 'joke']);
  });

  it('knows its own kinds and nothing else', () => {
    expect(isTitleAngle('play')).toBe(true);
    expect(isTitleAngle('clickbait')).toBe(false);
    expect(isTitleAngle(null)).toBe(false);
  });
});
