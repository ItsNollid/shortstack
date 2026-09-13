import { describe, expect, it } from 'vitest';
import { describeUpdate, updateWorthShowing, type UpdateStatus } from './updates';

const status = (over: Partial<UpdateStatus>): UpdateStatus => ({ channel: 'release', state: { kind: 'idle' }, ...over });

describe('updateWorthShowing', () => {
  it('speaks up about an update that exists', () => {
    expect(updateWorthShowing(status({ state: { kind: 'available', version: '1.2.0', notes: null } }))).toBe(true);
    expect(updateWorthShowing(status({ state: { kind: 'downloading', version: '1.2.0', percent: 40 } }))).toBe(true);
    expect(updateWorthShowing(status({ state: { kind: 'ready', version: '1.2.0' } }))).toBe(true);
  });

  // A machine with no network fails this check constantly. A banner for that is noise, not news.
  it('stays quiet about checking, being current, and failing to reach the internet', () => {
    expect(updateWorthShowing(status({ state: { kind: 'checking' } }))).toBe(false);
    expect(updateWorthShowing(status({ state: { kind: 'current', checkedAt: '2026-09-13T00:00:00.000Z' } }))).toBe(false);
    expect(updateWorthShowing(status({ state: { kind: 'failed', reason: 'No network' } }))).toBe(false);
    expect(updateWorthShowing(null)).toBe(false);
  });

  it('speaks up when the source has moved past the build, whatever the release check says', () => {
    expect(updateWorthShowing(status({ channel: 'development', state: { kind: 'idle' }, commitsBehind: 3 }))).toBe(true);
    expect(updateWorthShowing(status({ channel: 'development', state: { kind: 'idle' }, commitsBehind: 0 }))).toBe(false);
  });
});

describe('describeUpdate', () => {
  it('says something specific in every state', () => {
    const states: UpdateStatus['state'][] = [
      { kind: 'idle' },
      { kind: 'checking' },
      { kind: 'current', checkedAt: '2026-09-13T00:00:00.000Z' },
      { kind: 'available', version: '1.2.0', notes: null },
      { kind: 'downloading', version: '1.2.0', percent: 40.4 },
      { kind: 'ready', version: '1.2.0' },
      { kind: 'failed', reason: 'GitHub did not answer' }
    ];
    for (const state of states) expect(describeUpdate(status({ state })).length, state.kind).toBeGreaterThan(0);

    expect(describeUpdate(status({ state: { kind: 'downloading', version: '1.2.0', percent: 40.4 } }))).toContain('40%');
    expect(describeUpdate(status({ state: { kind: 'failed', reason: 'GitHub did not answer' } }))).toBe('GitHub did not answer');
  });
});
