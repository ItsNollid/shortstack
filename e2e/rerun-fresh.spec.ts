// Drafting re-runs afresh is offered only alongside automatic drafting, and is off until chosen: it can
// replace details someone wrote by hand, so it needs saying yes to.
import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import * as path from 'path';
import { goTo, launch } from './fixtures';

const stored = (userData: string): string | null => {
  const db = new Database(path.join(userData, 'shortstack.db'), { readonly: true });
  const row = db.prepare("SELECT value FROM settings WHERE key = 'ai_refresh_reruns'").get() as { value: string } | undefined;
  db.close();
  return row?.value ?? null;
};

test('drafting re-runs afresh is off until chosen, and only offered with automatic drafting', async () => {
  const off = await launch([{ filename: 'clip.mov' }], { ai_model: 'qwen3-vl:8b' });
  try {
    await goTo(off.page, '#/settings');
    await expect(off.page.getByText('Suggestions from a local model')).toBeVisible();
    await expect(off.page.getByRole('switch', { name: 'Draft re-runs afresh' })).toHaveCount(0);
  } finally {
    await off.close();
  }

  const on = await launch([{ filename: 'clip.mov' }], { ai_model: 'qwen3-vl:8b', ai_auto_draft: 'true' });
  try {
    await goTo(on.page, '#/settings');
    const fresh = on.page.getByRole('switch', { name: 'Draft re-runs afresh' });
    await expect(fresh).toBeVisible();
    await expect(fresh).toHaveAttribute('aria-checked', 'false');

    await fresh.click();
    await expect(fresh).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => stored(on.userData)).toBe('true');
  } finally {
    await on.close();
  }
});
