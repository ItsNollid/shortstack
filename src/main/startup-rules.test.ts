import { describe, expect, it } from 'vitest';
import { loginItemChange, shouldManageLoginItem } from './startup-rules';

describe('loginItemChange', () => {
  it('asks for the change when the system disagrees', () => {
    expect(loginItemChange(true, { openAtLogin: false })).toEqual({ openAtLogin: true });
    expect(loginItemChange(false, { openAtLogin: true })).toEqual({ openAtLogin: false });
  });

  it('says nothing when the system already agrees, so a launch does not rewrite the registry', () => {
    expect(loginItemChange(true, { openAtLogin: true })).toBeNull();
    expect(loginItemChange(false, { openAtLogin: false })).toBeNull();
  });
});

describe('shouldManageLoginItem', () => {
  const live = { platform: 'win32', isPackaged: true, profile: 'live' as const };

  it('manages the login item for a packaged Windows release', () => {
    expect(shouldManageLoginItem(live)).toBe(true);
  });

  it('never registers a dev build, which would launch an unpackaged binary at login', () => {
    expect(shouldManageLoginItem({ ...live, profile: 'dev' })).toBe(false);
    expect(shouldManageLoginItem({ ...live, isPackaged: false })).toBe(false);
  });

  it('does nothing off Windows', () => {
    expect(shouldManageLoginItem({ ...live, platform: 'darwin' })).toBe(false);
  });
});
