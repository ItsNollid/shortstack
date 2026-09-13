// House style, applied to whatever ends up in a title or description — typed, drafted by the model,
// or filled in from defaults. Every rule is off by default: this shapes someone's own writing, and
// software that reformats what you typed without being asked is infuriating.
//
// Pure, and deliberately idempotent. Formatting runs on save, on a draft and on a re-save of the
// same item, so a rule that appended its footer every time would grow the description without end.
import { DESCRIPTION_MAX_BYTES, TITLE_MAX_CHARS, charCount, utf8Bytes } from './settings';

export type TitleCase = 'as_written' | 'upper' | 'title';

export interface FormattingRules {
  titleCase: TitleCase;
  titlePrefix: string;
  titleSuffix: string;
  descriptionFooter: string;
  /** Strip stray quotes, collapse runs of blank lines, drop repeated tags and hashtags. */
  tidy: boolean;
  /** Most hashtags to keep in a description. 0 means no limit. Past 60, YouTube ignores all of them. */
  maxHashtags: number;
}

export const NO_FORMATTING: FormattingRules = {
  titleCase: 'as_written',
  titlePrefix: '',
  titleSuffix: '',
  descriptionFooter: '',
  tidy: false,
  maxHashtags: 0
};

/** Quotes a model wraps its answer in, which are not part of the title anyone wanted. */
const QUOTE_PAIRS: ReadonlyArray<[string, string]> = [
  ['"', '"'],
  ["'", "'"],
  ['“', '”'],
  ['‘', '’'],
  ['`', '`']
];

export function stripWrappingQuotes(value: string): string {
  let result = value.trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const [open, close] of QUOTE_PAIRS) {
      if (result.length > 1 && result.startsWith(open) && result.endsWith(close)) {
        result = result.slice(open.length, result.length - close.length).trim();
        changed = true;
      }
    }
  }
  return result;
}

/**
 * Capitalises the first letter of each word and leaves the rest alone, so COD stays COD rather than
 * becoming Cod. Lowercasing the remainder would be more consistent and much worse.
 */
