// What the model sees in a video: the stills are described one at a time by a stand-in for Ollama,
// and the cover and the verdict on the first second come out of ShortStack, not the model.
import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import * as http from 'http';
import * as path from 'path';
import { goTo, launch } from './fixtures';

const ANSWERS = [
  { scene: 'gameplay', appeal: 4, what: 'a creeper sneaks up' },
  { scene: 'gameplay', appeal: 5, what: 'a creeper explodes' },
  { scene: 'menu', appeal: 2, what: 'the pause menu' },
  { scene: 'loading', appeal: 1, what: 'a loading bar' },
  { scene: 'lobby', appeal: 1, what: 'players wait to start' }
];

async function fakeOllama(): Promise<{ host: string; images: number[]; close(): Promise<void> }> {
  const images: number[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      if (req.url === '/api/tags') {
        res.end(JSON.stringify({ models: [{ name: 'qwen3-vl:8b', capabilities: ['vision', 'completion', 'thinking'] }] }));
        return;
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { images?: string[] };
      images.push(body.images?.length ?? 0);
      res.end(JSON.stringify({ response: JSON.stringify(ANSWERS[Math.min(images.length, ANSWERS.length) - 1]) }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    host: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    images,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      })
  };
}

test('the model looks at each still, and ShortStack picks the cover and checks the opening', async () => {
  const ollama = await fakeOllama();
  // Approved, in assisted mode, so the Studio steps are on screen too.
  const harness = await launch([{ filename: 'clip.mov', state: 'approved' }], {
    ai_host: ollama.host,
    ai_model: 'qwen3-vl:8b',
    upload_method: 'assisted'
  });
  try {
    // Stills as the background pass would save them. Only the JPEG marker is checked, so these stand in.
    const saved = await harness.page.evaluate(async () => {
      const jpeg = new Uint8Array([0xff, 0xd8, 0xff, ...new Array(32).fill(0x20)]);
      const api = (window as unknown as { api: { framesSave: (...args: unknown[]) => Promise<{ ok: boolean }> } }).api;
      return api.framesSave(1, [jpeg, jpeg, jpeg], { times: [2, 5, 8], opening: [jpeg, jpeg], openingTimes: [0.25, 1], duration: 10 });
    });
    expect(saved.ok).toBe(true);

    await goTo(harness.page, '#/video/1');
    // No cover step until something has been looked at.
    await expect(harness.page.getByRole('heading', { name: 'Upload it in YouTube Studio' })).toBeVisible();
    await expect(harness.page.getByText('Choose the cover')).toHaveCount(0);

    const panel = harness.page.getByRole('region', { name: 'What the model sees' });
    await expect(panel.getByRole('button', { name: 'Look at the video' })).toBeEnabled({ timeout: 10_000 });
    await panel.getByRole('button', { name: 'Look at the video' }).click();

    await expect(panel.getByText('Nothing happens in the first second')).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByText('The frame at 0:05 — a creeper explodes')).toBeVisible();
    await expect(panel.getByText('0:00 · Loading screen')).toBeVisible();
    await expect(panel.getByText('0:08 · Menu')).toBeVisible();
    // One still per question, every time.
    expect(ollama.images).toEqual([1, 1, 1, 1, 1]);

    // The Studio steps pick up the same cover, with the moment to choose.
    await expect(harness.page.getByText('Choose the cover')).toBeVisible();
    await expect(harness.page.getByText(/choose the moment at 0:05 — a creeper explodes/)).toBeVisible();

    const db = new Database(path.join(harness.userData, 'shortstack.db'), { readonly: true });
    const row = db.prepare('SELECT stills FROM video_readings WHERE video_id = 1').get() as { stills: string };
    db.close();
    expect(JSON.parse(row.stills)).toHaveLength(5);

    // Kept: coming back shows what was seen without asking the model again.
    await goTo(harness.page, '#/queue');
    await goTo(harness.page, '#/video/1');
    await expect(panel.getByText('The frame at 0:05 — a creeper explodes')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Look again' })).toBeVisible();
    expect(ollama.images).toHaveLength(5);
  } finally {
    await harness.close();
    await ollama.close();
  }
});
