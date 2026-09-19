import { describe, expect, it } from 'vitest';
import { SETTINGS_SCHEMA } from './settings';

const host = SETTINGS_SCHEMA.ai_host;

describe('where ShortStack looks for Ollama', () => {
  it('accepts this computer’s own addresses', () => {
    for (const address of ['http://127.0.0.1:11434', 'http://localhost:11434', 'https://localhost:8443', 'http://[::1]:11434']) {
      expect(host.validate(address)).toBeNull();
    }
  });

  it('refuses another machine, because the policy promises nothing leaves this one', () => {
    for (const address of ['http://192.168.1.20:11434', 'http://ollama.example.com', 'http://127.0.0.1.example.com:11434']) {
      expect(host.validate(address)).toBe('Ollama has to run on this computer: use 127.0.0.1 or localhost');
    }
  });

  it('still refuses what is not a web address at all', () => {
    expect(host.validate('ftp://127.0.0.1')).toBe('Use an http:// or https:// address');
    expect(host.validate('not an address')).toBe('Enter an address like http://127.0.0.1:11434');
  });

  it('drops a saved remote address on load, so the default on this computer is used instead', () => {
    expect(host.decode('http://192.168.1.20:11434')).toBeUndefined();
    expect(host.decode('http://127.0.0.1:11434')).toBe('http://127.0.0.1:11434');
  });
});
