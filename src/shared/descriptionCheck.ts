// Checks a Short's description the way it is actually used: a block of hashtags for search, perhaps
// with a line or two of words. Spelling, grammar, and the hashtag mistakes that quietly cost a video
// its reach — repeats, a hashtag YouTube cuts off at a hyphen, another app's hashtags, another game's.
//
// Every rule is fixed text, not a model. It runs as someone types, must give the same answer twice,
// and must never invent a problem. Each problem carries the exact replacement that fixes it, so "Fix
// all" is nothing more than those replacements applied — and only the ones marked safe.
import { GAMING_WORDS, MISSING_APOSTROPHES, OTHER_PLATFORM_HASHTAGS, OTHER_PLATFORM_NAMES } from './gamingWords';
import { HASHTAG_HARD_LIMIT, allGameHashtags, gameHashtags, gameNamedByHashtag, sameGameFamily } from './hashtags';
import type { Lexicon } from './spelling';

/**
 * Every word the checker knows on top of its dictionary: gaming words, each game's hashtags, and the
 * names given — the channel's, the game's, the person's own list — both whole and word by word, so
 * "Nollid Official" knows #nollidofficial as well as Nollid.
 */
export function checkerVocabulary(names: Iterable<string | null | undefined>): string[] {
  const words = new Set<string>(GAMING_WORDS);
  for (const tag of allGameHashtags()) words.add(tag.slice(1));
  for (const name of names) {
    if (name === null || name === undefined) continue;
    const lower = name.toLowerCase();
    const whole = lower.replace(/[^\p{L}\p{N}]+/gu, '');
    if (whole !== '') words.add(whole);
    for (const part of lower.split(/[^\p{L}\p{N}'’]+/u)) {
      if (part !== '') words.add(part.replace(/’/g, "'"));
    }
  }
  return [...words];
}

export type CheckGroup = 'upload' | 'hashtags' | 'spelling' | 'grammar';

export type CheckRule =
  | 'angle_brackets'
  | 'double_hash'
  | 'broken_hashtag'
  | 'hashtag_commas'
  | 'duplicate_hashtag'
  | 'other_platform'
  | 'other_game'
  | 'too_many_hashtags'
  | 'hashtag_spelling'
  | 'misspelled'
  | 'repeated_word'
  | 'article'
  | 'lowercase_i'
  | 'sentence_start'
  | 'double_space'
  | 'space_before_punctuation'
  | 'missing_space'
  | 'wrong_word';

export const RULE_GROUP: Readonly<Record<CheckRule, CheckGroup>> = {
  angle_brackets: 'upload',
  double_hash: 'hashtags',
  broken_hashtag: 'hashtags',
  hashtag_commas: 'hashtags',
  duplicate_hashtag: 'hashtags',
  other_platform: 'hashtags',
  other_game: 'hashtags',
  too_many_hashtags: 'hashtags',
  hashtag_spelling: 'hashtags',
  misspelled: 'spelling',
  repeated_word: 'grammar',
  article: 'grammar',
  lowercase_i: 'grammar',
  sentence_start: 'grammar',
  double_space: 'grammar',
  space_before_punctuation: 'grammar',
  missing_space: 'grammar',
  wrong_word: 'grammar'
};

export interface CheckIssue {
  /** Stable for the same problem in the same text. */
  id: string;
  rule: CheckRule;
  group: CheckGroup;
  /** Where the problem is, as string indices. */
  start: number;
  end: number;
  /** Exactly the text between start and end. */
  found: string;
  message: string;
  /** Each a complete replacement for `found`, best first. An empty string removes it. */
  replacements: string[];
  /** Safe for "Fix all" to apply the first replacement without asking. */
  auto: boolean;
}

export interface CheckContext {
  /** Null while the dictionary loads: everything but spelling is still checked. */
  lexicon: Lexicon | null;
  game: string | null;
  /** The house-style cap on hashtags; 0 means only YouTube's own limit. */
  maxHashtags: number;
}

interface Span {
  start: number;
  end: number;
}

interface Word {
  text: string;
  start: number;
  end: number;
}

interface HashtagAt {
  start: number;
  end: number;
  hashes: number;
  /** The part YouTube reads as the hashtag. */
  head: string;
  /** What was typed on past a hyphen, apostrophe or full stop, which YouTube does not read. */
  tail: string;
  /** Lower case, separators dropped: what makes two hashtags the same one. */
  key: string;
}

/** Stands in for links, handles and hashtags, so the sentence rules never read inside them. */
const PROTECTED = '';

const HASHTAG = /(^|[^\p{L}\p{N}_&#])(#+)([\p{L}\p{N}_]+)((?:[-'’.][\p{L}\p{N}_]+)*)/gu;
const URL = /(?:https?:\/\/|www\.)[^\s<>]+/giu;
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
const DOMAIN =
  /(?<![\p{L}\p{N}@.])[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.(?:com|net|org|gg|tv|io|co|me|app|dev|link|ly|shop|store|xyz)(?![\p{L}\p{N}])/giu;
const MENTION = /(?<![\p{L}\p{N}_@])@[\p{L}\p{N}_.-]+/gu;
const WORD = /(?<![\p{L}\p{N}_'’])\p{L}+(?:['’]\p{L}+)*(?![\p{L}\p{N}_])/gu;

const ANGLE = /<3|->|<-|>>|<<|[<>]/g;
const ANGLE_REPLACEMENT: Readonly<Record<string, string>> = { '<3': '❤', '->': '→', '<-': '←', '>>': '»', '<<': '«' };

/** Doubled on purpose often enough that flagging them would be wrong: "no no no", "bye bye". */
const ALLOWED_REPEATS: ReadonlySet<string> = new Set([
  'had', 'that', 'bye', 'no', 'ha', 'haha', 'go', 'so', 'very', 'really', 'knock', 'chop', 'hush', 'blah', 'la', 'na',
  'bang', 'boom', 'woo', 'yay', 'wow', 'oh', 'ah', 'uh', 'hey', 'ok', 'okay', 'run', 'come', 'again', 'more', 'please',
  'yes', 'yeah', 'ding', 'tick', 'bla', 'cha', 'choo', 'ba', 'da', 'do', 'dun', 'hm', 'mm', 'hmm', 'bro', 'gg', 'big',
  'pew', 'lol', 'rip'
]);

/** After "a" these mean it was a letter, not an article: "option a or b". */
const NOT_AFTER_ARTICLE: ReadonlySet<string> = new Set([
  'or', 'and', 'to', 'is', 'was', 'are', 'were', 'of', 'in', 'on', 'at', 'by', 'for', 'from', 'with', 'the', 'a', 'an'
]);
/** Written with a vowel, said with a consonant: "a unicorn", "a one-shot". */
const CONSONANT_SOUND = [
  'unicorn', 'uniform', 'unify', 'unific', 'union', 'unique', 'unison', 'unit', 'univers', 'usual', 'usurp', 'use',
  'usa', 'usb', 'user', 'using', 'usage', 'utensil', 'utili', 'utopia', 'ure', 'urin', 'uranium', 'euro', 'eulog',
  'euph', 'ewe', 'one', 'once', 'ufo', 'ukulele', 'ubiquit', 'uber'
];
/** Written with a consonant, said with a vowel: "an hour". */
const VOWEL_SOUND = ['hour', 'honest', 'honor', 'honour', 'heir', 'herb'];
const ABBREVIATIONS: ReadonlySet<string> = new Set([
  'vs', 'etc', 'ft', 'feat', 'approx', 'mr', 'mrs', 'ms', 'dr', 'st', 'jr', 'sr', 'no', 'vol', 'ep', 'pt', 'eg', 'ie'
]);

interface WrongWord {
  /** The first capture group is what gets replaced. Needs the `d` flag for its position. */
  pattern: RegExp;
  replacement: string;
  message: string;
}

const WRONG_WORDS: readonly WrongWord[] = [
  {
    pattern: /(?<![\p{L}\p{N}'’])(?:should|could|would|must|might)[ \t]+(of)(?![\p{L}\p{N}'’])/dgiu,
    replacement: 'have',
    message: '“Of” here should be “have”'
  },
  {
    pattern: /(?<![\p{L}\p{N}'’])(your)[ \t]+welcome(?![\p{L}\p{N}'’])/dgiu,
    replacement: "you're",
    message: 'Should be “you’re” — you are'
  },
  {
    pattern:
      /(?<![\p{L}\p{N}'’])(its)[ \t]+(?:a|an|the|not|been|going|gonna|so|just|over|too|very|really|about|getting|actually|always|never|literally|like)(?![\p{L}\p{N}'’])/dgiu,
    replacement: "it's",
    message: 'Should be “it’s” — it is'
  },
  {
    pattern:
      /(?<![\p{L}\p{N}'’])(?:more|less|better|worse|rather|bigger|smaller|faster|slower|harder|easier|greater|higher|lower)[ \t]+(then)(?![\p{L}\p{N}'’])/dgiu,
    replacement: 'than',
    message: 'Comparing takes “than”'
  },
  {
    pattern:
      /(?<![\p{L}\p{N}'’])(?:to|gonna|will|might|not|never|could|would|should|cant|can't|can’t|dont|don't|don’t)[ \t]+(loose)(?![\p{L}\p{N}'’])/dgiu,
    replacement: 'lose',
    message: '“Lose” has one o — “loose” means not tight'
  }
];

function make(
  text: string,
  rule: CheckRule,
  start: number,
  end: number,
  message: string,
  replacements: string[],
  auto: boolean
): CheckIssue {
  return {
    id: `${rule}:${start}:${end}`,
    rule,
    group: RULE_GROUP[rule],
    start,
    end,
    found: text.slice(start, end),
    message,
    replacements,
    auto: auto && replacements.length > 0
  };
}

const spansOf = (text: string, pattern: RegExp): Span[] =>
  [...text.matchAll(pattern)].map((match) => ({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length }));

const overlaps = (a: Span, b: Span): boolean => a.start < b.end && b.start < a.end;

function mask(text: string, spans: readonly Span[]): string {
  if (spans.length === 0) return text;
  const characters = text.split('');
  for (const { start, end } of spans) {
    for (let at = start; at < end; at += 1) characters[at] = PROTECTED;
  }
  return characters.join('');
}

/** Removing something takes one neighbouring space with it, so nothing is left with two. */
function withOneSpace(text: string, start: number, end: number): Span {
  if (start > 0 && (text.charAt(start - 1) === ' ' || text.charAt(start - 1) === '\t')) return { start: start - 1, end };
  if (text.charAt(end) === ' ' || text.charAt(end) === '\t') return { start, end: end + 1 };
  return { start, end };
}

function caseLike(typed: string, replacement: string): string {
  if (typed.length > 1 && typed === typed.toUpperCase() && typed !== typed.toLowerCase()) return replacement.toUpperCase();
  if (/^\p{Lu}/u.test(typed)) return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  return replacement;
}

const onlySpaces = (masked: string, from: number, to: number): boolean => /^[ \t]+$/.test(masked.slice(from, to));

function findHashtags(text: string): HashtagAt[] {
  return [...text.matchAll(HASHTAG)].map((match) => {
    const lead = match[1] ?? '';
    const hashes = match[2] ?? '';
    const head = match[3] ?? '';
    const tail = match[4] ?? '';
    const start = (match.index ?? 0) + lead.length;
    return {
      start,
      end: start + hashes.length + head.length + tail.length,
      hashes: hashes.length,
      head,
      tail,
      key: (head + tail.replace(/[-'’.]/g, '')).toLowerCase()
    };
  });
}

/** Whether a word begins a sentence: first on its line, or after a full stop, question or exclamation. */
function startsSentence(masked: string, index: number): boolean {
  let at = index - 1;
  while (at >= 0 && /["'’“”([]/.test(masked.charAt(at))) at -= 1;
  while (at >= 0 && (masked.charAt(at) === ' ' || masked.charAt(at) === '\t')) at -= 1;
  if (at < 0 || masked.charAt(at) === '\n') return true;
  if (/["'’”)\]]/.test(masked.charAt(at))) at -= 1;
  return /[.!?]/.test(masked.charAt(at));
}

/** A full stop that does not end a sentence: "vs. him", "J. Smith", or an ellipsis carrying on. */
function afterAbbreviation(masked: string, index: number): boolean {
  let at = index - 1;
  while (at >= 0 && /[\s"'’“”()[\]]/.test(masked.charAt(at))) at -= 1;
  if (masked.charAt(at) !== '.') return false;
  if (masked.charAt(at - 1) === '.') return true;
  const before = /(\p{L}+)$/u.exec(masked.slice(0, at))?.[1] ?? '';
  return before.length === 1 || ABBREVIATIONS.has(before.toLowerCase());
}

/** True for "an", false for "a", null when the word gives no reliable answer — initialisms, mostly. */
function wantsAn(word: string): boolean | null {
  if (word.length < 2 || word === word.toUpperCase()) return null;
  const lower = word.toLowerCase();
  if (CONSONANT_SOUND.some((start) => lower.startsWith(start))) return false;
  if (VOWEL_SOUND.some((start) => lower.startsWith(start))) return true;
  return /^[aeiou]/.test(lower);
}

function angleBrackets(text: string): CheckIssue[] {
  return [...text.matchAll(ANGLE)].map((match) => {
    const start = match.index ?? 0;
    return make(
      text,
      'angle_brackets',
      start,
      start + match[0].length,
      'YouTube will not accept < or > in a description',
      [ANGLE_REPLACEMENT[match[0]] ?? ''],
      true
    );
  });
}

/** A line of hashtags separated by commas. The commas are only clutter; the line is rebuilt with spaces. */
function hashtagCommas(text: string, hashtags: readonly HashtagAt[]): CheckIssue[] {
  const issues: CheckIssue[] = [];
  let lineStart = 0;
  for (const line of text.split('\n')) {
    const lineEnd = lineStart + line.length;
    const onLine = hashtags.filter((tag) => tag.start >= lineStart && tag.end <= lineEnd);
    if (onLine.length > 0) {
      let between = '';
      let cursor = lineStart;
      for (const tag of onLine) {
        between += text.slice(cursor, tag.start);
        cursor = tag.end;
      }
      between += text.slice(cursor, lineEnd);
      if (between.includes(',') && /^[\s,]*$/.test(between)) {
        const indent = /^[ \t]*/.exec(line)?.[0] ?? '';
        const rebuilt = indent + onLine.map((tag) => text.slice(tag.start, tag.end)).join(' ');
        issues.push(
          make(text, 'hashtag_commas', lineStart, lineEnd, 'Commas between hashtags are not needed — spaces are enough', [rebuilt], true)
        );
      }
    }
    lineStart = lineEnd + 1;
  }
  return issues;
}

function hashtagIssues(text: string, hashtags: readonly HashtagAt[], context: CheckContext): CheckIssue[] {
  const issues = hashtagCommas(text, hashtags);
  const game = context.game !== null && context.game.trim() !== '' ? context.game.trim() : null;
  const ownTags = new Set(gameHashtags(game).map((tag) => tag.slice(1).toLowerCase()));
  const seen = new Set<string>();
  const kept: HashtagAt[] = [];

  for (const tag of hashtags) {
    const remove = (rule: CheckRule, message: string): void => {
      const span = withOneSpace(text, tag.start, tag.end);
      issues.push(make(text, rule, span.start, span.end, message, [''], true));
    };

    if (seen.has(tag.key)) {
      remove('duplicate_hashtag', 'Used more than once — a second copy only takes up room');
      continue;
    }
    seen.add(tag.key);

    if (OTHER_PLATFORM_HASHTAGS.has(tag.key) || OTHER_PLATFORM_NAMES.some((name) => tag.key.includes(name))) {
      remove('other_platform', 'Another app’s hashtag. On a YouTube video it is unrelated, which YouTube treats as misleading');
      continue;
    }

    const named = ownTags.has(tag.key) ? null : gameNamedByHashtag(tag.key);
    if (game !== null && named !== null && !sameGameFamily(named, game)) {
      remove('other_game', `Names another game. This video is ${game}, and YouTube treats unrelated hashtags as misleading`);
      continue;
    }

    kept.push(tag);
    const bodyStart = tag.start + tag.hashes;
    if (tag.hashes > 1) {
      issues.push(make(text, 'double_hash', tag.start, bodyStart, 'Two #s in a row — a hashtag takes one', ['#'], true));
    }
    if (tag.tail !== '') {
      issues.push(
        make(
          text,
          'broken_hashtag',
          bodyStart,
          tag.end,
          `YouTube ends a hashtag at the “${tag.tail.charAt(0)}”, so this one only counts as #${tag.head}`,
          [tag.head + tag.tail.replace(/[-'’.]/g, '')],
          true
        )
      );
    } else if (named === null && !ownTags.has(tag.key)) {
      const advice = context.lexicon?.hashtag(tag.key) ?? null;
      if (advice !== null && advice.suggestions.length > 0) {
        issues.push(
          make(text, 'hashtag_spelling', bodyStart, tag.end, 'Looks misspelled — nobody searches for a typo', advice.suggestions, advice.confident)
        );
      }
    }
  }

  const limit = context.maxHashtags > 0 ? Math.min(context.maxHashtags, HASHTAG_HARD_LIMIT) : HASHTAG_HARD_LIMIT;
  const message =
    limit < HASHTAG_HARD_LIMIT
      ? `Past your limit of ${limit}. Only the first ${limit} are kept when it is saved`
      : `Past ${HASHTAG_HARD_LIMIT}. YouTube ignores every hashtag on a video that has more`;
  for (const tag of kept.slice(limit)) {
    const span = withOneSpace(text, tag.start, tag.end);
    issues.push(make(text, 'too_many_hashtags', span.start, span.end, message, [''], true));
  }
  return issues;
}

function grammarIssues(text: string, masked: string, words: readonly Word[]): CheckIssue[] {
  const issues: CheckIssue[] = [];

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index] as Word;
    const lower = word.text.toLowerCase();
    const previous = index > 0 ? words[index - 1] : undefined;
    const next = words[index + 1];
    const after = masked.charAt(word.end);

    if (
      previous !== undefined &&
      previous.text.toLowerCase() === lower &&
      onlySpaces(masked, previous.end, word.start) &&
      !ALLOWED_REPEATS.has(lower)
    ) {
      issues.push(make(text, 'repeated_word', previous.end, word.end, `“${word.text}” twice in a row`, [''], true));
      continue;
    }

    const contraction = MISSING_APOSTROPHES[lower];
    if (contraction !== undefined && !(word.text.length <= 2 && word.text === word.text.toUpperCase())) {
      issues.push(make(text, 'wrong_word', word.start, word.end, 'Missing an apostrophe', [caseLike(word.text, contraction)], true));
      continue;
    }

    if (/^i(?:['’](?:m|ve|ll|d))?$/.test(word.text) && after !== '.') {
      issues.push(make(text, 'lowercase_i', word.start, word.start + 1, '“I” is always a capital', ['I'], true));
      continue;
    }

    if (
      /^\p{Ll}/u.test(word.text) &&
      !/\p{Lu}/u.test(word.text.slice(1)) &&
      !/[\p{N}.@]/u.test(after) &&
      startsSentence(masked, word.start) &&
      !afterAbbreviation(masked, word.start)
    ) {
      issues.push(
        make(text, 'sentence_start', word.start, word.start + 1, 'Start a sentence with a capital', [word.text.charAt(0).toUpperCase()], true)
      );
    }

    if (
      (lower === 'a' || lower === 'an') &&
      next !== undefined &&
      onlySpaces(masked, word.end, next.start) &&
      (word.text !== 'A' || startsSentence(masked, word.start)) &&
      !NOT_AFTER_ARTICLE.has(next.text.toLowerCase())
    ) {
      const wanted = wantsAn(next.text);
      if (wanted !== null && wanted !== (lower === 'an')) {
        const capital = word.text.charAt(0) === 'A';
        const replacement = wanted ? (capital ? 'An' : 'an') : capital ? 'A' : 'a';
        const message = wanted ? `“an” before a vowel sound: an ${next.text}` : `“a” before a consonant sound: a ${next.text}`;
        issues.push(make(text, 'article', word.start, word.end, message, [replacement], true));
      }
    }
  }

  for (const match of masked.matchAll(/(?<=\S)[ \t]{2,}(?=\S)/gu)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    // Spaces before punctuation are their own problem, reported below.
    if (/[,.;:!?]/.test(masked.charAt(end))) continue;
    issues.push(make(text, 'double_space', start, end, 'More than one space in a row', [' '], true));
  }

  for (const match of masked.matchAll(/(?<=[\p{L}\p{N}])[ \t]+(?=[,.;:!?]+(?:[ \t]|$))/gmu)) {
    const start = match.index ?? 0;
    issues.push(make(text, 'space_before_punctuation', start, start + match[0].length, 'No space before punctuation', [''], true));
  }

  for (const match of masked.matchAll(/(?<=\p{Ll}{2})(?:[,;!?]|\.(?=\p{Lu}\p{Ll}))(?=\p{L})/gu)) {
    const start = match.index ?? 0;
    issues.push(make(text, 'missing_space', start, start + 1, 'Missing a space after punctuation', [`${match[0]} `], true));
  }

  for (const wrong of WRONG_WORDS) {
    for (const match of masked.matchAll(wrong.pattern)) {
      const span = match.indices?.[1];
      if (span === undefined) continue;
      const [start, end] = span;
      issues.push(make(text, 'wrong_word', start, end, wrong.message, [caseLike(text.slice(start, end), wrong.replacement)], true));
    }
  }

  return issues;
}

function spellingIssues(
  text: string,
  masked: string,
  words: readonly Word[],
  lexicon: Lexicon | null,
  found: readonly CheckIssue[]
): CheckIssue[] {
  if (lexicon === null) return [];
  // A word another rule already rewrites — "dont", a repeat — is that rule's to report.
  const covered = found.filter((issue) => issue.group === 'grammar' && issue.rule !== 'sentence_start' && issue.rule !== 'lowercase_i');
  const issues: CheckIssue[] = [];

  for (const word of words) {
    if (word.text.length < 2) continue;
    if (covered.some((issue) => overlaps(issue, word))) continue;
    const letters = word.text.replace(/['’]/g, '');
    // GTA, POV, NGL: short words in capitals are nearly always initialisms.
    if (letters.length <= 6 && letters === letters.toUpperCase()) continue;

    const typed = word.text.replace(/’/g, "'");
    const base = typed.replace(/'s$/i, '');
    if (lexicon.knows(typed) || (base !== typed && lexicon.knows(base))) continue;

    const advice = lexicon.suggest(base);
    const replacements = advice.suggestions.map((suggestion) => (base === typed ? suggestion : `${suggestion}'s`));
    // A capital in the middle of a sentence is probably a name, and a name is not ours to change.
    const name = /^\p{Lu}/u.test(word.text) && !startsSentence(masked, word.start);
    const message =
      replacements.length === 0
        ? 'Not a word the dictionary knows. If it is a name or slang, add it'
        : name
          ? 'Not in the dictionary. A name? Add it so it stops being flagged'
          : 'Not in the dictionary';
    issues.push(make(text, 'misspelled', word.start, word.end, message, replacements, advice.confident && !name));
  }
  return issues;
}

export function checkDescription(text: string, context: CheckContext): CheckIssue[] {
  const links = [...spansOf(text, URL), ...spansOf(text, EMAIL), ...spansOf(text, DOMAIN), ...spansOf(text, MENTION)];
  const hashtags = findHashtags(text).filter((tag) => !links.some((link) => overlaps(link, tag)));
  const masked = mask(text, [...links, ...hashtags]);
  const words = [...masked.matchAll(WORD)].map((match) => ({
    text: match[0],
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length
  }));

  const issues = [...angleBrackets(text), ...hashtagIssues(text, hashtags, context), ...grammarIssues(text, masked, words)];
  issues.push(...spellingIssues(text, masked, words, context.lexicon, issues));
  return issues.sort((a, b) => a.start - b.start || a.end - b.end);
}

/** Applies the first replacement of each issue, skipping any that overlaps one already taken. */
export function applyIssues(text: string, issues: readonly CheckIssue[]): { text: string; applied: number } {
  const chosen: CheckIssue[] = [];
  let reached = -1;
  for (const issue of [...issues].sort((a, b) => a.start - b.start || a.end - b.end)) {
    if (issue.replacements.length === 0 || issue.start < reached) continue;
    chosen.push(issue);
    reached = issue.end;
  }
  let result = text;
  for (const issue of chosen.reverse()) {
    result = result.slice(0, issue.start) + (issue.replacements[0] ?? '') + result.slice(issue.end);
  }
  return { text: result, applied: chosen.length };
}

/** One chosen replacement, or the text unchanged if it has moved on since the check. */
export function applyReplacement(text: string, issue: CheckIssue, replacement: string): string {
  if (text.slice(issue.start, issue.end) !== issue.found) return text;
  return text.slice(0, issue.start) + replacement + text.slice(issue.end);
}

/** What "ignore this" remembers: the same mistake anywhere in the text, not one position. */
export const issueKey = (issue: CheckIssue): string => `${issue.rule}:${issue.found.trim().toLowerCase()}`;

/**
 * Every safe fix, applied until nothing safe is left. Fixes uncover others — taking out a repeated
 * hashtag can leave two spaces — so it checks again after each round.
 */
export function fixAll(
  text: string,
  context: CheckContext,
  skip: (issue: CheckIssue) => boolean = () => false
): { text: string; fixed: number } {
  let current = text;
  let fixed = 0;
  for (let round = 0; round < 8; round += 1) {
    const safe = checkDescription(current, context).filter((issue) => issue.auto && !skip(issue));
    if (safe.length === 0) break;
    const next = applyIssues(current, safe);
    if (next.text === current) break;
    current = next.text;
    fixed += next.applied;
  }
  return { text: current, fixed };
}
