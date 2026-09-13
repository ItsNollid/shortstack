// The list of names drafting must never use, kept from the real Settings screen.
import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import * as path from 'path';
import { goTo, launch } from './fixtures';

const storedNames = (userData: string): string[] | null => {
  const db = new Database(path.join(userData, 'shortstack.db'), { readonly: true });
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'ai_blocked_names'").get() as { value: string } | undefined;
    return row === undefined ? null : (JSON.parse(row.value) as string[]);
  } finally {
    db.close();
  }
};

test('a name added to the list is kept, and can be taken off again', async () => {
  const harness = await launch([{ filename: 'clip.mov' }], { ai_model: 'qwen3-vl:8b' });
  try {
    await goTo(harness.page, '#/settings');
    const input = harness.page.getByLabel('Names never to use', { exact: true });
    await input.fill('Dr Phuckass');
    await input.press('Enter');
    await expect.poll(() => storedNames(harness.userData)).toEqual(['Dr Phuckass']);

    await harness.page.getByRole('button', { name: 'Remove Dr Phuckass' }).click();
    await expect.poll(() => storedNames(harness.userData)).toEqual([]);
  } finally {
    await harness.close();
  }
});
