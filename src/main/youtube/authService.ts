// Holds the connection to YouTube: exchanging a code, refreshing, reporting state, disconnecting.
// Uses plain fetch against Google's token endpoint so it can be tested without a browser.
import * as fs from 'fs';
import { REQUIRED_SCOPES, parseClientSecret, type ClientSecret } from './oauthFlow';
import { TokenStore, missingScopes } from './tokenStore';

export const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';

/** disconnected: nothing stored. expired: Google rejected the refresh token. offline: no network. */
export type AuthState = 'ok' | 'expired' | 'offline' | 'disconnected';

export interface AuthServiceDeps {
  store: TokenStore;
  clientSecretFile: string;
  fetch?: typeof fetch;
  tokenEndpoint?: string;
  revokeEndpoint?: string;
  now?: () => Date;
}

export type AuthOutcome = { ok: true } | { ok: false; reason: string; state: AuthState };

const EXPIRY_MARGIN_MS = 60_000;

export class AuthService {
  private lastFailure: 'expired' | 'offline' | null = null;

  constructor(private readonly deps: AuthServiceDeps) {}

  clientSecret(): ClientSecret | null {
    try {
      const parsed = parseClientSecret(fs.readFileSync(this.deps.clientSecretFile, 'utf8'));
      return parsed.ok ? parsed.value : null;
    } catch {
      return null;
    }
  }

  state(): AuthState {
    if (this.clientSecret() === null) return 'disconnected';
    const tokens = this.deps.store.read();
    if (tokens === null || tokens.refresh_token === undefined) return 'disconnected';
    return this.lastFailure ?? 'ok';
  }

  /** False when the operating system had no secure storage and the tokens had to go to disk in
   *  the clear. The user is told rather than left to assume. */
  tokensEncrypted(): boolean {
    return this.deps.store.read() === null || this.deps.store.isEncryptedAtRest();
  }

  /** Scopes the stored grant is missing, which is how the UI knows to ask for one reconnect. */
  missingScopes(): string[] {
    return missingScopes(this.deps.store.read(), REQUIRED_SCOPES);
  }

  async accessToken(): Promise<string> {
    const tokens = this.deps.store.read();
    const now = (this.deps.now ?? (() => new Date()))().getTime();
    if (tokens?.access_token !== undefined && (tokens.expiry_date ?? 0) - EXPIRY_MARGIN_MS > now) return tokens.access_token;

    const refreshed = await this.refresh();
    if (!refreshed.ok) throw new Error(refreshed.reason);
    const current = this.deps.store.read();
    if (current?.access_token === undefined) throw new Error('No access token available');
    return current.access_token;
  }

  async refresh(): Promise<AuthOutcome> {
    const secret = this.clientSecret();
    const tokens = this.deps.store.read();
    if (secret === null || tokens?.refresh_token === undefined) {
      return { ok: false, reason: 'ShortStack is not connected to YouTube', state: 'disconnected' };
    }
    return this.requestToken(
      {
        client_id: secret.clientId,
        client_secret: secret.clientSecret,
        refresh_token: tokens.refresh_token,
        grant_type: 'refresh_token'
      },
      'Could not refresh the YouTube connection'
    );
  }

  async exchangeCode(code: string, verifier: string, redirectUri: string): Promise<AuthOutcome> {
    const secret = this.clientSecret();
    if (secret === null) return { ok: false, reason: 'No client secret is installed', state: 'disconnected' };
    return this.requestToken(
      {
        client_id: secret.clientId,
        client_secret: secret.clientSecret,
        code,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      },
      'Could not complete the sign-in'
    );
  }

  private async requestToken(form: Record<string, string>, failureMessage: string): Promise<AuthOutcome> {
    const doFetch = this.deps.fetch ?? fetch;
    const now = (this.deps.now ?? (() => new Date()))().getTime();
    try {
      const response = await doFetch(this.deps.tokenEndpoint ?? TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(form).toString()
      });
      const body = await response.text();
      if (!response.ok) {
        const error = (() => {
          try {
            return (JSON.parse(body) as { error?: string }).error ?? null;
          } catch {
            return null;
          }
        })();
        // invalid_grant means the refresh token is dead: only a new sign-in fixes it.
        this.lastFailure = error === 'invalid_grant' ? 'expired' : null;
        return { ok: false, reason: `${failureMessage} (${error ?? response.status})`, state: this.lastFailure ?? 'ok' };
      }

      const parsed = JSON.parse(body) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
      this.deps.store.merge({
        access_token: parsed.access_token,
        refresh_token: parsed.refresh_token,
        scope: parsed.scope,
        expiry_date: parsed.expires_in === undefined ? undefined : now + parsed.expires_in * 1000
      });
      this.deps.store.discardLegacyPlaintext();
      this.lastFailure = null;
      return { ok: true };
    } catch (error) {
      // A network problem is not a lost connection: keep the tokens and say so.
      this.lastFailure = 'offline';
      return { ok: false, reason: `${failureMessage}: ${error instanceof Error ? error.message : String(error)}`, state: 'offline' };
    }
  }

  /** Revokes the grant with Google, then removes every stored token. */
  async disconnect(): Promise<void> {
    const tokens = this.deps.store.read();
    const token = tokens?.refresh_token ?? tokens?.access_token;
    if (token !== undefined) {
      try {
        await (this.deps.fetch ?? fetch)(`${this.deps.revokeEndpoint ?? REVOKE_ENDPOINT}?token=${encodeURIComponent(token)}`, {
          method: 'POST'
        });
      } catch {
        // Revocation is best effort; the local tokens go either way.
      }
    }
    this.deps.store.clear();
    this.lastFailure = null;
  }
}
