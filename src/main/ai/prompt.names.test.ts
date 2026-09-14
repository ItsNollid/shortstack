import { describe, expect, it } from 'vitest';
import { buildPrompt } from './prompt';

const video = {
  filename: 'clip.mov',
  game: 'Call of Duty: Black Ops 3 Zombies',
  durationSeconds: 20,
  width: 1080,
  height: 1920,
  currentTitle: '',
  currentDescription: ''
};

describe('names never to use, in the prompt', () => {
  it('lists them for the model when there are some', () => {
    const prompt = buildPrompt({ video, channelName: 'Nollid', examples: [], hasFrames: true, blockedNames: ['Dr Phuckass', 'xX_Sniper_Xx'] });
    expect(prompt).toContain('never use any of these names, in the titles, the topics or the tags: Dr Phuckass, xX_Sniper_Xx.');
  });

  it('adds nothing when the list is empty', () => {
    expect(buildPrompt({ video, channelName: 'Nollid', examples: [], hasFrames: true })).not.toContain('any of these names');
  });
});
