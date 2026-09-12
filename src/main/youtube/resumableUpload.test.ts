import * as http from 'http';
import { afterEach, describe, expect, it } from 'vitest';
import { classifyFailure, parseConfirmedBytes, uploadVideoResumable, type UploaderDeps } from './resumableUpload';

interface FakeYouTube {
  url: string;
  close(): Promise<void>;
  received: number;
  puts: string[];
}

type SessionBehaviour = (context: { range: string | null; received: number; total: number; body: Buffer }) => {
  status: number;
  headers?: Record<string, string>;
  body?: string;
};

const servers: FakeYouTube[] = [];

async function startFakeYouTube(behaviour: SessionBehaviour, total: number): Promise<FakeYouTube> {
  const state = { received: 0, puts: [] as string[] };
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      if (req.method === 'POST') {
        res.writeHead(200, { location: `${fake.url}/session/1` });
        res.end('{}');
        return;
      }
      const range = req.headers['content-range'] ?? null;
      state.puts.push(String(range));
      const result = behaviour({ range: range as string | null, received: state.received, total, body: Buffer.concat(chunks) });
      if (result.status === 308 && result.headers?.range !== undefined) {
        state.received = Number(/bytes=0-(\d+)/.exec(result.headers.range)?.[1] ?? -1) + 1;
      }
      res.writeHead(result.status, result.headers ?? {});
      res.end(result.body ?? '');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const fake: FakeYouTube = {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        // undici keeps sockets alive, so close() alone never settles and the worker is killed.
        server.closeAllConnections();
        server.close(() => resolve());
      }),
    get received() {
      return state.received;
    },
    get puts() {
      return state.puts;
    }
  };
  servers.push(fake);
  return fake;
}

afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
});

const CONTENT = Buffer.alloc(2500, 7);

function deps(extra: Partial<UploaderDeps> = {}): UploaderDeps {
  return {
    accessToken: async () => 'token',
    readChunk: async (_path, start, length) => CONTENT.subarray(start, start + length),
    sleep: async () => undefined,
    chunkSize: 1000,
    ...extra
  };
}

const request = (server: FakeYouTube, overrides: Record<string, unknown> = {}) => ({
  filePath: 'clip.mov',
  fileSize: CONTENT.length,
  mimeType: 'video/quicktime',
  metadata: { snippet: { title: 'clip' }, status: { privacyStatus: 'private' } },
  ...overrides
});

describe('helpers', () => {
  it('reads the confirmed byte count from a Range header', () => {
    expect(parseConfirmedBytes('bytes=0-999')).toBe(1000);
    expect(parseConfirmedBytes(null)).toBe(0);
    expect(parseConfirmedBytes('nonsense')).toBe(0);
  });

  it('classifies failures the way the retry policy needs', () => {
    expect(classifyFailure(503, '')).toMatchObject({ retryable: true, hold: 'api' });
    expect(classifyFailure(429, '')).toMatchObject({ retryable: true, hold: 'api' });
    expect(classifyFailure(403, JSON.stringify({ error: { errors: [{ reason: 'quotaExceeded' }] } }))).toMatchObject({
      retryable: false,
      code: 'quotaExceeded',
      hold: 'upload_quota'
    });
    expect(classifyFailure(400, JSON.stringify({ error: { errors: [{ reason: 'invalidTitle' }] } }))).toMatchObject({
      retryable: false,
      code: 'invalidTitle'
    });
  });
});

describe('uploading', () => {
  it('sends the file in chunks and returns the video id', async () => {
    const server = await startFakeYouTube(({ received, total, body }) => {
      const next = received + body.length;
      return next >= total
        ? { status: 200, body: JSON.stringify({ id: 'yt-123' }) }
        : { status: 308, headers: { range: `bytes=0-${next - 1}` } };
    }, CONTENT.length);

    const sessions: string[] = [];
    const progress: number[] = [];
    const outcome = await uploadVideoResumable(
      request(server),
      deps({ endpoint: `${server.url}/upload`, onSession: (uri) => void sessions.push(uri), onProgress: (bytes) => progress.push(bytes) })
    );

    expect(outcome).toMatchObject({ status: 'completed', videoId: 'yt-123' });
    expect(sessions).toHaveLength(1);
    expect(progress).toEqual([1000, 2000]);
    expect(server.puts).toEqual(['bytes 0-999/2500', 'bytes 1000-1999/2500', 'bytes 2000-2499/2500']);
  });

  it('continues from the offset YouTube reports, not the one we assumed', async () => {
    const server = await startFakeYouTube(({ range, received, total, body }) => {
      if (range === `bytes */${total}`) return { status: 308, headers: { range: 'bytes=0-499' } };
      const next = received + body.length;
      return next >= total ? { status: 200, body: JSON.stringify({ id: 'yt-resumed' }) } : { status: 308, headers: { range: `bytes=0-${next - 1}` } };
    }, CONTENT.length);

    const outcome = await uploadVideoResumable(
      request(server, { sessionUri: `${server.url}/session/1`, bytesConfirmed: 2000 }),
      deps({ endpoint: `${server.url}/upload` })
    );

    expect(outcome).toMatchObject({ status: 'completed', videoId: 'yt-resumed' });
    // It trusted the server's 500, not the local 2000.
    expect(server.puts[1]).toBe('bytes 500-1499/2500');
  });
});

