import type Database from 'better-sqlite3';
import {
  decodeSettings,
  encodeSetting,
  isSettingKey,
  validateSettingChange,
  type AppSettings,
  type SettingKey
} from '../../shared/settings';

export function readSettings(db: Database.Database): { settings: AppSettings; problems: string[] } {
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string | null }>;
  return decodeSettings(rows);
}

export function readSetting<K extends SettingKey>(db: Database.Database, key: K): AppSettings[K] {
  return readSettings(db).settings[key];
}

export type SettingWriteResult = { ok: true; settings: AppSettings } | { ok: false; reason: string };

/** Validates against current settings (some rules span fields), then stores the encoded value. */
export function writeSetting(db: Database.Database, key: string, value: unknown): SettingWriteResult {
  if (!isSettingKey(key)) return { ok: false, reason: `Unknown setting: ${key}` };
  const write = db.transaction((): SettingWriteResult => {
    const { settings } = readSettings(db);
    const problem = validateSettingChange(settings, key, value);
    if (problem !== null) return { ok: false, reason: problem };
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
      key,
      encodeSetting(key, value as AppSettings[SettingKey])
    );
    return { ok: true, settings: { ...settings, [key]: value } as AppSettings };
  });
  return write();
}
