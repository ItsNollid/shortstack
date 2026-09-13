// Talks to a local Ollama daemon. Every failure has its own code so the UI can say what to do
// (start Ollama, pull a model, try again) instead of failing silently the way the old build did.
import type { PastUpload } from '../../shared/pastUploads';
import { extractJson, sanitizeSuggestion, type MetadataSuggestion } from './metadataSuggestion';
import { isVisionModel, thinkingFrom, visionFrom, type AiModel } from '../../shared/aiModels';
import { classifyFailure } from './failures';
import { buildPrompt, type VideoFacts } from './prompt';

/**
 * Long enough for a cold model to come off disk, which is the slow part: qwen3-vl:8b is 6GB and the
 * first request after it unloads pays for all of it. Generating, once loaded, takes seconds.
 */
export const DEFAULT_GENERATE_TIMEOUT_MS = 180_000;

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
  /** Whether it reasons before answering, so it can be told not to. */
  thinking?: boolean;
  /** Overridable, but see METADATA_FRAMES for why more is not better here. */
  maxFrames?: number;
  /** What this channel's numbers say about titles and topics. */
  findings?: readonly { statement: string }[];
}

/**
 * One frame, not the whole strip. Measured on qwen3-vl:8b, warm: one frame took 3 seconds, two took
 * 29, three took 29 — and the extra frames bought nothing, the model naming a different wrong game
 * each time. Ten times the wait for no better answer is not a trade worth making by default.
 *
 * The strip is still kept; picking a thumbnail needs a choice of moments, which this does not.
 */
export const METADATA_FRAMES = 1;

/** Frames are only worth sending to a model that can read them; the rest ignore or choke on them. */
export function framesFor(input: GenerateInput): string[] {
  const canSee = input.vision ?? isVisionModel(input.model);
  return canSee ? [...(input.frames ?? [])].slice(0, input.maxFrames ?? METADATA_FRAMES) : [];
}

export function promptFor(input: GenerateInput): string {
  return buildPrompt({
    video: input.video,
    channelName: input.channelName ?? null,
    examples: input.examples ?? [],
    hasFrames: framesFor(input).length > 0,
    findings: input.findings ?? []
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
      .map((model) => ({
        name: model.name,
        vision: visionFrom(model.capabilities, model.name),
        thinking: thinkingFrom(model.capabilities)
      }));
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
    const response = await withTimeout(deps.generateTimeoutMs ?? DEFAULT_GENERATE_TIMEOUT_MS, (signal) =>
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
          // Measured on qwen3-vl:8b with one frame: thinking took 84 seconds and timed out, not
          // thinking took 3. There is nothing here worth reasoning about at length — the evidence is
          // in front of it. Only sent to a model that reports the capability.
          ...(input.thinking === true ? { think: false } : {}),
          // Low enough to stay on the evidence, not so low it writes the same title every time.
          options: { temperature: 0.4 }
        })
      })
    );
    if (response === 'timeout') return { ok: false, code: 'timeout', reason: 'The model took too long to answer' };

    const body = await response.text();
    if (!response.ok) return { ok: false, ...classifyFailure(response.status, body, input.model) };

    const envelope = JSON.parse(body) as { response?: unknown; thinking?: unknown };
    // qwen3-vl asked for JSON puts the whole answer in "thinking" and leaves "response" empty, so
    // reading only "response" got an empty string and called a working model broken.
    const answer =
      typeof envelope.response === 'string' && envelope.response.trim() !== ''
        ? envelope.response
        : typeof envelope.thinking === 'string'
          ? envelope.thinking
          : null;
    if (answer === null) {
      return { ok: false, code: 'bad_output', reason: 'Ollama returned an unexpected response' };
    }
    const suggestion = sanitizeSuggestion(extractJson(answer));
    return suggestion === null
      ? { ok: false, code: 'bad_output', reason: 'The model did not return usable title, description or tags' }
      : { ok: true, value: suggestion };
  } catch (error) {
    return unreachable(error);
  }
}