describe('failures', () => {
  it('retries a 5xx and then succeeds', async () => {
    let failuresLeft = 2;
    const server = await startFakeYouTube(({ received, total, body }) => {
      if (failuresLeft > 0) {
        failuresLeft -= 1;
        return { status: 503, body: 'server busy' };
      }
      const next = received + body.length;
      return next >= total ? { status: 200, body: JSON.stringify({ id: 'yt-retry' }) } : { status: 308, headers: { range: `bytes=0-${next - 1}` } };
    }, CONTENT.length);

    const waits: number[] = [];
    const outcome = await uploadVideoResumable(
      request(server),
      deps({ endpoint: `${server.url}/upload`, sleep: async (ms) => void waits.push(ms) })
    );
    expect(outcome).toMatchObject({ status: 'completed', videoId: 'yt-retry' });
    expect(waits).toEqual([2000, 4000]);
  });

  it('gives up on a 5xx that never clears, and asks the scheduler to back off', async () => {
    const server = await startFakeYouTube(() => ({ status: 500, body: 'boom' }), CONTENT.length);
    const outcome = await uploadVideoResumable(request(server), deps({ endpoint: `${server.url}/upload`, attemptsPerChunk: 3 }));
    expect(outcome).toMatchObject({ status: 'failed', retryable: true, hold: 'api' });
  });

  it('stops immediately when the upload quota is spent', async () => {
    const server = await startFakeYouTube(
      () => ({ status: 403, body: JSON.stringify({ error: { errors: [{ reason: 'uploadLimitExceeded' }] } }) }),
      CONTENT.length
    );
    const outcome = await uploadVideoResumable(request(server), deps({ endpoint: `${server.url}/upload` }));
    expect(outcome).toMatchObject({ status: 'failed', retryable: false, code: 'uploadLimitExceeded', hold: 'upload_quota' });
  });

  it('treats an expired session early in the file as a restart', async () => {
    const server = await startFakeYouTube(() => ({ status: 404, body: 'gone' }), CONTENT.length);
    const outcome = await uploadVideoResumable(
      request(server, { sessionUri: `${server.url}/session/1`, bytesConfirmed: 500 }),
      deps({ endpoint: `${server.url}/upload` })
    );
    expect(outcome).toEqual({ status: 'session_lost' });
  });

  it('never retries an expired session whose final chunk was already sent', async () => {
    const server = await startFakeYouTube(() => ({ status: 404, body: 'gone' }), CONTENT.length);
    const outcome = await uploadVideoResumable(
      request(server, { sessionUri: `${server.url}/session/1`, bytesConfirmed: 2000 }),
      deps({ endpoint: `${server.url}/upload` })
    );
    expect(outcome).toMatchObject({ status: 'possible_duplicate' });
  });

  it('recovers a crash that happened after YouTube accepted the file', async () => {
    // A finished session replays its response, which is how the upload is recovered
    // instead of being sent a second time.
    const server = await startFakeYouTube(() => ({ status: 201, body: JSON.stringify({ id: 'yt-already-there' }) }), CONTENT.length);
    const outcome = await uploadVideoResumable(
      request(server, { sessionUri: `${server.url}/session/1`, bytesConfirmed: 1000 }),
      deps({ endpoint: `${server.url}/upload` })
    );
    expect(outcome).toMatchObject({ status: 'completed', videoId: 'yt-already-there' });
  });

  it('flags a session lost while the final chunk was in flight', async () => {
    const server = await startFakeYouTube(({ range, received, total, body }) => {
      if (range === `bytes */${total}`) return { status: 308, headers: { range: 'bytes=0-1999' } };
      const next = received + body.length;
      return next >= total ? { status: 404, body: 'gone' } : { status: 308, headers: { range: `bytes=0-${next - 1}` } };
    }, CONTENT.length);

    const outcome = await uploadVideoResumable(
      request(server, { sessionUri: `${server.url}/session/1`, bytesConfirmed: 2000 }),
      deps({ endpoint: `${server.url}/upload` })
    );
    expect(outcome).toMatchObject({ status: 'possible_duplicate' });
  });
});
