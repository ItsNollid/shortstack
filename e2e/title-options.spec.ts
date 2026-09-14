// A title of each kind is offered, and the kind of the one used is remembered until the title is rewritten,
// so Analytics can later say which kind works on this channel.
import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import * as http from 'http';
import * as path from 'path';
import { goTo, launch } from './fixtures';

const REPLY = {
  titles: [
    { angle: 'reaction', title: 'He really said goodnight' },
    { angle: 'play', title: 'Zombies take the lobby' },
    { angle: 'joke', title: 'Bedtime is not optional' }
  ],
  topics: ['lobby', 'bedtime'],
  tags: ['bo3 zombies', 'cod zombies', 'zombies lobby', 'black ops 3', 'funny zombies', 'bo3 lobby', 'cod lobby', 'zombies clip', 'gaming clip', 'zombies bedtime']
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

const stored = (userData: string): { title: string; title_angle: string | null } => {
  const db = new Database(path.join(userData, 'shortstack.db'), { readonly: true });
  const row = db.prepare('SELECT title, title_angle FROM queue WHERE id = 1').get() as { title: string; title_angle: string | null };
  db.close();
  return row;
};

test('a title of each kind is offered, and the kind of the one used is remembered until the title is rewritten', async () => {
  const ollama = await fakeOllama();
  const harness = await launch([{ filename: 'clip.mov' }], { ai_host: ollama.host, ai_model: 'llama3.2:latest' });
  try {
    await goTo(harness.page, '#/video/1');
    const panel = harness.page.getByRole('region', { name: 'Suggested details' });
    await expect(panel.getByRole('button', { name: 'Suggest' })).toBeEnabled({ timeout: 10_000 });
    await panel.getByRole('button', { name: 'Suggest' }).click();

    const play = panel.getByRole('group', { name: 'Title · The play' });
    await expect(play).toContainText('Zombies take the lobby', { timeout: 15_000 });
    await expect(panel.getByRole('group', { name: 'Title · The reaction' })).toContainText('He really said goodnight');
    await expect(panel.getByRole('group', { name: 'Title · The joke' })).toContainText('Bedtime is not optional');

    await play.getByRole('button', { name: 'Use this' }).click();
    const title = harness.page.getByRole('textbox', { name: 'Title' });
    await expect(title).toHaveValue('Zombies take the lobby');
    await harness.page.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => stored(harness.userData).title_angle).toBe('play');

    // A small edit keeps the kind.
    await title.fill('Zombies take the whole lobby');
    await harness.page.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => stored(harness.userData).title).toBe('Zombies take the whole lobby');
    expect(stored(harness.userData).title_angle).toBe('play');

    // Written over, it is a title of the person's own, of no recorded kind.
    await title.fill('Goodnight from the campfire crew');
    await harness.page.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => stored(harness.userData).title_angle).toBeNull();
  } finally {
    await harness.close();
    await ollama.close();
  }
});
