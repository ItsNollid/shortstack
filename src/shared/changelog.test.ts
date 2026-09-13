import { describe, expect, it } from 'vitest';
import { CHANGELOG, legalChangesIn, sortedChangelog, unseenEntries, type ChangelogEntry } from './changelog';
import { parseVersion } from './version';

const entry = (version: string, over: Partial<ChangelogEntry> = {}): ChangelogEntry => ({
  version,
  date: '2026-09-13',
  headline: `Release ${version}`,
  changes: ['something'],
  ...over
});

const entries = [entry('1.0.0'), entry('1.2.0'), entry('1.1.0')];

describe('the shipped changelog', () => {
  it('is well formed, because a broken entry is only discovered by a user after an update', () => {
    expect(CHANGELOG.length).toBeGreaterThan(0);
    for (const item of CHANGELOG) {
      expect(parseVersion(item.version), item.version).not.toBeNull();
      expect(Number.isNaN(new Date(item.date).getTime()), item.date).toBe(false);
      expect(item.headline.length).toBeGreaterThan(0);
      expect(item.changes.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate versions', () => {
    const versions = CHANGELOG.map((item) => item.version);
    expect(new Set(versions).size).toBe(versions.length);
  });
});

describe('sortedChangelog', () => {
  it('puts the newest first', () => {
    expect(sortedChangelog(entries).map((item) => item.version)).toEqual(['1.2.0', '1.1.0', '1.0.0']);
  });
});

describe('unseenEntries', () => {
  it('returns what arrived since the version last seen', () => {
    expect(unseenEntries('1.2.0', '1.0.0', entries).map((item) => item.version)).toEqual(['1.2.0', '1.1.0']);
  });

  it('returns nothing when nothing is new', () => {
    expect(unseenEntries('1.2.0', '1.2.0', entries)).toEqual([]);
  });

  // A first install has nothing to catch up on, and the whole history would just be noise.
  it('shows nothing on a fresh install', () => {
    expect(unseenEntries('1.2.0', null, entries)).toEqual([]);
  });

  // A build older than the changelog it carries must not advertise a release it does not contain.
  it('never announces a version newer than the one running', () => {
    expect(unseenEntries('1.1.0', '1.0.0', entries).map((item) => item.version)).toEqual(['1.1.0']);
  });
});

describe('legalChangesIn', () => {
  it('collects only the entries that changed the policies', () => {
    const withLegal = [entry('1.2.0', { legal: ['Terms updated'] }), entry('1.1.0')];
    expect(legalChangesIn(withLegal)).toEqual(['Terms updated']);
    expect(legalChangesIn([entry('1.1.0')])).toEqual([]);
  });
});
