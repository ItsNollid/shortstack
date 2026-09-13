// Talks to a local Ollama daemon. Every failure has its own code so the UI can say what to do
// (start Ollama, pull a model, try again) instead of failing silently the way the old build did.
import type { PastUpload } from '../../shared/pastUploads';
import { extractJson, sanitizeSuggestion, type MetadataSuggestion } from './metadataSuggestion';
import { isVisionModel } from '../../shared/aiModels';
import { buildPrompt, type VideoFacts } from './prompt';

export type AiFailureCode = 'not_running' | 'no_models' | 'model_missing' | 'timeout' | 'bad_output' | 'error';

export type AiResult<T> = { ok: true; value: T } | { ok: false; code: AiFailureCode; reason: string };

export interface OllamaDeps {
  host: string;
  fetch?: typeof fetch;
  statusTimeoutMs?: number;
  generateTimeoutMs?: number;
}

export interface GenerateInput {
  model: string;
  video: VideoFacts;
  channelName?: string | null;
  /** Published videos from the same channel, used as examples. */
  examples?: readonly PastUpload[];
  /** Base64 PNG frames. Only sent to a model that can read them. */
  frames?: readonly string[];
}

/** Frames are only worth sending to a model that can read them; the rest ignore or choke on them. */
export function framesFor(input: GenerateInput): string[] {
  return isVisionModel(input.model) ? [...(input.frames ?? [])] : [];
}

export function promptFor(input: GenerateInput): string {
  return buildPrompt({
    video: input.video,
    channelName: input.channelName ?? null,
    examples: input.examples ?? [],
    hasFrames: framesFor(input).length > 0
  });
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
        body: JSON.stringify({
          model: input.model,
          prompt: promptFor(input),
          images: framesFor(input),
          stream: false,
          format: 'json',
          // Low enough to stay on the evidence, not so low it writes the same title every time.
          options: { temperature: 0.4 }
        })
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
