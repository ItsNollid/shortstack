// Fill the calendar, against the real queue: the plan is worked out again here at the moment it is applied, so
// what is written never rests on a preview the queue has since moved past.
import type Database from 'better-sqlite3';
import { planFill, type FillPlan } from '../../shared/fillSchedule';
import type { UploadMethod } from '../../shared/queue';
import type { AppSettings } from '../../shared/settings';
import type { BookingSettings } from '../../shared/slotBooking';
import { applyQueueEvent, getQueueItem, listQueueItems } from '../db/queueRepo';
import { readSettings } from '../db/settingsRepo';

export interface FillContext {
  now: Date;
  uploadMethod: UploadMethod;
}

export const bookingSettingsFrom = (settings: AppSettings): BookingSettings => ({
  uploadTimes: settings.upload_times,
  rotationUploadTimes: settings.rotation_upload_times,
  horizonDays: settings.auto_schedule_days,
  sourceDailyLimit: settings.source_daily_limit
});

export function previewFill(db: Database.Database, includeUnapproved: boolean, now: Date): FillPlan {
  const { settings } = readSettings(db);
  return planFill({
    items: listQueueItems(db),
    settings: bookingSettingsFrom(settings),
    now,
    includeUnapproved
  });
}

export interface FillResult {
  filled: Array<{ id: number; at: string }>;
  /** Videos in the plan the state machine would not give a time to after all, having changed in the meantime. */
  refused: number;
}

export function applyFill(db: Database.Database, includeUnapproved: boolean, ctx: FillContext): FillResult {
  const plan = previewFill(db, includeUnapproved, ctx.now);
  const filled: FillResult['filled'] = [];
  let refused = 0;
  for (const assignment of plan.assignments) {
    const result = applyQueueEvent(db, assignment.id, { type: 'fill_slot', at: assignment.at }, ctx);
    if (result.ok) filled.push({ id: assignment.id, at: assignment.at });
    else refused += 1;
  }
  return { filled, refused };
}

/** Takes back times a fill gave, but only ones still where it put them: a time moved by hand since is the person's. */
export function undoFill(db: Database.Database, entries: ReadonlyArray<{ id: number; at: string }>, ctx: FillContext): number {
  let undone = 0;
  for (const entry of entries) {
    const item = getQueueItem(db, entry.id);
    if (item === undefined || item.scheduled_for === null || item.schedule_source !== 'auto') continue;
    if (Date.parse(item.scheduled_for) !== Date.parse(entry.at)) continue;
    if (applyQueueEvent(db, entry.id, { type: 'unschedule' }, ctx).ok) undone += 1;
  }
  return undone;
}
