import * as http from 'http';
import { afterEach, describe, expect, it } from 'vitest';
import { framesFor, promptFor, generateMetadata, listModels } from './ollamaClient';

type Route = (req: { method: string; path: string; body: string }) => { status: number; body: unknown; delayMs?: number };

const servers: Array<{ close(): Promise<void> }> = [];

async function startOllama(route: Route): Promise<string> {
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const result = route({ method: req.method ?? '', path: req.url ?? '', body: Buffer.concat(chunks).toString('utf8') });
      const send = () => {
        res.writeHead(result.status, { 'content-type': 'application/json' });
        res.end(typeof result.body === 'string' ? result.body : JSON.stringify(result.body));
      };
      if (result.delayMs === undefined) send();
      else setTimeout(send, result.delayMs).unref();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push({
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      })
  });
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}

afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
});

describe('listModels', () => {
  it('lists what is installed, and what each one can do', async () => {
    const host = await startOllama(() => ({
      status: 200,
      body: {
        models: [
          { name: 'llama3.2:latest', capabilities: ['completion', 'tools'] },
          // Exactly what this machine's Ollama reports for qwen3-vl:8b.
          { name: 'qwen3-vl:8b', capabilities: ['vision', 'completion', 'tools', 'thinking'] }
        ]
      }
    }));
    await expect(listModels({ host })).resolves.toEqual({
      ok: true,
      value: [
        { name: 'llama3.2:latest', vision: false, thinking: false },
        { name: 'qwen3-vl:8b', vision: true, thinking: true }
      ]
    });
  });

  // Older daemons answer without the field. Guessing from the name beats deciding nothing can see.
  it('falls back to the model name when capabilities are not reported', async () => {
    const host = await startOllama(() => ({ status: 200, body: { models: [{ name: 'llava:13b' }, { name: 'mistral' }] } }));
    await expect(listModels({ host })).resolves.toEqual({
      ok: true,
      value: [
        { name: 'llava:13b', vision: true, thinking: false },
        { name: 'mistral', vision: false, thinking: false }
      ]
    });
  });

  it('separates "no models downloaded" from "not running"', async () => {
    const empty = await startOllama(() => ({ status: 200, body: { models: [] } }));
    await expect(listModels({ host: empty })).resolves.toMatchObject({ ok: false, code: 'no_models' });

    // Nothing listening: this is the state on a machine where Ollama is installed but stopped.
    await expect(listModels({ host: 'http://127.0.0.1:1' })).resolves.toMatchObject({ ok: false, code: 'not_running' });
  });

  it('treats a hung daemon as not running rather than hanging the app', async () => {
    const host = await startOllama(() => ({ status: 200, body: { models: [] }, delayMs: 500 }));
    await expect(listModels({ host, statusTimeoutMs: 20 })).resolves.toMatchObject({ ok: false, code: 'not_running' });
  });
});

