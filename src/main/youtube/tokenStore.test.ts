import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { TokenStore, grantedScopes, mergeTokens, missingScopes, type SecretStorage } from './tokenStore';

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function workspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shortstack-tokens-'));
  temps.push(dir);
  return { dir, file: path.join(dir, 'tokens.enc'), legacy: path.join(dir, 'tokens.json') };
}

// Stands in for Electron safeStorage: reversible, and obviously not plaintext on disk.
const fakeSecrets = (available = true): SecretStorage => ({
  isAvailable: () => available,
  // Buffer#map is typed as returning Uint8Array, so wrap it rather than rely on the runtime.
  encrypt: (plain) => Buffer.from(Buffer.from(plain, 'utf8').map((byte) => byte ^ 0x5a)),
  decrypt: (cipher) => Buffer.from(Buffer.from(cipher).map((byte) => byte ^ 0x5a)).toString('utf8')
});

describe('mergeTokens', () => {
  it('keeps the stored refresh token when a refresh response omits it', () => {
    const current = { refresh_token: 'keep-me', access_token: 'old', expiry_date: 1 };
    const merged = mergeTokens(current, { access_token: 'new', expiry_date: 2 });
    expect(merged).toEqual({ refresh_token: 'keep-me', access_token: 'new', expiry_date: 2 });
  });

  it('takes a new refresh token when consent returns one', () => {
    expect(mergeTokens({ refresh_token: 'old' }, { refresh_token: 'new' }).refresh_token).toBe('new');
  });

  it('treats an empty refresh token as absent rather than as a deletion', () => {
    expect(mergeTokens({ refresh_token: 'keep-me' }, { refresh_token: '' }).refresh_token).toBe('keep-me');
  });

  it('starts clean when there is nothing stored', () => {
    expect(mergeTokens(null, { access_token: 'a' })).toEqual({ access_token: 'a' });
  });
});

describe('scopes', () => {
  const tokens = { scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly' };

  it('lists what was granted', () => {
    expect(grantedScopes(tokens)).toHaveLength(2);
    expect(grantedScopes(null)).toEqual([]);
  });

  it('reports what an upgrade still needs, so the UI can ask for one reconnect', () => {
    const required = [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.force-ssl',
      'https://www.googleapis.com/auth/yt-analytics.readonly'
    ];
    expect(missingScopes(tokens, required)).toEqual([
      'https://www.googleapis.com/auth/youtube.force-ssl',
      'https://www.googleapis.com/auth/yt-analytics.readonly'
    ]);
    expect(missingScopes({ scope: required.join(' ') }, required)).toEqual([]);
  });
});

describe('TokenStore', () => {
  it('writes tokens encrypted and reads them back', () => {
    const { file } = workspace();
    const store = new TokenStore(file, fakeSecrets());
    store.write({ access_token: 'secret-value', refresh_token: 'refresh-value' });

    expect(store.read()).toEqual({ access_token: 'secret-value', refresh_token: 'refresh-value' });
    expect(store.isEncryptedAtRest()).toBe(true);
    expect(fs.readFileSync(file, 'utf8')).not.toContain('secret-value');
  });

  it('falls back to plaintext when the platform offers no encryption, and says so', () => {
    const { file } = workspace();
    const store = new TokenStore(file, fakeSecrets(false));
    store.write({ access_token: 'plain' });
    expect(store.read()).toEqual({ access_token: 'plain' });
    expect(store.isEncryptedAtRest()).toBe(false);
  });

  it('reports disconnected rather than throwing when the file cannot be decrypted', () => {
    const { file } = workspace();
    new TokenStore(file, fakeSecrets()).write({ access_token: 'a' });
    const brokenSecrets: SecretStorage = {
      isAvailable: () => true,
      encrypt: () => Buffer.from(''),
      decrypt: () => {
        throw new Error('wrong machine');
      }
    };
    expect(new TokenStore(file, brokenSecrets).read()).toBeNull();
  });

  it('merges through the file, so a refresh cannot strip the refresh token', () => {
    const { file } = workspace();
    const store = new TokenStore(file, fakeSecrets());
    store.write({ access_token: 'first', refresh_token: 'long-lived' });
    store.merge({ access_token: 'second', expiry_date: 99 });
    expect(store.read()).toEqual({ access_token: 'second', refresh_token: 'long-lived', expiry_date: 99 });
  });

  it('removes the old plaintext file only once encrypted tokens exist', () => {
    const { file, legacy } = workspace();
    fs.writeFileSync(legacy, JSON.stringify({ refresh_token: 'from-old-build' }));
    const store = new TokenStore(file, fakeSecrets(), legacy);

    expect(store.discardLegacyPlaintext()).toBe(false);
    expect(fs.existsSync(legacy)).toBe(true);

    store.write({ access_token: 'new', refresh_token: 'new-refresh' });
    expect(store.discardLegacyPlaintext()).toBe(true);
    expect(fs.existsSync(legacy)).toBe(false);
  });

  it('clears both files on disconnect', () => {
    const { file, legacy } = workspace();
    fs.writeFileSync(legacy, '{}');
    const store = new TokenStore(file, fakeSecrets(), legacy);
    store.write({ access_token: 'a' });

    store.clear();
    expect(fs.existsSync(file)).toBe(false);
    expect(fs.existsSync(legacy)).toBe(false);
    expect(store.read()).toBeNull();
  });
});

describe('plaintext fallback', () => {
  it('keeps the legacy plaintext file when the replacement is not actually encrypted', () => {
    // safeStorage is unavailable on some Linux desktops, and write() falls back to plaintext. If
    // the old file were removed anyway the secret would still be in the clear, just under a name
    // that says otherwise.
    const { file, legacy } = workspace();
    fs.writeFileSync(legacy, JSON.stringify({ refresh_token: 'legacy' }));

    const store = new TokenStore(file, fakeSecrets(false), legacy);
    store.write({ refresh_token: 'fresh' });

    expect(store.isEncryptedAtRest()).toBe(false);
    expect(store.discardLegacyPlaintext()).toBe(false);
    expect(fs.existsSync(legacy)).toBe(true);
  });

  it('removes the legacy file once the replacement really is encrypted', () => {
    const { file, legacy } = workspace();
    fs.writeFileSync(legacy, JSON.stringify({ refresh_token: 'legacy' }));

    const store = new TokenStore(file, fakeSecrets(), legacy);
    store.write({ refresh_token: 'fresh' });

    expect(store.isEncryptedAtRest()).toBe(true);
    expect(store.discardLegacyPlaintext()).toBe(true);
    expect(fs.existsSync(legacy)).toBe(false);
  });
});
