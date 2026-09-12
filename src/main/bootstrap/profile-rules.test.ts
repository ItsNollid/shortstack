import { describe, expect, it } from 'vitest';
import { DEV_FOLDER, LIVE_FOLDER, resolveProfile } from './profile-rules';

describe('resolveProfile', () => {
  it('defaults unpackaged runs to the dev profile with dry-run uploads', () => {
    expect(resolveProfile({ env: {}, isPackaged: false })).toMatchObject({
      profile: 'dev',
      uploads: 'dry-run',
      userDataFolder: DEV_FOLDER
    });
  });

  it('requires both env vars before an unpackaged run may use the live profile', () => {
    expect(resolveProfile({ env: { SHORTSTACK_PROFILE: 'live' }, isPackaged: false }).profile).toBe('dev');
    expect(resolveProfile({ env: { SHORTSTACK_UPLOAD_MODE: 'live' }, isPackaged: false }).profile).toBe('dev');
    expect(
      resolveProfile({ env: { SHORTSTACK_PROFILE: 'live', SHORTSTACK_UPLOAD_MODE: 'live' }, isPackaged: false })
    ).toMatchObject({ profile: 'live', uploads: 'live', userDataFolder: LIVE_FOLDER });
  });

  it('treats near-miss values as dev (no case-insensitive or truthy matching)', () => {
    for (const value of ['LIVE', 'Live', 'true', '1', ' live', 'live ']) {
      const decision = resolveProfile({
        env: { SHORTSTACK_PROFILE: value, SHORTSTACK_UPLOAD_MODE: value },
        isPackaged: false
      });
      expect(decision.profile, `value ${JSON.stringify(value)}`).toBe('dev');
    }
  });

  it('never pairs the live profile with dry-run uploads or vice versa', () => {
    const envs = [
      {},
      { SHORTSTACK_PROFILE: 'live' },
      { SHORTSTACK_UPLOAD_MODE: 'live' },
      { SHORTSTACK_PROFILE: 'live', SHORTSTACK_UPLOAD_MODE: 'live' }
    ];
    for (const env of envs) {
      for (const isPackaged of [false, true]) {
        for (const bakedBuildProfile of [undefined, 'dev']) {
          const d = resolveProfile({ env, isPackaged, bakedBuildProfile });
          expect(d.profile === 'live').toBe(d.uploads === 'live');
          expect(d.userDataFolder).toBe(d.profile === 'live' ? LIVE_FOLDER : DEV_FOLDER);
        }
      }
    }
  });

  it('uses the live profile for packaged release builds', () => {
    expect(resolveProfile({ env: {}, isPackaged: true })).toMatchObject({ profile: 'live', uploads: 'live' });
  });

  it('keeps baked dev/test builds on the dev profile even when packaged and env says live', () => {
    const env = { SHORTSTACK_PROFILE: 'live', SHORTSTACK_UPLOAD_MODE: 'live' };
    expect(resolveProfile({ env, isPackaged: true, bakedBuildProfile: 'dev' })).toMatchObject({
      profile: 'dev',
      uploads: 'dry-run'
    });
  });
});
