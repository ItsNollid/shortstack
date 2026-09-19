import { describe, expect, it } from 'vitest';
import { STARTING_QUESTIONS, followUpsFor, scopeView } from './followUps';

describe('the questions the panel offers', () => {
  it('tells a video waiting, published and stuck apart', () => {
    expect(scopeView({ kind: 'channel' }, null)).toBe('channel');
    expect(scopeView({ kind: 'plan' }, null)).toBe('plan');
    expect(scopeView({ kind: 'video', queueId: 1 }, 'pending')).toBe('video-draft');
    expect(scopeView({ kind: 'video', queueId: 1 }, 'published')).toBe('video-published');
    expect(scopeView({ kind: 'video', queueId: 1 }, 'failed')).toBe('video-stuck');
    expect(scopeView({ kind: 'video', queueId: 1 }, 'needs_attention')).toBe('video-stuck');
  });

  it('offers the scope’s questions not asked yet, three at most', () => {
    expect(followUpsFor('channel', ["How's my channel doing?"])).toEqual(['What should I change?', 'When should I post?', "What's working in my titles?"]);
    expect(followUpsFor('video-stuck', ['Why is this stuck?'])).toEqual(['What should I do about it?']);
    expect(followUpsFor('plan', [...STARTING_QUESTIONS.plan])).toEqual([]);
  });
});
