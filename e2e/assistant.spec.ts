// The assistant end to end: opened from a video, answering from facts ShortStack wrote, streamed, with a
// suggested title that lands as a draft — and nothing approved.
import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import * as http from 'http';
import * as path from 'path';
import { goTo, launch } from './fixtures';

async function fakeOllama(): Promise<{ host: string; lastChat(): string; close(): Promise<void> }> {
  let chatBody = '';
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));
    req.on('end', () => {
      if (req.url === '/api/tags') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ models: [{ name: 'llama3.2:latest', capabilities: ['completion'] }] }));
        return;
      }
      if (req.url === '/api/chat') {
        chatBody = body;
        res.writeHead(200, { 'content-type': 'application/x-ndjson' });
        const chunks = [
          'The title promises a clutch, ',
          "but the stills don't show one yet.\n",
          'CHANGES: [{"kind":"video_title","value":"Round 50, one bullet left"}]'
        ];
        for (const content of chunks) res.write(`${JSON.stringify({ message: { role: 'assistant', content }, done: false })}\n`);
        res.end(`${JSON.stringify({ message: { role: 'assistant', content: '' }, done: true })}\n`);
        return;
      }
      // The warm-up, and anything else: answered, and ignored.
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    host: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    lastChat: () => chatBody,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      })
  };
}

const row = (userData: string): { title: string; state: string } => {
  const db = new Database(path.join(userData, 'shortstack.db'), { readonly: true });
  const found = db.prepare('SELECT title, state FROM queue WHERE id = 1').get() as { title: string; state: string };
  db.close();
  return found;
};

test('the assistant answers about a video from what ShortStack found, and a suggestion lands as a draft', async () => {
  const ollama = await fakeOllama();
  const harness = await launch([{ filename: 'INSANE CLUTCH.mov' }], {
    ai_host: ollama.host,
    ai_model: 'llama3.2:latest',
    ai_auto_draft: 'false'
  });
  try {
    const { page } = harness;
    await goTo(page, '#/video/1');
    await page.getByRole('button', { name: 'Ask about this video' }).click();

    const panel = page.getByRole('complementary', { name: 'Assistant' });
    await expect(panel).toBeVisible();
    await expect(panel.getByText('About: INSANE CLUTCH')).toBeVisible();
    await panel.getByRole('button', { name: 'Is this title good?' }).click();

    // Twice over: the answer itself, and again in the hidden line screen readers announce once it is finished.
    await expect(panel.getByText('The title promises a clutch').first()).toBeVisible();
    await expect(panel.getByText(/^Based on this video/)).toBeVisible();

    await panel.getByRole('button', { name: 'Use this' }).click();
    await expect.poll(() => row(harness.userData).title).toBe('Round 50, one bullet left');
    // A suggestion taken is a detail changed, never an approval.
    expect(row(harness.userData).state).toBe('pending');

    // What the model was given: the creator's title as quoted words, and the rule against inventing numbers.
    expect(ollama.lastChat()).toContain('\\"INSANE CLUTCH\\"');
    expect(ollama.lastChat()).toContain('Never write a number that is not in the lines above');
  } finally {
    await harness.close();
    await ollama.close();
  }
});
