// Asking Ollama a chat question and passing the answer on as it is written. Every other call ShortStack makes
// waits for the whole answer; a person watching a panel should not stare at nothing for twenty seconds.
import type { ChatMessage } from '../../shared/assistant/prompt';
import { classifyFailure } from './failures';
import { unreachable, type AiResult } from './ollamaClient';

export interface ChatRequest {
  host: string;
  model: string;
  /** Whether the model reasons before answering. Told not to, as everywhere else in ShortStack. */
  thinking: boolean;
  messages: readonly ChatMessage[];
  signal: AbortSignal;
  /** Called with the whole answer so far each time more arrives. */
  onText(textSoFar: string): void;
  fetch?: typeof fetch;
}

export interface ChatAnswer {
  text: string;
  /** False when the stream ended, or was stopped, before Ollama said it was done. */
  finished: boolean;
}

/** Splits streamed text into whole lines, keeping a part line for the next piece. */
export function takeLines(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split('\n');
  const rest = parts.pop() ?? '';
  return { lines: parts.map((part) => part.trim()).filter((part) => part !== ''), rest };
}

interface ChatChunk {
  message?: { content?: unknown; thinking?: unknown };
  done?: unknown;
  error?: unknown;
}

export async function streamChat(request: ChatRequest): Promise<AiResult<ChatAnswer>> {
  const doFetch = request.fetch ?? fetch;
  let response: Response;
  try {
    response = await doFetch(`${request.host}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: request.signal,
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        stream: true,
        // As for suggestions: a thinking model left to think takes minutes, and there is nothing here to reason about.
        ...(request.thinking ? { think: false } : {}),
        // Room for the facts and six turns; Ollama's default window cuts the facts off.
        options: { temperature: 0.3, num_ctx: 8192 }
      })
    });
  } catch (error) {
    if (request.signal.aborted) return { ok: true, value: { text: '', finished: false } };
    return unreachable(error);
  }
  if (!response.ok || response.body === null) {
    const body = await response.text().catch(() => '');
    return { ok: false, ...classifyFailure(response.status, body, request.model) };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let thought = '';
  let finished = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { lines, rest } = takeLines(buffer);
      buffer = rest;
      for (const text of lines) {
        let chunk: ChatChunk;
        try {
          chunk = JSON.parse(text) as ChatChunk;
        } catch {
          continue;
        }
        if (typeof chunk.error === 'string') {
          return { ok: false, ...classifyFailure(500, JSON.stringify({ error: chunk.error }), request.model) };
        }
        if (typeof chunk.message?.content === 'string' && chunk.message.content !== '') {
          content += chunk.message.content;
          request.onText(content);
        } else if (typeof chunk.message?.thinking === 'string') {
          thought += chunk.message.thinking;
        }
        if (chunk.done === true) finished = true;
      }
    }
  } catch {
    // Stopped by the person, or the connection dropped: what arrived is kept, marked unfinished.
    return { ok: true, value: { text: content !== '' ? content : thought, finished: false } };
  }
  // Some models answer in the thinking field and leave the content empty, as seen with suggestions.
  return { ok: true, value: { text: content !== '' ? content : thought, finished } };
}

/** Asks Ollama to load the model now, so the first real question does not also pay for a cold start. */
export async function warmModel(host: string, model: string, doFetch: typeof fetch = fetch): Promise<void> {
  await doFetch(`${host}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, keep_alive: '10m' })
  }).catch(() => undefined);
}
