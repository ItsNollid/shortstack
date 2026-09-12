import { describe, expect, it } from 'vitest';
import { loginItemChange } from './startup';

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
