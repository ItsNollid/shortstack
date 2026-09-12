// Waits for Google's redirect on a loopback server. Bound to 127.0.0.1 on an ephemeral port,
// always closed on every exit path, and never resolved twice.
import * as http from 'http';
import { createPkcePair, createState, validateCallback } from './oauthFlow';

export interface AuthCodeRequest {
  makeAuthUrl(redirectUri: string, state: string, challenge: string): string;
  openBrowser(url: string): void | Promise<void>;
  timeoutMs?: number;
  signal?: AbortSignal;
  callbackPath?: string;
}

export type AuthCodeResult =
  | { ok: true; code: string; verifier: string; redirectUri: string }
  | { ok: false; reason: string; cancelled: boolean };

const PAGE = (message: string) =>
  `<!doctype html><meta charset="utf-8"><title>ShortStack</title>` +
  `<body style="font-family:system-ui;background:#0f0f0f;color:#f1f1f1;display:grid;place-items:center;height:100vh;margin:0">` +
  `<p>${message}</p></body>`;

export async function awaitAuthorizationCode(request: AuthCodeRequest): Promise<AuthCodeResult> {
  const callbackPath = request.callbackPath ?? '/oauth2callback';
  const timeoutMs = request.timeoutMs ?? 5 * 60 * 1000;
  const { verifier, challenge } = createPkcePair();
  const state = createState();

  const server = http.createServer();
  let settle: ((result: AuthCodeResult) => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const finish = (result: AuthCodeResult): void => {
    if (settle === null) return;
    const resolve = settle;
    settle = null;
    if (timer !== null) clearTimeout(timer);
    server.closeAllConnections();
    server.close(() => resolve(result));
  };

  const result = await new Promise<AuthCodeResult>((resolve) => {
    settle = resolve;

    server.on('request', (req, res) => {
      const requestUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (requestUrl.pathname !== callbackPath) {
        // Browsers ask for /favicon.ico; that is not an answer, so keep waiting.
        res.writeHead(404).end();
        return;
      }
      const outcome = validateCallback(requestUrl, state);
      res.writeHead(outcome.ok ? 200 : 400, { 'content-type': 'text/html; charset=utf-8' });
      res.end(PAGE(outcome.ok ? 'Sign-in received. You can close this tab and go back to ShortStack.' : outcome.reason));
      finish(
        outcome.ok
          ? { ok: true, code: outcome.code, verifier, redirectUri: `http://127.0.0.1:${port}${callbackPath}` }
          : { ok: false, reason: outcome.reason, cancelled: outcome.cancelled }
      );
    });

    server.on('error', (error: Error) => finish({ ok: false, reason: `Could not start the sign-in listener: ${error.message}`, cancelled: false }));

    const cancel = () => finish({ ok: false, reason: 'Sign-in was cancelled', cancelled: true });
    if (request.signal?.aborted === true) {
      cancel();
      return;
    }
    request.signal?.addEventListener('abort', cancel, { once: true });

    let port = 0;
    // Port 0 lets the OS pick a free one: a stale listener can never block the next attempt,
    // and 127.0.0.1 keeps it off the network.
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        finish({ ok: false, reason: 'Could not start the sign-in listener', cancelled: false });
        return;
      }
      port = address.port;
      timer = setTimeout(() => finish({ ok: false, reason: 'Sign-in timed out', cancelled: false }), timeoutMs);
      if (typeof timer.unref === 'function') timer.unref();

      const redirectUri = `http://127.0.0.1:${port}${callbackPath}`;
      void (async () => {
        try {
          await request.openBrowser(request.makeAuthUrl(redirectUri, state, challenge));
        } catch (error) {
          finish({
            ok: false,
            reason: `Could not open the browser: ${error instanceof Error ? error.message : String(error)}`,
            cancelled: false
          });
        }
      })();
    });
  });

  return result;
}
