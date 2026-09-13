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
    const prompt = buildPrompt(input({ examples: [example(), example({ videoId: 'b', title: 'ANOTHER ONE' })] }));
    expect(prompt).toContain('THIS ZOMBIE ROUND BROKE ME');
    expect(prompt).toContain('#blackops3zombies');
    expect(prompt).toContain('blackops3zombies, codzombies');
  });

  describe('hashtags that belong to one video', () => {
    const across = (extra: string) => example({ description: `#blackops3zombies #codzombies ${extra}` });

    // Measured: shown an example ending in #round100, qwen3-vl:8b put #round50 on a lobby screen,
    // and a blunter instruction only changed the number. It cannot be told; it has to not see them.
    it('keeps them out of the examples entirely', () => {
      const prompt = buildPrompt(
        input({
          examples: [
            across('#round100'),
            across('#easteregg'),
            across('#firstgame')
          ]
        })
      );
      expect(prompt).not.toContain('#round100');
      expect(prompt).not.toContain('#easteregg');
      expect(prompt).not.toContain('#firstgame');
    });

    it('keeps the ones the channel puts on everything in the examples', () => {
      const prompt = buildPrompt(input({ examples: [across('#round100'), across('#easteregg')] }));
      expect(prompt).toContain('#blackops3zombies');
      expect(prompt).toContain('#codzombies');
    });

    // One upload is no evidence of a habit, so every hashtag on it is treated as belonging to that
    // one video, and none of them are shown.
    it('shows none of the hashtags on a lone example', () => {
      const prompt = buildPrompt(input({ examples: [across('#round100')] }));
      expect(prompt).not.toContain('#round100');
      expect(prompt).not.toContain('#blackops3zombies');
    });
  });

  // The description is assembled in code from the game, these topics and the channel's habits. Asked
  // to write one, the model copied old hashtags, invented round numbers or wrote "#gaming #shorts".
  it('asks for topics, not a description', () => {
    const prompt = buildPrompt(input({ examples: [example()] }));
    expect(prompt).toContain('Topics:');
    expect(prompt).toContain('"topics"');
    expect(prompt).not.toContain('copy the shape of the example descriptions');
    expect(prompt).not.toContain('write a block of hashtags');
    expect(prompt).toMatch(/no round numbers, scores or map names unless they are on screen/);
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
    expect(prompt).toMatch(/a mode, a map/);
    expect(prompt).toMatch(/leave out anything generic/);
  });

  // Measured: shown a lobby with a player list, the model offered the channel's own name and a
  // friend's gamertag as topics. The example list also invited it, by suggesting "a character".
  it('forbids names read off the screen, and no longer invites them', () => {
    const prompt = buildPrompt(input());
    expect(prompt).toMatch(/Never use a name read off the screen/);
    expect(prompt).toMatch(/gamertags/);
    expect(prompt).not.toMatch(/a character/);
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

describe('what has worked on this channel', () => {
  const finding = { statement: 'Videos where the title is in capitals get a median of 2800 views against 1400 where it is not.' };

  it('tells the model what the numbers say, so it writes what works here', () => {
    const text = buildPrompt(input({ findings: [finding] }));
    expect(text).toContain(finding.statement);
    expect(text).toMatch(/What has worked on this channel/);
    expect(text).toMatch(/measured from this channel/);
  });

  it('says nothing at all when there are no findings yet', () => {
    const text = buildPrompt(input());
    expect(text).not.toMatch(/What has worked on this channel/);
  });

  // It belongs after the video and before the instructions: read any earlier and it looks like
  // another example to copy from.
  it('comes after the video and before what to write', () => {
    const text = buildPrompt(input({ findings: [finding] }));
    expect(text.indexOf('--- The new video ---')).toBeLessThan(text.indexOf('--- What has worked'));
    expect(text.indexOf('--- What has worked')).toBeLessThan(text.indexOf('--- What to write ---'));
  });
});

describe('the game, when it is known', () => {
  // Shown one lobby frame four times, qwen3-vl:8b answered The Last of Us, Left 4 Dead, ARK and
  // The Forest. It cannot tell, so when the user has said, it is told rather than asked.
  it('names it, and tells the model not to contradict it', () => {
    const text = buildPrompt(input({ video: { ...input().video, game: 'Counter-Strike 2' }, hasFrames: true }));
    expect(text).toContain('Game: Counter-Strike 2');
    expect(text).toMatch(/already named above and is correct/);
    expect(text).toMatch(/do not contradict it/);
  });

  it('still asks it to look when nobody has said', () => {
    const text = buildPrompt(input({ hasFrames: true }));
    expect(text).not.toContain('Game:');
    expect(text).toMatch(/name the game, the map or mode/);
  });

  it('uses it even with no frames at all', () => {
    const text = buildPrompt(input({ video: { ...input().video, game: 'Minecraft' }, hasFrames: false }));
    expect(text).toContain('Game: Minecraft');
    expect(text).toMatch(/The game above is correct/);
  });

  it('ignores a blank one rather than writing an empty line', () => {
    for (const game of [null, '', '   ']) {
      expect(buildPrompt(input({ video: { ...input().video, game } })), String(game)).not.toContain('Game:');
    }
  });
});
