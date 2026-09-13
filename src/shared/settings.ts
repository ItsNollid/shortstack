// Typed app settings: defaults, decoding of stored strings, and validation of changes.
// Shared so the renderer can validate inline with exactly the rules the main process enforces.
import type { FormattingRules, TitleCase } from './formatting';
import type { InsightGoal } from './insightGoal';
import type { Privacy, UploadMethod } from './queue';

export interface AppSettings {
  setup_complete: boolean;
  legal_accepted_version: string | null;
  /** The app version whose changes have been read. Null on a fresh install. */
  last_seen_version: string | null;
  defaults_reviewed: boolean;
  shorts_folder: string;
  scheduler_paused: boolean;
  upload_method: UploadMethod;
  api_audit_confirmed_at: string | null;
  default_title_template: string;
  default_description: string;
  default_tags: string[];
  default_category_id: string;
  default_privacy: Privacy;
  notify_subscribers: boolean;
  made_for_kids: boolean;
  upload_times: string[];
  /** Rotation re-runs get their own times, so a backlog of them never delays a new video. */
  rotation_upload_times: string[];
  /** How many times a video may be posted in total. 0 switches rotation off. */
  rotation_max_postings: number;
  /** Days that must pass before a video may be posted again. */
  rotation_min_gap_days: number;
  /** How far ahead auto-scheduling books. Keeps the near-term schedule free to change. */
  auto_schedule_days: number;
  auto_approve: boolean;
  auto_approve_consented_at: string | null;
  auto_retry_max: number;
  ai_host: string;
  ai_model: string;
  ai_auto_draft: boolean;

  /** What the channel is being grown for, which decides what "better" means in any comparison. */
  insight_goal: InsightGoal;
  /** How the person works, in their own words, so advice is about what they can change. */
  insight_context: string;
  /** The findings from the last time Analytics was opened, as JSON. Read when writing a title. */
  insight_findings: string;

  /** House style, applied to whatever ends up in a title or description. All of it optional. */
  format_title_case: TitleCase;
  format_title_prefix: string;
  format_title_suffix: string;
  format_description_footer: string;
  format_tidy: boolean;
  /** 0 means no limit. */
  format_max_hashtags: number;
  close_to_tray: boolean;
  close_to_tray_notice_shown: boolean;
  start_with_windows: boolean;
}

export type SettingKey = keyof AppSettings;

export const TITLE_MAX_CHARS = 100;
export const DESCRIPTION_MAX_BYTES = 5000;
export const TAGS_MAX_CHARS = 500;

export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function charCount(text: string): number {
  return [...text].length;
}

/** YouTube's tag budget counts the commas between tags and two quote marks for tags containing spaces. */
export function tagsCharCount(tags: readonly string[]): number {
  if (tags.length === 0) return 0;
  return tags.reduce((sum, tag) => sum + charCount(tag) + (tag.includes(' ') ? 2 : 0), 0) + tags.length - 1;
}

export function renderTitleTemplate(template: string, filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '');
  return [...template.split('{filename}').join(base).trim()].slice(0, TITLE_MAX_CHARS).join('');
}

