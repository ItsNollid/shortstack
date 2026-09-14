// Review has everything the video page has, so a whole folder can be finished there: suggestions beside the fields,
// taken by replacing or by adding to what is already written, saved at once.
import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import * as http from 'http';
import * as path from 'path';
import { goTo, launch } from './fixtures';

const REPLY = {
  titles: [
    { angle: 'reaction', title: 'Supposed to mean you are good?' },
    { angle: 'play', title: '10 YEAR COIN = GOOD PLAYER' },
    { angle: 'joke', title: 'CS2: 10 year coin? You are a legend' }
  ],
  topics: ['dust ii', 'ten year coin'],
  tags: ['counter strike 2', 'cs2 dust ii', 'cs2 10 year coin', 'cs2 competitive', 'cs2 scoreboard', 'cs2 funny', 'cs2 short', 'counter strike', 'cs2 coin', 'cs2 match']
};

async function fakeOllama(): Promise<{ host: string; close(): Promise<void> }> {
  const server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        req.url === '/api/tags'
          ? JSON.stringify({ models: [{ name: 'llama3.2:latest', capabilities: ['completion'] }] })
          : JSON.stringify({ response: JSON.stringify(REPLY) })
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    host: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      })
  };
}

const stored = (userData: string): { description: string; tags: string[]; notify: number } => {
  const db = new Database(path.join(userData, 'shortstack.db'), { readonly: true });
  const row = db.prepare('SELECT description, tags, notify_subscribers FROM queue WHERE id = 1').get() as {
    description: string;
    tags: string;
    notify_subscribers: number;
  };
  db.close();
  return { description: row.description, tags: JSON.parse(row.tags) as string[], notify: row.notify_subscribers };
};

test('review has the suggestions and the rest of the video page, and adds a suggestion to what is written', async () => {
  const ollama = await fakeOllama();
  const harness = await launch([{ filename: '10 Year Coin = Good Player.mp4' }], { ai_host: ollama.host, ai_model: 'llama3.2:latest' });
  try {
    const { page } = harness;
    await page.evaluate(async () => {
      const api = (window as unknown as { api: { queueUpdateMetadata: (...args: unknown[]) => Promise<unknown> } }).api;
      await api.queueUpdateMetadata(1, { description: 'Subscribe\n\n#funny #shorts', tags: ['cs2'] });
    });

    await goTo(page, '#/review');
    const assist = page.getByRole('region', { name: 'Suggested details' });
    await expect(assist.getByRole('button', { name: 'Suggest' })).toBeEnabled({ timeout: 10_000 });
    await assist.getByRole('button', { name: 'Suggest' }).click();

    // What is written stays: the suggested hashtags join the end of it, and none is repeated.
    const description = assist.getByRole('group', { name: 'Description', exact: true });
    await expect(description.getByRole('button', { name: 'Add to end' })).toBeVisible({ timeout: 15_000 });
    await description.getByRole('button', { name: 'Add to end' }).click();
    await expect.poll(() => stored(harness.userData).description).toMatch(/^Subscribe\n\n#funny #shorts #\S+/);
    expect(stored(harness.userData).description.match(/#shorts/gi)).toHaveLength(1);
    await expect(description.getByText(/^Added \d+ hashtags? to the end/)).toBeVisible();

    // Tags added to the start keep the one already there, now last.
    const tags = assist.getByRole('group', { name: 'Tags', exact: true });
    await tags.getByRole('button', { name: 'Add to start' }).click();
    await expect.poll(() => stored(harness.userData).tags.at(-1)).toBe('cs2');
    expect(stored(harness.userData).tags.length).toBeGreaterThan(1);

    // The rest of what the video page offers is here too.
    await expect(page.getByRole('region', { name: 'What the model sees' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Where it goes' })).toBeVisible();
    const notify = page.getByRole('switch', { name: 'Tell subscribers' });
    await notify.click();
    await expect.poll(() => stored(harness.userData).notify).toBe(1);
    await expect(page.getByRole('switch', { name: 'Made for kids' })).toBeVisible();
  } finally {
    await harness.close();
    await ollama.close();
  }
});