const toTitleCase = (value: string): string =>
  value.replace(/(^|[\s([{"'‘“/-])(\p{L})/gu, (_match, before: string, letter: string) => before + letter.toUpperCase());

const applyCase = (value: string, style: TitleCase): string => {
  if (style === 'upper') return value.toUpperCase();
  if (style === 'title') return toTitleCase(value);
  return value;
};

/** Cuts at a space where it can, so a trimmed title does not end mid-word. */
function clampChars(value: string, max: number): string {
  const characters = [...value];
  if (characters.length <= max) return value;

  const hard = characters.slice(0, max).join('');
  const lastSpace = hard.lastIndexOf(' ');
  // Only back up to a word boundary if that does not throw away most of what is left.
  return (lastSpace > max * 0.6 ? hard.slice(0, lastSpace) : hard).trimEnd();
}

function clampBytes(value: string, max: number): string {
  if (utf8Bytes(value) <= max) return value;
  let result = value;
  while (result.length > 0 && utf8Bytes(result) > max) {
    result = result.slice(0, Math.max(0, result.length - Math.ceil((utf8Bytes(result) - max) / 4) - 1));
  }
  return result.trimEnd();
}

/**
 * Formatting never rescues someone from their own over-long text, and never makes valid text
 * invalid. Silently trimming a title the user typed past the limit hides the problem the character
 * counter is there to show; silently letting an added suffix push it over produces something
 * YouTube refuses. So the clamp applies only when formatting is what broke it.
 */
const clampOnlyIfWeBrokeIt = <T>(raw: T, formatted: T, fits: (value: T) => boolean, clamp: (value: T) => T): T =>
  fits(raw) && !fits(formatted) ? clamp(formatted) : formatted;

export function formatTitle(raw: string, rules: FormattingRules): string {
  // Left exactly as typed. Someone who writes " #shorts" means " #shorts", and shouting it back
  // at them overrides a choice they made deliberately.
  const prefix = rules.titlePrefix;
  const suffix = rules.titleSuffix;

  let middle = rules.tidy ? stripWrappingQuotes(raw) : raw.trim();

  // Stripped before the case rule runs, not after. Upper-casing first turns a " #shorts" already
  // on the end into " #SHORTS", which then fails to match and gets a second copy appended.
  if (prefix !== '' && middle.startsWith(prefix)) middle = middle.slice(prefix.length).trimStart();
  if (suffix !== '' && middle.endsWith(suffix)) middle = middle.slice(0, middle.length - suffix.length).trimEnd();

  middle = applyCase(middle, rules.titleCase);

  // The prefix and suffix are the parts named by hand; the middle is what gives way.
  const room = TITLE_MAX_CHARS - charCount(prefix) - charCount(suffix);
  const joined = room <= 0 ? `${prefix}${suffix}` : `${prefix}${middle}${suffix}`;

  return clampOnlyIfWeBrokeIt(
    raw,
    joined,
    (value) => charCount(value) <= TITLE_MAX_CHARS,
    () => (room <= 0 ? clampChars(joined, TITLE_MAX_CHARS) : `${prefix}${clampChars(middle, room)}${suffix}`)
  );
}

const HASHTAG = /(^|\s)(#[\p{L}\p{N}_]+)/gu;

/** The hashtags in a piece of text, lowercased, for comparing one part against another. */
const hashtagsIn = (text: string): string[] =>
  [...text.matchAll(HASHTAG)].map((match) => (match[2] as string).toLowerCase());

/** Keeps the first of each hashtag, case-insensitively, and at most `max` of them when asked. */
function limitHashtags(text: string, max: number, dedupe: boolean, alreadyUsed: readonly string[] = []): string {
  if (!dedupe && max <= 0) return text;

  const seen = new Set<string>(dedupe ? alreadyUsed : []);
  let kept = 0;
  return text.replace(HASHTAG, (match, space: string, tag: string) => {
    // Returning nothing would swallow the line break in front of the tag and glue two lines
    // together; a newline is structure, a space between tags is not.
    const dropped = space.includes('\n') ? space : '';
    const key = tag.toLowerCase();
    if (dedupe && seen.has(key)) return dropped;
    if (max > 0 && kept >= max) return dropped;
    seen.add(key);
    kept += 1;
    return match;
  });
}

const collapseBlankLines = (text: string): string =>
  text
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');

export function formatDescription(raw: string, rules: FormattingRules): string {
  const footer = rules.descriptionFooter.trim();

  // Taken off first, and put back verbatim at the end. Tidying a footer that is already in the
  // text would change it, the verbatim match would then fail, and a second copy would be added.
  let body = footer !== '' && raw.trimEnd().endsWith(footer) ? raw.trimEnd().slice(0, raw.trimEnd().length - footer.length).trimEnd() : raw;

  if (rules.tidy) {
    // The body gives up any hashtag the footer already carries, rather than the other way round.
    body = collapseBlankLines(limitHashtags(stripWrappingQuotes(body), rules.maxHashtags, true, hashtagsIn(footer)))
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/^[ \t]+/gm, '')
      .trim();
  } else if (rules.maxHashtags > 0) {
    body = limitHashtags(body, rules.maxHashtags, false).trim();
  }

  if (footer === '') return body;

  const room = DESCRIPTION_MAX_BYTES - utf8Bytes(footer) - 2;
  const joined = body === '' ? footer : `${body}\n\n${footer}`;

  return clampOnlyIfWeBrokeIt(
    raw,
    joined,
    (value) => utf8Bytes(value) <= DESCRIPTION_MAX_BYTES,
    () => {
      if (room <= 0) return clampBytes(footer, DESCRIPTION_MAX_BYTES);
      const trimmed = clampBytes(body, room);
      return trimmed === '' ? footer : `${trimmed}\n\n${footer}`;
    }
  );
}

/** Repeated tags waste the 500-character budget and tell YouTube nothing it did not already know. */
export function formatTags(tags: readonly string[], rules: FormattingRules): string[] {
  if (!rules.tidy) return [...tags];

  const seen = new Set<string>();
  const kept: string[] = [];
  for (const tag of tags) {
    const cleaned = tag.trim().replace(/\s+/g, ' ');
    const key = cleaned.toLowerCase();
    if (cleaned === '' || seen.has(key)) continue;
    seen.add(key);
    kept.push(cleaned);
  }
  return kept;
}

/** Whether any rule would actually do something, so the UI can say "nothing is being changed". */
export const formattingIsActive = (rules: FormattingRules): boolean =>
  rules.titleCase !== 'as_written' ||
  rules.titlePrefix !== '' ||
  rules.titleSuffix !== '' ||
  rules.descriptionFooter.trim() !== '' ||
  rules.tidy ||
  rules.maxHashtags > 0;
