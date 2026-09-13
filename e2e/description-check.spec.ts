// The description checker in the real app: problems found as they are typed, fixed in one click,
// undone in one more — and in Review, where the box saves when it loses focus, a fix that is saved.
import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import * as path from 'path';
import { goTo, launch } from './fixtures';

const read = <T>(userData: string, sql: string): T | undefined => {
  const db = new Database(path.join(userData, 'shortstack.db'), { readonly: true });
  try {
    return db.prepare(sql).get() as T | undefined;
  } finally {
    db.close();
  }
};

const storedWords = (userData: string): string[] | null => {
  const row = read<{ value: string }>(userData, "SELECT value FROM settings WHERE key = 'spell_words'");
  return row === undefined ? null : (JSON.parse(row.value) as string[]);
};

const storedDescription = (userData: string): string | null =>
  read<{ description: string }>(userData, 'SELECT description FROM queue WHERE id = 1')?.description ?? null;

const TYPED =
  'i think this is teh best clip,right ?\n\n#blackops3zombies, #codzombies, #blackops3zombies ##shorts #tiktok #funnymoemnts #pack-a-punch';

test('finds the problems in a description, fixes them in one click, and undoes it in another', async () => {
  const harness = await launch([{ filename: 'clip.mov' }]);
  try {
    await goTo(harness.page, '#/video/1');
    const box = harness.page.getByLabel('Description', { exact: true });
    await box.fill(TYPED);

    const check = harness.page.getByRole('region', { name: 'Description check' });
    // The dictionary loads the first time it is needed, so wait until spelling is part of the answer.
    await expect(check.getByText('Spelling', { exact: true })).toBeVisible();
    await expect(check.getByText('Hashtags', { exact: true })).toBeVisible();
    await expect(check.getByText('Grammar', { exact: true })).toBeVisible();

    await check.getByRole('button', { name: /Fix all/ }).click();
    await expect(box).toHaveValue('I think this is the best clip, right?\n\n#blackops3zombies #codzombies #shorts #funnymoments #packapunch');
    await expect(check.getByText('Nothing to fix')).toBeVisible();

    await check.getByRole('button', { name: 'Undo' }).click();
    await expect(box).toHaveValue(TYPED);
  } finally {
    await harness.close();
  }
});

test('a name added to the dictionary stops being flagged, and is remembered', async () => {
  const harness = await launch([{ filename: 'clip.mov' }]);
  try {
    await goTo(harness.page, '#/video/1');
    await harness.page.getByLabel('Description', { exact: true }).fill('Big thanks to Drphuckass for the clip');

    const check = harness.page.getByRole('region', { name: 'Description check' });
    await expect(check.locator('mark', { hasText: 'Drphuckass' })).toBeVisible();
    // A capitalised word mid-sentence is probably a name, so Fix all has nothing it may change.
    await expect(check.getByRole('button', { name: 'Fix all', exact: true })).toBeDisabled();

    await check.getByRole('button', { name: 'Add to dictionary' }).click();
    await expect.poll(() => storedWords(harness.userData)).toEqual(['Drphuckass']);
    await expect(check.getByText('Nothing to fix')).toBeVisible();
  } finally {
    await harness.close();
  }
});

// Review saves the description when the box loses focus. Clicking Fix all used to take that focus, so
// the box's save and the fix's save raced and the fix was refused as out of date.
test('in Review, a fix made straight after typing is saved', async () => {
  const harness = await launch([{ filename: 'clip.mov' }]);
  try {
    await goTo(harness.page, '#/review');
    const box = harness.page.getByLabel('Description', { exact: true });
    await box.fill('#shorts #shorts');

    const check = harness.page.getByRole('region', { name: 'Description check' });
    await check.getByRole('button', { name: /Fix all/ }).click();
    await expect(box).toHaveValue('#shorts');
    await expect.poll(() => storedDescription(harness.userData)).toBe('#shorts');
  } finally {
    await harness.close();
  }
});
