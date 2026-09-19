// The conversation: each question with its answer as it streams in. It lives only in this window, and goes when
// the app closes — nothing of it is written anywhere.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isAssistantEvent,
  type AssistantChange,
  type AssistantEvent,
  type AssistantScope,
  type AssistantTurn
} from '../../../shared/assistant/types';

export interface ChatEntry {
  id: string;
  /** What it was about when asked, so its buttons still point at the right video after the panel moves on. */
  scope: AssistantScope;
  question: string;
  answer: string;
  status: 'streaming' | 'done' | 'error';
  finished: boolean;
  changes: AssistantChange[];
  unsupportedNumbers: string[];
  basedOn: string;
  ownCalculations: boolean;
  needsRefresh: boolean;
  error: string | null;
}

export interface AssistantChat {
  entries: ChatEntry[];
  busy: boolean;
  ask(question: string): void;
  stop(): void;
  clear(): void;
}

const blank = (id: string, scope: AssistantScope, question: string): ChatEntry => ({
  id,
  scope,
  question,
  answer: '',
  status: 'streaming',
  finished: false,
  changes: [],
  unsupportedNumbers: [],
  basedOn: '',
  ownCalculations: false,
  needsRefresh: false,
  error: null
});

function applyEvent(entry: ChatEntry, event: AssistantEvent): ChatEntry {
  if (event.type === 'text') return { ...entry, answer: event.text };
  if (event.type === 'error') return { ...entry, status: 'error', error: event.reason };
  return {
    ...entry,
    status: 'done',
    answer: event.prose,
    finished: event.finished,
    changes: event.changes,
    unsupportedNumbers: event.unsupportedNumbers,
    basedOn: event.basedOn,
    ownCalculations: event.ownCalculations,
    needsRefresh: event.needsRefresh
  };
}

export function useAssistantChat(scope: AssistantScope): AssistantChat {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const current = useRef<string | null>(null);

  useEffect(
    () =>
      window.api.on('assistant:stream', (payload) => {
        if (!isAssistantEvent(payload)) return;
        if (payload.type !== 'text' && current.current === payload.requestId) current.current = null;
        setEntries((list) => list.map((entry) => (entry.id === payload.requestId ? applyEvent(entry, payload) : entry)));
      }),
    []
  );

  const ask = useCallback(
    (question: string) => {
      const text = question.trim();
      if (text === '') return;
      // Named here, before asking, so no event can arrive for an answer the list does not have yet.
      const id = crypto.randomUUID();
      const history = entries
        .filter((entry) => entry.status === 'done' && entry.answer !== '')
        .flatMap((entry): AssistantTurn[] => [
          { role: 'person', text: entry.question },
          { role: 'assistant', text: entry.answer }
        ]);
      current.current = id;
      setEntries((list) => [...list, blank(id, scope, text)]);
      void window.api.assistantAsk(id, scope, text, history).then((result) => {
        if (result.ok) return;
        if (current.current === id) current.current = null;
        setEntries((list) => list.map((entry) => (entry.id === id ? { ...entry, status: 'error', error: result.error.message } : entry)));
      });
    },
    [entries, scope]
  );

  const stop = useCallback(() => {
    if (current.current !== null) void window.api.assistantStop(current.current);
  }, []);

  const clear = useCallback(() => {
    stop();
    current.current = null;
    setEntries([]);
  }, [stop]);

  return { entries, busy: entries.some((entry) => entry.status === 'streaming'), ask, stop, clear };
}
