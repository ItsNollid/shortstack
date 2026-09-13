import { describe, expect, it } from 'vitest';
import { ageGroupName, countryName, duration, genderName, percentOf, trafficSourceName } from './analyticsCopy';

describe('trafficSourceName', () => {
  it('names the sources a Shorts channel actually sees', () => {
    expect(trafficSourceName('SHORTS')).toBe('Shorts feed');
    expect(trafficSourceName('SUBSCRIBER')).toBe('Subscriptions and home');
    expect(trafficSourceName('YT_SEARCH')).toBe('YouTube search');
  });

  // A source this does not know about is still a real source, so it is tidied rather than dropped.
  it('tidies anything it does not recognise instead of hiding it', () => {
    expect(trafficSourceName('SOME_NEW_THING')).toBe('Some new thing');
    expect(trafficSourceName('')).toBe('Unknown');
  });
});

describe('countryName', () => {
  it('spells out the common ones and keeps the code for the rest', () => {
    expect(countryName('GB')).toBe('United Kingdom');
    expect(countryName('US')).toBe('United States');
    expect(countryName('TV')).toBe('TV');
    expect(countryName('')).toBe('Unknown');
  });
});

describe('ageGroupName', () => {
  it('reads a range as a range', () => {
    expect(ageGroupName('age25-34')).toBe('25 to 34');
    expect(ageGroupName('age13-17')).toBe('13 to 17');
  });

  it('reads the open-ended one as open-ended', () => {
    expect(ageGroupName('age65-')).toBe('65 and over');
  });

  it('falls back rather than showing a raw key', () => {
    expect(ageGroupName('unknown_group')).toBe('Unknown group');
  });
});

describe('genderName', () => {
  it('uses plain words', () => {
    expect(genderName('male')).toBe('Men');
    expect(genderName('female')).toBe('Women');
    expect(genderName('user_specified')).toBe('User specified');
  });
});

describe('duration', () => {
  // Shorts are seconds long, so a format built around hours would show 0h for everything.
  it('stays in seconds for anything under a minute', () => {
    expect(duration(6)).toBe('6s');
    expect(duration(59.4)).toBe('59s');
  });

  it('switches to minutes above that, and drops a zero remainder', () => {
    expect(duration(60)).toBe('1m');
    expect(duration(95)).toBe('1m 35s');
    expect(duration(120)).toBe('2m');
  });

  it('never shows a negative', () => {
    expect(duration(-5)).toBe('0s');
  });
});

describe('percentOf', () => {
  it('works out a share', () => {
    expect(percentOf(25, 100)).toBe(25);
    expect(percentOf(1, 3)).toBeCloseTo(33.33, 1);
  });

  // The case that makes every dashboard print NaN on a channel with no views yet.
  it('returns zero rather than dividing by nothing', () => {
    expect(percentOf(0, 0)).toBe(0);
    expect(percentOf(5, -1)).toBe(0);
  });
});
