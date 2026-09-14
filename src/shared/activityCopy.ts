// The activity record has to show what ShortStack did on the user's behalf, distinctly from what
// they did themselves — that separation is the whole point of keeping it.
export const ACTIVITY_ACTIONS = [
  'approve',
  'unapprove',
  'reject',
  'restore',
  'schedule',
  'hold',
  'auto_slot',
  'edit_metadata',
  'method_changed',
  'begin_manual_upload',
  'link_video',
  'begin_upload',
  'upload_progress',
  'upload_completed',
  'upload_failed',
  'upload_session_lost',
  'upload_possible_duplicate',
  'upload_cancelled',
  'remote_observed',
  'remote_sync_failed',
  'missed_slot',
  'flag',
  'resolve_attention',
  'confirm_not_duplicate',
  'disconnect',
  // Written straight to the log rather than emitted by the state machine.
  'mark_published_before',
  'rotation_paused',
  'rotation_resumed',
  'posting_created',
  'posting_rotated',
  'ai_drafted',
  'house_style',
  'platform_posted',
  'platform_skipped',
  'platform_restored'
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export type Actor = 'you' | 'shortstack';

const BY_SHORTSTACK: ReadonlySet<string> = new Set<ActivityAction>([
  'auto_slot',
  'begin_manual_upload',
  'begin_upload',
  'upload_progress',
  'upload_completed',
  'upload_failed',
  'upload_session_lost',
  'upload_possible_duplicate',
  'remote_observed',
  'remote_sync_failed',
  'missed_slot',
  'flag',
  'link_video',
  'method_changed',
  // Automatic rotation is ShortStack acting on the user's behalf; pressing Post again is not.
  'posting_rotated',
  'ai_drafted'
]);

const LABELS: Record<ActivityAction, string> = {
  approve: 'Approved',
  unapprove: 'Approval removed',
  reject: 'Rejected',
  restore: 'Restored',
  schedule: 'Scheduled',
  hold: 'Taken off the schedule',
  auto_slot: 'Given an automatic time',
  edit_metadata: 'Details edited',
  ai_drafted: 'Details drafted by the local model',
  house_style: 'House style applied',
  method_changed: 'Upload method changed',
  begin_manual_upload: 'Ready to upload in Studio',
  link_video: 'Linked to a YouTube video',
  begin_upload: 'Upload started',
  upload_progress: 'Upload progress',
  upload_completed: 'Uploaded',
  upload_failed: 'Upload failed',
  upload_session_lost: 'Upload session expired',
  upload_possible_duplicate: 'Upload needs checking',
  upload_cancelled: 'Upload cancelled',
  remote_observed: 'YouTube reported a change',
  remote_sync_failed: 'Could not update YouTube',
  missed_slot: 'Missed its time',
  flag: 'Flagged for attention',
  resolve_attention: 'Marked resolved',
  confirm_not_duplicate: 'Confirmed it never uploaded',
  disconnect: 'YouTube data removed',
  mark_published_before: 'Marked as already published',
  rotation_paused: 'Taken out of rotation',
  rotation_resumed: 'Put back into rotation',
  posting_created: 'Queued to post again',
  posting_rotated: 'Queued for another run',
  platform_posted: 'Posted to another platform',
  platform_skipped: 'Not posting to another platform',
  platform_restored: 'Waiting to be posted elsewhere again'
};

const isKnown = (action: string): action is ActivityAction =>
  (ACTIVITY_ACTIONS as readonly string[]).includes(action);

/** Who did it. Anything ShortStack did without a click belongs in the "for you" view. */
export function actorOf(action: string): Actor {
  return BY_SHORTSTACK.has(action) ? 'shortstack' : 'you';
}

export function activityLabel(action: string): string {
  return isKnown(action) ? LABELS[action] : action.split('_').join(' ');
}

/** Entries that mean something went wrong, so History can call them out. */
export function isProblem(action: string): boolean {
  return (
    action === 'upload_failed' ||
    action === 'remote_sync_failed' ||
    action === 'missed_slot' ||
    action === 'flag' ||
    action === 'upload_possible_duplicate' ||
    action === 'upload_session_lost'
  );
}

/** The stored detail is already a full sentence written when the event happened ("Upload failed:
 *  network unreachable"), so it is what the reader sees. The label is the fallback for an entry
 *  that was recorded without one. */
export function activityText(action: string, detail: string | null): string {
  return detail === null || detail.trim() === '' ? activityLabel(action) : detail;
}
