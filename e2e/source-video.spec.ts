// The long video a Short was cut from: named for now while it is not up, then linked, which links the
// whole batch. The test app never talks to YouTube, so a pasted link on its own cannot be named here.
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

const NAME = 'Round 50 attempt on Kino';
const LINK = 'https://youtu.be/EfaSgECW4CY?si=2qmO9qvxR5ijR4P-';
const URL = 'https://www.youtube.com/watch?v=EfaSgECW4CY';

test('Shorts named after a long video that is not up yet are all linked once one of them is', async () => {
  const harness = await launch([{ filename: 'first.mov' }, { filename: 'second.mov' }]);
  try {
    const page = harness.page;

    for (const id of [1, 2]) {
      await goTo(page, `#/video/${id}`);
      await page.getByRole('button', { name: 'Not on YouTube yet? Name it for now' }).click();
      const name = page.getByLabel('Name for now', { exact: true });
      await name.fill(NAME);
      await name.blur();
      await expect.poll(() => storedSource(harness.userData, id)).toEqual({ source_title: NAME, source_url: null });
    }

    await goTo(page, '#/video/1');
    const link = page.getByLabel('Long video on YouTube', { exact: true });
    await link.fill(LINK);
    await link.blur();
    await expect.poll(() => storedSource(harness.userData, 1)).toEqual({ source_title: NAME, source_url: URL });
    await expect.poll(() => storedSource(harness.userData, 2)).toEqual({ source_title: NAME, source_url: URL });
  } finally {
    await harness.close();
  }
});

test('a pasted link with no name, which cannot be looked up, asks for a name instead of failing silently', async () => {
  const harness = await launch([{ filename: 'first.mov' }]);
  try {
    const page = harness.page;
    await goTo(page, '#/video/1');
    const link = page.getByLabel('Long video on YouTube', { exact: true });
    await link.fill(LINK);
    await link.blur();

    await expect(page.getByText('Name it yourself for now', { exact: false })).toBeVisible();
    const name = page.getByLabel('Name for now', { exact: true });
    await name.fill(NAME);
    await name.blur();
    await expect.poll(() => storedSource(harness.userData, 1)).toEqual({ source_title: NAME, source_url: URL });
  } finally {
    await harness.close();
  }
});
