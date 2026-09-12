// Which bulk actions make sense for a selection. The state machine in the main process is still the
// authority — a disabled button here only spares the user a refusal, and a test cross-checks these
// rules against `transition` so the two cannot drift apart.
import type { AttentionCode, QueueState } from './queue';

export const BULK_ACTIONS = ['approve', 'unapprove', 'reject', 'restore'] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];

export interface ActionSubject {
  state: QueueState;
  youtube_video_id: string | null;
  remote_tombstone: boolean;
  attention_code: AttentionCode | null;
}

const REJECTABLE: readonly QueueState[] = ['pending', 'approved', 'awaiting_manual_upload', 'failed', 'needs_attention'];
const NEEDS_DUPLICATE_CHECK: readonly AttentionCode[] = [
  'possible_duplicate',
  'duplicate_uploads',
  'legacy_unrecorded_upload'
];

const isOnYouTube = (item: ActionSubject): boolean => item.youtube_video_id !== null || item.remote_tombstone;

export function canApply(item: ActionSubject, action: BulkAction): boolean {
  switch (action) {
    case 'approve':
      return item.state === 'pending';
    case 'unapprove':
      if (item.state === 'approved' || item.state === 'awaiting_manual_upload' || item.state === 'failed') return true;
      return (item.state === 'uploaded' || item.state === 'scheduled') && item.youtube_video_id !== null;
    case 'reject':
      if (isOnYouTube(item)) return false;
      if (item.attention_code !== null && NEEDS_DUPLICATE_CHECK.includes(item.attention_code)) return false;
      return REJECTABLE.includes(item.state);
    case 'restore':
      return item.state === 'rejected';
  }
}

/** An action is offered when at least one selected video can take it; it is then applied only to
 *  those, so a mixed selection never silently drops the rest. */
export function actionableIds(items: ReadonlyArray<ActionSubject & { id: number }>, action: BulkAction): number[] {
  return items.filter((item) => canApply(item, action)).map((item) => item.id);
}
