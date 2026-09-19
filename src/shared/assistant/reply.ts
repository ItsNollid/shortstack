// Taking the model's answer apart: the words for the person, and the changes it suggested — kept only when they
// are a kind ShortStack knows and valid as they stand. Then every number in the words is looked for in what the
// model was given, so a figure it made up is pointed out instead of trusted.
import { parseAction } from '../channelActions';
import { descriptionProblem, tagsProblem, titleProblem } from '../videoMetadata';
import { CHANGES_MARKER } from './prompt';
import type { AssistantChange, AssistantScope } from './types';

export interface ParsedReply {
  prose: string;
  changes: AssistantChange[];
}

/** More than this is not advice, it is a list to wade through. */
const MAX_CHANGES = 5;

function videoChange(raw: Record<string, unknown>): AssistantChange | null {
  const { kind, value } = raw;
  if (kind === 'video_title' && typeof value === 'string') {
    const title = value.trim();
    return title !== '' && titleProblem(title) === null ? { kind: 'video', field: 'title', value: title } : null;
  }
  if (kind === 'video_description' && typeof value === 'string') {
    return value.trim() !== '' && descriptionProblem(value) === null ? { kind: 'video', field: 'description', value } : null;
  }
  if (kind === 'video_tags' && Array.isArray(value) && value.every((tag) => typeof tag === 'string')) {
    const tags = (value as string[]).map((tag) => tag.trim()).filter((tag) => tag !== '');
    return tags.length > 0 && tagsProblem(tags) === null ? { kind: 'video', field: 'tags', value: tags } : null;
  }
  return null;
}

export function parseReply(raw: string, scope: AssistantScope): ParsedReply {
  const at = raw.lastIndexOf(CHANGES_MARKER);
  if (at === -1) return { prose: raw.trim(), changes: [] };
  const prose = raw.slice(0, at).trim();

  let listed: unknown;
  try {
    listed = JSON.parse(raw.slice(at + CHANGES_MARKER.length).trim());
  } catch {
    return { prose, changes: [] };
  }
  if (!Array.isArray(listed)) return { prose, changes: [] };

  const changes: AssistantChange[] = [];
  for (const entry of listed.slice(0, MAX_CHANGES)) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.kind === 'string' && record.kind.startsWith('video_')) {
      // A draft for a video only makes sense with that video in front of the person.
      if (scope.kind !== 'video') continue;
      const change = videoChange(record);
      if (change !== null) changes.push(change);
      continue;
    }
    const action = parseAction(record);
    if (action !== null) changes.push({ kind: 'setting', action });
  }
  return { prose, changes };
}

/** The words so far while an answer streams, without a change block that has started — even one cut mid-word. */
export function streamingProse(text: string): string {
  const at = text.lastIndexOf(CHANGES_MARKER);
  if (at !== -1) return text.slice(0, at).trimEnd();
  for (let length = CHANGES_MARKER.length - 1; length > 0; length -= 1) {
    if (text.endsWith(CHANGES_MARKER.slice(0, length))) return text.slice(0, text.length - length).trimEnd();
  }
  return text;
}

const NUMBER = /\d[\d,]*(?:\.\d+)?%?/g;
const numericPart = (token: string): string => token.replace(/%$/, '').replace(/,/g, '');
/** Two or more digits, a decimal, or a percentage. A single digit — "post 3 times" — is not worth flagging. */
const worthChecking = (token: string): boolean => token.endsWith('%') || token.includes('.') || numericPart(token).length >= 2;

/** Numbers in the answer found nowhere in the facts, the conversation or the question. */
export function unsupportedNumbers(prose: string, sources: readonly string[]): string[] {
  const known = new Set<string>();
  for (const source of sources) for (const token of source.match(NUMBER) ?? []) known.add(numericPart(token));
  const flagged: string[] = [];
  for (const token of prose.match(NUMBER) ?? []) {
    const clean = token.replace(/,$/, '');
    if (!worthChecking(clean) || known.has(numericPart(clean)) || flagged.includes(clean)) continue;
    flagged.push(clean);
  }
  return flagged;
}
