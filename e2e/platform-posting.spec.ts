// Posting to TikTok with ShortStack's help: only after approval, with the caption written, the link checked, and
// every step undoable. Nothing is posted anywhere by the app itself.
import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import * as path from 'path';
import { goTo, launch } from './fixtures';

const stored = (userData: string): { state: string; url: string | null } | undefined => {
  const db = new Database(path.join(userData, 'shortstack.db'), { readonly: true });
  const row = db.prepare("SELECT state, url FROM platform_posts WHERE queue_id = 1 AND platform = 'tiktok'").get() as
    | { state: string; url: string | null }
    | undefined;
  db.close();
  return row;
};

const setting = (userData: string, key: string): string | null => {
  const db = new Database(path.join(userData, 'shortstack.db'), { readonly: true });
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  db.close();
  return row?.value ?? null;
};

test('a video also going to TikTok is posted by hand after approval, with the caption written and the link checked', async () => {
  const harness = await launch([{ filename: 'Does being a zombie hurt real bad or feel real good.mov' }]);
  try {
    const { page } = harness;
    await page.evaluate(async () => {
      const api = (window as unknown as { api: { queueUpdateMetadata: (...args: unknown[]) => Promise<unknown> } }).api;
      await api.queueUpdateMetadata(1, { description: '#bo3zombies #zombies #shorts' });
    });

    await goTo(page, '#/video/1');
    await page.getByRole('group', { name: 'Where it goes' }).getByLabel('TikTok').check();

    const panel = page.getByRole('region', { name: 'Post to TikTok' });
    await expect(panel).toBeVisible();
    await expect(panel.getByText(/Approve the video to post it here/)).toBeVisible();

    // Approving says, in so many words, that TikTok is the person's to post.
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/You post it to TikTok yourself/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(dialog).toHaveCount(0);

    // The caption is the title and hashtags, without YouTube's own.
    await expect(panel.getByText(/#bo3zombies #zombies/)).toBeVisible();
    await expect(panel.getByText(/#shorts/)).toHaveCount(0);

    const linkField = panel.getByLabel('TikTok link');
    await linkField.fill('https://www.instagram.com/reel/C9xYz12AbCd/');
    await expect(panel.getByText('That is not a link to a TikTok video')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Mark as posted' })).toBeDisabled();

    await linkField.fill('https://www.tiktok.com/@nollid/video/7412345678901234567?is_from_webapp=1&sender_device=pc');
    await panel.getByRole('button', { name: 'Mark as posted' }).click();
    await expect(panel.getByRole('button', { name: 'Open the post' })).toBeVisible();
    await expect.poll(() => stored(harness.userData)).toEqual({ state: 'posted', url: 'https://www.tiktok.com/@nollid/video/7412345678901234567' });

    await panel.getByRole('button', { name: 'Not posted after all' }).click();
    await expect(panel.getByRole('button', { name: 'Mark as posted' })).toBeVisible();

    await panel.getByRole('button', { name: 'Skip TikTok for this video' }).click();
    await expect(panel.getByText('Not posting this one to TikTok.')).toBeVisible();
    await expect.poll(() => stored(harness.userData)?.state).toBe('skipped');
  } finally {
    await harness.close();
  }
});

test('new videos can be set to go to TikTok and Instagram from Settings', async () => {
  const harness = await launch([{ filename: 'clip.mov' }]);
  try {
    await goTo(harness.page, '#/settings');
    const section = harness.page.locator('#platforms');
    const tiktok = section.getByRole('switch', { name: 'Post new videos to TikTok too' });
    await expect(tiktok).toHaveAttribute('aria-checked', 'false');
    await tiktok.click();
    await expect(tiktok).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => setting(harness.userData, 'post_to_tiktok')).toBe('true');
    await expect(section.getByRole('switch', { name: 'Post new videos to Instagram too' })).toHaveAttribute('aria-checked', 'false');
  } finally {
    await harness.close();
  }
});
