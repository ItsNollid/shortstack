import * as http from 'http';
import { afterEach, describe, expect, it } from 'vitest';
import { promptFor, generateMetadata, listModels } from './ollamaClient';

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
  it('lists what is installed', async () => {
    const host = await startOllama(() => ({ status: 200, body: { models: [{ name: 'llama3.2:latest' }, { name: 'qwen2.5' }] } }));
    await expect(listModels({ host })).resolves.toEqual({ ok: true, value: ['llama3.2:latest', 'qwen2.5'] });
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
