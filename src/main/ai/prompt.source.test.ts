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

describe('the long video, in the prompt', () => {
  it('tells the model what the clip was cut from', () => {
    const prompt = buildPrompt({ video: { ...video, sourceTitle: 'Round 50 attempt on Kino' }, channelName: 'Nollid', examples: [], hasFrames: true });
    expect(prompt).toContain('Cut from the long video: Round 50 attempt on Kino');
  });

  it('says nothing when nobody has said', () => {
    expect(buildPrompt({ video, channelName: 'Nollid', examples: [], hasFrames: true })).not.toContain('Cut from the long video');
  });
});
