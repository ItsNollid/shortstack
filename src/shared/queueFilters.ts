// Which states sit behind each filter chip. Kept as data so the chip counts, the empty-state copy
// and any future view all agree on what "Ready to upload" means.
import type { QueueState } from './queue';

export const QUEUE_FILTERS = [
  'all',
  'needs_approval',
  'ready',
  'scheduled',
  'uploading',
  'needs_attention',
  'published',
  'rejected'
] as const;
export type QueueFilter = (typeof QUEUE_FILTERS)[number];

const MEMBERS: Record<Exclude<QueueFilter, 'all'>, readonly QueueState[]> = {
  needs_approval: ['pending'],
  ready: ['approved', 'awaiting_manual_upload'],
  scheduled: ['uploaded', 'scheduled'],
  uploading: ['uploading'],
  needs_attention: ['needs_attention', 'failed'],
  published: ['published'],
  rejected: ['rejected']
};

export const FILTER_LABELS: Record<QueueFilter, string> = {
  all: 'All',
  needs_approval: 'Needs approval',
  ready: 'Ready to upload',
  scheduled: 'Scheduled',
  uploading: 'Uploading',
  needs_attention: 'Needs attention',
  published: 'Published',
  rejected: 'Rejected'
};

/** What to say when a filter matches nothing, so an empty list still explains itself. */
export const FILTER_EMPTY: Record<QueueFilter, string> = {
  all: 'Nothing here yet. Choose your Shorts folder, then scan it.',
  needs_approval: 'Everything has been through approval.',
  ready: 'Nothing is waiting to upload.',
  scheduled: 'Nothing is scheduled to publish.',
  uploading: 'No upload is running.',
  needs_attention: 'Nothing needs a decision from you.',
  published: 'Nothing has been published through ShortStack yet.',
  rejected: 'Nothing has been rejected.'
};

export function matchesFilter(state: QueueState, filter: QueueFilter): boolean {
  // "All" hides rejected items: they were set aside on purpose and would otherwise crowd the list.
  if (filter === 'all') return state !== 'rejected';
  return MEMBERS[filter].includes(state);
}

export function countByFilter(states: readonly QueueState[]): Record<QueueFilter, number> {
  const counts = Object.fromEntries(QUEUE_FILTERS.map((filter) => [filter, 0])) as Record<QueueFilter, number>;
  for (const state of states) {
    for (const filter of QUEUE_FILTERS) {
      if (matchesFilter(state, filter)) counts[filter] += 1;
    }
  }
  return counts;
}

// A second axis, deliberately separate from the state chips: whether a posting is an announcement
// or a re-run says nothing about where it is in its lifecycle, so mixing them into one row of chips
// would ask the user to think about two questions as if they were one.
export const KIND_FILTERS = ['any', 'new', 'rotation'] as const;
export type KindFilter = (typeof KIND_FILTERS)[number];

export const KIND_LABELS: Record<KindFilter, string> = {
  any: 'All videos',
  new: 'New',
  rotation: 'Re-runs'
};

export function matchesKind(postingKind: 'new' | 'rotation', filter: KindFilter): boolean {
  return filter === 'any' || postingKind === filter;
}
