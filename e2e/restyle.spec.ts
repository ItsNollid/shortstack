// Applying the house style to a video written before the rule was switched on, from Settings.
import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import * as path from 'path';
import { goTo, launch } from './fixtures';

const storedTitle = (userData: string): string => {
  const db = new Database(path.join(userData, 'shortstack.db'), { readonly: true });
  try {
    return (db.prepare('SELECT title FROM queue WHERE id = 1').get() as { title: string }).title;
  } finally {
    db.close();
  }
};

test('a waiting video is brought into line with the house style after the change is shown', async () => {
  const harness = await launch([{ filename: 'does being a zombie hurt.mov' }], { format_title_case: 'upper' });
  try {
    const before = storedTitle(harness.userData);
    expect(before).not.toBe(before.toUpperCase());

    const page = harness.page;
    await goTo(page, '#/settings');
    await expect(page.getByText('1 waiting video does not match this house style yet', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Apply to waiting videos…' }).click();

    const dialog = page.getByRole('dialog', { name: 'Apply house style to waiting videos' });
    await expect(dialog.getByText(before.toUpperCase(), { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Apply to 1' }).click();

    await expect.poll(() => storedTitle(harness.userData)).toBe(before.toUpperCase());
    await expect(page.getByText('House style applied to 1 waiting video.')).toBeVisible();
  } finally {
    await harness.close();
  }
});
