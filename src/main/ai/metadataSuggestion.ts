// Model output is untrusted text: it may be truncated, wrapped in prose, or full of values
// YouTube would reject. Everything is clamped here before it can reach a form field.
import { DESCRIPTION_MAX_BYTES, TAGS_MAX_CHARS, TITLE_MAX_CHARS, tagsCharCount, utf8Bytes } from '../../shared/settings';

export interface MetadataSuggestion {
  title: string;
  description: string;
  tags: string[];
  /** Short phrases about what happens in the clip, turned into hashtags by shared/hashtags.ts. */
  topics?: string[];
}

/** At most six, each a short phrase: they become hashtags, and a sentence makes a useless one. */
function cleanTopics(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const topics: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const topic = entry.replace(/[<>]/g, '').replace(/^#+/, '').trim();
    if (topic === '' || topic.length > 60 || seen.has(topic.toLowerCase())) continue;
    seen.add(topic.toLowerCase());
    topics.push(topic);
    if (topics.length === 6) break;
  }
  return topics;
}

const stripAngles = (value: string): string => value.replace(/[<>]/g, '').trim();

function clampChars(value: string, maxChars: number): string {
  const characters = [...value];
  return characters.length <= maxChars ? value : characters.slice(0, maxChars).join('');
}

function clampBytes(value: string, maxBytes: number): string {
  if (utf8Bytes(value) <= maxBytes) return value;
  const characters = [...value];
  let result = '';
  for (const character of characters) {
    if (utf8Bytes(result + character) > maxBytes) break;
    result += character;
  }
  return result;
}

function cleanTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const tag = clampChars(stripAngles(entry).replace(/^#/, ''), 60);
    if (tag === '' || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    tags.push(tag);
  }
  // YouTube counts commas and quotes too, so drop from the end until the whole list fits.
  while (tags.length > 0 && tagsCharCount(tags) > TAGS_MAX_CHARS) tags.pop();
  return tags;
}

/** Returns null when there is nothing usable at all, so the UI can say so plainly. */
export function sanitizeSuggestion(raw: unknown): MetadataSuggestion | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;

  const title = typeof record.title === 'string' ? clampChars(stripAngles(record.title), TITLE_MAX_CHARS) : '';
  const description = typeof record.description === 'string' ? clampBytes(stripAngles(record.description), DESCRIPTION_MAX_BYTES) : '';
  const tags = cleanTags(record.tags);
  const topics = cleanTopics(record.topics);

  if (title === '' && description === '' && tags.length === 0 && topics.length === 0) return null;
  // Topics only appear when there are some, so a reply without them keeps exactly its old shape.
  return { title, description, tags, ...(topics.length > 0 ? { topics } : {}) };
}

/** Models sometimes wrap JSON in prose or a code fence even when asked not to. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}
