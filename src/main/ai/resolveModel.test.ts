import { describe, expect, it } from 'vitest';
import { resolveModel } from './resolveModel';

const HOST = 'http://127.0.0.1:11434';
const TAGS = {
  models: [
    { name: 'qwen3-vl:8b', capabilities: ['completion', 'vision', 'thinking'] },
    { name: 'llama3.2:latest', capabilities: ['completion'] }
  ]
};
const serving = (body: unknown): typeof fetch => (async () => new Response(JSON.stringify(body))) as unknown as typeof fetch;
const down = (async () => {
  throw new Error('connect ECONNREFUSED');
}) as unknown as typeof fetch;

describe('which model the assistant asks', () => {
  it('finds the preferred model by name, with or without its tag', async () => {
    expect(await resolveModel(HOST, 'llama3.2', serving(TAGS))).toEqual({ ok: true, value: { name: 'llama3.2:latest', thinking: false } });
  });

  it('knows a model that thinks before answering', async () => {
    expect(await resolveModel(HOST, 'qwen3-vl:8b', serving(TAGS))).toEqual({ ok: true, value: { name: 'qwen3-vl:8b', thinking: true } });
  });

  it('takes the first installed model when none is preferred', async () => {
    expect(await resolveModel(HOST, '', serving(TAGS))).toEqual({ ok: true, value: { name: 'qwen3-vl:8b', thinking: true } });
  });

  it('passes on a model Ollama does not list, for Ollama to refuse by name', async () => {
    expect(await resolveModel(HOST, 'mistral', serving(TAGS))).toEqual({ ok: true, value: { name: 'mistral', thinking: false } });
  });

  it('says Ollama is not running when nothing is preferred and it cannot be reached', async () => {
    const result = await resolveModel(HOST, '', down);
    expect(result.ok ? null : result.code).toBe('not_running');
  });
});
