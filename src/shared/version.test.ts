import { describe, expect, it } from 'vitest';
import { compareVersions, isNewer, parseVersion } from './version';

describe('parseVersion', () => {
  it('reads the shapes a release tag actually comes in', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: '' });
    expect(parseVersion('v1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: '' });
    expect(parseVersion('1.2.3-beta.2')).toMatchObject({ prerelease: 'beta.2' });
    expect(parseVersion(' 1.2.3 ')).not.toBeNull();
    // Build metadata is not part of precedence, so it is read and discarded.
    expect(parseVersion('1.2.3+d44a4ec')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: '' });
  });

  it('refuses what is not a version', () => {
    for (const value of ['', 'latest', '1.2', '1.2.3.4', 'x.y.z']) expect(parseVersion(value), value).toBeNull();
  });
});

describe('compareVersions', () => {
  it('orders by major, then minor, then patch', () => {
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
    expect(compareVersions('1.3.0', '1.2.9')).toBe(1);
    expect(compareVersions('1.2.4', '1.2.3')).toBe(1);
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
    expect(compareVersions('1.2.3', '1.2.4')).toBe(-1);
  });

  it('compares numerically, not as text', () => {
    // The bug that ships an update loop: "10" sorts before "9" as a string.
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
    expect(compareVersions('1.0.10', '1.0.9')).toBe(1);
  });

  it('puts a release ahead of its own prereleases', () => {
    expect(compareVersions('1.2.0', '1.2.0-beta.2')).toBe(1);
    expect(compareVersions('1.2.0-beta.2', '1.2.0-beta.10')).toBe(-1);
    expect(compareVersions('1.2.0-alpha', '1.2.0-beta')).toBe(-1);
    expect(compareVersions('1.2.0-beta', '1.2.0-beta.1')).toBe(-1);
  });

  // Nonsense from a release feed must never read as an update waiting to install.
  it('sorts what it cannot parse below everything', () => {
    expect(isNewer('not-a-version', '1.0.0')).toBe(false);
    expect(isNewer('1.0.1', 'not-a-version')).toBe(true);
    expect(compareVersions('junk', 'junk')).toBe(0);
  });
});
