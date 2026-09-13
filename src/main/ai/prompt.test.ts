import { describe, expect, it } from 'vitest';
import type { PastUpload } from '../../shared/pastUploads';
import { buildPrompt, type PromptInput } from './prompt';

const example = (over: Partial<PastUpload> = {}): PastUpload => ({
  videoId: 'a',
  title: 'THIS ZOMBIE ROUND BROKE ME',
  description: '#blackops3zombies #codzombies #round100',
  tags: ['blackops3zombies', 'codzombies'],
  categoryId: '20',
  thumbnailUrl: null,
  publishedAt: null,
  privacy: 'public',
  ...over
});

const input = (over: Partial<PromptInput> = {}): PromptInput => ({
  video: { filename: 'clip.mov', durationSeconds: 18, width: 1080, height: 1920 },
  channelName: 'Nollid',
  examples: [],
  hasFrames: false,
  ...over
});

describe('buildPrompt', () => {
  it('names the channel it is writing for', () => {
    expect(buildPrompt(input())).toContain('"Nollid"');
  });

  it('puts the channel’s own uploads in front of the model as examples', () => {
    // Without these it is guessing at a house style it has never seen.
    const prompt = buildPrompt(input({ examples: [example()] }));
    expect(prompt).toContain('THIS ZOMBIE ROUND BROKE ME');
    expect(prompt).toContain('#blackops3zombies');
    expect(prompt).toContain('blackops3zombies, codzombies');
  });

  it('asks for the example description shape when there are examples, and a default when there are not', () => {
    expect(buildPrompt(input({ examples: [example()] }))).toContain('copy the shape of the example descriptions');
    expect(buildPrompt(input())).toContain('a short line about the video');
  });

  it('tells the model to look at the frames only when frames are actually attached', () => {
    expect(buildPrompt(input({ hasFrames: true }))).toContain('frames from this video are attached');
    expect(buildPrompt(input({ hasFrames: false }))).toContain('No frames are available');
  });

  it('passes on what is already in the form, which is often the best clue', () => {
    const prompt = buildPrompt(
      input({
        video: {
          filename: 'clip.mov',
          durationSeconds: 18,
          width: 1080,
          height: 1920,
          currentTitle: 'ALRIGHT GUYS IM GOING TO BED',
          currentDescription: '#blackops3zombies'
        }
      })
    );
    expect(prompt).toContain('ALRIGHT GUYS IM GOING TO BED');
    expect(prompt).toContain('Existing description');
  });

  it('asks for specific words rather than generic ones', () => {
    const prompt = buildPrompt(input({ examples: [example()] }));
    expect(prompt).toContain('Specific beats broad');
    expect(prompt).toMatch(/game, map, mode/);
  });

  it('tells the model not to guess a game it cannot identify', () => {
    // A confidently wrong game name in a description is worse than a vague one.
    expect(buildPrompt(input())).toContain('Do not invent facts');
  });

  it('keeps a long example from crowding out the instructions', () => {
    const wall = '#tag '.repeat(500);
    const prompt = buildPrompt(input({ examples: [example({ description: wall })] }));
    expect(prompt.length).toBeLessThan(4000);
    expect(prompt).toContain('Reply with only a JSON object');
  });

  it('uses at most a handful of examples', () => {
    const many = Array.from({ length: 20 }, (_, index) => example({ videoId: `v${index}`, title: `Example ${index}` }));
    const prompt = buildPrompt(input({ examples: many }));
    expect(prompt).toContain('Example 4');
    expect(prompt).not.toContain('Example 5 ---');
  });

  it('skips examples with no title, which carry nothing', () => {
    expect(buildPrompt(input({ examples: [example({ title: '   ' })] }))).toContain('No frames are available');
  });
});
