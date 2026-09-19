import { describe, expect, it } from 'vitest';
import { parseReply, streamingProse, unsupportedNumbers } from './reply';

const CHANNEL = { kind: 'channel' } as const;
const VIDEO = { kind: 'video', queueId: 3 } as const;

describe('taking the answer apart', () => {
  it('is all prose when no change was suggested', () => {
    expect(parseReply('Post in the evening.', CHANNEL)).toEqual({ prose: 'Post in the evening.', changes: [] });
  });

  it('keeps only known kinds of change, and never one to approve or upload', () => {
    const raw = 'Cap your hashtags.\nCHANGES: [{"kind":"set_max_hashtags","value":5},{"kind":"approve"},{"kind":"upload_now"}]';
    expect(parseReply(raw, CHANNEL)).toEqual({
      prose: 'Cap your hashtags.',
      changes: [{ kind: 'setting', action: { kind: 'set_max_hashtags', value: 5 } }]
    });
  });

  it('offers a video draft only while looking at that video, and only when it is valid', () => {
    const raw = `Try this.\nCHANGES: [{"kind":"video_title","value":"Round 50, one bullet left"},{"kind":"video_title","value":"${'x'.repeat(101)}"},{"kind":"video_tags","value":["cs2"," clutch "]}]`;
    expect(parseReply(raw, CHANNEL).changes).toEqual([]);
    expect(parseReply(raw, VIDEO).changes).toEqual([
      { kind: 'video', field: 'title', value: 'Round 50, one bullet left' },
      { kind: 'video', field: 'tags', value: ['cs2', 'clutch'] }
    ]);
  });

  it('keeps the words when the change block cannot be read', () => {
    expect(parseReply('Try this.\nCHANGES: [{"kind":', CHANNEL)).toEqual({ prose: 'Try this.', changes: [] });
  });
});

describe('the words while they stream', () => {
  it('hides a change block, even one still arriving', () => {
    expect(streamingProse('Try this.\nCHANGES: [{"ki')).toBe('Try this.');
    expect(streamingProse('Try this.\nCHANG')).toBe('Try this.');
    expect(streamingProse('Try this.')).toBe('Try this.');
  });
});

describe('numbers the answer gives', () => {
  const facts = ['Evening videos get a median of 4,100 views across 14 videos.', 'People watch 43% of it, 12 points less than usual.'];

  it('flags a number found nowhere in what the model was given', () => {
    expect(unsupportedNumbers('About 47% of viewers leave early.', facts)).toEqual(['47%']);
  });

  it('passes numbers that are in the facts, however they are written', () => {
    expect(unsupportedNumbers('Evening gets 4100 views and 43% is watched, 12 points down.', facts)).toEqual([]);
  });

  it('lets single digits through', () => {
    expect(unsupportedNumbers('Post 3 times a day.', facts)).toEqual([]);
  });

  it('checks decimals', () => {
    expect(unsupportedNumbers('That is 3.2 times more.', facts)).toEqual(['3.2']);
    expect(unsupportedNumbers('That is 3.2 times more.', ['640 views, 3.2 times the typical'])).toEqual([]);
  });
});
