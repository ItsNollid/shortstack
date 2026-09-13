// Turning what Ollama says into something a person can act on.
//
// The error that prompted this said only "Ollama replied 500". What Ollama had actually said was
// "unknown model architecture: 'mllama'" — the model was installed, correctly named, and simply
// cannot be run by that version of Ollama. Nobody could have worked that out from a status code.
import type { AiFailureCode } from './ollamaClient';

export interface Failure {
  code: AiFailureCode;
  reason: string;
}

/** Pulls Ollama's own message out of its JSON error body, if there is one in there. */
export function ollamaErrorText(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    return typeof parsed.error === 'string' && parsed.error.trim() !== '' ? parsed.error.trim() : null;
  } catch {
    return null;
  }
}

/** The first line, which is the useful one; the rest is usually the same sentence repeated. */
const firstLine = (text: string): string => (text.split('\n')[0] as string).trim();

export function classifyFailure(status: number, body: string, model: string): Failure {
  const error = ollamaErrorText(body);
  const lower = (error ?? body).toLowerCase();

  if (status === 404 || lower.includes('not found, try pulling it')) {
    return { code: 'model_missing', reason: `Ollama does not have the model "${model}" downloaded` };
  }

  // Ollama moved model loading to llama.cpp, which does not carry every architecture its own engine
  // did. A model in this state is installed and unusable, and only a different model fixes it.
  if (lower.includes('unknown model architecture') || lower.includes('unsupported architecture')) {
    return {
      code: 'model_unsupported',
      reason: `This version of Ollama cannot run "${model}". It is installed, but the architecture is not one Ollama can load any more. Choose a different model.`
    };
  }

  if (lower.includes('requires more system memory') || lower.includes('out of memory') || lower.includes('not enough memory')) {
    return { code: 'out_of_memory', reason: `"${model}" needs more memory than this computer has free. A smaller model will work.` };
  }

  if (error !== null) return { code: 'error', reason: `Ollama could not run "${model}": ${firstLine(error)}` };
  return { code: 'error', reason: `Ollama replied ${status}` };
}
