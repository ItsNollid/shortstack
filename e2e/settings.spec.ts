// The model used to be typed by hand, which is how a model that cannot possibly run ended up
// configured. These assert the list is a list and that the check button is really wired to Ollama.
import { expect, test } from '@playwright/test';
import { goTo, launch } from './fixtures';

test.describe('choosing a model', () => {
  test('offers the installed models rather than a blank box', async () => {
    const harness = await launch([{ filename: 'clip.mov' }]);
    try {
      await goTo(harness.page, '#/settings');

      const select = harness.page.locator('select').filter({ has: harness.page.locator('option') }).first();
      await expect(harness.page.getByText('Suggestions from a local model')).toBeVisible();

      const picker = harness.page.getByLabel('Model', { exact: true });
      await expect(picker).toBeVisible();
      expect(await picker.evaluate((node) => node.tagName)).toBe('SELECT');
      await expect(harness.page.getByRole('button', { name: /check this model/i })).toBeVisible();
      expect(await select.count()).toBeGreaterThan(0);
    } finally {
      await harness.close();
    }
  });

  test('says what went wrong instead of a status code', async () => {
    const harness = await launch([{ filename: 'clip.mov' }], { ai_model: JSON.stringify('made-up-model').slice(1, -1) });
    try {
      await goTo(harness.page, '#/settings');
      await harness.page.getByRole('button', { name: /check this model/i }).click();

      // Whatever the machine running this has installed, "made-up-model" is not it. Either Ollama
      // says so, or Ollama is not running and it says that — never a bare number.
      const banner = harness.page.getByText(/did not run/i);
      await expect(banner).toBeVisible({ timeout: 30_000 });
      await expect(harness.page.getByText(/replied \d\d\d/)).toHaveCount(0);
    } finally {
      await harness.close();
    }
  });
});
