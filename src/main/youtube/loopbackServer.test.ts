import { describe, expect, it } from 'vitest';
import { awaitAuthorizationCode } from './loopbackServer';

/** Stands in for the browser: follows the URL the app would have opened. */
function browserThatRedirects(query: (state: string) => string) {
  return async (url: string) => {
    const state = new URL(url).searchParams.get('state') ?? '';
    const redirectUri = new URL(url).searchParams.get('redirect_uri') as string;
    await fetch(`${redirectUri}${query(state)}`);
  };
}

const makeAuthUrl = (redirectUri: string, state: string, challenge: string) =>
  `https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&code_challenge=${challenge}`;

describe('awaitAuthorizationCode', () => {
  it('returns the code and the verifier that goes with it', async () => {
    const result = await awaitAuthorizationCode({
      makeAuthUrl,
      openBrowser: browserThatRedirects((state) => `?code=auth-code-1&state=${state}`)
    });
    expect(result).toMatchObject({ ok: true, code: 'auth-code-1' });
    if (result.ok) {
      expect(result.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(result.redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/oauth2callback$/);
    }
  });

  it('listens only on loopback, never on the network', async () => {
    let opened = '';
    await awaitAuthorizationCode({
      makeAuthUrl,
      openBrowser: async (url) => {
        opened = url;
        const redirectUri = new URL(url).searchParams.get('redirect_uri') as string;
        const state = new URL(url).searchParams.get('state') ?? '';
        await fetch(`${redirectUri}?code=x&state=${state}`);
      }
    });
    expect(new URL(new URL(opened).searchParams.get('redirect_uri') as string).hostname).toBe('127.0.0.1');
  });

  it('refuses a response whose state does not match', async () => {
    const result = await awaitAuthorizationCode({
      makeAuthUrl,
      openBrowser: browserThatRedirects(() => '?code=injected&state=not-the-one')
    });
    expect(result).toMatchObject({ ok: false, cancelled: false });
  });

  it('reports a cancelled sign-in as cancelled', async () => {
    const result = await awaitAuthorizationCode({
      makeAuthUrl,
      openBrowser: browserThatRedirects((state) => `?error=access_denied&state=${state}`)
    });
    expect(result).toMatchObject({ ok: false, cancelled: true });
  });

  it('ignores a favicon request and still accepts the real redirect', async () => {
    const result = await awaitAuthorizationCode({
      makeAuthUrl,
      openBrowser: async (url) => {
        const redirectUri = new URL(url).searchParams.get('redirect_uri') as string;
        const state = new URL(url).searchParams.get('state') ?? '';
        const origin = new URL(redirectUri).origin;
        const favicon = await fetch(`${origin}/favicon.ico`);
        expect(favicon.status).toBe(404);
        await fetch(`${redirectUri}?code=after-favicon&state=${state}`);
      }
    });
    expect(result).toMatchObject({ ok: true, code: 'after-favicon' });
  });

  it('times out instead of waiting forever, and frees the port', async () => {
    const result = await awaitAuthorizationCode({ makeAuthUrl, openBrowser: () => undefined, timeoutMs: 30 });
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/timed out/) });

    // The old build left port 8910 bound after a failed attempt, so the next one hit EADDRINUSE.
    const second = await awaitAuthorizationCode({
      makeAuthUrl,
      openBrowser: browserThatRedirects((state) => `?code=second-attempt&state=${state}`)
    });
    expect(second).toMatchObject({ ok: true, code: 'second-attempt' });
  });

  it('can be cancelled from the app', async () => {
    const controller = new AbortController();
    const pending = awaitAuthorizationCode({
      makeAuthUrl,
      openBrowser: () => controller.abort(),
      signal: controller.signal,
      timeoutMs: 5000
    });
    await expect(pending).resolves.toMatchObject({ ok: false, cancelled: true });
  });

  it('reports a browser that will not open, rather than hanging', async () => {
    const result = await awaitAuthorizationCode({
      makeAuthUrl,
      openBrowser: () => {
        throw new Error('no handler for https');
      },
      timeoutMs: 5000
    });
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/Could not open the browser/) });
  });

  it('returns immediately when cancellation already happened', async () => {
    const result = await awaitAuthorizationCode({
      makeAuthUrl,
      openBrowser: () => undefined,
      signal: AbortSignal.abort(),
      timeoutMs: 5000
    });
    expect(result).toMatchObject({ ok: false, cancelled: true });
  });
});
