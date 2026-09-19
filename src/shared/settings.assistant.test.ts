import { describe, expect, it } from 'vitest';
import { SETTINGS_SCHEMA, defaultSettings } from './settings';

describe('the assistant’s model', () => {
  it('defaults to the same model as suggestions', () => {
    expect(defaultSettings().assistant_model).toBe('');
  });

  it('refuses a name no model has', () => {
    expect(SETTINGS_SCHEMA.assistant_model.validate('llama3.2')).toBeNull();
    expect(SETTINGS_SCHEMA.assistant_model.validate('x'.repeat(201))).toBe('That model name is too long');
  });
});
