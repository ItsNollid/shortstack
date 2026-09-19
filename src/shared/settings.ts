// Typed app settings: defaults, decoding of stored strings, and validation of changes.
// Shared so the renderer can validate inline with exactly the rules the main process enforces.
import { ANALYTICS_REFRESH_MODES, DEFAULT_REFRESH_MINUTES, MAX_REFRESH_MINUTES, MIN_REFRESH_MINUTES, type AnalyticsRefresh } from './analyticsRefresh';
import { checkBlockedNames } from './blockedNames';
import { DRAFT_FIELDS, checkDraftFields, type DraftField } from './draftFields';
import type { FormattingRules, TitleCase } from './formatting';
import type { InsightGoal } from './insightGoal';
import type { Privacy, UploadMethod } from './queue';
import { MODELS } from './listening';

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
  /** Most Shorts from the same long video to book on one day. 0 means no limit. */
  source_daily_limit: number;
  auto_approve: boolean;
  auto_approve_consented_at: string | null;
  auto_retry_max: number;
  ai_host: string;
  ai_model: string;
  ai_auto_draft: boolean;
  /** Which details automatic drafting writes. At least one. */
  ai_auto_draft_fields: DraftField[];
  /** Re-runs drafted afresh, so they do not go out under the same title again. Off unless chosen: it replaces details written by hand. */
  ai_refresh_reruns: boolean;
  /** Listening to what is said in a video before drafting. Off unless chosen: it keeps the processor or graphics card busy for a while. */
  listen_enabled: boolean;
  /** Which engine listens: the graphics card build when it is installed, unless one is chosen. */
  listen_engine: 'auto' | 'cpu' | 'gpu';
  /** A downloaded model, by its id in the list. */
  listen_model: string;
  /** Or a model file already on this computer, which is used instead when set. */
  listen_model_file: string;
  /** New videos go to TikTok too, posted by the person with ShortStack's help. */
  post_to_tiktok: boolean;
  /** New videos go to Instagram too, the same way. */
  post_to_instagram: boolean;
  /** Names drafting must never use: friends' gamertags, mostly. The channel's own name is always kept out. */
  ai_blocked_names: string[];

  /** What the channel is being grown for, which decides what "better" means in any comparison. */
  insight_goal: InsightGoal;
  /** How the person works, in their own words, so advice is about what they can change. */
  insight_context: string;
  /** The findings from the last time Analytics was opened, as JSON. Read when writing a title. */
  insight_findings: string;
  /** The daily YouTube Data API allowance the quota meter measures against. */
  quota_daily_units: number;

  /** House style, applied to whatever ends up in a title or description. All of it optional. */
  format_title_case: TitleCase;
  format_title_prefix: string;
  format_title_suffix: string;
  format_description_footer: string;
  format_tidy: boolean;
  /** 0 means no limit. */
  format_max_hashtags: number;
  /** Words the description checker accepts on top of its dictionary: names, slang, in-jokes. */
  spell_words: string[];
  /** When Analytics asks YouTube again rather than showing the numbers it already pulled. */
  analytics_refresh: AnalyticsRefresh;
  /** How old the numbers may get before they are pulled again, when refreshing on an interval. */
  analytics_refresh_minutes: number;
  close_to_tray: boolean;
  close_to_tray_notice_shown: boolean;
  start_with_windows: boolean;
}

export type SettingKey = keyof AppSettings;

export const TITLE_MAX_CHARS = 100;
export const DESCRIPTION_MAX_BYTES = 5000;
export const TAGS_MAX_CHARS = 500;
/** A footer with more would leave too little of YouTube's 60 for the hashtags each video is built with. */
export const FOOTER_MAX_HASHTAGS = 40;

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

const SPELL_WORD = /^[\p{L}\p{N}][\p{L}\p{N}'’-]*$/u;

function checkSpellWords(words: string[]): string | null {
  if (words.length > 2000) return 'Keep your dictionary to 2,000 words';
  const seen = new Set<string>();
  for (const word of words) {
    if (word.length > 40 || !SPELL_WORD.test(word)) return `“${word.slice(0, 40)}” is not a single word`;
    const key = word.toLowerCase();
    if (seen.has(key)) return `“${word}” is in your dictionary twice`;
    seen.add(key);
  }
  return null;
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

/**
 * The model is given titles, descriptions and findings worked out from YouTube data, and the privacy policy
 * promises all of that stays on this computer. Another machine’s address would quietly break the promise, and
 * YouTube’s policies do not allow its data to reach anyone but the person who authorised it.
 */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '[::1]']);

function checkLocalOllamaUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'Enter an address like http://127.0.0.1:11434';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'Use an http:// or https:// address';
  return LOOPBACK_HOSTS.has(url.hostname) ? null : 'Ollama has to run on this computer: use 127.0.0.1 or localhost';
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
  source_daily_limit: integer(0, 0, 10),
  auto_approve: bool(false),
  auto_approve_consented_at: isoDateOrNull(),
  auto_retry_max: integer(3, 0, 10),
  ai_host: text('http://127.0.0.1:11434', checkLocalOllamaUrl),
  ai_model: text('', (value) => (value.length > 200 ? 'That model name is too long' : null)),
  ai_auto_draft: bool(false),
  // All three by default, which is what drafting did before there was a choice.
  ai_auto_draft_fields: stringList([...DRAFT_FIELDS], checkDraftFields) as unknown as SettingCodec<DraftField[]>,
  ai_refresh_reruns: bool(false),
  listen_enabled: bool(false),
  listen_engine: oneOf<'auto' | 'cpu' | 'gpu'>('auto', ['auto', 'cpu', 'gpu']),
  listen_model: text('', (value) => (value === '' || MODELS.some((model) => model.id === value) ? null : 'That is not one of the listening models')),
  listen_model_file: text('', (value) => (value === '' || (value.length < 1024 && /\.bin$/i.test(value)) ? null : 'Choose a whisper.cpp model file')),
  post_to_tiktok: bool(false),
  post_to_instagram: bool(false),
  ai_blocked_names: stringList([], checkBlockedNames),

  insight_goal: oneOf<InsightGoal>('reach_and_subscribers', ['reach_and_subscribers', 'views', 'subscribers', 'watch_time']),
  insight_context: text('', (value) => (value.length > 600 ? 'Keep this to a couple of sentences' : null)),
  insight_findings: text('', (value) => (value.length > 8000 ? 'Too large to keep' : null)),
  // Ten thousand is the default a new Cloud project gets. A project that passed the audit, or asked
  // for an increase, has more — and a meter measured against the wrong ceiling is worse than none.
  quota_daily_units: integer(10_000, 1, 10_000_000),

  format_title_case: oneOf<TitleCase>('as_written', ['as_written', 'upper', 'title']),
  format_title_prefix: text('', (value) => (charCount(value) > 40 ? 'A prefix that long leaves no room for a title' : null)),
  format_title_suffix: text('', (value) => (charCount(value) > 40 ? 'A suffix that long leaves no room for a title' : null)),
  format_description_footer: text('', (value) => {
    if (utf8Bytes(value) > 2000) return 'A footer that long leaves no room for a description';
    // The footer goes under every description, and past 60 hashtags on a video YouTube ignores all of
    // them. Forty leaves room for the ones each video is built with.
    if ((value.match(/#[\p{L}\p{N}_]+/gu) ?? []).length > FOOTER_MAX_HASHTAGS) {
      return 'Keep the footer to 40 hashtags or fewer — past 60 on a video, YouTube ignores every one of them';
    }
    return null;
  }),
  format_tidy: bool(false),
  format_max_hashtags: integer(0, 0, 60),
  spell_words: stringList([], checkSpellWords),
  analytics_refresh: oneOf<AnalyticsRefresh>('interval', ANALYTICS_REFRESH_MODES),
  analytics_refresh_minutes: integer(DEFAULT_REFRESH_MINUTES, MIN_REFRESH_MINUTES, MAX_REFRESH_MINUTES),
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

/** A stored setting that could not be used, so its default is in effect instead. */
export interface IgnoredSetting {
  key: SettingKey;
  /** Exactly what is stored, so the person can have it back. */
  stored: string;
  /** Why it was refused, in the words saving it would get today. */
  reason: string;
}

/** The most useful reason a stored value was refused: the rule it breaks, not just that it broke one. */
function whyRefused(key: SettingKey, stored: string): string {
  const codec = codecFor(key);
  const asText = codec.validate(stored);
  if (asText !== null && !asText.startsWith('Expected')) return asText;
  try {
    const asValue = codec.validate(JSON.parse(stored));
    if (asValue !== null) return asValue;
  } catch {
    // Not JSON either, so the plain reading is as good as it gets.
  }
  return asText ?? 'It could not be read';
}

/**
 * Builds typed settings from stored rows. Unknown keys are ignored. A value that cannot be used falls
 * back to its default and is reported with its reason, never dropped in silence: a rule tightened
 * after a value was saved makes that value unusable, and measured on a real channel, a footer stopped
 * appearing under every description with nothing on screen to say so.
 */
export function decodeSettings(rows: ReadonlyArray<{ key: string; value: string | null }>): {
  settings: AppSettings;
  problems: string[];
  ignored: IgnoredSetting[];
} {
  const settings = defaultSettings() as unknown as Record<SettingKey, unknown>;
  const problems: string[] = [];
  const ignored: IgnoredSetting[] = [];
  for (const row of rows) {
    if (!isSettingKey(row.key) || row.value === null) continue;
    const decoded = codecFor(row.key).decode(row.value);
    if (decoded === undefined) {
      const reason = whyRefused(row.key, row.value);
      problems.push(`Ignored the stored ${row.key}: ${reason}`);
      ignored.push({ key: row.key, stored: row.value, reason });
    } else {
      settings[row.key] = decoded;
    }
  }
  return { settings: settings as unknown as AppSettings, problems, ignored };
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
