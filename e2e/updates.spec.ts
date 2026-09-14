// A development build knows it is behind its own source, and says so with a way to act on it.
import { expect, test } from '@playwright/test';
import { CHANGELOG, sortedChangelog } from '../src/shared/changelog';
import { goTo, launch } from './fixtures';

test.describe('updates', () => {
  test('settings shows the channel, the build and the release notes', async () => {
    const harness = await launch([{ filename: 'clip.mov' }]);
    try {
      await goTo(harness.page, '#/settings');
      await expect(harness.page.getByRole('heading', { name: 'Updates' })).toBeVisible();
      await expect(harness.page.getByText(/rebuilds rather than downloads/)).toBeVisible();
      await expect(harness.page.getByText(/This build:/)).toBeVisible();
      // The newest release note from the bundled changelog, whichever release that is by now.
      await expect(harness.page.getByText(sortedChangelog(CHANGELOG)[0]?.headline ?? '')).toBeVisible();
      await expect(harness.page.getByRole('button', { name: /check now/i })).toBeVisible();
    } finally {
      await harness.close();
    }
  });

  test("shows what's new after an update, and only once", async () => {
    // Seeded as though this profile last ran an older version.
    const harness = await launch([{ filename: 'clip.mov' }], { last_seen_version: '1.0.0' });
    try {
      await expect(harness.page.getByText(/What’s new/)).toBeVisible({ timeout: 15_000 });
      await expect(harness.page.getByText(/drafts titles, descriptions and tags/)).toBeVisible();

      await harness.page.getByRole('button', { name: /got it/i }).click();
      await expect(harness.page.getByText(/What’s new/)).toHaveCount(0);
    } finally {
      await harness.close();
    }
  });

  test('says nothing about updates on a first run', async () => {
    const harness = await launch([{ filename: 'clip.mov' }]);
    try {
      await goTo(harness.page, '#/queue');
      await harness.page.waitForTimeout(1500);
      await expect(harness.page.getByText(/What’s new/)).toHaveCount(0);
    } finally {
      await harness.close();
    }
  });
});
