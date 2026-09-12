import { describe, expect, it } from 'vitest';
import { QUEUE_STATES } from './queue';
import { FILTER_EMPTY, FILTER_LABELS, QUEUE_FILTERS, countByFilter, matchesFilter } from './queueFilters';

describe('queue filters', () => {
  it('labels and empty-state copy exist for every chip', () => {
    for (const filter of QUEUE_FILTERS) {
      expect(FILTER_LABELS[filter].length).toBeGreaterThan(0);
      expect(FILTER_EMPTY[filter].length).toBeGreaterThan(0);
    }
  });

  it('places every state under at least one chip, so nothing becomes unreachable', () => {
    for (const state of QUEUE_STATES) {
      const chips = QUEUE_FILTERS.filter((filter) => filter !== 'all' && matchesFilter(state, filter));
      expect(chips.length).toBeGreaterThan(0);
    }
  });

  it('keeps rejected items out of "All" but reachable under their own chip', () => {
    expect(matchesFilter('rejected', 'all')).toBe(false);
    expect(matchesFilter('rejected', 'rejected')).toBe(true);
  });

  it('counts each state once per chip it belongs to', () => {
    const counts = countByFilter(['pending', 'pending', 'published', 'rejected']);
    expect(counts.all).toBe(3);
    expect(counts.needs_approval).toBe(2);
    expect(counts.published).toBe(1);
    expect(counts.rejected).toBe(1);
  });
});
