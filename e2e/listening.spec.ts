// Listening is off until chosen, downloads nothing on its own, and says plainly what is missing before it can hear.
import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { goTo, launch } from './fixtures';

const stored = (userData: string, key: string): string | null => {
  const db = new Database(path.join(userData, 'shortstack.db'), { readonly: true });
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  db.close();
  return row?.value ?? null;
};

test('listening is off until chosen, lists what can be downloaded, and says what is missing', async () => {
  const harness = await launch([{ filename: 'clip.mov' }]);
  try {
    // Off: the video page stays as it was.
    await goTo(harness.page, '#/video/1');
    await expect(harness.page.getByRole('region', { name: 'Suggested details' })).toBeVisible();
    await expect(harness.page.getByRole('region', { name: 'What was said' })).toHaveCount(0);

    await goTo(harness.page, '#/settings');
    const section = harness.page.locator('#listening');
    await expect(section.getByRole('heading', { name: 'Listening to videos' })).toBeVisible();
    const toggle = section.getByRole('switch', { name: 'Listen to videos when drafting' });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');

    // The sizes are the real downloads', so nobody starts a 675 MB download thinking it is small.
    await expect(section.getByRole('group', { name: 'Processor engine' })).toContainText('8.6 MB', { timeout: 10_000 });
    await expect(section.getByRole('group', { name: 'NVIDIA graphics card engine' })).toContainText('675 MB');
    await expect(section.getByRole('group', { name: 'Small model' })).toContainText('190 MB');
    await expect(section.getByRole('group', { name: 'Large turbo model' })).toContainText('Any language');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => stored(harness.userData, 'listen_enabled')).toBe('true');
    await expect(section.getByText('Download a listening engine first')).toBeVisible();

    // On, but nothing downloaded: the panel says what is missing and where to fix it.
    await goTo(harness.page, '#/video/1');
    const heard = harness.page.getByRole('region', { name: 'What was said' });
    await expect(heard).toBeVisible();
    await expect(heard.getByText(/Download a listening engine first/)).toBeVisible({ timeout: 10_000 });
    await expect(heard.getByRole('link', { name: 'Set up listening in Settings' })).toBeVisible();
    await expect(heard.getByRole('button', { name: 'Listen to the video' })).toBeDisabled();

    // Nothing was downloaded without being asked.
    expect(fs.existsSync(path.join(harness.userData, 'listening', 'engines'))).toBe(false);
    expect(fs.existsSync(path.join(harness.userData, 'listening', 'models'))).toBe(false);
  } finally {
    await harness.close();
  }
});
