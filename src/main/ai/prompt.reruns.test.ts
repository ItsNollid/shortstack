import { describe, expect, it } from 'vitest';
import { buildPrompt } from './prompt';

const video = {
  filename: 'clip.mov',
  game: 'Call of Duty: Black Ops 3 Zombies',
  durationSeconds: 20,
  width: 1080,
  height: 1920,
  currentTitle: 'ALRIGHT GUYS IM GOING TO BED',
  currentDescription: ''
};

describe('a re-run, in the prompt', () => {
  it('lists the titles the video already went out under, and asks for different ones', () => {
    const prompt = buildPrompt({
      video: { ...video, previousTitles: ['ALRIGHT GUYS IM GOING TO BED', 'He really said goodnight'] },
      channelName: 'Nollid',
      examples: [],
      hasFrames: false
    });
    expect(prompt).toContain('It has gone out before, under these titles. Write new ones that are clearly different from each:');
    expect(prompt).toContain('- ALRIGHT GUYS IM GOING TO BED\n- He really said goodnight');
  });

  it('says nothing about it for a first posting', () => {
    expect(buildPrompt({ video: { ...video, previousTitles: [] }, channelName: 'Nollid', examples: [], hasFrames: false })).not.toContain(
      'It has gone out before'
    );
    expect(buildPrompt({ video, channelName: 'Nollid', examples: [], hasFrames: false })).not.toContain('It has gone out before');
  });
});
