// One question at a time, from the panel to the model and back as events. A new question stops the one before
// it, and Stop ends one early. What streams is the model's words; what arrives at the end has been checked.
import type Database from 'better-sqlite3';
import type { Pulled } from '../../shared/analyticsRefresh';
import { buildAssistantMessages } from '../../shared/assistant/prompt';
import { parseReply, streamingProse, unsupportedNumbers } from '../../shared/assistant/reply';
import type { AssistantEvent, AssistantScope, AssistantTurn } from '../../shared/assistant/types';
import type { VideoStat } from '../../shared/insights';
import { streamChat, warmModel, type ChatAnswer, type ChatRequest } from '../ai/ollamaChat';
import type { AiResult } from '../ai/ollamaClient';
import { resolveModel } from '../ai/resolveModel';
import { readSettings } from '../db/settingsRepo';
import { gatherFacts } from './gather';

/** Matches the Analytics advice call: a cold 8B model and a considered answer is not a one-minute job. */
export const ASSISTANT_TIMEOUT_MS = 240_000;

/** Facts that mean refreshing Analytics would give the assistant more, or newer, to go on. */
const NEEDS_REFRESH: ReadonlySet<string> = new Set(['channel-none', 'channel-stale', 'compare-unpulled', 'compare-missing']);

export interface AssistantDeps {
  db: Database.Database;
  videoStats(): Pulled<VideoStat[]> | null;
  emit(event: AssistantEvent): void;
  now?(): Date;
  fetch?: typeof fetch;
  /** Stands in for Ollama in tests. */
  chat?(request: ChatRequest): Promise<AiResult<ChatAnswer>>;
}

export class AssistantService {
  private current: { id: string; controller: AbortController } | null = null;

  constructor(private readonly deps: AssistantDeps) {}

  /** Starts answering under the panel's id, and returns at once; the answer arrives as events. */
  ask(id: string, scope: AssistantScope, question: string, history: readonly AssistantTurn[]): void {
    this.current?.controller.abort();
    const controller = new AbortController();
    this.current = { id, controller };
    void this.answer(id, controller, scope, question, history).finally(() => {
      if (this.current?.id === id) this.current = null;
    });
  }

  stop(id: string): void {
    if (this.current?.id === id) this.current.controller.abort();
  }

  async warm(): Promise<void> {
    const { settings } = readSettings(this.deps.db);
    const model = await resolveModel(settings.ai_host, this.preferredModel(), this.deps.fetch);
    if (model.ok) await warmModel(settings.ai_host, model.value.name, this.deps.fetch);
  }

  private preferredModel(): string {
    const { settings } = readSettings(this.deps.db);
    return settings.assistant_model !== '' ? settings.assistant_model : settings.ai_model;
  }

  private async answer(
    id: string,
    controller: AbortController,
    scope: AssistantScope,
    question: string,
    history: readonly AssistantTurn[]
  ): Promise<void> {
    const { emit } = this.deps;
    const gathered = gatherFacts({ db: this.deps.db, videoStats: this.deps.videoStats, now: this.deps.now?.() ?? new Date() }, scope);
    if (gathered === null) {
      emit({ requestId: id, type: 'error', code: 'not_found', reason: 'That video is no longer in the queue' });
      return;
    }
    const { settings } = readSettings(this.deps.db);
    const model = await resolveModel(settings.ai_host, this.preferredModel(), this.deps.fetch);
    if (!model.ok) {
      emit({ requestId: id, type: 'error', code: model.code, reason: model.reason });
      return;
    }

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, ASSISTANT_TIMEOUT_MS);
    const chat = this.deps.chat ?? streamChat;
    const result = await chat({
      host: settings.ai_host,
      model: model.value.name,
      thinking: model.value.thinking,
      messages: buildAssistantMessages({ scope, channelName: gathered.channelName, facts: gathered.facts, history, question }),
      signal: controller.signal,
      onText: (text) => emit({ requestId: id, type: 'text', text: streamingProse(text) }),
      fetch: this.deps.fetch
    }).finally(() => clearTimeout(timer));

    if (!result.ok) {
      emit({ requestId: id, type: 'error', code: result.code, reason: result.reason });
      return;
    }
    if (timedOut && result.value.text.trim() === '') {
      emit({ requestId: id, type: 'error', code: 'timeout', reason: 'The model took too long to answer' });
      return;
    }

    const reply = parseReply(result.value.text, scope);
    const sources = [...gathered.facts.map((fact) => fact.text), ...history.map((turn) => turn.text), question];
    emit({
      requestId: id,
      type: 'done',
      prose: reply.prose,
      changes: reply.changes,
      unsupportedNumbers: unsupportedNumbers(reply.prose, sources),
      basedOn: gathered.basedOn,
      ownCalculations: gathered.facts.some((fact) => fact.derived),
      needsRefresh: gathered.facts.some((fact) => NEEDS_REFRESH.has(fact.id)),
      finished: result.value.finished && !controller.signal.aborted
    });
  }
}
