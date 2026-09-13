import { describe, expect, it } from 'vitest';
import { describeBuild } from './buildInfo';

const at = (iso: string) => ({ builtAt: iso, commit: 'd44a4ec' });

describe('describeBuild', () => {
  it('names the commit and when it was built', () => {
    const text = describeBuild(at('2026-09-12T23:31:00.000Z'), new Date('2026-09-12T23:40:00.000Z'));
    expect(text).toContain('d44a4ec');
    expect(text).toContain('2026');
  });

  // The whole point: a build left running for days is the failure this is meant to catch.
  it('says how old a stale build is', () => {
    expect(describeBuild(at('2026-09-09T10:00:00.000Z'), new Date('2026-09-12T23:00:00.000Z'))).toContain('3 days old');
    expect(describeBuild(at('2026-09-11T10:00:00.000Z'), new Date('2026-09-12T23:00:00.000Z'))).toContain('1 day old');
  });

  it('says nothing about age for a build made today', () => {
    expect(describeBuild(at('2026-09-12T10:00:00.000Z'), new Date('2026-09-12T23:00:00.000Z'))).not.toContain('old');
  });

  it('falls back to the commit when the time makes no sense', () => {
    expect(describeBuild({ builtAt: 'not a date', commit: 'abc1234' })).toBe('abc1234');
  });
});
