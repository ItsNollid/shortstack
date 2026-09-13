// Which details the drafting worker is allowed to write on its own.
//
// Drafting used to mean all three or nothing, which suited nobody who wanted, say, hashtag
// descriptions written for them but titles of their own. The model still answers for all three in a
// single request, so choosing fewer costs nothing — the worker just writes less.

export type DraftField = 'title' | 'description' | 'tags';

/** In the order they appear on a video, which is the order they are always described and stored in. */
export const DRAFT_FIELDS: readonly DraftField[] = ['title', 'description', 'tags'];

const isDraftField = (value: string): value is DraftField => (DRAFT_FIELDS as readonly string[]).includes(value);

/** Null when the choice is usable. At least one: drafting nothing at all is what the switch is for. */
export function checkDraftFields(value: readonly string[]): string | null {
  if (value.length === 0) return 'Choose at least one, or turn automatic drafting off';
  if (!value.every(isDraftField)) return 'Only the title, description and tags can be drafted';
  if (new Set(value).size !== value.length) return 'Each one can only be chosen once';
  return null;
}

/** "a title, a description and tags", "a description and tags" — for a sentence about what gets written. */
export function describeDraftFields(fields: readonly DraftField[]): string {
  const names = DRAFT_FIELDS.filter((field) => fields.includes(field)).map((field) =>
    field === 'title' ? 'a title' : field === 'description' ? 'a description' : 'tags'
  );
  if (names.length === 0) return 'nothing';
  if (names.length === 1) return names[0] as string;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The choice after ticking or unticking one, always kept in display order. */
export function toggleDraftField(fields: readonly DraftField[], field: DraftField): DraftField[] {
  const next = fields.includes(field) ? fields.filter((each) => each !== field) : [...fields, field];
  return DRAFT_FIELDS.filter((each) => next.includes(each));
}
