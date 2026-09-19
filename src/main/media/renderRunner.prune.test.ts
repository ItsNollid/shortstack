import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { RENDER_KEEP_MS, pruneRenders } from './renderRunner';

const NOW = new Date('2026-09-18T12:00:00.000Z');

/** A renders folder with each file aged as asked. */
async function folder(files: Record<string, number>): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'shortstack-renders-'));
  for (const [name, ageMs] of Object.entries(files)) {
    const each = path.join(dir, name);
    await fs.writeFile(each, 'x');
    const at = new Date(NOW.getTime() - ageMs);
    await fs.utimes(each, at, at);
  }
  return dir;
}

describe('the copies made for TikTok and Instagram', () => {
  it('drops a copy nothing has wanted for a month, and keeps a recent one', async () => {
    const dir = await folder({
      '1.mp4': RENDER_KEEP_MS + 60_000,
      '1.json': RENDER_KEEP_MS + 60_000,
      '2.mp4': RENDER_KEEP_MS - 60_000,
      '2.json': RENDER_KEEP_MS - 60_000
    });
    expect(await pruneRenders(dir, NOW)).toBe(2);
    expect((await fs.readdir(dir)).sort()).toEqual(['2.json', '2.mp4']);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('leaves anything that is not one of its own files, however old', async () => {
    const dir = await folder({ 'notes.txt': RENDER_KEEP_MS * 12, '3.mp4.part': RENDER_KEEP_MS * 12 });
    expect(await pruneRenders(dir, NOW)).toBe(0);
    expect((await fs.readdir(dir)).sort()).toEqual(['3.mp4.part', 'notes.txt']);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('has nothing to do before the folder exists', async () => {
    expect(await pruneRenders(path.join(os.tmpdir(), 'shortstack-renders-none-here'), NOW)).toBe(0);
  });
});
