// The assistant, as a panel on the right of every page. It answers from what ShortStack measured, says what each
// answer was based on, marks any number it cannot find in your data, and offers changes as buttons — never more.
import React, { useEffect, useRef, useState } from 'react';
import { MessageCircleQuestion, Square, Trash2, X } from 'lucide-react';
import { STARTING_QUESTIONS, followUpsFor, scopeView } from '../../../shared/assistant/followUps';
import { MAX_QUESTION_CHARS, type AssistantScope } from '../../../shared/assistant/types';
import type { QueueItemDTO } from '../../../shared/dto';
import type { Result } from '../../../shared/ipc';
import { useApiQuery } from '../../hooks/useApi';
import { SettingChangeRow } from '../SettingChangeRow';
import { Banner, Button } from '../ui';
import { useAssistant } from './AssistantProvider';
import { useAssistantChat, type ChatEntry } from './useAssistantChat';
import { VideoDraftRow } from './VideoDraftRow';
import styles from './AssistantPanel.module.css';

/** YouTube requires figures worked out from its data be labelled as the app's own. */
const OWN_WORK = 'ShortStack’s own calculations — not YouTube data';

export function AssistantPanel(): React.JSX.Element | null {
  const { open, scope, pending, clearPending, close, widen } = useAssistant();
  const chat = useAssistantChat(scope);
  const [draft, setDraft] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const queueId = scope.kind === 'video' ? scope.queueId : 0;
  const video = useApiQuery((): Promise<Result<QueueItemDTO>> => window.api.queueGet(queueId), {
    key: `assistant-video:${queueId}`,
    enabled: open && scope.kind === 'video',
    invalidateOn: ['queue:changed']
  });

  useEffect(() => {
    if (!open) return;
    if (pending !== null) {
      setDraft(pending);
      clearPending();
    }
    input.current?.focus();
  }, [open, pending, clearPending]);

  if (!open) return null;

  const item = scope.kind === 'video' ? video.data : null;
  const view = scopeView(scope, item?.state ?? null);
  const last = chat.entries[chat.entries.length - 1];
  const suggestions =
    last === undefined
      ? STARTING_QUESTIONS[view]
      : last.status === 'done'
        ? followUpsFor(
            view,
            chat.entries.map((entry) => entry.question)
          )
        : [];
  const lastFinished = [...chat.entries].reverse().find((entry) => entry.status === 'done');

  const send = (question: string): void => {
    if (chat.busy || question.trim() === '') return;
    chat.ask(question);
    setDraft('');
  };

  return (
    <aside className={styles.panel} aria-label="Assistant">
      <header className={styles.header}>
        <MessageCircleQuestion size={16} />
        <span className={styles.title}>Assistant</span>
        <span className={styles.spacer} />
        <Button
          size="small"
          variant="ghost"
          icon={<Trash2 size={14} />}
          aria-label="Clear the conversation"
          disabled={chat.entries.length === 0}
          onClick={chat.clear}
        />
        <Button size="small" variant="ghost" icon={<X size={14} />} aria-label="Close the assistant" onClick={close} />
      </header>

      <div className={styles.scope}>
        <span className={styles.chip}>
          About: {scopeLabel(scope, item)}
          {scope.kind !== 'channel' && (
            <button type="button" className={styles.chipClear} aria-label="Ask about the whole channel instead" onClick={widen}>
              ×
            </button>
          )}
        </span>
      </div>

      <div className={styles.conversation}>
        {chat.entries.length === 0 && (
          <p className={styles.intro}>
            Answers come only from what ShortStack has measured about your channel and videos. When something is not measured, it
            says so.
          </p>
        )}
        {chat.entries.map((entry) => (
          <Exchange key={entry.id} entry={entry} onRetry={() => send(entry.question)} />
        ))}
        {suggestions.length > 0 && (
          <div className={styles.suggestions} aria-label="Suggested questions">
            {suggestions.map((question) => (
              <button key={question} type="button" className={styles.suggestion} disabled={chat.busy} onClick={() => send(question)}>
                {question}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Announced once, when an answer is finished — not every word as it streams in. */}
      <div className={styles.announcer} aria-live="polite">
        {lastFinished?.answer ?? ''}
      </div>

      <form
        className={styles.ask}
        onSubmit={(event) => {
          event.preventDefault();
          send(draft);
        }}
      >
        <textarea
          ref={input}
          className={styles.input}
          aria-label="Your question"
          placeholder="Ask about your channel, a video or your plan…"
          value={draft}
          maxLength={MAX_QUESTION_CHARS}
          rows={2}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              send(draft);
            }
          }}
        />
        {chat.busy ? (
          <Button icon={<Square size={14} />} onClick={chat.stop}>
            Stop
          </Button>
        ) : (
          <Button variant="primary" type="submit" disabled={draft.trim() === ''}>
            Ask
          </Button>
        )}
      </form>
    </aside>
  );
}

function scopeLabel(scope: AssistantScope, item: QueueItemDTO | null): string {
  if (scope.kind === 'channel') return 'your channel';
  if (scope.kind === 'plan') return 'your plan';
  return item === null ? 'this video' : item.title;
}

function Exchange({ entry, onRetry }: { entry: ChatEntry; onRetry(): void }): React.JSX.Element {
  const flagged = entry.unsupportedNumbers;
  return (
    <div className={styles.exchange}>
      <div className={styles.question}>{entry.question}</div>
      {entry.status === 'error' ? (
        <Banner
          kind="warning"
          title="No answer"
          actions={
            <Button size="small" onClick={onRetry}>
              Try again
            </Button>
          }
        >
          {entry.error}
        </Banner>
      ) : (
        <div className={styles.answer}>
          {entry.answer === '' && entry.status === 'streaming' ? <span className={styles.writing}>Thinking…</span> : entry.answer}
        </div>
      )}
      {entry.status === 'done' && (
        <>
          {!entry.finished && <div className={styles.note}>Stopped before it finished.</div>}
          {flagged.length > 0 && (
            <div className={styles.warning}>
              {flagged.join(', ')} {flagged.length === 1 ? 'is' : 'are'} not in your data — the model may have made{' '}
              {flagged.length === 1 ? 'it' : 'them'} up.
            </div>
          )}
          {entry.changes.map((change, index) =>
            change.kind === 'setting' ? (
              <SettingChangeRow key={index} change={change.action} />
            ) : entry.scope.kind === 'video' ? (
              <VideoDraftRow key={index} queueId={entry.scope.queueId} change={change} />
            ) : null
          )}
          <div className={styles.basis}>
            Based on {entry.basedOn}
            {entry.ownCalculations && <span> · {OWN_WORK}</span>}
          </div>
          {entry.needsRefresh && (
            <Button
              size="small"
              variant="ghost"
              onClick={() => {
                window.location.hash = '#/analytics';
              }}
            >
              Open Analytics to refresh
            </Button>
          )}
        </>
      )}
    </div>
  );
}
