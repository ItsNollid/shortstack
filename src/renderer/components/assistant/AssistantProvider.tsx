// Where the assistant lives on screen: whether the panel is open, what it is about, and a way for any page to
// say what it is showing. Pages set their scope; Ask buttons open the panel with a question ready.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { AssistantScope } from '../../../shared/assistant/types';

interface AssistantContextValue {
  open: boolean;
  /** What the panel is about right now: a scope chosen by an Ask button, or else the page's own. */
  scope: AssistantScope;
  /** A question to put in the box when the panel opens from an Ask button. */
  pending: string | null;
  clearPending(): void;
  openPanel(scope?: AssistantScope, question?: string): void;
  close(): void;
  /** Widens to the whole channel. */
  widen(): void;
  setPageScope(scope: AssistantScope): void;
}

const CHANNEL: AssistantScope = { kind: 'channel' };
const AssistantContext = createContext<AssistantContextValue | null>(null);
const keyOf = (scope: AssistantScope | null): string =>
  scope === null ? 'none' : scope.kind === 'video' ? `video:${scope.queueId}` : scope.kind;

export function AssistantProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [pageScope, setPageScopeState] = useState<AssistantScope>(CHANNEL);
  const [chosen, setChosen] = useState<AssistantScope | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const openPanel = useCallback((scope?: AssistantScope, question?: string) => {
    setChosen(scope ?? null);
    setPending(question ?? null);
    setOpen(true);
    void window.api.assistantWarm();
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    setChosen(null);
  }, []);
  const widen = useCallback(() => setChosen(CHANNEL), []);
  const clearPending = useCallback(() => setPending(null), []);
  const setPageScope = useCallback((scope: AssistantScope) => setPageScopeState(scope), []);

  // Ctrl+K opens and closes it from anywhere. Review's single-key shortcuts ignore modifier keys.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return;
      event.preventDefault();
      setOpen((current) => {
        if (!current) void window.api.assistantWarm();
        return !current;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const value = useMemo(
    () => ({ open, scope: chosen ?? pageScope, pending, clearPending, openPanel, close, widen, setPageScope }),
    [open, chosen, pageScope, pending, clearPending, openPanel, close, widen, setPageScope]
  );
  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant(): AssistantContextValue {
  const value = useContext(AssistantContext);
  if (value === null) throw new Error('useAssistant must be used inside AssistantProvider');
  return value;
}

/** Tells the assistant what this page is showing, for as long as it is shown. */
export function usePageScope(scope: AssistantScope | null): void {
  const { setPageScope } = useAssistant();
  const key = keyOf(scope);
  // The key stands for the scope, so a new object with the same meaning does not run this again.
  useEffect(() => {
    if (scope !== null) setPageScope(scope);
    return () => setPageScope(CHANNEL);
  }, [key, setPageScope]);
}
