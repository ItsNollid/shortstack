// Whether the background worker may write a video's details. Pure, because this is the rule that
// decides when software overwrites something a person might have typed, and that deserves to be
// readable and tested on its own rather than buried in a query.
import type { QueueItemDTO } from './dto';

/**
 * Before anything is on YouTube and before anyone is about to upload it by hand. Once a video is
 * uploading, uploaded or waiting to be uploaded in Studio, rewriting its details underneath the
 * person doing that would be worse than unhelpful.
 */
const DRAFTABLE_STATES = ['pending', 'approved'] as const;

export type DraftSkip = 'off' | 'state' | 'edited' | 'drafted' | 'missing';

/** Null when the worker may draft it; otherwise why not, which is what the UI explains. */
export function draftSkipReason(item: QueueItemDTO, enabled: boolean): DraftSkip | null {
  if (!enabled) return 'off';
  if (item.missing) return 'missing';
  if (!(DRAFTABLE_STATES as readonly string[]).includes(item.state)) return 'state';
  // The whole point: details a person wrote are theirs, and stay theirs.
  if (item.metadata_edited_at !== null) return 'edited';
  if (item.ai_drafted_at !== null) return 'drafted';
  return null;
}

export const canAutoDraft = (item: QueueItemDTO, enabled: boolean): boolean => draftSkipReason(item, enabled) === null;

/**
 * What the worker should pick up next. Oldest first, so a folder dropped in all at once is worked
 * through in the order it was scanned rather than newest-first, which would look arbitrary.
 */
export function pickForDraft(items: readonly QueueItemDTO[], enabled: boolean, limit: number): QueueItemDTO[] {
  return items
    .filter((item) => canAutoDraft(item, enabled))
    .sort((left, right) => left.id - right.id)
    .slice(0, Math.max(0, limit));
}
