import { describe, expect, it } from 'vitest';
import { streamChat, takeLines, warmModel, type ChatRequest } from './ollamaChat';

const encoder = new TextEncoder();
const streaming = (chunks: string[], status = 200): typeof fetch =>
  (async () =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        }
      }),
      { status }
    )) as unknown as typeof fetch;
const line = (content: string, done = false): string => `${JSON.stringify({ message: { role: 'assistant', content }, done })}\n`;
const request = (over: Partial<ChatRequest> = {}): ChatRequest => ({
  host: 'http://127.0.0.1:11434',
  model: 'llama3.2',
  thinking: false,
  messages: [{ role: 'user', content: 'hi' }],
  signal: new AbortController().signal,
  onText: () => undefined,
  ...over
});

describe('splitting a stream into lines', () => {
  it('keeps a line cut in half for the next piece', () => {
    expect(takeLines('{"a":1}\n{"b":')).toEqual({ lines: ['{"a":1}'], rest: '{"b":' });
  });
});

describe('asking Ollama and passing the answer on as it is written', () => {
  it('passes on the answer as it grows, even when a line arrives in pieces', async () => {
    const second = line(' is fine');
    const seen: string[] = [];
    const result = await streamChat(
      request({ fetch: streaming([line('The title') + second.slice(0, 10), second.slice(10) + line('', true)]), onText: (text) => seen.push(text) })
    );
    expect(result).toEqual({ ok: true, value: { text: 'The title is fine', finished: true } });
    expect(seen).toEqual(['The title', 'The title is fine']);
  });

  it('uses the thinking when a model leaves the answer empty', async () => {
    const thinking = `${JSON.stringify({ message: { role: 'assistant', content: '', thinking: 'Post at six.' }, done: true })}\n`;
    expect(await streamChat(request({ fetch: streaming([thinking]) }))).toEqual({ ok: true, value: { text: 'Post at six.', finished: true } });
  });

  it('reports an error Ollama sends inside the stream', async () => {
    const error = `${JSON.stringify({ error: 'model "x" not found, try pulling it first' })}\n`;
    const result = await streamChat(request({ fetch: streaming([error]) }));
    expect(result.ok ? null : result.code).toBe('model_missing');
  });

  it('reports a refusal by status the way suggestions do', async () => {
    const result = await streamChat(request({ fetch: streaming(['{"error":"model \\"x\\" not found, try pulling it first"}'], 404) }));
    expect(result.ok ? null : result.code).toBe('model_missing');
  });

  it('keeps what arrived when the person stops it', async () => {
    const stopper = new AbortController();
    const fake = (async (_url: string, init: RequestInit) =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(line('Half')));
            init.signal?.addEventListener('abort', () => controller.error(new Error('aborted')));
          }
        })
      )) as unknown as typeof fetch;
    const result = await streamChat(request({ fetch: fake, signal: stopper.signal, onText: () => stopper.abort() }));
    expect(result).toEqual({ ok: true, value: { text: 'Half', finished: false } });
  });

  it('says Ollama is not answering when it cannot be reached', async () => {
    const down = (async () => {
      throw new Error('connect ECONNREFUSED');
    }) as unknown as typeof fetch;
    const result = await streamChat(request({ fetch: down }));
    expect(result.ok ? null : result.code).toBe('not_running');
  });
});

describe('warming the model', () => {
  it('asks Ollama to load it, and never fails loudly', async () => {
    const calls: string[] = [];
    const recording = (async (url: string, init: RequestInit) => {
      calls.push(`${url} ${String(init.body)}`);
      return new Response('{}');
    }) as unknown as typeof fetch;
    await warmModel('http://127.0.0.1:11434', 'llama3.2', recording);
    expect(calls).toEqual(['http://127.0.0.1:11434/api/generate {"model":"llama3.2","keep_alive":"10m"}']);
    const down = (async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;
    await expect(warmModel('http://127.0.0.1:11434', 'llama3.2', down)).resolves.toBeUndefined();
  });
});
