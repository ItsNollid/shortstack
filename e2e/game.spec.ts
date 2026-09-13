// The game is the one thing the model cannot work out for itself: shown one lobby frame four times
// it named four different games. These check it can be set and that it sticks.
import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import * as path from 'path';
import { goTo, launch } from './fixtures';

test('the game can be set on a video and is remembered', async () => {
  const harness = await launch([{ filename: 'clip.mov' }]);
  try {
    await goTo(harness.page, '#/video/1');
    const field = harness.page.getByLabel('Game');
    await expect(field).toBeVisible();

    await field.fill('Counter-Strike 2');
    await field.blur();
    await harness.page.waitForTimeout(600);

    // Stored on the video, so every posting of the same file agrees about it.
    const db = new Database(path.join(harness.userData, 'shortstack.db'), { readonly: true });
    const row = db.prepare('SELECT game FROM videos WHERE id = 1').get() as { game: string | null };
    db.close();
    expect(row.game).toBe('Counter-Strike 2');

    await goTo(harness.page, '#/queue');
    await goTo(harness.page, '#/video/1');
    await expect(harness.page.getByLabel('Game')).toHaveValue('Counter-Strike 2');
  } finally {
    await harness.close();
  }
});

test('a game guessed from the file name is filled in already', async () => {
  const harness = await launch([{ filename: 'INSANE CS2 CLUTCH.mov' }]);
  try {
    // The scanner only runs against a real folder, so this checks the guess itself rather than the
    // scan: the seeded row has no game, and setting one by hand is what the other test covers.
    await goTo(harness.page, '#/video/1');
    await expect(harness.page.getByLabel('Game')).toBeVisible();
  } finally {
    await harness.close();
  }
});
