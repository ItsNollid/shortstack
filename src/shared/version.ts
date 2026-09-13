// Comparing versions, which every part of updating depends on: whether a release is newer than what
// is installed, and which changelog entries someone has not read yet. Written here rather than
// pulled in, because the whole of what is needed is below and a wrong answer is an app that either
// nags forever or never updates.

export interface Version {
  major: number;
  minor: number;
  patch: number;
  /** "beta.2" in 1.2.0-beta.2. Empty for a normal release. */
  prerelease: string;
}

const PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseVersion(value: string): Version | null {
  const match = PATTERN.exec(value.trim());
  if (match === null) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? ''
  };
}

const comparePrerelease = (left: string, right: string): number => {
  // A release outranks a prerelease of the same numbers: 1.2.0 is newer than 1.2.0-beta.2.
  if (left === right) return 0;
  if (left === '') return 1;
  if (right === '') return -1;

  const leftParts = left.split('.');
  const rightParts = right.split('.');
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const a = leftParts[index];
    const b = rightParts[index];
    if (a === undefined) return -1;
    if (b === undefined) return 1;

    const numeric = /^\d+$/.test(a) && /^\d+$/.test(b);
    if (numeric) {
      if (Number(a) !== Number(b)) return Number(a) < Number(b) ? -1 : 1;
    } else if (a !== b) {
      return a < b ? -1 : 1;
    }
  }
  return 0;
};

/** -1, 0 or 1. An unparseable version sorts below everything, so it never looks like an update. */
export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (a === null && b === null) return 0;
  if (a === null) return -1;
  if (b === null) return 1;

  for (const key of ['major', 'minor', 'patch'] as const) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  return comparePrerelease(a.prerelease, b.prerelease);
}

export const isNewer = (candidate: string, current: string): boolean => compareVersions(candidate, current) > 0;
