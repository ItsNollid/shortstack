import { describe, expect, it } from 'vitest';
import type { Brief, Fact } from '../insights';
import { STALE_AFTER_MS, channelFacts } from './channelFacts';

const NOW = new Date('2026-09-19T12:00:00.000Z');
const fact = (over: Partial<Fact> = {}): Fact => ({
  id: 'time-of-day',
  statement: 'Evening videos get the most views: a median of 900 across 12 videos.',
  sampleSize: 12,
  confidence: 'strong',
  ...over
});
const brief = (over: Partial<Brief> = {}): Brief => ({
  usable: [fact()],
  missing: [],
  videoCount: 34,
  tooEarly: false,
  madeAt: new Date(NOW.getTime() - 60_000).toISOString(),
  ...over
});

describe('what the assistant may say about the channel', () => {
  it('says nothing is measured when Analytics has never been refreshed', () => {
    expect(channelFacts(null, NOW)).toEqual([
      { id: 'channel-none', text: 'Nothing has been measured about this channel yet: Analytics has not been refreshed.', derived: false }
    ]);
  });

  it('passes on each finding as written, marked as ShortStack’s own calculation', () => {
    const facts = channelFacts(brief(), NOW);
    expect(facts).toContainEqual({
      id: 'finding:time-of-day',
      text: 'Evening videos get the most views: a median of 900 across 12 videos. (a strong finding, across 12 videos)',
      derived: true
    });
    expect(facts.map((each) => each.id)).not.toContain('channel-stale');
  });

  it('calls a weak finding weak', () => {
    const [first] = channelFacts(brief({ usable: [fact({ confidence: 'weak', sampleSize: 4 })] }), NOW);
    expect(first?.text).toContain('a weak finding, from few videos');
  });

  it('says so when the findings are more than a week old, or carry no date', () => {
    const old = channelFacts(brief({ madeAt: new Date(NOW.getTime() - STALE_AFTER_MS - 60_000).toISOString() }), NOW);
    expect(old[0]?.id).toBe('channel-stale');
    const undated = channelFacts({ usable: [], missing: [], videoCount: 3, tooEarly: true }, NOW);
    expect(undated.map((each) => each.id)).toEqual(['channel-stale', 'channel-too-early']);
  });

  it('lists what is not measured yet, not as a calculation', () => {
    const missing = fact({ id: 'tags', statement: 'Tags cannot be compared yet: 2 videos use them.', confidence: 'insufficient' });
    expect(channelFacts(brief({ missing: [missing] }), NOW)).toContainEqual({
      id: 'missing:tags',
      text: 'Not measured yet: Tags cannot be compared yet: 2 videos use them.',
      derived: false
    });
  });
});
