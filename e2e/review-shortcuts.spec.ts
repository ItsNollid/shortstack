// The Review screen's single-key shortcuts listen on the window. A native modal dialog traps focus but
// not key events, so with a dialog open these used to act on the video behind it: "r" rejected it and
// the arrows moved the card away while the dialog was still up for the previous one.
import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import * as path from 'path';
import { goTo, launch } from './fixtures';

test('review shortcuts do nothing while a dialog is open', async () => {
  const harness = await launch([{ filename: 'first.mov' }, { filename: 'second.mov' }]);
  try {
    await goTo(harness.page, '#/review');
    await harness.page.waitForTimeout(1200);

    // "a" asks for approval, which opens the consent dialog and puts focus inside it.
    await harness.page.keyboard.press('a');
    await expect(harness.page.locator('dialog[open]')).toBeVisible();

    // With the dialog open, these used to reach the Review screen behind it.
    await harness.page.keyboard.press('r');
    await harness.page.keyboard.press('u');
    await harness.page.keyboard.press('ArrowRight');
    await harness.page.waitForTimeout(600);

    const db = new Database(path.join(harness.userData, 'shortstack.db'), { readonly: true });
    const rows = db
      .prepare('SELECT q.state, v.published_before FROM queue q JOIN videos v ON v.id = q.video_id ORDER BY q.id')
      .all() as Array<{ state: string; published_before: number }>;
    db.close();

    expect(rows.map((row) => row.state)).not.toContain('rejected');
    expect(rows.every((row) => row.published_before === 0)).toBe(true);
  } finally {
    await harness.close();
  }
});

test('review shortcuts still work when no dialog is open', async () => {
  const harness = await launch([{ filename: 'first.mov' }, { filename: 'second.mov' }]);
  try {
    await goTo(harness.page, '#/review');
    await harness.page.waitForTimeout(1200);

    await harness.page.keyboard.press('r');
    await harness.page.waitForTimeout(800);

    const db = new Database(path.join(harness.userData, 'shortstack.db'), { readonly: true });
    const states = (db.prepare('SELECT state FROM queue ORDER BY id').all() as Array<{ state: string }>).map((row) => row.state);
    db.close();

    // The guard must not have switched the shortcuts off altogether.
    expect(states).toContain('rejected');
  } finally {
    await harness.close();
  }
});
