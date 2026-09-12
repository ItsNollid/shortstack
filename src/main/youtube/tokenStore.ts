// Stores OAuth tokens encrypted at rest. The encryption backend is injected so tests can run
// without Electron, and so a machine without OS-level encryption degrades predictably.
import * as fs from 'fs';
import * as path from 'path';

export interface StoredTokens {
  access_token?: string;
  refresh_token?: string;
  expiry_date?: number;
  scope?: string;
  token_type?: string;
}

export interface SecretStorage {
  isAvailable(): boolean;
  encrypt(plain: string): Buffer;
  decrypt(cipher: Buffer): string;
}

const ENCRYPTED_MARKER = Buffer.from('SSENC1\n', 'latin1');

/**
 * Merges a token response into what is already stored. Google only returns a refresh token on
 * the first consent, so a plain refresh response must never be allowed to erase it.
 */
export function mergeTokens(current: StoredTokens | null, update: StoredTokens): StoredTokens {
  const merged: StoredTokens = { ...(current ?? {}), ...update };
  if (update.refresh_token === undefined || update.refresh_token === '') {
    if (current?.refresh_token !== undefined) merged.refresh_token = current.refresh_token;
    else delete merged.refresh_token;
  }
  return merged;
}

export function grantedScopes(tokens: StoredTokens | null): string[] {
  return (tokens?.scope ?? '').split(/\s+/).filter((scope) => scope !== '');
}

export function missingScopes(tokens: StoredTokens | null, required: readonly string[]): string[] {
  const granted = new Set(grantedScopes(tokens));
  return required.filter((scope) => !granted.has(scope));
}

export class TokenStore {
  constructor(
    private readonly file: string,
    private readonly secrets: SecretStorage,
    /** The pre-encryption file the previous build wrote; removed once a new connection succeeds. */
    private readonly legacyPlaintextFile?: string
  ) {}

  read(): StoredTokens | null {
    try {
      if (!fs.existsSync(this.file)) return null;
      const raw = fs.readFileSync(this.file);
      if (raw.subarray(0, ENCRYPTED_MARKER.length).equals(ENCRYPTED_MARKER)) {
        const plain = this.secrets.decrypt(raw.subarray(ENCRYPTED_MARKER.length));
        return JSON.parse(plain) as StoredTokens;
      }
      return JSON.parse(raw.toString('utf8')) as StoredTokens;
    } catch {
      // Unreadable or undecryptable (copied profile, different machine): treat as disconnected.
      return null;
    }
  }

  write(tokens: StoredTokens): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const plain = JSON.stringify(tokens);
    const body = this.secrets.isAvailable()
      ? Buffer.concat([ENCRYPTED_MARKER, this.secrets.encrypt(plain)])
      : Buffer.from(plain, 'utf8');
    fs.writeFileSync(this.file, body, { mode: 0o600 });
  }

  /** The normal path after any token response, including silent refreshes. */
  merge(update: StoredTokens): StoredTokens {
    const merged = mergeTokens(this.read(), update);
    this.write(merged);
    return merged;
  }

  clear(): void {
    for (const file of [this.file, this.legacyPlaintextFile]) {
      if (file !== undefined && fs.existsSync(file)) fs.rmSync(file, { force: true });
    }
  }

  /** Removes the old plaintext file once encrypted tokens exist, so credentials stop sitting in the clear. */
  discardLegacyPlaintext(): boolean {
    if (this.legacyPlaintextFile === undefined || !fs.existsSync(this.legacyPlaintextFile)) return false;
    if (this.read() === null) return false;
    fs.rmSync(this.legacyPlaintextFile, { force: true });
    return true;
  }

  isEncryptedAtRest(): boolean {
    try {
      if (!fs.existsSync(this.file)) return false;
      return fs.readFileSync(this.file).subarray(0, ENCRYPTED_MARKER.length).equals(ENCRYPTED_MARKER);
    } catch {
      return false;
    }
  }
}
