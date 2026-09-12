import * as crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import { REQUIRED_SCOPES, buildAuthUrl, createPkcePair, createState, parseClientSecret, validateCallback } from './oauthFlow';

describe('PKCE', () => {
  it('derives the challenge as the S256 hash of the verifier', () => {
    const { verifier, challenge } = createPkcePair();
    const expected = crypto.createHash('sha256').update(verifier).digest('base64url');
    expect(challenge).toBe(expected);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('produces a different verifier and state every time', () => {
    const verifiers = new Set(Array.from({ length: 20 }, () => createPkcePair().verifier));
    const states = new Set(Array.from({ length: 20 }, () => createState()));
    expect(verifiers.size).toBe(20);
    expect(states.size).toBe(20);
  });
});

describe('buildAuthUrl', () => {
  const url = () =>
    new URL(
      buildAuthUrl({
        clientId: 'client-123',
        redirectUri: 'http://127.0.0.1:51234/oauth2callback',
        scopes: REQUIRED_SCOPES,
        state: 'state-abc',
        challenge: 'challenge-xyz'
      })
    );

  it('asks for offline access with consent, so a refresh token comes back', () => {
    const params = url().searchParams;
    expect(params.get('access_type')).toBe('offline');
    expect(params.get('prompt')).toBe('consent');
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(params.get('code_challenge')).toBe('challenge-xyz');
    expect(params.get('state')).toBe('state-abc');
    expect(params.get('response_type')).toBe('code');
  });

  it('requests every scope the app needs, including the ones the old build lacked', () => {
    const scopes = (url().searchParams.get('scope') ?? '').split(' ');
    expect(scopes).toContain('https://www.googleapis.com/auth/youtube.upload');
    expect(scopes).toContain('https://www.googleapis.com/auth/youtube.force-ssl');
    expect(scopes).toContain('https://www.googleapis.com/auth/yt-analytics.readonly');
  });

  it('points back at the loopback address it will actually listen on', () => {
    expect(url().searchParams.get('redirect_uri')).toBe('http://127.0.0.1:51234/oauth2callback');
  });
});

describe('validateCallback', () => {
  const callback = (query: string) => new URL(`http://127.0.0.1:51234/oauth2callback${query}`);

  it('accepts a matching state and returns the code', () => {
    expect(validateCallback(callback('?code=abc123&state=expected'), 'expected')).toEqual({ ok: true, code: 'abc123' });
  });

  it('rejects a response whose state does not match, or is missing', () => {
    expect(validateCallback(callback('?code=abc123&state=other'), 'expected')).toMatchObject({ ok: false, cancelled: false });
    expect(validateCallback(callback('?code=abc123'), 'expected')).toMatchObject({ ok: false });
    // An injected code must never be exchanged.
    expect(validateCallback(callback('?code=attacker-code&state='), 'expected').ok).toBe(false);
  });

  it('separates a cancelled sign-in from a real failure', () => {
    expect(validateCallback(callback('?error=access_denied&state=expected'), 'expected')).toMatchObject({
      ok: false,
      cancelled: true,
      reason: expect.stringMatching(/cancelled/i)
    });
    expect(validateCallback(callback('?error=invalid_scope&state=expected'), 'expected')).toMatchObject({ ok: false, cancelled: false });
  });

  it('rejects a redirect with no code at all, such as a favicon request', () => {
    expect(validateCallback(callback('?state=expected'), 'expected')).toMatchObject({ ok: false });
    expect(validateCallback(callback(''), 'expected')).toMatchObject({ ok: false });
  });
});

describe('parseClientSecret', () => {
  it('accepts both shapes Google hands out', () => {
    const installed = JSON.stringify({ installed: { client_id: 'id', client_secret: 'secret' } });
    const web = JSON.stringify({ web: { client_id: 'id2', client_secret: 'secret2' } });
    expect(parseClientSecret(installed)).toEqual({ ok: true, value: { clientId: 'id', clientSecret: 'secret' } });
    expect(parseClientSecret(web)).toEqual({ ok: true, value: { clientId: 'id2', clientSecret: 'secret2' } });
  });

  it('explains what is wrong instead of failing later at sign-in', () => {
    expect(parseClientSecret('not json')).toMatchObject({ ok: false, reason: expect.stringMatching(/JSON/) });
    expect(parseClientSecret(JSON.stringify({ api_key: 'x' }))).toMatchObject({ ok: false, reason: expect.stringMatching(/Desktop app/) });
    expect(parseClientSecret(JSON.stringify({ installed: { client_id: 'id' } }))).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/missing/)
    });
  });
});
