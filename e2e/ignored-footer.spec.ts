// A footer saved before the hashtag rule existed: shown instead of silently ignored, put back, cleaned up and saved.
import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import * as path from 'path';
import { goTo, launch } from './fixtures';

/** The footer stored on the channel's real settings, word for word. */
const REAL_FOOTER =
  'Subscribe\n\n#funnycontent #funny #funnymoments #viral #shorts #funnyshorts #funnycomedyshorts #funny #funnyvideo #ytshorts ##shorts #short #comedyshorts #viralcomedyshorts #youtubeshorts #fun #funnymoments #funny #funnyvideos #funnyfails #btsfunnymoments #repofunnymoments #funnymoment #funnymemes #funnytiktoks #funnyshorts #viralshorts #shorts #shortsviral #viral #short #viralshort #youtubeshorts #trendingshorts #shortsviralkaisekare #shortscreator #ytshorts #tiktok #viraltiktok #tiktokviral #viral #viralshorts #shortsviral #howtogoviraltiktok #tiktokdance #tiktoktrending #tradangtiktok';

const storedFooter = (userData: string): string => {
  const db = new Database(path.join(userData, 'shortstack.db'), { readonly: true });
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'format_description_footer'").get() as { value: string } | undefined;
    return row?.value ?? '';
  } finally {
    db.close();
  }
};

test('a footer that no longer passes the rules is shown, put back, cleaned up and saved', async () => {
  const harness = await launch([], { format_description_footer: REAL_FOOTER });
  try {
    const page = harness.page;
    await goTo(page, '#/settings');
    await expect(page.getByText('Your saved footer is not being used')).toBeVisible();

    await page.getByRole('button', { name: 'Put it back in the box' }).click();
    const box = page.getByLabel('Under every description', { exact: true });
    await expect(box).toHaveValue(REAL_FOOTER);

    const check = page.getByRole('region', { name: 'Description check' });
    await check.getByRole('button', { name: /Fix all/ }).click();

    await expect.poll(() => storedFooter(harness.userData)).not.toBe(REAL_FOOTER);
    const saved = storedFooter(harness.userData);
    const tags = saved.match(/#+[\p{L}\p{N}_]+/gu) ?? [];
    expect(saved.startsWith('Subscribe')).toBe(true);
    expect(tags.length).toBeLessThanOrEqual(40);
    expect(new Set(tags.map((tag) => tag.toLowerCase())).size).toBe(tags.length);
    expect(tags.some((tag) => tag.toLowerCase().includes('tiktok'))).toBe(false);
    await expect(page.getByText('Your saved footer is not being used')).toBeHidden();
  } finally {
    await harness.close();
  }
});
