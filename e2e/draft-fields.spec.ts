// Choosing which details automatic drafting writes, in the real Settings screen.
import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import * as path from 'path';
import { goTo, launch } from './fixtures';

const storedFields = (userData: string): string[] | null => {
  const db = new Database(path.join(userData, 'shortstack.db'), { readonly: true });
  const row = db.prepare("SELECT value FROM settings WHERE key = 'ai_auto_draft_fields'").get() as { value: string } | undefined;
  db.close();
  return row === undefined ? null : (JSON.parse(row.value) as string[]);
};

test('choosing which details are drafted automatically', async () => {
  const harness = await launch([{ filename: 'clip.mov' }], { ai_model: 'qwen3-vl:8b', ai_auto_draft: 'true' });
  try {
    await goTo(harness.page, '#/settings');
    const title = harness.page.getByRole('checkbox', { name: 'Title' });
    const description = harness.page.getByRole('checkbox', { name: 'Description' });
    const tags = harness.page.getByRole('checkbox', { name: 'Tags' });

    // All three to begin with, which is what drafting did before there was a choice.
    for (const box of [title, description, tags]) await expect(box).toBeChecked();

    await title.click();
    await expect(title).not.toBeChecked();
    await expect.poll(() => storedFields(harness.userData)).toEqual(['description', 'tags']);

    await tags.click();
    await expect(tags).not.toBeChecked();
    await expect.poll(() => storedFields(harness.userData)).toEqual(['description']);

    // The last one cannot be unticked: drafting nothing at all is what the switch is for.
    await expect(description).toBeChecked();
    await expect(description).toBeDisabled();

    // Ticking one back works, and keeps the stored order.
    await title.click();
    await expect(title).toBeChecked();
    await expect.poll(() => storedFields(harness.userData)).toEqual(['title', 'description']);
  } finally {
    await harness.close();
  }
});

test('the choices only appear while automatic drafting is on', async () => {
  const harness = await launch([{ filename: 'clip.mov' }], { ai_model: 'qwen3-vl:8b' });
  try {
    await goTo(harness.page, '#/settings');
    await expect(harness.page.getByText('Suggestions from a local model')).toBeVisible();
    await expect(harness.page.getByRole('checkbox', { name: 'Title' })).toHaveCount(0);
  } finally {
    await harness.close();
  }
});
