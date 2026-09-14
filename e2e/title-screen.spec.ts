// A title that promises play, on a clip the model saw none in, is pointed out while it is typed — on the
// video and in Review — and the quote titles this channel mostly uses are left alone.
import { expect, test, type Page } from '@playwright/test';
import * as http from 'http';
import { goTo, launch } from './fixtures';

const LOBBY = { scene: 'lobby', appeal: 3, what: 'players wait by a campfire' };

async function fakeOllama(answer: object): Promise<{ host: string; close(): Promise<void> }> {
  const server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        req.url === '/api/tags'
          ? JSON.stringify({ models: [{ name: 'qwen3-vl:8b', capabilities: ['vision', 'completion', 'thinking'] }] })
          : JSON.stringify({ response: JSON.stringify(answer) })
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

/** Stills as the background pass would save them. Only the JPEG marker is checked, so these stand in. */
async function saveStills(page: Page): Promise<void> {
  const saved = await page.evaluate(async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, ...new Array(32).fill(0x20)]);
    const api = (window as unknown as { api: { framesSave: (...args: unknown[]) => Promise<{ ok: boolean }> } }).api;
    return api.framesSave(1, [jpeg, jpeg, jpeg], { times: [2, 5, 8], opening: [jpeg, jpeg], openingTimes: [0.25, 1], duration: 10 });
  });
  expect(saved.ok).toBe(true);
}

test('a title promising play on a clip that shows none is pointed out as it is typed, on the video and in Review', async () => {
  const ollama = await fakeOllama(LOBBY);
  const harness = await launch([{ filename: 'INSANE CLUTCH.mov' }], { ai_host: ollama.host, ai_model: 'qwen3-vl:8b' });
  try {
    await saveStills(harness.page);
    await goTo(harness.page, '#/video/1');
    const panel = harness.page.getByRole('region', { name: 'What the model sees' });
    await expect(panel.getByRole('button', { name: 'Look at the video' })).toBeEnabled({ timeout: 10_000 });
    // Nothing is said about the title until the model has looked.
    await expect(harness.page.getByText(/The title promises/)).toHaveCount(0);
    await panel.getByRole('button', { name: 'Look at the video' }).click();

    const clutch = harness.page.getByText('The title promises “CLUTCH”');
    await expect(clutch).toBeVisible({ timeout: 15_000 });
    await expect(harness.page.getByText(/shows play, only a lobby/)).toBeVisible();

    // It follows the title as it is typed, before anything is saved.
    const title = harness.page.getByLabel('Title');
    await title.fill('ALRIGHT GUYS IM GOING TO BED');
    await expect(harness.page.getByText(/The title promises/)).toHaveCount(0);
    await title.fill('1v4 clutch');
    await expect(harness.page.getByText('The title promises “1v4”')).toBeVisible();
    await harness.page.getByRole('button', { name: 'Discard' }).click();

    // Review says both too: the title under the title, and the opening in its panel of what the model saw, once.
    await goTo(harness.page, '#/review');
    await expect(harness.page.getByText('The title promises “CLUTCH”')).toBeVisible({ timeout: 10_000 });
    await expect(harness.page.getByText('Nothing happens in the first second')).toBeVisible();
  } finally {
    await harness.close();
    await ollama.close();
  }
});