interface SettingCodec<T> {
  defaultValue: T;
  /** Returns undefined when the stored string can't be read. */
  decode(raw: string): T | undefined;
  encode(value: T): string;
  validate(value: unknown): string | null;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const ANGLE_BRACKETS = /[<>]/;

function bool(defaultValue: boolean): SettingCodec<boolean> {
  return {
    defaultValue,
    decode: (raw) => (raw === 'true' || raw === '1' ? true : raw === 'false' || raw === '0' ? false : undefined),
    encode: (value) => (value ? 'true' : 'false'),
    validate: (value) => (typeof value === 'boolean' ? null : 'Expected on or off')
  };
}

function text(defaultValue: string, check: (value: string) => string | null = () => null): SettingCodec<string> {
  return {
    defaultValue,
    decode: (raw) => (check(raw) === null ? raw : undefined),
    encode: (value) => value,
    validate: (value) => (typeof value === 'string' ? check(value) : 'Expected text')
  };
}

function nullableText(maxChars: number): SettingCodec<string | null> {
  return {
    defaultValue: null,
    decode: (raw) => (raw === '' ? null : charCount(raw) <= maxChars ? raw : undefined),
    encode: (value) => value ?? '',
    validate: (value) =>
      value === null || (typeof value === 'string' && value !== '' && charCount(value) <= maxChars) ? null : 'Expected text or nothing'
  };
}

function isoDateOrNull(): SettingCodec<string | null> {
  const isIso = (value: string) => Number.isFinite(Date.parse(value));
  return {
    defaultValue: null,
    decode: (raw) => (raw === '' ? null : isIso(raw) ? raw : undefined),
    encode: (value) => value ?? '',
    validate: (value) => (value === null || (typeof value === 'string' && isIso(value)) ? null : 'Expected a date or nothing')
  };
}

function oneOf<T extends string>(defaultValue: T, allowed: readonly T[]): SettingCodec<T> {
  const isAllowed = (value: unknown): value is T => typeof value === 'string' && (allowed as readonly string[]).includes(value);
  return {
    defaultValue,
    decode: (raw) => (isAllowed(raw) ? raw : undefined),
    encode: (value) => value,
    validate: (value) => (isAllowed(value) ? null : `Expected one of: ${allowed.join(', ')}`)
  };
}

function integer(defaultValue: number, min: number, max: number): SettingCodec<number> {
  const inRange = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
  return {
    defaultValue,
    decode: (raw) => {
      const parsed = raw.trim() === '' ? NaN : Number(raw);
      return inRange(parsed) ? parsed : undefined;
    },
    encode: (value) => String(value),
    validate: (value) => (inRange(value) ? null : `Expected a whole number from ${min} to ${max}`)
  };
}

function stringList(defaultValue: string[], check: (value: string[]) => string | null): SettingCodec<string[]> {
  const isList = (value: unknown): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === 'string');
  return {
    defaultValue,
    decode: (raw) => {
      try {
        const parsed: unknown = JSON.parse(raw);
        return isList(parsed) && check(parsed) === null ? parsed : undefined;
      } catch {
        return undefined;
      }
    },
    encode: (value) => JSON.stringify(value),
    validate: (value) => (isList(value) ? check(value) : 'Expected a list of text values')
  };
}

function checkTitleTemplate(value: string): string | null {
  if (value.trim() === '') return "The title template can't be empty";
  if (ANGLE_BRACKETS.test(value)) return "Titles can't contain < or >";
  return charCount(value) > TITLE_MAX_CHARS ? `Titles can use at most ${TITLE_MAX_CHARS} characters` : null;
}

function checkDescription(value: string): string | null {
  if (ANGLE_BRACKETS.test(value)) return "Descriptions can't contain < or >";
  return utf8Bytes(value) > DESCRIPTION_MAX_BYTES ? `Descriptions can use at most ${DESCRIPTION_MAX_BYTES} bytes` : null;
}

function checkTags(tags: string[]): string | null {
  if (tags.some((tag) => tag.trim() === '')) return "Tags can't be empty";
  if (tags.some((tag) => ANGLE_BRACKETS.test(tag))) return "Tags can't contain < or >";
  return tagsCharCount(tags) > TAGS_MAX_CHARS ? `Tags can use at most ${TAGS_MAX_CHARS} characters` : null;
}

function checkUploadTimes(times: string[]): string | null {
  if (times.length === 0) return 'Add at least one upload time';
  if (times.length > 12) return 'Use at most 12 upload times';
  if (!times.every((time) => HHMM.test(time))) return 'Use 24-hour times like 09:00';
  return new Set(times).size === times.length ? null : 'Upload times must all be different';
}

function checkRotationTimes(times: string[]): string | null {
  if (times.length > 12) return 'Use at most 12 rotation times';
  if (!times.every((time) => HHMM.test(time))) return 'Use 24-hour times like 15:00';
  return new Set(times).size === times.length ? null : 'Rotation times must all be different';
}

function checkHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? null : 'Use an http:// or https:// address';
  } catch {
    return 'Enter an address like http://127.0.0.1:11434';
  }
}

