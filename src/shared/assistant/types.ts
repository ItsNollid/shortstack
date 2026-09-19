// The vocabulary the assistant's parts share: what it is looking at, what was said, what it may say, and what it
// streams back. Kept in one place so the screen, the main process and the tests agree on a single shape.
import type { ChannelAction } from '../channelActions';

/** What the assistant is looking at. A video is named by its queue id. */
export type AssistantScope = { kind: 'channel' } | { kind: 'video'; queueId: number } | { kind: 'plan' };

export function isAssistantScope(value: unknown): value is AssistantScope {
  if (typeof value !== 'object' || value === null) return false;
  const scope = value as { kind?: unknown; queueId?: unknown };
  if (scope.kind === 'channel' || scope.kind === 'plan') return true;
  return scope.kind === 'video' && typeof scope.queueId === 'number' && Number.isInteger(scope.queueId) && scope.queueId > 0;
}

export interface AssistantTurn {
  role: 'person' | 'assistant';
  text: string;
}

/** How many earlier turns go back to the model: enough for "and on weekends?", not a whole afternoon. */
export const MAX_HISTORY_TURNS = 6;
export const MAX_QUESTION_CHARS = 1000;

export function isAssistantHistory(value: unknown): value is AssistantTurn[] {
  if (!Array.isArray(value) || value.length > 40) return false;
  return value.every((turn: unknown) => {
    if (typeof turn !== 'object' || turn === null) return false;
    const { role, text } = turn as { role?: unknown; text?: unknown };
    return (role === 'person' || role === 'assistant') && typeof text === 'string' && text.length <= 8000;
  });
}

/** The panel names each answer, so events for an answer it has moved on from can be told apart. */
export const isRequestId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(value);

/**
 * One thing the assistant may say, written by code, never by the model. `derived` marks a figure ShortStack worked
 * out from YouTube's numbers, which YouTube's policies require be labelled as ShortStack's own calculation.
 */
export interface AssistantFact {
  id: string;
  text: string;
  derived: boolean;
}

/** A change the person can press. Settings changes are the Analytics advice kinds; video drafts are one field each. */
export type AssistantChange =
  | { kind: 'setting'; action: ChannelAction }
  | { kind: 'video'; field: 'title'; value: string }
  | { kind: 'video'; field: 'description'; value: string }
  | { kind: 'video'; field: 'tags'; value: string[] };

export type AssistantEvent =
  | { requestId: string; type: 'text'; text: string }
  | {
      requestId: string;
      type: 'done';
      prose: string;
      changes: AssistantChange[];
      /** Numbers in the answer found nowhere in what the model was given. */
      unsupportedNumbers: string[];
      /** A few words on what the answer could draw on. */
      basedOn: string;
      /** Whether it was given figures ShortStack worked out from YouTube's data. */
      ownCalculations: boolean;
      /** Whether refreshing Analytics would give it more, or newer, to go on. */
      needsRefresh: boolean;
      /** False when it was stopped, or cut off, before the model finished. */
      finished: boolean;
    }
  | { requestId: string; type: 'error'; code: string; reason: string };

export function isAssistantEvent(value: unknown): value is AssistantEvent {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as { requestId?: unknown; type?: unknown };
  return typeof event.requestId === 'string' && (event.type === 'text' || event.type === 'done' || event.type === 'error');
}
