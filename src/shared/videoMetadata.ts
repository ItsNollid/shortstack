// Validation for the metadata a user can edit on a queue item, using YouTube's real limits.
import { PLATFORMS, PRIVACIES, type Platform, type Privacy } from './queue';
import { DESCRIPTION_MAX_BYTES, TAGS_MAX_CHARS, TITLE_MAX_CHARS, charCount, tagsCharCount, utf8Bytes } from './settings';

export interface QueueMetadataPatch {
  title?: string;
  description?: string;
  tags?: string[];
  category_id?: string;
  privacy?: Privacy;
  notify_subscribers?: boolean;
  made_for_kids?: boolean;
  platforms?: Platform[];
}

export const EDITABLE_METADATA_FIELDS: ReadonlyArray<keyof QueueMetadataPatch> = [
  'title',
  'description',
  'tags',
  'category_id',
  'privacy',
  'notify_subscribers',
  'made_for_kids',
  'platforms'
];

const ANGLE_BRACKETS = /[<>]/;

export function titleProblem(title: string): string | null {
  if (title.trim() === '') return 'Add a title';
  if (ANGLE_BRACKETS.test(title)) return "Titles can't contain < or >";
  return charCount(title) > TITLE_MAX_CHARS ? `Titles can use at most ${TITLE_MAX_CHARS} characters` : null;
}

export function descriptionProblem(description: string): string | null {
  if (ANGLE_BRACKETS.test(description)) return "Descriptions can't contain < or >";
  return utf8Bytes(description) > DESCRIPTION_MAX_BYTES ? `Descriptions can use at most ${DESCRIPTION_MAX_BYTES} bytes` : null;
}

export function tagsProblem(tags: string[]): string | null {
  if (tags.some((tag) => tag.trim() === '')) return "Tags can't be empty";
  if (tags.some((tag) => ANGLE_BRACKETS.test(tag))) return "Tags can't contain < or >";
  return tagsCharCount(tags) > TAGS_MAX_CHARS ? `Tags can use at most ${TAGS_MAX_CHARS} characters` : null;
}

/** Returns the first problem with a patch, or null when every supplied field is acceptable. */
export function validateMetadataPatch(patch: QueueMetadataPatch): string | null {
  for (const key of Object.keys(patch)) {
    if (!(EDITABLE_METADATA_FIELDS as ReadonlyArray<string>).includes(key)) return `${key} can't be edited`;
  }
  if (patch.title !== undefined) {
    if (typeof patch.title !== 'string') return 'Expected text for the title';
    const problem = titleProblem(patch.title);
    if (problem !== null) return problem;
  }
  if (patch.description !== undefined) {
    if (typeof patch.description !== 'string') return 'Expected text for the description';
    const problem = descriptionProblem(patch.description);
    if (problem !== null) return problem;
  }
  if (patch.tags !== undefined) {
    if (!Array.isArray(patch.tags) || patch.tags.some((tag) => typeof tag !== 'string')) return 'Expected a list of tags';
    const problem = tagsProblem(patch.tags);
    if (problem !== null) return problem;
  }
  if (patch.category_id !== undefined && !/^\d{1,3}$/.test(String(patch.category_id))) return 'Pick a category';
  if (patch.privacy !== undefined && !(PRIVACIES as readonly string[]).includes(patch.privacy)) return 'Pick a visibility';
  if (patch.notify_subscribers !== undefined && typeof patch.notify_subscribers !== 'boolean') return 'Expected on or off';
  if (patch.made_for_kids !== undefined && typeof patch.made_for_kids !== 'boolean') return 'Expected on or off';
  if (patch.platforms !== undefined) {
    if (!Array.isArray(patch.platforms) || patch.platforms.some((entry) => !(PLATFORMS as readonly string[]).includes(entry))) {
      return 'Pick platforms from the supported list';
    }
    if (!patch.platforms.includes('youtube')) return 'YouTube is the only platform ShortStack can upload to right now';
  }
  return null;
}
