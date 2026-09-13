// Sending a finished brief to the local model. Separate from draft.ts because the two ask for
// different things: that one describes a video, this one reads findings and says what to do about
// them. What they share is the part that matters — which model, whether it thinks, and where its
// answer actually turns up.
import type Database from 'better-sqlite3';
import { findModel } from '../../shared/aiModels';
import { readSettings } from '../db/settingsRepo';
import { classifyFailure } from './failures';
import { listModels, type AiFailureCode, type AiResult } from './ollamaClient';

export interface AdviseInput {
  db: Database.Database;
  prompt: string;
  fetch?: typeof fetch;
}

/**
 * Longer than a metadata request is allowed. This one runs on a brief the person asked for and is
 * watching a spinner over, and it is asking for reasoning across several findings rather than a
 * title — a cold 6GB model plus a longer answer is not a 60 second job.
 */
const ADVICE_TIMEOUT_MS = 240_000;

export async function adviseWith(input: AdviseInput): Promise<AiResult<unknown>> {
  const { settings } = readSettings(input.db);
  const doFetch = input.fetch ?? fetch;

  const installed = await listModels({ host: settings.ai_host, fetch: doFetch });
  if (!installed.ok && settings.ai_model === '') return installed;

  const available = installed.ok ? installed.value : [];
  const chosen = findModel(available, settings.ai_model) ?? (settings.ai_model === '' ? available[0] : undefined);
  const model = chosen?.name ?? settings.ai_model;
  if (model === '') {
    return { ok: false, code: 'no_models' as AiFailureCode, reason: 'Choose a model in Settings first' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ADVICE_TIMEOUT_MS);
  try {
    const response = await doFetch(`${settings.ai_host}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        prompt: input.prompt,
        stream: false,
        format: 'json',
        // Same reason as everywhere else: a thinking model left to think spends minutes on this.
        ...(chosen?.thinking === true ? { think: false } : {}),
        // Lower than the metadata request. This is meant to follow the findings, not be creative.
        options: { temperature: 0.3 }
      })
    });

    const body = await response.text();
    if (!response.ok) return { ok: false, ...classifyFailure(response.status, body, model) };

    const envelope = JSON.parse(body) as { response?: unknown; thinking?: unknown };
    // Some models put a JSON answer in "thinking" and leave "response" empty.
    const answer =
      typeof envelope.response === 'string' && envelope.response.trim() !== ''
        ? envelope.response
        : typeof envelope.thinking === 'string'
          ? envelope.thinking
          : null;
    if (answer === null) return { ok: false, code: 'bad_output', reason: 'Ollama returned an unexpected response' };

    try {
      return { ok: true, value: JSON.parse(answer) };
    } catch {
      const start = answer.indexOf('{');
      const end = answer.lastIndexOf('}');
      if (start < 0 || end <= start) return { ok: false, code: 'bad_output', reason: 'The model did not return JSON' };
      try {
        return { ok: true, value: JSON.parse(answer.slice(start, end + 1)) };
      } catch {
        return { ok: false, code: 'bad_output', reason: 'The model did not return JSON' };
      }
    }
  } catch (error) {
    if (controller.signal.aborted) {
      return { ok: false, code: 'timeout', reason: 'The model took too long to work through the findings' };
    }
    return { ok: false, code: 'not_running', reason: `Ollama is not answering: ${(error as Error)?.message ?? 'unknown'}` };
  } finally {
    clearTimeout(timer);
  }
}