describe('generateMetadata', () => {
  const input = { model: 'llama3.2', video: { filename: 'PETER GRIFFIN IN CALL OF DUTY.mov', durationSeconds: null, width: null, height: null } };

  it('asks for the filename and strict JSON', () => {
    const prompt = promptFor({ ...input, channelName: "Peter's Clips" });
    expect(prompt).toContain('PETER GRIFFIN IN CALL OF DUTY.mov');
    expect(prompt).toContain("Peter's Clips");
    expect(prompt).toContain('JSON');
  });

  it('returns a sanitized suggestion', async () => {
    const host = await startOllama(() => ({
      status: 200,
      body: { response: JSON.stringify({ title: 'Peter in CoD', description: 'A clip', tags: ['#gaming', 'gaming'] }) }
    }));
    await expect(generateMetadata(input, { host })).resolves.toEqual({
      ok: true,
      value: { title: 'Peter in CoD', description: 'A clip', tags: ['gaming'] }
    });
  });

  it('sends frames only to a model that Ollama says can read them', async () => {
    const bodies: string[] = [];
    const host = await startOllama((req) => {
      bodies.push(req.body);
      return { status: 200, body: { response: '{"title":"t"}' } };
    });
    const frames = ['ZmFrZQ=='];

    // The name says text-only; Ollama says otherwise, and Ollama is the one that has to read them.
    await generateMetadata({ ...input, frames, vision: true }, { host });
    await generateMetadata({ ...input, frames, vision: false }, { host });
    await generateMetadata({ ...input, frames }, { host });

    expect(bodies.map((body) => JSON.parse(body).images)).toEqual([frames, [], []]);
  });

  it('tells a thinking model not to, and leaves the others alone', async () => {
    const bodies: string[] = [];
    const host = await startOllama((req) => {
      bodies.push(req.body);
      return { status: 200, body: { response: '{"title":"t"}' } };
    });

    await generateMetadata({ ...input, thinking: true }, { host });
    await generateMetadata({ ...input, thinking: false }, { host });
    await generateMetadata(input, { host });

    // Measured: qwen3-vl:8b left to think took 84 seconds on one frame and timed out at 60.
    expect(bodies.map((body) => JSON.parse(body).think)).toEqual([false, undefined, undefined]);
  });

  // Ollama 0.30.8 answering for qwen3-vl:8b with format json: the JSON is in "thinking" and
  // "response" is an empty string. Reading only "response" called a working model broken.
  it('finds the answer when a model puts it in "thinking" instead of "response"', async () => {
    const host = await startOllama(() => ({
      status: 200,
      body: { response: '', thinking: '{"title":"Round 100","description":"#bo3","tags":["cod zombies"]}' }
    }));
    await expect(generateMetadata(input, { host })).resolves.toMatchObject({
      ok: true,
      value: { title: 'Round 100' }
    });
  });

  it('prefers a real response over anything in thinking', async () => {
    const host = await startOllama(() => ({
      status: 200,
      body: { response: '{"title":"From response"}', thinking: '{"title":"From thinking"}' }
    }));
    await expect(generateMetadata(input, { host })).resolves.toMatchObject({ ok: true, value: { title: 'From response' } });
  });

  it('sends the request Ollama expects', async () => {
    let sent = '';
    const host = await startOllama((req) => {
      sent = req.body;
      return { status: 200, body: { response: '{"title":"t"}' } };
    });
    await generateMetadata(input, { host });
    expect(JSON.parse(sent)).toMatchObject({ model: 'llama3.2', stream: false, format: 'json' });
  });

  it('reports a model that is not downloaded, which is this machine right now', async () => {
    const host = await startOllama(() => ({ status: 404, body: { error: "model 'llama3.2' not found" } }));
    await expect(generateMetadata(input, { host })).resolves.toMatchObject({ ok: false, code: 'model_missing' });
  });

  it('reports a model that answers with prose instead of JSON', async () => {
    const host = await startOllama(() => ({ status: 200, body: { response: 'I think a good title would be nice!' } }));
    await expect(generateMetadata(input, { host })).resolves.toMatchObject({ ok: false, code: 'bad_output' });
  });

  it('gives up on a model that takes too long', async () => {
    const host = await startOllama(() => ({ status: 200, body: { response: '{}' }, delayMs: 500 }));
    await expect(generateMetadata(input, { host, generateTimeoutMs: 20 })).resolves.toMatchObject({ ok: false, code: 'timeout' });
  });

  it('never throws, whatever the daemon does', async () => {
    const host = await startOllama(() => ({ status: 500, body: 'kaboom' }));
    await expect(generateMetadata(input, { host })).resolves.toMatchObject({ ok: false, code: 'error' });
    await expect(generateMetadata(input, { host: 'http://127.0.0.1:1' })).resolves.toMatchObject({ ok: false, code: 'not_running' });
  });
});

describe('how many frames are worth sending', () => {
  const threeFrames = ['a', 'b', 'c'];
  const base = { model: 'qwen3-vl:8b', video: { filename: 'clip.mov', durationSeconds: null, width: null, height: null } };

  // Measured warm on qwen3-vl:8b: one frame 3s, two 29s, three 29s — and the extra frames made the
  // answer no better, the model naming a different wrong game each time.
  it('sends one by default, however many are available', () => {
    expect(framesFor({ ...base, vision: true, frames: threeFrames })).toEqual(['a']);
  });

  it('sends more only when a caller asks for them', () => {
    expect(framesFor({ ...base, vision: true, frames: threeFrames, maxFrames: 3 })).toEqual(threeFrames);
  });

  it('still sends none at all to a model that cannot read them', () => {
    expect(framesFor({ ...base, vision: false, frames: threeFrames, maxFrames: 3 })).toEqual([]);
  });
});
