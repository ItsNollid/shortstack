import { describe, expect, it } from 'vitest';
import type { AssistantEvent } from '../../shared/assistant/types';
import type { AiResult } from '../ai/ollamaClient';
import type { ChatAnswer, ChatRequest } from '../ai/ollamaChat';
import { writeSetting } from '../db/settingsRepo';
import { createTestDb } from '../db/testFixtures';
import { AssistantService } from './service';

const NOW = new Date('2026-09-19T12:00:00.000Z');
const TAGS = { models: [{ name: 'llama3.2:latest', capabilities: ['completion'] }] };
const ollama = (tags: unknown = TAGS): typeof fetch =>
  (async (url: string) => new Response(JSON.stringify(String(url).endsWith('/api/tags') ? tags : {}))) as unknown as typeof fetch;
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));
const ID = '3f2b8c1e-9a4d-4e6b-8f7a-1c2d3e4f5a6b';

function setup(chat: (request: ChatRequest) => Promise<AiResult<ChatAnswer>>, tags: unknown = TAGS) {
  const db = createTestDb();
  writeSetting(db, 'ai_model', 'llama3.2:latest');
  const events: AssistantEvent[] = [];
  const service = new AssistantService({ db, videoStats: () => null, emit: (event) => events.push(event), fetch: ollama(tags), chat, now: () => NOW });
  return { db, events, service };
}

describe('answering one question at a time', () => {
  it('streams the words, then a checked answer', async () => {
    const { events, service } = setup(async (request) => {
      request.onText('The title is');
      request.onText('The title is fine.\nCHANG');
      return {
        ok: true,
        value: { text: 'The title is fine, 47% better.\nCHANGES: [{"kind":"set_max_hashtags","value":5},{"kind":"approve"}]', finished: true }
      };
    });
    service.ask(ID, { kind: 'channel' }, 'Is my title good?', []);
    await settle();
    expect(events.filter((event) => event.type === 'text').map((event) => (event.type === 'text' ? event.text : ''))).toEqual([
      'The title is',
      'The title is fine.'
    ]);
    expect(events[events.length - 1]).toEqual({
      requestId: ID,
      type: 'done',
      prose: 'The title is fine, 47% better.',
      changes: [{ kind: 'setting', action: { kind: 'set_max_hashtags', value: 5 } }],
      unsupportedNumbers: ['47%'],
      basedOn: 'nothing measured yet',
      ownCalculations: false,
      needsRefresh: true,
      finished: true
    });
  });

  it('labels an answer given ShortStack’s own calculations', async () => {
    const { db, events, service } = setup(async () => ({ ok: true, value: { text: 'Post in the evening.', finished: true } }));
    writeSetting(
      db,
      'insight_findings',
      JSON.stringify({
        usable: [{ id: 'time-of-day', statement: 'Evening videos get the most views.', sampleSize: 12, confidence: 'strong' }],
        missing: [],
        videoCount: 34,
        tooEarly: false,
        madeAt: '2026-09-19T10:00:00.000Z'
      })
    );
    service.ask(ID, { kind: 'channel' }, 'When should I post?', []);
    await settle();
    expect(events[events.length - 1]).toMatchObject({ type: 'done', ownCalculations: true, needsRefresh: false });
  });

  it('says so when the video is gone', async () => {
    const { events, service } = setup(async () => ({ ok: true, value: { text: '', finished: true } }));
    service.ask(ID, { kind: 'video', queueId: 999 }, 'Is this title good?', []);
    await settle();
    expect(events).toEqual([{ requestId: ID, type: 'error', code: 'not_found', reason: 'That video is no longer in the queue' }]);
  });

  it('passes on why no model could be asked', async () => {
    const { db, events, service } = setup(async () => ({ ok: true, value: { text: '', finished: true } }), { models: [] });
    writeSetting(db, 'ai_model', '');
    service.ask(ID, { kind: 'channel' }, 'Hi', []);
    await settle();
    expect(events[0]).toMatchObject({ type: 'error', code: 'no_models' });
  });

  it('stops when asked, keeping what arrived', async () => {
    const { events, service } = setup(
      (request) =>
        new Promise((resolve) => {
          request.onText('Half');
          request.signal.addEventListener('abort', () => resolve({ ok: true, value: { text: 'Half', finished: false } }));
        })
    );
    service.ask(ID, { kind: 'channel' }, 'Hi', []);
    await settle();
    service.stop(ID);
    await settle();
    expect(events[events.length - 1]).toMatchObject({ type: 'done', prose: 'Half', finished: false });
  });
});
