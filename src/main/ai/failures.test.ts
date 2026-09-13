import { describe, expect, it } from 'vitest';
import { classifyFailure, ollamaErrorText } from './failures';

// Captured verbatim from Ollama 0.30.8 on a machine with llama3.2-vision installed. The user saw
// "Ollama replied 500" and had no way to know the model simply could not be loaded.
const MLLAMA_500 = JSON.stringify({
  error:
    "llama-server process has terminated: exit status 1: error loading model: unknown model architecture: 'mllama'\nerror loading model: unknown model architecture: 'mllama'"
});

describe('classifyFailure', () => {
  it('explains a model Ollama can no longer load, and says to pick another', () => {
    const failure = classifyFailure(500, MLLAMA_500, 'llama3.2-vision');
    expect(failure.code).toBe('model_unsupported');
    expect(failure.reason).toContain('llama3.2-vision');
    expect(failure.reason).toMatch(/cannot run/i);
    expect(failure.reason).toMatch(/different model/i);
  });

  it('still reports a model that was never downloaded', () => {
    expect(classifyFailure(404, JSON.stringify({ error: "model 'mistral' not found" }), 'mistral').code).toBe('model_missing');
    // Ollama has also answered 500 for this, with the answer in the body rather than the status.
    expect(classifyFailure(500, JSON.stringify({ error: 'model not found, try pulling it first' }), 'mistral').code).toBe(
      'model_missing'
    );
  });

  it('names running out of memory as its own thing', () => {
    const body = JSON.stringify({ error: 'model requires more system memory (9.1 GiB) than is available (5.2 GiB)' });
    const failure = classifyFailure(500, body, 'qwen3-vl:8b');
    expect(failure.code).toBe('out_of_memory');
    expect(failure.reason).toMatch(/smaller model/i);
  });

  it('passes an unfamiliar message through rather than swallowing it', () => {
    const failure = classifyFailure(500, JSON.stringify({ error: 'something entirely new\nand a second line' }), 'llava');
    expect(failure.code).toBe('error');
    expect(failure.reason).toContain('something entirely new');
    // One line: the rest is usually the same sentence again.
    expect(failure.reason).not.toContain('second line');
  });

  it('falls back to the status when there is nothing to read', () => {
    expect(classifyFailure(503, 'not json at all', 'llava').reason).toBe('Ollama replied 503');
  });
});

describe('ollamaErrorText', () => {
  it('reads the error field, and nothing else', () => {
    expect(ollamaErrorText('{"error":"  boom  "}')).toBe('boom');
    expect(ollamaErrorText('{"error":""}')).toBeNull();
    expect(ollamaErrorText('{"response":"fine"}')).toBeNull();
    expect(ollamaErrorText('<html>')).toBeNull();
  });
});
