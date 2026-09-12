// The decision-making half of the sign-in flow: PKCE, the state parameter, the authorization
// URL and validation of whatever comes back to the loopback server. Pure, so the security
// checks are tested directly rather than by clicking through a browser.
import * as crypto from 'crypto';

export const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';

export const REQUIRED_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  // Needed to set a publish time, change visibility or edit metadata after upload.
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/yt-analytics.readonly'
] as const;

export interface PkcePair {
  verifier: string;
  challenge: string;
}

const base64url = (buffer: Buffer): string => buffer.toString('base64url');

export function createPkcePair(randomBytes: (size: number) => Buffer = crypto.randomBytes): PkcePair {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export function createState(randomBytes: (size: number) => Buffer = crypto.randomBytes): string {
  return base64url(randomBytes(24));
}

export interface AuthUrlInput {
  clientId: string;
  redirectUri: string;
  scopes: readonly string[];
  state: string;
  challenge: string;
}

export function buildAuthUrl({ clientId, redirectUri, scopes, state, challenge }: AuthUrlInput): string {
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scopes.join(' '));
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  // offline + consent: a refresh token comes back only on consent, and losing it means
  // uploads stop about an hour later.
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  return url.toString();
}

export type CallbackResult =
  | { ok: true; code: string }
  | { ok: false; reason: string; cancelled: boolean };

/** Validates the redirect. A wrong or missing state is rejected: anything on the machine, or the
 *  local network, could otherwise hand the loopback server an authorization code of its choosing. */
export function validateCallback(requestUrl: URL, expectedState: string): CallbackResult {
  const error = requestUrl.searchParams.get('error');
  if (error !== null) {
    const cancelled = error === 'access_denied';
    return { ok: false, cancelled, reason: cancelled ? 'Sign-in was cancelled' : `Google refused the sign-in (${error})` };
  }
  const state = requestUrl.searchParams.get('state');
  if (state === null || state !== expectedState) {
    return { ok: false, cancelled: false, reason: 'That sign-in response did not match this request, so it was ignored' };
  }
  const code = requestUrl.searchParams.get('code');
  if (code === null || code === '') return { ok: false, cancelled: false, reason: 'Google did not return an authorization code' };
  return { ok: true, code };
}

export interface ClientSecret {
  clientId: string;
  clientSecret: string;
}

/** Reads either shape Google hands out (installed or web) and says plainly what is wrong. */
export function parseClientSecret(json: string): { ok: true; value: ClientSecret } | { ok: false; reason: string } {
  let parsed: { installed?: Record<string, string>; web?: Record<string, string> };
  try {
    parsed = JSON.parse(json) as typeof parsed;
  } catch {
    return { ok: false, reason: "That file isn't valid JSON" };
  }
  const section = parsed.installed ?? parsed.web;
  if (section === undefined) {
    return { ok: false, reason: 'That file is not an OAuth client secret: download the Desktop app credentials from Google Cloud' };
  }
  const clientId = section.client_id ?? '';
  const clientSecret = section.client_secret ?? '';
  if (clientId === '' || clientSecret === '') return { ok: false, reason: 'That client secret is missing its client id or secret' };
  return { ok: true, value: { clientId, clientSecret } };
}
