import { describe, expect, it } from 'vitest';
import type { ChangelogEntry } from './changelog';
import type { AppSettings } from './settings';
import { legalChangesSince, whatsNew } from './whatsNew';

const entry = (version: string, over: Partial<ChangelogEntry> = {}): ChangelogEntry => ({
  version,
  date: '2026-09-13',
  headline: `Release ${version}`,
  changes: ['something'],
  ...over
});

const entries = [entry('1.0.0', { legal: ['Policies published'] }), entry('1.1.0'), entry('1.2.0', { legal: ['Terms changed'] })];
const settings = (lastSeen: string | null): AppSettings => ({ last_seen_version: lastSeen }) as AppSettings;

describe('whatsNew', () => {
  it('shows what arrived and marks the new version read', () => {
    const result = whatsNew(settings('1.0.0'), '1.2.0', entries);
    expect(result.show.map((item) => item.version)).toEqual(['1.2.0', '1.1.0']);
    expect(result.markSeen).toBe('1.2.0');
  });

  // The failure that makes an app feel broken: a notice that comes back every single launch.
  it('shows nothing once the current version has been seen', () => {
    expect(whatsNew(settings('1.2.0'), '1.2.0', entries)).toEqual({ show: [], markSeen: null });
  });

  it('marks a fresh install read without showing it the whole history', () => {
    expect(whatsNew(settings(null), '1.2.0', entries)).toEqual({ show: [], markSeen: '1.2.0' });
  });

  it('shows nothing at all until the settings are known', () => {
    expect(whatsNew(null, '1.2.0', entries)).toEqual({ show: [], markSeen: null });
  });

  // Downgrading, or running an old build after a new one: nothing to announce, but still recorded,
  // so the notice does not fire again on every launch of the older build.
  it('announces nothing when the running version is behind what was seen', () => {
    const result = whatsNew(settings('1.2.0'), '1.1.0', entries);
    expect(result.show).toEqual([]);
    expect(result.markSeen).toBe('1.1.0');
  });
});

describe('legalChangesSince', () => {
  it('says what changed in the policies since the version agreed to', () => {
    expect(legalChangesSince('1.1.0', '1.2.0', entries)).toEqual(['Terms changed']);
  });

  it('says nothing when the policies did not change', () => {
    expect(legalChangesSince('1.0.0', '1.1.0', entries)).toEqual([]);
  });

  // Agreeing for the first time is not a change anyone needs explained.
  it('says nothing to someone agreeing for the first time', () => {
    expect(legalChangesSince(null, '1.2.0', entries)).toEqual([]);
  });
});
