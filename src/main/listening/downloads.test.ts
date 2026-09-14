import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { downloadVerified } from './downloads';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

const BODY = Buffer.alloc(2_500_000, 7);
const SHA = createHash('sha256').update(BODY).digest('hex');

/** Serves the body, a redirect to it, a 404, and a body that stalls halfway. */
async function serve(): Promise<string> {
  const server = http.createServer((req, res) => {
    if (req.url === '/moved') {
      res.writeHead(302, { location: '/model.bin' });
      res.end();
    } else if (req.url === '/model.bin') {
      res.writeHead(200, { 'content-length': String(BODY.length) });
      res.end(BODY);
    } else if (req.url === '/slow.bin') {
      res.writeHead(200, { 'content-length': String(BODY.length) });
      res.write(BODY.subarray(0, 1_200_000));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      })
  );
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}

async function tempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'shortstack-download-'));
  cleanups.push(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

const exists = (file: string): Promise<boolean> =>
  fs.access(file).then(
    () => true,
    () => false
  );

describe('downloading a file the app will run', () => {
  it('keeps it when size and checksum match, following a redirect, and reports progress', async () => {
    const host = await serve();
    const dest = path.join(await tempDir(), 'models', 'model.bin');
    const progress: number[] = [];
    const result = await downloadVerified({ url: `${host}/moved`, bytes: BODY.length, sha256: SHA, dest }, { onProgress: (received) => progress.push(received) });

    expect(result).toEqual({ ok: true, path: dest });
    expect((await fs.readFile(dest)).equals(BODY)).toBe(true);
    expect(await exists(`${dest}.part`)).toBe(false);
    expect(progress[progress.length - 1]).toBe(BODY.length);
    expect(progress.length).toBeGreaterThan(1);
  });

  it('throws away a file that does not match its checksum', async () => {
    const host = await serve();
    const dest = path.join(await tempDir(), 'model.bin');
    const result = await downloadVerified({ url: `${host}/model.bin`, bytes: BODY.length, sha256: '0'.repeat(64), dest });
    expect(result).toMatchObject({ ok: false, code: 'checksum' });
    expect(await exists(dest)).toBe(false);
    expect(await exists(`${dest}.part`)).toBe(false);
  });

  it('stops as soon as more arrives than the file should hold', async () => {
    const host = await serve();
    const dest = path.join(await tempDir(), 'model.bin');
    expect(await downloadVerified({ url: `${host}/model.bin`, bytes: 1_000_000, sha256: SHA, dest })).toMatchObject({ ok: false, code: 'size' });
    expect(await exists(`${dest}.part`)).toBe(false);
  });

  it('says what the server answered when it is not there', async () => {
    const host = await serve();
    const result = await downloadVerified({ url: `${host}/gone.bin`, bytes: 1, sha256: SHA, dest: path.join(await tempDir(), 'gone.bin') });
    expect(result).toMatchObject({ ok: false, code: 'network' });
    if (!result.ok) expect(result.reason).toContain('404');
  });

  it('can be cancelled partway, leaving nothing behind', async () => {
    const host = await serve();
    const dest = path.join(await tempDir(), 'slow.bin');
    const controller = new AbortController();
    const started = downloadVerified(
      { url: `${host}/slow.bin`, bytes: BODY.length, sha256: SHA, dest },
      { signal: controller.signal, onProgress: () => controller.abort() }
    );
    expect(await started).toMatchObject({ ok: false, code: 'cancelled' });
    expect(await exists(`${dest}.part`)).toBe(false);
    expect(await exists(dest)).toBe(false);
  });
});
