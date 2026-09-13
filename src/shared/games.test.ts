import { describe, expect, it } from 'vitest';
import { detectGame } from './games';

describe('detectGame', () => {
  it('finds the game in a title', () => {
    expect(detectGame({ title: 'INSANE CS2 CLUTCH' })).toBe('Counter-Strike 2');
    expect(detectGame({ title: 'my minecraft base is gone' })).toBe('Minecraft');
    expect(detectGame({ title: 'GTA police chase' })).toBe('Grand Theft Auto');
  });

  it('finds it in hashtags and tags when the title says nothing', () => {
    expect(detectGame({ title: 'THIS BROKE ME', description: '#blackops3zombies #shorts' })).toBe(
      'Call of Duty: Black Ops 3 Zombies'
    );
    expect(detectGame({ title: 'unbelievable', tags: ['rocket league', 'shorts'] })).toBe('Rocket League');
  });

  // The specific answer is more useful than the general one it sits inside.
  it('prefers the more specific game over the broader series', () => {
    expect(detectGame({ title: 'bo3 zombies round 100', description: '#callofduty' })).toBe(
      'Call of Duty: Black Ops 3 Zombies'
    );
  });

  // "cod" inside "code" is how a channel ends up being told its programming videos are Call of Duty.
  it('does not match an alias buried inside a longer word', () => {
    expect(detectGame({ title: 'my code review went badly' })).toBeNull();
    expect(detectGame({ title: 'a rusty old car' })).toBeNull();
    expect(detectGame({ title: 'the gtav sign was a typo' })).toBe('Grand Theft Auto');
  });

  it('matches an alias against the edges of a hashtag', () => {
    expect(detectGame({ title: 'clip', description: '#cs2 #shorts' })).toBe('Counter-Strike 2');
    expect(detectGame({ title: 'clip', description: '#gta5' })).toBe('Grand Theft Auto');
  });

  // Guessing wrong would put a false comparison in front of someone making real decisions.
  it('answers nothing rather than guessing', () => {
    expect(detectGame({ title: 'ALRIGHT GUYS IM GOING TO BED' })).toBeNull();
    expect(detectGame({ title: '' })).toBeNull();
  });

  it('is case insensitive throughout', () => {
    expect(detectGame({ title: 'LETHAL COMPANY WENT WRONG' })).toBe('Lethal Company');
    expect(detectGame({ title: 'lethal company went wrong' })).toBe('Lethal Company');
  });
});
