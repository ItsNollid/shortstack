// The questions the panel offers, chosen by code from where it was opened — never by the model — so every
// suggestion is one the assistant has facts to answer.
import type { QueueState } from '../queue';
import type { AssistantScope } from './types';

export type ScopeView = 'channel' | 'plan' | 'video-draft' | 'video-published' | 'video-stuck';

export function scopeView(scope: AssistantScope, videoState: QueueState | null): ScopeView {
  if (scope.kind !== 'video') return scope.kind;
  if (videoState === 'published') return 'video-published';
  if (videoState === 'failed' || videoState === 'needs_attention') return 'video-stuck';
  return 'video-draft';
}

export const STARTING_QUESTIONS: Record<ScopeView, readonly string[]> = {
  channel: ["How's my channel doing?", 'What should I change?', 'When should I post?', "What's working in my titles?"],
  plan: ['What should I post next?', 'Is my week balanced?'],
  'video-draft': ['Is this title good?', 'Does the first second hold?', 'What would you change?'],
  'video-published': ['How is this one doing?', 'What should I change?'],
  'video-stuck': ['Why is this stuck?', 'What should I do about it?']
};

/** After an answer: the scope's own questions that have not been asked yet. */
export function followUpsFor(view: ScopeView, asked: readonly string[]): string[] {
  return STARTING_QUESTIONS[view].filter((question) => !asked.includes(question)).slice(0, 3);
}
