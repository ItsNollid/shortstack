// The long video a Short was cut from, set on one video and offered, link and all, for the next.
import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import * as path from 'path';
import { goTo, launch } from './fixtures';

const storedSource = (userData: string, videoId: number): { source_title: string | null; source_url: string | null } => {
  const db = new Database(path.join(userData, 'shortstack.db'), { readonly: true });
  try {
    return db.prepare('SELECT source_title, source_url FROM videos WHERE id = ?').get(videoId) as {
      source_title: string | null;
      source_url: string | null;
    };
  } finally {
    db.close();
  }
};

const KINO = { source_title: 'Round 50 attempt on Kino', source_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' };

test('the long video is kept on the Short, and the next one cut from it is offered it with its link', async () => {
  const harness = await launch([{ filename: 'first.mov' }, { filename: 'second.mov' }]);
  try {
    const page = harness.page;
    await goTo(page, '#/video/1');
    await page.getByLabel('From long video', { exact: true }).fill('Round 50 attempt on Kino');
    const link = page.getByLabel('Its YouTube link', { exact: true });
    await link.fill('https://youtu.be/dQw4w9WgXcQ');
    await link.blur();
    await expect.poll(() => storedSource(harness.userData, 1)).toEqual(KINO);

    await goTo(page, '#/video/2');
    const title = page.getByLabel('From long video', { exact: true });
    await expect(title).toHaveValue('');
    await title.fill('Round 50 attempt on Kino');
    await expect(page.getByLabel('Its YouTube link', { exact: true })).toHaveValue(KINO.source_url);
    await title.blur();
    await expect.poll(() => storedSource(harness.userData, 2)).toEqual(KINO);
  } finally {
    await harness.close();
  }
});
