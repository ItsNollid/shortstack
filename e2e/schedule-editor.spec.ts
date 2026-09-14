// Giving a video a publish time from the video itself, when it is not on YouTube yet.
import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import * as path from 'path';
import { goTo, launch } from './fixtures';

const stored = (userData: string): { scheduled_for: string | null; schedule_source: string | null } => {
  const db = new Database(path.join(userData, 'shortstack.db'), { readonly: true });
  try {
    return db.prepare('SELECT scheduled_for, schedule_source FROM queue WHERE id = 1').get() as {
      scheduled_for: string | null;
      schedule_source: string | null;
    };
  } finally {
    db.close();
  }
};

const pad = (value: number): string => String(value).padStart(2, '0');
const localInput = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

test('a video not on YouTube yet can be given a time, have it changed, and be taken off the schedule', async () => {
  const harness = await launch([{ filename: 'clip.mov', privacy: 'public' }]);
  try {
    const page = harness.page;
    await goTo(page, '#/video/1');
    const schedule = page.getByRole('region', { name: 'Schedule' });

    // One of the next free times, in one click.
    await schedule.getByRole('button', { name: 'Set a time' }).click();
    await schedule.getByRole('button', { name: /^Publish / }).first().click();
    await expect.poll(() => stored(harness.userData).schedule_source).toBe('manual');
    expect(stored(harness.userData).scheduled_for).not.toBeNull();

    // A time typed by hand, two days out.
    const target = new Date();
    target.setDate(target.getDate() + 2);
    target.setHours(10, 30, 0, 0);
    await schedule.getByRole('button', { name: 'Change' }).click();
    await schedule.getByLabel('Or pick a time', { exact: true }).fill(localInput(target));
    await schedule.getByRole('button', { name: 'Save time' }).click();
    await expect.poll(() => stored(harness.userData).scheduled_for).toBe(target.toISOString());

    await schedule.getByRole('button', { name: 'Change' }).click();
    await schedule.getByRole('button', { name: 'Take off the schedule' }).click();
    await expect.poll(() => stored(harness.userData)).toEqual({ scheduled_for: null, schedule_source: 'hold' });
    await expect(schedule.getByText('Kept off the schedule')).toBeVisible();
  } finally {
    await harness.close();
  }
});
