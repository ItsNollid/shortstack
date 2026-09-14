// Taking a suggested description or tags without losing what is already there: replace it, or add the
// suggestion to the start or the end. Adding never repeats a hashtag or a tag the video already has, and never
// takes away anything the person wrote to make room: what does not fit YouTube's limits is left out of the addition.
import { DESCRIPTION_MAX_BYTES, TAGS_MAX_CHARS, tagsCharCount, utf8Bytes } from './settings';

export type MergeMode = 'replace' | 'start' | 'end';

export interface MergeCounts {
  /** Hashtags or tags that went in. */
  added: number;
  /** Suggested ones the video already had. */
  alreadyThere: number;
  /** New ones that did not fit YouTube's limit. */
  leftOut: number;
}

export interface MergedDescription extends MergeCounts {
  value: string;
  /** Whether words other than hashtags went in too. */
  textAdded: boolean;
}

export interface MergedTags extends MergeCounts {
  value: string[];
}

const HASHTAG = /^#[\p{L}\p{N}_]+$/u;
const tokensOf = (line: string): string[] => line.split(/\s+/).filter((token) => token !== '');
const isHashtagLine = (line: string): boolean => {
  const tokens = tokensOf(line);
  return tokens.length > 0 && tokens.every((token) => HASHTAG.test(token));
};
const hashtagsIn = (text: string): string[] => tokensOf(text.replace(/\r?\n/g, ' ')).filter((token) => HASHTAG.test(token));

export function mergeDescription(current: string, suggested: string, mode: MergeMode, maxBytes: number = DESCRIPTION_MAX_BYTES): MergedDescription {
  if (mode === 'replace') {
    const tokens = tokensOf(suggested.replace(/\r?\n/g, ' '));
    return { value: suggested, added: hashtagsIn(suggested).length, alreadyThere: 0, leftOut: 0, textAdded: tokens.some((token) => !HASHTAG.test(token)) };
  }

  const present = new Set(hashtagsIn(current).map((tag) => tag.toLowerCase()));
  const currentLines = new Set(
    current
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== '')
  );
  let alreadyThere = 0;
  const lines: string[][] = [];
  for (const raw of suggested.split(/\r?\n/)) {
    const line = raw.trim();
    // A line of words the description already has, word for word, is not added again.
    if (line === '' || (!isHashtagLine(line) && currentLines.has(line))) continue;
    const kept = tokensOf(line).filter((token) => {
      if (!HASHTAG.test(token)) return true;
      const key = token.toLowerCase();
      if (present.has(key)) {
        alreadyThere += 1;
        return false;
      }
      present.add(key);
      return true;
    });
    if (kept.length > 0) lines.push(kept);
  }

  const combine = (): string => {
    const addition = lines.map((line) => line.join(' ')).join('\n');
    if (addition === '') return current;
    if (current.trim() === '') return addition;
    if (mode === 'end') {
      const base = current.replace(/\s+$/, '');
      const touching = base.split(/\r?\n/).pop() ?? '';
      // Hashtags added to a line of hashtags join that line, rather than starting a paragraph of their own.
      return `${base}${isHashtagLine(touching) && isHashtagLine(addition.split('\n')[0] ?? '') ? ' ' : '\n\n'}${addition}`;
    }
    const rest = current.replace(/^\s+/, '');
    const touching = rest.split(/\r?\n/)[0] ?? '';
    return `${addition}${isHashtagLine(touching) && isHashtagLine(addition.split('\n').pop() ?? '') ? ' ' : '\n\n'}${rest}`;
  };

  let value = combine();
  let leftOut = 0;
  while (utf8Bytes(value) > maxBytes && lines.length > 0) {
    const last = lines[lines.length - 1] as string[];
    const dropped = last.pop();
    if (dropped !== undefined && HASHTAG.test(dropped)) leftOut += 1;
    if (last.length === 0) lines.pop();
    value = combine();
  }

  const added = lines.flat();
  return {
    value,
    added: added.filter((token) => HASHTAG.test(token)).length,
    alreadyThere,
    leftOut,
    textAdded: added.some((token) => !HASHTAG.test(token))
  };
}

export function mergeTags(current: readonly string[], suggested: readonly string[], mode: MergeMode, maxChars: number = TAGS_MAX_CHARS): MergedTags {
  if (mode === 'replace') return { value: [...suggested], added: suggested.length, alreadyThere: 0, leftOut: 0 };

  const present = new Set(current.map((tag) => tag.trim().toLowerCase()));
  let alreadyThere = 0;
  const fresh: string[] = [];
  for (const tag of suggested) {
    const key = tag.trim().toLowerCase();
    if (key === '') continue;
    if (present.has(key)) {
      alreadyThere += 1;
      continue;
    }
    present.add(key);
    fresh.push(tag.trim());
  }

  const kept: string[] = [];
  let leftOut = 0;
  for (const tag of fresh) {
    if (tagsCharCount([...current, ...kept, tag]) <= maxChars) kept.push(tag);
    else leftOut += 1;
  }
  return { value: mode === 'start' ? [...kept, ...current] : [...current, ...kept], added: kept.length, alreadyThere, leftOut };
}

const count = (value: number, noun: string): string => `${value} ${noun}${value === 1 ? '' : 's'}`;

/** What adding a suggestion did, in a sentence. Nothing for a replacement, which shows for itself. */
export function describeMerge(result: MergeCounts & { textAdded?: boolean }, mode: MergeMode, noun: 'hashtag' | 'tag'): string | null {
  if (mode === 'replace') return null;
  const where = mode === 'start' ? 'start' : 'end';
  const parts: string[] = [];
  if (result.added > 0) parts.push(`Added ${count(result.added, noun)} to the ${where}`);
  else if (result.textAdded === true) parts.push(`Added to the ${where}`);
  else parts.push(`Nothing new to add`);
  if (result.alreadyThere > 0) parts.push(`${count(result.alreadyThere, noun)} ${result.alreadyThere === 1 ? 'was' : 'were'} already there`);
  if (result.leftOut > 0) parts.push(`${count(result.leftOut, noun)} did not fit YouTube’s limit`);
  return `${parts.join('; ')}.`;
}
