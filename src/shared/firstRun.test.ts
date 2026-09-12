import { describe, expect, it } from 'vitest';
import { firstRunStage } from './firstRun';
import { defaultSettings, type AppSettings } from './settings';

const settings = (over: Partial<AppSettings> = {}): AppSettings => ({ ...defaultSettings(), ...over });

describe('firstRunStage', () => {
  it('shows nothing until the settings have been read', () => {
    expect(firstRunStage(null, 'v1')).toBeNull();
  });

  it('gates a fresh install on the legal step', () => {
    expect(firstRunStage(settings(), 'v1')).toBe('legal');
  });

  it('asks again when the policy has changed since it was accepted', () => {
    expect(firstRunStage(settings({ legal_accepted_version: 'v1' }), 'v2')).toBe('legal');
  });

  it('moves to setup once the policy is accepted', () => {
    expect(firstRunStage(settings({ legal_accepted_version: 'v1' }), 'v1')).toBe('setup');
  });

  it('lets the app through once both are done', () => {
    expect(firstRunStage(settings({ legal_accepted_version: 'v1', setup_complete: true }), 'v1')).toBeNull();
  });

  it('still gates on legal even when setup was finished under an older policy', () => {
    expect(firstRunStage(settings({ legal_accepted_version: 'v1', setup_complete: true }), 'v2')).toBe('legal');
  });
});
