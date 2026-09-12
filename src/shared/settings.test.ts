import { describe, expect, it } from 'vitest';
import {
  DESCRIPTION_MAX_BYTES,
  SETTING_KEYS,
  SETTINGS_SCHEMA,
  decodeSettings,
  defaultSettings,
  encodeSetting,
  renderTitleTemplate,
  tagsCharCount,
  validateSettingChange,
  type AppSettings,
  type SettingKey
} from './settings';

describe('decodeSettings', () => {
  it('reads the values the old build stored', () => {
    const { settings, problems } = decodeSettings([
      { key: 'shorts_folder', value: 'E:\\Youtube\\Rendered\\ShortStack' },
      { key: 'setup_complete', value: 'true' },
      { key: 'scheduler_paused', value: 'true' },
      { key: 'default_tags', value: '["shorts","gaming"]' }
    ]);
    expect(problems).toEqual([]);
    expect(settings).toMatchObject({
      shorts_folder: 'E:\\Youtube\\Rendered\\ShortStack',
      setup_complete: true,
      scheduler_paused: true,
      default_tags: ['shorts', 'gaming']
    });
  });

  it('uses safe defaults for anything not stored', () => {
    const { settings } = decodeSettings([]);
    expect(settings).toMatchObject({
      upload_method: 'assisted',
      default_privacy: 'private',
      auto_approve: false,
      api_audit_confirmed_at: null,
      upload_times: ['09:00', '13:00', '18:00', '22:00']
    });
  });

  it('ignores unknown and legacy keys', () => {
    const { settings, problems } = decodeSettings([
      { key: 'schedule_cron', value: '* * * * *' },
      { key: 'archive_folder', value: 'D:\\old' }
    ]);
    expect(problems).toEqual([]);
    expect(settings).toEqual(defaultSettings());
  });

  it('falls back to defaults and reports unreadable values', () => {
    const { settings, problems } = decodeSettings([
      { key: 'default_tags', value: '{not json' },
      { key: 'auto_retry_max', value: '99' },
      { key: 'upload_times', value: '["9am"]' },
      { key: 'default_privacy', value: 'friends-only' }
    ]);
    expect(settings.default_tags).toEqual([]);
    expect(settings.auto_retry_max).toBe(3);
    expect(settings.upload_times).toEqual(['09:00', '13:00', '18:00', '22:00']);
    expect(settings.default_privacy).toBe('private');
    expect(problems).toHaveLength(4);
  });

  it('never hands out the shared default arrays', () => {
    const first = decodeSettings([]).settings;
    first.upload_times.push('23:00');
    expect(decodeSettings([]).settings.upload_times).toHaveLength(4);
  });

  it('round-trips every default through encode and decode', () => {
    const defaults = defaultSettings();
    const rows = SETTING_KEYS.map((key) => ({ key, value: encodeSetting(key, defaults[key] as never) }));
    expect(decodeSettings(rows)).toEqual({ settings: defaults, problems: [] });
  });
});

describe('field validation', () => {
  const current = defaultSettings();
  const check = (key: SettingKey, value: unknown) => validateSettingChange(current, key, value);

  it('validates upload times', () => {
    expect(check('upload_times', ['09:00', '21:30'])).toBeNull();
    expect(check('upload_times', [])).toMatch(/at least one/);
    expect(check('upload_times', ['9:00'])).toMatch(/24-hour/);
    expect(check('upload_times', ['24:00'])).toMatch(/24-hour/);
    expect(check('upload_times', ['09:00', '09:00'])).toMatch(/different/);
  });

  it('counts tag budget the way YouTube does', () => {
    expect(tagsCharCount([])).toBe(0);
    expect(tagsCharCount(['abc'])).toBe(3);
    expect(tagsCharCount(['abc', 'de'])).toBe(6);
    expect(tagsCharCount(['call of duty'])).toBe(14);
    const tooMany = Array.from({ length: 100 }, (_, i) => `tag${String(i).padStart(2, '0')}`);
    expect(check('default_tags', tooMany)).toMatch(/500 characters/);
    expect(check('default_tags', ['ok', ' '])).toMatch(/empty/);
    expect(check('default_tags', ['<script>'])).toMatch(/< or >/);
  });

  it('limits descriptions by bytes, not characters', () => {
    const emoji = '\u{1F3AE}';
    expect(check('default_description', emoji.repeat(DESCRIPTION_MAX_BYTES / 4))).toBeNull();
    expect(check('default_description', emoji.repeat(DESCRIPTION_MAX_BYTES / 4 + 1))).toMatch(/bytes/);
  });

  it('validates the title template, AI host, retries, and types', () => {
    expect(check('default_title_template', '  ')).toMatch(/empty/);
    expect(check('default_title_template', 'x'.repeat(101))).toMatch(/100 characters/);
    expect(check('ai_host', 'http://127.0.0.1:11434')).toBeNull();
    expect(check('ai_host', 'file:///C:/Windows')).toMatch(/http/);
    expect(check('auto_retry_max', 11)).toMatch(/0 to 10/);
    expect(check('auto_retry_max', 2.5)).toMatch(/whole number/);
    expect(check('close_to_tray', 'true')).toMatch(/on or off/);
    expect(check('default_privacy', 'friends')).toMatch(/one of/);
  });
});

describe('rules spanning several settings', () => {
  it('only allows API uploads after the audit is confirmed', () => {
    const notAudited = defaultSettings();
    expect(validateSettingChange(notAudited, 'upload_method', 'api')).toMatch(/audit/);

    const audited: AppSettings = { ...notAudited, api_audit_confirmed_at: '2026-10-01T10:00:00.000Z' };
    expect(validateSettingChange(audited, 'upload_method', 'api')).toBeNull();
    expect(validateSettingChange({ ...audited, upload_method: 'api' }, 'api_audit_confirmed_at', null)).toMatch(/assisted/);
  });

  it('only allows auto-approve after explicit consent', () => {
    const noConsent = defaultSettings();
    expect(validateSettingChange(noConsent, 'auto_approve', true)).toMatch(/accept/);

    const consented: AppSettings = { ...noConsent, auto_approve_consented_at: '2026-09-12T08:00:00.000Z' };
    expect(validateSettingChange(consented, 'auto_approve', true)).toBeNull();
    expect(validateSettingChange({ ...consented, auto_approve: true }, 'auto_approve_consented_at', null)).toMatch(/Turn off/);
  });
});

describe('renderTitleTemplate', () => {
  it('substitutes the filename without its extension', () => {
    expect(renderTitleTemplate('{filename}', 'PETER GRIFFIN IN CALL OF DUTY.mov')).toBe('PETER GRIFFIN IN CALL OF DUTY');
    expect(renderTitleTemplate('{filename} #shorts', 'clip.final.mp4')).toBe('clip.final #shorts');
  });

  it('trims and clamps to 100 characters', () => {
    expect(renderTitleTemplate('  {filename}  ', 'a.mov')).toBe('a');
    expect([...renderTitleTemplate('{filename}', `${'\u{1F3AE}'.repeat(150)}.mov`)]).toHaveLength(100);
  });
});

describe('schema coverage', () => {
  it('defines a codec for every AppSettings key', () => {
    expect(SETTING_KEYS.sort()).toEqual(Object.keys(SETTINGS_SCHEMA).sort());
    expect(SETTING_KEYS).toHaveLength(Object.keys(defaultSettings()).length);
  });
});
