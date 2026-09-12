import { describe, expect, it } from 'vitest';
import { connectionStage, describeConnection, type ConnectionFacts, type ConnectionStage } from './connection';

const facts = (over: Partial<ConnectionFacts> = {}): ConnectionFacts => ({
  state: 'ok',
  hasClientSecret: true,
  hasChannel: true,
  ...over
});

const ALL_STAGES: ConnectionStage[] = [
  'no_credentials',
  'disconnected',
  'expired',
  'offline',
  'channel_unknown',
  'connected'
];

describe('connectionStage', () => {
  it('never calls a signed-in app disconnected just because the channel is unknown', () => {
    // The bug this replaces: state ok with no channel row rendered "Not connected" and "Connected"
    // one above the other, because two facts were being shown as one.
    expect(connectionStage(facts({ hasChannel: false }))).toBe('channel_unknown');
    expect(connectionStage(facts({ hasChannel: true }))).toBe('connected');
  });

  it('puts missing credentials ahead of everything else, because nothing else can happen first', () => {
    expect(connectionStage(facts({ hasClientSecret: false, state: 'disconnected' }))).toBe('no_credentials');
    expect(connectionStage(facts({ hasClientSecret: false, state: 'ok' }))).toBe('no_credentials');
  });

  it('reports what the grant is actually doing', () => {
    expect(connectionStage(facts({ state: 'expired' }))).toBe('expired');
    expect(connectionStage(facts({ state: 'offline' }))).toBe('offline');
    expect(connectionStage(facts({ state: 'disconnected' }))).toBe('disconnected');
  });
});

describe('describeConnection', () => {
  it('has copy for every stage, and never contradicts itself', () => {
    for (const stage of ALL_STAGES) {
      const copy = describeConnection(stage, { channelTitle: 'My Channel' });
      expect(copy.headline.length).toBeGreaterThan(0);
      expect(copy.detail.length).toBeGreaterThan(0);
      expect(copy.badge.length).toBeGreaterThan(0);
      // The exact failure that was on screen: one line saying connected, another saying not.
      const all = `${copy.headline} ${copy.badge} ${copy.detail}`.toLowerCase();
      expect(all.includes('not connected') && all.includes('ready to upload')).toBe(false);
    }
  });

  it('explains dry-run rather than blaming the connection', () => {
    const dry = describeConnection('channel_unknown', { dryRun: true });
    const live = describeConnection('channel_unknown', { dryRun: false });
    expect(dry.detail).toContain('dry-run');
    expect(live.detail).not.toContain('dry-run');
  });

  it('does not put the same words in the headline and the pill', () => {
    for (const stage of ALL_STAGES) {
      const copy = describeConnection(stage, { channelTitle: 'My Channel' });
      expect(copy.badge.toLowerCase()).not.toBe(copy.headline.toLowerCase());
    }
  });

  it('uses the channel name as the headline once it is known', () => {
    expect(describeConnection('connected', { channelTitle: 'Waffl Shorts' }).headline).toBe('Waffl Shorts');
    expect(describeConnection('connected', { channelTitle: null }).headline).toBe('Connected');
  });

  it('offers reconnecting only where it would actually help', () => {
    expect(describeConnection('offline').offerConnect).toBe(false);
    expect(describeConnection('no_credentials').offerConnect).toBe(false);
    expect(describeConnection('connected').offerConnect).toBe(false);
    expect(describeConnection('expired').offerConnect).toBe(true);
    expect(describeConnection('channel_unknown').offerConnect).toBe(true);
  });
});
