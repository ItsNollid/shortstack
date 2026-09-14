// Fill the calendar: one button gives every video without a time one from the daily schedule, shown first,
// approving nothing, and undone in one click.
import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import * as path from 'path';
import { goTo, launch } from './fixtures';

const rows = (
  userData: string
): Array<{
  state: string;
  scheduled_for: string | null;
  schedule_source: string | null;
}> => {
  const db = new Database(path.join(userData, 'shortstack.db'), {
    readonly: true
  });
  const found = db.prepare('SELECT state, scheduled_for, schedule_source FROM queue ORDER BY id').all() as Array<{
    state: string;
    scheduled_for: string | null;
    schedule_source: string | null;
  }>;
  db.close();
  return found;
};

test('filling the calendar shows the times first, gives them without approving, and can be undone', async () => {
  const harness = await launch([{ filename: 'first.mov' }, { filename: 'second.mov' }, { filename: 'third.mov' }]);
  try {
    const { page } = harness;
    await goTo(page, '#/calendar');
    await expect(page.getByText('No time yet')).toBeVisible();

    await page.getByRole('button', { name: 'Fill the calendar' }).click();
    const dialog = page.getByRole('dialog', { name: 'Fill the calendar' });
    await expect(dialog).toBeVisible();

    // None is approved, so the ones waiting for approval are included from the start, and said to be waiting.
    await expect(dialog.getByRole('checkbox')).toBeChecked({ timeout: 10_000 });
    await expect(dialog.getByRole('listitem')).toHaveCount(3);
    await expect(dialog.getByText('Needs approval')).toHaveCount(3);

    await dialog.getByRole('button', { name: 'Give 3 times' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText('Gave 3 videos a time')).toBeVisible();
    await expect(page.getByText('Everything has a time.')).toBeVisible();

    await expect.poll(() => rows(harness.userData).every((row) => row.scheduled_for !== null)).toBe(true);
    // A time is not an approval.
    expect(rows(harness.userData).map((row) => row.state)).toEqual(['pending', 'pending', 'pending']);

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect
      .poll(() => rows(harness.userData).map((row) => [row.scheduled_for, row.schedule_source]))
      .toEqual([
        [null, null],
        [null, null],
        [null, null]
      ]);
    await expect(page.getByText('Everything has a time.')).toHaveCount(0);
  } finally {
    await harness.close();
  }
});
