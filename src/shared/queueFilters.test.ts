import { describe, expect, it } from 'vitest';
import { QUEUE_STATES } from './queue';
import {
  FILTER_EMPTY,
  FILTER_LABELS,
  KIND_FILTERS,
  KIND_LABELS,
  QUEUE_FILTERS,
  countByFilter,
  matchesFilter,
  matchesKind
} from './queueFilters';

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

describe('the kind filter', () => {
  it('has a label for every option', () => {
    for (const filter of KIND_FILTERS) expect(KIND_LABELS[filter].length).toBeGreaterThan(0);
  });

  it('lets everything through on "any"', () => {
    expect(matchesKind('new', 'any')).toBe(true);
    expect(matchesKind('rotation', 'any')).toBe(true);
  });

  it('separates announcements from re-runs', () => {
    expect(matchesKind('new', 'new')).toBe(true);
    expect(matchesKind('rotation', 'new')).toBe(false);
    expect(matchesKind('rotation', 'rotation')).toBe(true);
    expect(matchesKind('new', 'rotation')).toBe(false);
  });

  it('is independent of the state filter, so the two can be combined', () => {
    // A pending re-run is both "Needs approval" and "Re-runs"; neither filter should exclude it.
    expect(matchesFilter('pending', 'needs_approval') && matchesKind('rotation', 'rotation')).toBe(true);
  });
});
