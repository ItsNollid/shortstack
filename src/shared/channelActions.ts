// The only things a recommendation is allowed to do.
//
// A button that ran what the model wrote would mean an 8B model changing a real schedule on the
// strength of a sentence — and this one has already, in testing, invented round numbers that never
// happened and named three different wrong games for a single frame. There is no wording that
// reliably prevents that.
//
// So the model does not write instructions. It picks a kind from the list below and fills in
// parameters, both of which are validated here against the same rules the settings screen uses, and
// the result is shown as a before-and-after before anything changes. Anything it asks for that is
// not in this list is dropped, which is also how a recommendation with no action at all works —
// "record more Minecraft" is good advice and not something software can do.
import type { TitleCase } from './formatting';
import type { AppSettings } from './settings';

export type ActionKind =
  | 'set_upload_time'
  | 'add_upload_time'
  | 'remove_upload_time'
  | 'set_title_case'
  | 'set_title_suffix'
  | 'set_description_footer'
  | 'set_max_hashtags'
  | 'enable_auto_draft';

/** Which set of daily times an action is about. The two lanes are scheduled separately. */
export type Lane = 'new' | 'rotation';

export type ChannelAction =
  | { kind: 'set_upload_time'; lane: Lane; from: string; to: string }
  | { kind: 'add_upload_time'; lane: Lane; at: string }
  | { kind: 'remove_upload_time'; lane: Lane; at: string }
  | { kind: 'set_title_case'; value: TitleCase }
  | { kind: 'set_title_suffix'; value: string }
  | { kind: 'set_description_footer'; value: string }
  | { kind: 'set_max_hashtags'; value: number }
  | { kind: 'enable_auto_draft' };

export const ACTION_KINDS: readonly ActionKind[] = [
  'set_upload_time',
  'add_upload_time',
  'remove_upload_time',
  'set_title_case',
  'set_title_suffix',
  'set_description_footer',
  'set_max_hashtags',
  'enable_auto_draft'
];

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const TITLE_CASES: readonly TitleCase[] = ['as_written', 'upper', 'title'];

const asTime = (value: unknown): string | null => (typeof value === 'string' && HHMM.test(value.trim()) ? value.trim() : null);
const asLane = (value: unknown): Lane => (value === 'rotation' ? 'rotation' : 'new');
const asShortText = (value: unknown, limit: number): string | null =>
  typeof value === 'string' && value.replace(/[<>]/g, '').length <= limit ? value.replace(/[<>]/g, '') : null;

/** Null for anything that is not one of the listed actions with parameters that make sense. */
export function parseAction(raw: unknown): ChannelAction | null {
  if (raw === null || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const kind = record.kind;

  switch (kind) {
    case 'set_upload_time': {
      const from = asTime(record.from);
      const to = asTime(record.to);
      // Moving a time to itself is not a change, and offering it as one wastes the person's attention.
      return from === null || to === null || from === to ? null : { kind, lane: asLane(record.lane), from, to };
    }
    case 'add_upload_time':
    case 'remove_upload_time': {
      const at = asTime(record.at);
      return at === null ? null : { kind, lane: asLane(record.lane), at };
    }
    case 'set_title_case': {
      const value = record.value;
      return TITLE_CASES.includes(value as TitleCase) ? { kind, value: value as TitleCase } : null;
    }
    case 'set_title_suffix': {
      const value = asShortText(record.value, 40);
      return value === null ? null : { kind, value };
    }
    case 'set_description_footer': {
      const value = asShortText(record.value, 2000);
      return value === null ? null : { kind, value };
    }
    case 'set_max_hashtags': {
      const value = Number(record.value);
      return Number.isInteger(value) && value >= 0 && value <= 60 ? { kind, value } : null;
    }
    case 'enable_auto_draft':
      return { kind };
    default:
      return null;
  }
}

const timesKey = (lane: Lane): 'upload_times' | 'rotation_upload_times' =>
  lane === 'rotation' ? 'rotation_upload_times' : 'upload_times';

const laneWords = (lane: Lane): string => (lane === 'rotation' ? 'Re-run times' : 'New video times');

export interface SettingChange {
  key: keyof AppSettings;
  value: unknown;
  /** What the setting is called on screen. */
  label: string;
  before: string;
  after: string;
}

const listWords = (times: readonly string[]): string => (times.length === 0 ? 'none' : [...times].sort().join(', '));

/**
 * What this action would change, or null when it would change nothing. Computed against the current
 * settings, so an action that is already true is not offered — being told to turn on something that
 * is already on is how a tool loses trust.
 */
export function changeFor(action: ChannelAction, settings: AppSettings): SettingChange | null {
  switch (action.kind) {
    case 'set_upload_time':
    case 'add_upload_time':
    case 'remove_upload_time': {
      const key = timesKey(action.lane);
      const current = settings[key];
      let next: string[];

      if (action.kind === 'set_upload_time') {
        if (!current.includes(action.from) || current.includes(action.to)) return null;
        next = current.map((time) => (time === action.from ? action.to : time));
      } else if (action.kind === 'add_upload_time') {
        if (current.includes(action.at)) return null;
        next = [...current, action.at];
      } else {
        // Removing the last time would leave nothing to schedule into, which is not an improvement.
        if (!current.includes(action.at) || current.length <= 1) return null;
        next = current.filter((time) => time !== action.at);
      }

      next.sort();
      return { key, value: next, label: laneWords(action.lane), before: listWords(current), after: listWords(next) };
    }
    case 'set_title_case': {
      if (settings.format_title_case === action.value) return null;
      const words: Record<TitleCase, string> = { as_written: 'Leave as written', upper: 'ALL CAPS', title: 'Title Case' };
      return {
        key: 'format_title_case',
        value: action.value,
        label: 'Title case',
        before: words[settings.format_title_case],
        after: words[action.value]
      };
    }
    case 'set_title_suffix':
      return settings.format_title_suffix === action.value
        ? null
        : {
            key: 'format_title_suffix',
            value: action.value,
            label: 'After every title',
            before: settings.format_title_suffix === '' ? 'nothing' : settings.format_title_suffix,
            after: action.value === '' ? 'nothing' : action.value
          };
    case 'set_description_footer':
      return settings.format_description_footer === action.value
        ? null
        : {
            key: 'format_description_footer',
            value: action.value,
            label: 'Under every description',
            before: settings.format_description_footer === '' ? 'nothing' : settings.format_description_footer,
            after: action.value === '' ? 'nothing' : action.value
          };
    case 'set_max_hashtags':
      return settings.format_max_hashtags === action.value
        ? null
        : {
            key: 'format_max_hashtags',
            value: action.value,
            label: 'Most hashtags in a description',
            before: settings.format_max_hashtags === 0 ? 'no limit' : String(settings.format_max_hashtags),
            after: action.value === 0 ? 'no limit' : String(action.value)
          };
    case 'enable_auto_draft':
      // Never offered without a model, because turning it on would only fail quietly.
      return settings.ai_auto_draft || settings.ai_model.trim() === ''
        ? null
        : { key: 'ai_auto_draft', value: true, label: 'Draft details automatically', before: 'off', after: 'on' };
    default:
      return null;
  }
}

/** A sentence for the button, so nobody has to read a diff to know what they are agreeing to. */
export function describeChange(change: SettingChange): string {
  return `${change.label}: ${change.before} → ${change.after}`;
}
