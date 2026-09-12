import { describe, expect, it } from 'vitest';
import { readSetting, readSettings, writeSetting } from './settingsRepo';
import { createTestDb } from './testFixtures';

describe('settingsRepo', () => {
  it('returns safe defaults for an empty database', () => {
    const db = createTestDb();
    const { settings, problems } = readSettings(db);
    expect(problems).toEqual([]);
    expect(settings).toMatchObject({
      upload_method: 'assisted',
      default_privacy: 'private',
      scheduler_paused: false,
      auto_approve: false,
      setup_complete: false
    });
  });

  it('reads what the previous build stored', () => {
    const db = createTestDb();
    db.prepare("INSERT INTO settings (key, value) VALUES ('scheduler_paused', 'true'), ('shorts_folder', 'E:\Youtube')").run();
    expect(readSetting(db, 'scheduler_paused')).toBe(true);
    expect(readSetting(db, 'shorts_folder')).toBe('E:\Youtube');
  });

  it('round-trips lists and booleans', () => {
    const db = createTestDb();
    expect(writeSetting(db, 'upload_times', ['08:00', '20:30']).ok).toBe(true);
    expect(writeSetting(db, 'close_to_tray', false).ok).toBe(true);
    expect(readSetting(db, 'upload_times')).toEqual(['08:00', '20:30']);
    expect(readSetting(db, 'close_to_tray')).toBe(false);
  });

  it('refuses unknown keys and invalid values without writing', () => {
    const db = createTestDb();
    expect(writeSetting(db, 'schedule_cron', '* * * * *')).toEqual({ ok: false, reason: expect.stringMatching(/Unknown setting/) });
    expect(writeSetting(db, 'upload_times', ['9am'])).toEqual({ ok: false, reason: expect.stringMatching(/24-hour/) });
    expect(writeSetting(db, 'auto_retry_max', 99)).toEqual({ ok: false, reason: expect.stringMatching(/0 to 10/) });
    expect(db.prepare('SELECT COUNT(*) AS n FROM settings').get()).toEqual({ n: 0 });
  });

  it('keeps API uploads locked behind the audit confirmation', () => {
    const db = createTestDb();
    expect(writeSetting(db, 'upload_method', 'api')).toEqual({ ok: false, reason: expect.stringMatching(/audit/) });

    expect(writeSetting(db, 'api_audit_confirmed_at', '2026-10-01T09:00:00.000Z').ok).toBe(true);
    expect(writeSetting(db, 'upload_method', 'api').ok).toBe(true);
    expect(readSetting(db, 'upload_method')).toBe('api');

    expect(writeSetting(db, 'api_audit_confirmed_at', null)).toEqual({ ok: false, reason: expect.stringMatching(/assisted/) });
  });

  it('keeps auto-approve locked behind consent', () => {
    const db = createTestDb();
    expect(writeSetting(db, 'auto_approve', true)).toEqual({ ok: false, reason: expect.stringMatching(/accept/) });
    expect(writeSetting(db, 'auto_approve_consented_at', '2026-09-12T09:00:00.000Z').ok).toBe(true);
    expect(writeSetting(db, 'auto_approve', true).ok).toBe(true);
    expect(readSetting(db, 'auto_approve')).toBe(true);
  });
});
