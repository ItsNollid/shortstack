import { describe, expect, it } from 'vitest';
import { buildPrompt } from './prompt';

const video = {
  filename: 'ALRIGHT GUYS IM GOING TO BED.mov',
  game: 'Call of Duty: Black Ops 3 Zombies',
  durationSeconds: 18,
  width: 1080,
  height: 1920,
  currentTitle: '',
  currentDescription: ''
};

describe('what is said, in the prompt', () => {
  it('passes on what was heard, marked as heard, and invites a title built on it', () => {
    const prompt = buildPrompt({
      video: { ...video, speech: "Alright, restart your game, Brett. I'm going to bed, guys." },
      channelName: 'Nollid',
      examples: [],
      hasFrames: false
    });
    expect(prompt).toContain(
      `What is said in the clip, as a speech model heard it (it can mishear words): "Alright, restart your game, Brett. I'm going to bed, guys."`
    );
    expect(prompt).toContain('a title can quote it or build on it');
  });

  // What was heard in this channel's own clip included a friend's name.
  it('keeps names heard in the clip out, like names read off the screen', () => {
    expect(buildPrompt({ video, channelName: 'Nollid', examples: [], hasFrames: false })).toContain('Never use a name read off the screen or heard in the clip');
  });

  it('says nothing about speech when nothing was heard', () => {
    for (const speech of [undefined, null, '   ']) {
      expect(buildPrompt({ video: { ...video, speech }, channelName: 'Nollid', examples: [], hasFrames: false })).not.toContain('What is said in the clip');
    }
  });
});
