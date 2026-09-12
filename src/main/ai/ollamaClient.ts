// Talks to a local Ollama daemon. Every failure has its own code so the UI can say what to do
// (start Ollama, pull a model, try again) instead of failing silently the way the old build did.
import { extractJson, sanitizeSuggestion, type MetadataSuggestion } from './metadataSuggestion';

export type AiFailureCode = 'not_running' | 'no_models' | 'model_missing' | 'timeout' | 'bad_output' | 'error';

export type AiResult<T> = { ok: true; value: T } | { ok: false; code: AiFailureCode; reason: string };

export interface OllamaDeps {
  host: string;
  fetch?: typeof fetch;
  statusTimeoutMs?: number;
  generateTimeoutMs?: number;
}

export interface GenerateInput {
  filename: string;
  model: string;
  channelName?: string | null;
  defaultTags?: readonly string[];
}

const REQUEST_JSON =
  'Reply with only a JSON object containing "title" (under 100 characters), "description" and "tags" (an array of short strings). No other text.';

export function buildPrompt(input: GenerateInput): string {
  const context = [
    `The video file is named "${input.filename}".`,
    input.channelName ? `It will be posted on the YouTube channel "${input.channelName}".` : null,
    input.defaultTags && input.defaultTags.length > 0 ? `Tags usually used on this channel: ${input.defaultTags.join(', ')}.` : null,
    'Write metadata for it as a YouTube Short.',
    REQUEST_JSON
  ].filter((line): line is string => line !== null);
  return context.join(' ');
}

async function withTimeout<T>(timeoutMs: number, run: (signal: AbortSignal) => Promise<T>): Promise<T | 'timeout'> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await run(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) return 'timeout';
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

const unreachable = (error: unknown): AiResult<never> => ({
  ok: false,
  code: 'not_running',
  reason: `Ollama is not answering: ${error instanceof Error ? error.message : String(error)}`
});

/** Lists installed models, which is also how the app tells whether Ollama is running at all. */
export async function listModels(deps: OllamaDeps): Promise<AiResult<string[]>> {
  const doFetch = deps.fetch ?? fetch;
  try {
    const response = await withTimeout(deps.statusTimeoutMs ?? 2000, (signal) =>
      doFetch(`${deps.host}/api/tags`, { signal })
    );
    if (response === 'timeout') return { ok: false, code: 'not_running', reason: 'Ollama did not answer in time' };
    if (!response.ok) return { ok: false, code: 'error', reason: `Ollama replied ${response.status}` };

    const parsed = JSON.parse(await response.text()) as { models?: Array<{ name?: string }> };
    const models = (parsed.models ?? []).map((model) => model.name).filter((name): name is string => typeof name === 'string');
    return models.length === 0
      ? { ok: false, code: 'no_models', reason: 'Ollama is running but has no models downloaded yet' }
      : { ok: true, value: models };
  } catch (error) {
    return unreachable(error);
  }
}

export async function generateMetadata(input: GenerateInput, deps: OllamaDeps): Promise<AiResult<MetadataSuggestion>> {
  const doFetch = deps.fetch ?? fetch;
  try {
    const response = await withTimeout(deps.generateTimeoutMs ?? 60_000, (signal) =>
      doFetch(`${deps.host}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({ model: input.model, prompt: buildPrompt(input), stream: false, format: 'json' })
      })
    );
    if (response === 'timeout') return { ok: false, code: 'timeout', reason: 'The model took too long to answer' };

    const body = await response.text();
    if (response.status === 404) {
      return { ok: false, code: 'model_missing', reason: `Ollama does not have the model "${input.model}" downloaded` };
    }
    if (!response.ok) return { ok: false, code: 'error', reason: `Ollama replied ${response.status}` };

    const envelope = JSON.parse(body) as { response?: unknown };
    if (typeof envelope.response !== 'string') {
      return { ok: false, code: 'bad_output', reason: 'Ollama returned an unexpected response' };
    }
    const suggestion = sanitizeSuggestion(extractJson(envelope.response));
    return suggestion === null
      ? { ok: false, code: 'bad_output', reason: 'The model did not return usable title, description or tags' }
      : { ok: true, value: suggestion };
  } catch (error) {
    return unreachable(error);
  }
}
