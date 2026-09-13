// Drag and drop is the one thing in this app that unit tests cannot really prove: the rules are
// tested, but whether a chip can actually be picked up and dropped is a property of the running
// window. This drives the real application.
import { expect, test } from '@playwright/test';
import { goTo, launch, type Harness } from './fixtures';

let harness: Harness;
test.afterEach(async () => {
  await harness?.close();
});

test('a public video can be dragged onto a day, and lands on a real time', async () => {
  harness = await launch(
    [{ filename: 'public-clip.mov', privacy: 'public' }],
    { upload_times: JSON.stringify(['09:00', '18:00']) }
  );
  const { page } = harness;
  await goTo(page, '#/calendar');

  const chip = page.locator('aside [draggable="true"]').first();
  await expect(chip).toBeVisible();

  // Tomorrow, so the thirty minute publish lead can never be the reason it fails.
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const day = page.locator(`[data-day="${tomorrow.getFullYear()}-${tomorrow.getMonth()}-${tomorrow.getDate()}"]`);
  await expect(day).toBeVisible();

  await chip.dragTo(day);
  await expect(page.getByText(/publishes/i).first()).toBeVisible({ timeout: 5000 });

  const scheduled = await page.evaluate(async () => {
    const result = await window.api.queueList();
    return result.ok ? result.data[0]?.scheduled_for ?? null : null;
  });
  expect(scheduled).not.toBeNull();
  expect(new Date(scheduled as string).getHours()).toBe(9);
});

test('a private video cannot be dragged, and the screen says why', async () => {
  // This is what was reported as "the calendar does not let me drag anything": every video was
  // private, and only public videos are ever scheduled.
  harness = await launch([{ filename: 'private-clip.mov', privacy: 'private' }]);
  const { page } = harness;
  await goTo(page, '#/calendar');

  const chip = page.locator('aside [class*="chip"]').first();
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute('draggable', 'false');

  // The reason has to be on the screen, not only in the code.
  await expect(page.getByText(/only public videos/i).first()).toBeVisible();
});

test('the queue shows every scanned video', async () => {
  harness = await launch([
    { filename: 'one.mov', privacy: 'public' },
    { filename: 'two.mov', privacy: 'private' }
  ]);
  const { page } = harness;
  await goTo(page, '#/queue');

  // Exact, because the filename contains the title and would match twice.
  await expect(page.getByText('one', { exact: true })).toBeVisible();
  await expect(page.getByText('two', { exact: true })).toBeVisible();
  await expect(page.getByText('one.mov', { exact: true })).toBeVisible();
});

test('nothing is approved without the consent dialog', async () => {
  harness = await launch([{ filename: 'gate.mov', privacy: 'public' }]);
  const { page } = harness;
  await goTo(page, '#/review');

  await page.getByRole('button', { name: /approve/i }).first().click();
  // The dialog names the channel and what will happen; the video must not move until it is accepted.
  await expect(page.getByText(/approve this video/i)).toBeVisible();

  const state = await page.evaluate(async () => {
    const result = await window.api.queueList();
    return result.ok ? result.data[0]?.state : null;
  });
  expect(state).toBe('pending');
});
