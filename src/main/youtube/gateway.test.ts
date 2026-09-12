import * as http from 'http';
import { afterEach, describe, expect, it } from 'vitest';
import { DryRunYouTubeGateway, HttpYouTubeGateway } from './gateway';

interface FakeApi {
  url: string;
  close(): Promise<void>;
  requests: Array<{ method: string; path: string; body: string }>;
}

type Route = (req: { method: string; path: string; body: string }) => { status: number; body: unknown };
const servers: FakeApi[] = [];

async function startApi(route: Route): Promise<FakeApi> {
  const requests: Array<{ method: string; path: string; body: string }> = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const entry = { method: req.method ?? '', path: req.url ?? '', body: Buffer.concat(chunks).toString('utf8') };
      requests.push(entry);
      const result = route(entry);
      res.writeHead(result.status, { 'content-type': 'application/json' });
      res.end(typeof result.body === 'string' ? result.body : JSON.stringify(result.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const api: FakeApi = {
    url: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
    requests
  };
  servers.push(api);
  return api;
}

afterEach(async () => {
  for (const api of servers.splice(0)) await api.close();
});

const gatewayFor = (api: FakeApi) => new HttpYouTubeGateway({ accessToken: async () => 'token', baseUrl: api.url });

describe('channel profile', () => {
  it('reads the fields the app shows and needs', async () => {
    const api = await startApi(() => ({
      status: 200,
      body: {
        items: [
          {
            id: 'UC123',
            snippet: {
              title: "Peter's Clips",
              customUrl: '@petersclips',
              thumbnails: { default: { url: 'small.jpg' }, high: { url: 'big.jpg' } }
            },
            statistics: { subscriberCount: '1234' },
            contentDetails: { relatedPlaylists: { uploads: 'UU123' } }
          }
        ]
      }
    }));

    await expect(gatewayFor(api).fetchChannelProfile()).resolves.toEqual({
      ok: true,
      value: {
        id: 'UC123',
        title: "Peter's Clips",
        handle: '@petersclips',
        avatarUrl: 'big.jpg',
        subscriberCount: 1234,
        uploadsPlaylistId: 'UU123'
      }
    });
  });

  it('says plainly when the account has no channel', async () => {
    const api = await startApi(() => ({ status: 200, body: { items: [] } }));
    await expect(gatewayFor(api).fetchChannelProfile()).resolves.toMatchObject({ ok: false, code: 'no_channel' });
  });

  it('asks the scheduler to back off on a server error', async () => {
    const api = await startApi(() => ({ status: 503, body: 'busy' }));
    await expect(gatewayFor(api).fetchVideoStatus('yt1')).resolves.toMatchObject({ ok: false, retryable: true, hold: 'api' });
  });
});

describe('setPublishPlan', () => {
  it('preserves every status field YouTube would otherwise delete', async () => {
    const existing = {
      privacyStatus: 'private',
      selfDeclaredMadeForKids: false,
      embeddable: true,
      license: 'youtube',
      publicStatsViewable: true,
      uploadStatus: 'processed'
    };
    const api = await startApi((req) =>
      req.method === 'GET'
        ? { status: 200, body: { items: [{ status: existing }] } }
        : { status: 200, body: { status: JSON.parse(req.body).status } }
    );

    const result = await gatewayFor(api).setPublishPlan('yt1', { privacyStatus: 'private', publishAt: '2026-10-01T13:00:00.000Z' });
    expect(result).toMatchObject({ ok: true, value: { publishAt: '2026-10-01T13:00:00.000Z', privacyStatus: 'private' } });

    const update = api.requests.find((entry) => entry.method === 'PUT');
    const sent = JSON.parse(update?.body ?? '{}') as { id: string; status: Record<string, unknown> };
    expect(sent.id).toBe('yt1');
    expect(sent.status).toMatchObject({
      privacyStatus: 'private',
      publishAt: '2026-10-01T13:00:00.000Z',
      selfDeclaredMadeForKids: false,
      embeddable: true,
      license: 'youtube',
      publicStatsViewable: true
    });
    expect(sent.status.uploadStatus).toBeUndefined();
  });

  it('clears the publish time when a video is taken off the schedule', async () => {
    const api = await startApi((req) =>
      req.method === 'GET'
        ? { status: 200, body: { items: [{ status: { privacyStatus: 'private', publishAt: '2026-10-01T13:00:00.000Z' } }] } }
        : { status: 200, body: { status: JSON.parse(req.body).status } }
    );

    await gatewayFor(api).setPublishPlan('yt1', { privacyStatus: 'private', publishAt: null });
    const sent = JSON.parse(api.requests.find((entry) => entry.method === 'PUT')?.body ?? '{}') as { status: Record<string, unknown> };
    expect('publishAt' in sent.status).toBe(false);
  });

  it('flags a refused publish time so the app can ask the user to set it in Studio', async () => {
    const api = await startApi((req) =>
      req.method === 'GET'
        ? { status: 200, body: { items: [{ status: { privacyStatus: 'private' } }] } }
        : { status: 403, body: { error: { errors: [{ reason: 'forbidden' }] } } }
    );
    await expect(
      gatewayFor(api).setPublishPlan('yt1', { privacyStatus: 'private', publishAt: '2026-10-01T13:00:00.000Z' })
    ).resolves.toMatchObject({ ok: false, scheduleRefused: true, retryable: false });
  });
});

describe('recent uploads', () => {
  it('matches uploads back to files using the original filename and size', async () => {
    const api = await startApi((req) =>
      req.path.startsWith('/playlistItems')
        ? {
            status: 200,
            body: {
              items: [
                { contentDetails: { videoId: 'v1', videoPublishedAt: '2026-09-12T10:00:00Z' }, snippet: { title: 'Clip one' } },
                { contentDetails: { videoId: 'v2' }, snippet: { title: 'Clip two' } }
              ]
            }
          }
        : {
            status: 200,
            body: {
              items: [
                { id: 'v1', fileDetails: { fileName: 'peter.mov', fileSize: '29360128' } },
                { id: 'v2', fileDetails: { fileName: 'zombie.mov', fileSize: '10800000' } }
              ]
            }
          }
    );

    const result = await gatewayFor(api).listRecentUploads('UU123');
    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.value).toEqual([
        { videoId: 'v1', title: 'Clip one', publishedAt: '2026-09-12T10:00:00Z', fileName: 'peter.mov', fileSize: 29360128 },
        { videoId: 'v2', title: 'Clip two', publishedAt: null, fileName: 'zombie.mov', fileSize: 10800000 }
      ]);
    }
  });

  it('still lists uploads when file details are unavailable', async () => {
    const api = await startApi((req) =>
      req.path.startsWith('/playlistItems')
        ? { status: 200, body: { items: [{ contentDetails: { videoId: 'v1' }, snippet: { title: 'Clip' } }] } }
        : { status: 403, body: { error: { errors: [{ reason: 'forbidden' }] } } }
    );
    const result = await gatewayFor(api).listRecentUploads('UU123');
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.value[0]).toMatchObject({ videoId: 'v1', fileName: null });
  });
});

describe('dry run', () => {
  it('refuses every call rather than pretending to work', async () => {
    const gateway = new DryRunYouTubeGateway();
    for (const result of [
      await gateway.fetchChannelProfile(),
      await gateway.fetchVideoStatus(),
      await gateway.setPublishPlan(),
      await gateway.listRecentUploads()
    ]) {
      expect(result).toMatchObject({ ok: false, code: 'dry_run' });
    }
  });
});
