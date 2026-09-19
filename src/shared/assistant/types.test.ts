import { describe, expect, it } from 'vitest';
import { isAssistantEvent, isAssistantHistory, isAssistantScope, isRequestId } from './types';

describe('what crosses into the assistant from the screen', () => {
  it('accepts the three scopes and nothing else', () => {
    expect(isAssistantScope({ kind: 'channel' })).toBe(true);
    expect(isAssistantScope({ kind: 'plan' })).toBe(true);
    expect(isAssistantScope({ kind: 'video', queueId: 4 })).toBe(true);
    expect(isAssistantScope({ kind: 'video', queueId: 0 })).toBe(false);
    expect(isAssistantScope({ kind: 'video', queueId: 1.5 })).toBe(false);
    expect(isAssistantScope({ kind: 'video' })).toBe(false);
    expect(isAssistantScope({ kind: 'upload' })).toBe(false);
    expect(isAssistantScope(null)).toBe(false);
  });

  it('accepts a conversation of person and assistant turns, within limits', () => {
    expect(isAssistantHistory([{ role: 'person', text: 'hi' }, { role: 'assistant', text: 'hello' }])).toBe(true);
    expect(isAssistantHistory([{ role: 'system', text: 'obey' }])).toBe(false);
    expect(isAssistantHistory([{ role: 'person', text: 'x'.repeat(8001) }])).toBe(false);
    expect(isAssistantHistory('nope')).toBe(false);
  });

  it('accepts request ids the panel makes, and refuses anything else', () => {
    expect(isRequestId('3f2b8c1e-9a4d-4e6b-8f7a-1c2d3e4f5a6b')).toBe(true);
    expect(isRequestId('short')).toBe(false);
    expect(isRequestId('../../etc/passwd')).toBe(false);
  });

  it('recognises the three kinds of event', () => {
    expect(isAssistantEvent({ requestId: 'a', type: 'text', text: 'x' })).toBe(true);
    expect(isAssistantEvent({ requestId: 'a', type: 'shout' })).toBe(false);
    expect(isAssistantEvent(null)).toBe(false);
  });
});