export const SETTINGS_SCHEMA: { [K in SettingKey]: SettingCodec<AppSettings[K]> } = {
  setup_complete: bool(false),
  legal_accepted_version: nullableText(32),
  last_seen_version: nullableText(32),
  defaults_reviewed: bool(false),
  shorts_folder: text('', (value) => (value.length > 1024 ? 'That folder path is too long' : null)),
  scheduler_paused: bool(false),
  upload_method: oneOf<UploadMethod>('assisted', ['assisted', 'api']),
  api_audit_confirmed_at: isoDateOrNull(),
  default_title_template: text('{filename}', checkTitleTemplate),
  default_description: text('', checkDescription),
  default_tags: stringList([], checkTags),
  default_category_id: text('22', (value) => (/^\d{1,3}$/.test(value) ? null : 'Pick a category')),
  default_privacy: oneOf<Privacy>('private', ['public', 'unlisted', 'private']),
  notify_subscribers: bool(false),
  made_for_kids: bool(false),
  upload_times: stringList(['09:00', '13:00', '18:00', '22:00'], checkUploadTimes),
  rotation_upload_times: stringList(['11:00', '15:00', '20:00'], checkRotationTimes),
  rotation_max_postings: integer(6, 0, 50),
  rotation_min_gap_days: integer(14, 0, 365),
  auto_schedule_days: integer(14, 1, 60),
  auto_approve: bool(false),
  auto_approve_consented_at: isoDateOrNull(),
  auto_retry_max: integer(3, 0, 10),
  ai_host: text('http://127.0.0.1:11434', checkHttpUrl),
  ai_model: text('', (value) => (value.length > 200 ? 'That model name is too long' : null)),
  ai_auto_draft: bool(false),

  insight_goal: oneOf<InsightGoal>('reach_and_subscribers', ['reach_and_subscribers', 'views', 'subscribers', 'watch_time']),
  insight_context: text('', (value) => (value.length > 600 ? 'Keep this to a couple of sentences' : null)),
  insight_findings: text('', (value) => (value.length > 8000 ? 'Too large to keep' : null)),

  format_title_case: oneOf<TitleCase>('as_written', ['as_written', 'upper', 'title']),
  format_title_prefix: text('', (value) => (charCount(value) > 40 ? 'A prefix that long leaves no room for a title' : null)),
  format_title_suffix: text('', (value) => (charCount(value) > 40 ? 'A suffix that long leaves no room for a title' : null)),
  format_description_footer: text('', (value) =>
    utf8Bytes(value) > 2000 ? 'A footer that long leaves no room for a description' : null
  ),
  format_tidy: bool(false),
  format_max_hashtags: integer(0, 0, 60),
  close_to_tray: bool(true),
  close_to_tray_notice_shown: bool(false),
  start_with_windows: bool(false)
};

export const SETTING_KEYS = Object.keys(SETTINGS_SCHEMA) as SettingKey[];

export function isSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTINGS_SCHEMA, key);
}

function codecFor(key: SettingKey): SettingCodec<unknown> {
  return SETTINGS_SCHEMA[key] as SettingCodec<unknown>;
}

function cloneValue<T>(value: T): T {
  return (Array.isArray(value) ? [...value] : value) as T;
}

export function defaultSettings(): AppSettings {
  const settings = {} as Record<SettingKey, unknown>;
  for (const key of SETTING_KEYS) settings[key] = cloneValue(codecFor(key).defaultValue);
  return settings as AppSettings;
}

/** Builds typed settings from stored rows. Unknown keys are ignored; unreadable values fall back to defaults. */
export function decodeSettings(rows: ReadonlyArray<{ key: string; value: string | null }>): {
  settings: AppSettings;
  problems: string[];
} {
  const settings = defaultSettings() as unknown as Record<SettingKey, unknown>;
  const problems: string[] = [];
  for (const row of rows) {
    if (!isSettingKey(row.key) || row.value === null) continue;
    const decoded = codecFor(row.key).decode(row.value);
    if (decoded === undefined) problems.push(`Ignored an unreadable value for ${row.key}`);
    else settings[row.key] = decoded;
  }
  return { settings: settings as unknown as AppSettings, problems };
}

export function encodeSetting<K extends SettingKey>(key: K, value: AppSettings[K]): string {
  return codecFor(key).encode(value);
}

/** Validates a single change against the key's own rules and the rules that span several settings. */
export function validateSettingChange(current: AppSettings, key: SettingKey, value: unknown): string | null {
  const ownProblem = codecFor(key).validate(value);
  if (ownProblem !== null) return ownProblem;

  if (key === 'upload_method' && value === 'api' && current.api_audit_confirmed_at === null) {
    return 'Confirm that your Google Cloud project passed the YouTube API audit first';
  }
  if (key === 'api_audit_confirmed_at' && value === null && current.upload_method === 'api') {
    return 'Switch back to assisted upload first';
  }
  // Drafting needs somewhere to send the request. Without a model it would fail quietly forever.
  if (key === 'ai_auto_draft' && value === true && current.ai_model.trim() === '') {
    return 'Choose a model first';
  }
  if (key === 'auto_approve' && value === true && current.auto_approve_consented_at === null) {
    return 'Review and accept what auto-approve does first';
  }
  if (key === 'auto_approve_consented_at' && value === null && current.auto_approve) {
    return 'Turn off auto-approve first';
  }
  return null;
}

/** The formatting rules as the settings currently describe them. */
export function formattingRules(settings: AppSettings): FormattingRules {
  return {
    titleCase: settings.format_title_case,
    titlePrefix: settings.format_title_prefix,
    titleSuffix: settings.format_title_suffix,
    descriptionFooter: settings.format_description_footer,
    tidy: settings.format_tidy,
    maxHashtags: settings.format_max_hashtags
  };
}
