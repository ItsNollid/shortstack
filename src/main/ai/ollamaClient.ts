// Talks to a local Ollama daemon. Every failure has its own code so the UI can say what to do
// (start Ollama, pull a model, try again) instead of failing silently the way the old build did.
import type { PastUpload } from '../../shared/pastUploads';
import { extractJson, sanitizeSuggestion, type MetadataSuggestion } from './metadataSuggestion';
import { isVisionModel, visionFrom, type AiModel } from '../../shared/aiModels';
import { classifyFailure } from './failures';
import { buildPrompt, type VideoFacts } from './prompt';

export type AiFailureCode =
  | 'not_running'
  | 'no_models'
  | 'model_missing'
  | 'model_unsupported'
  | 'out_of_memory'
  | 'timeout'
  | 'bad_output'
  | 'error';

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
  /** Base64 image frames. Only sent to a model that can read them. */
  frames?: readonly string[];
  /** What Ollama said about this model. Falls back to the name when the caller does not know. */
  vision?: boolean;
}

/** Frames are only worth sending to a model that can read them; the rest ignore or choke on them. */
export function framesFor(input: GenerateInput): string[] {
  const canSee = input.vision ?? isVisionModel(input.model);
  return canSee ? [...(input.frames ?? [])] : [];
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
export async function listModels(deps: OllamaDeps): Promise<AiResult<AiModel[]>> {
  const doFetch = deps.fetch ?? fetch;
  try {
    const response = await withTimeout(deps.statusTimeoutMs ?? 2000, (signal) =>
      doFetch(`${deps.host}/api/tags`, { signal })
    );
    if (response === 'timeout') return { ok: false, code: 'not_running', reason: 'Ollama did not answer in time' };
    if (!response.ok) return { ok: false, code: 'error', reason: `Ollama replied ${response.status}` };

    const parsed = JSON.parse(await response.text()) as { models?: Array<{ name?: unknown; capabilities?: unknown }> };
    const models = (parsed.models ?? [])
      .filter((model): model is { name: string; capabilities?: unknown } => typeof model.name === 'string')
      .map((model) => ({ name: model.name, vision: visionFrom(model.capabilities, model.name) }));
    return models.length === 0
      ? { ok: false, code: 'no_models', reason: 'Ollama is running but has no models downloaded yet' }
      : { ok: true, value: models };
  } catch (error) {
    return unreachable(error);
  }
}

/**
 * Loads a model and asks it for one word. Enough to surface everything that goes wrong at load time
 * — a missing model, an architecture Ollama cannot run, a machine without the memory for it — which
 * is otherwise only discovered when someone presses Suggest on a real video and gets a number.
 */
export async function testModel(model: string, deps: OllamaDeps): Promise<AiResult<null>> {
  const doFetch = deps.fetch ?? fetch;
  try {
    const response = await withTimeout(deps.generateTimeoutMs ?? 120_000, (signal) =>
      doFetch(`${deps.host}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        // Loading a model off a cold disk is the slow part, not the answer, so ask for almost nothing.
        body: JSON.stringify({ model, prompt: 'Reply with the single word: ready', stream: false, options: { num_predict: 8 } })
      })
    );
    if (response === 'timeout') {
      return { ok: false, code: 'timeout', reason: 'The model did not finish loading in time. A smaller one will start faster.' };
    }

    const body = await response.text();
    return response.ok ? { ok: true, value: null } : { ok: false, ...classifyFailure(response.status, body, model) };
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
    if (!response.ok) return { ok: false, ...classifyFailure(response.status, body, input.model) };

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
