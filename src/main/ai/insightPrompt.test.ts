import { describe, expect, it } from 'vitest';
import { buildBrief, type VideoStat } from '../../shared/insights';
import { buildInsightPrompt, sanitizeAdvice } from './insightPrompt';

const video = (over: Partial<VideoStat> = {}): VideoStat => ({
  videoId: Math.random().toString(36).slice(2),
  title: 'A VIDEO',
  description: '',
  tags: [],
  publishedAt: '2026-09-01T14:00:00',
  views: 100,
  averageViewPercentage: 50,
  likes: 5,
  subscribersGained: 1,
  ...over
});

const many = (count: number, make: () => VideoStat): VideoStat[] => Array.from({ length: count }, make);

const withFindings = buildBrief([
  ...many(10, () => video({ publishedAt: '2026-09-01T19:00:00', views: 900 })),
  ...many(10, () => video({ publishedAt: '2026-09-02T09:00:00', views: 300 }))
]);

const prompt = (over: Partial<Parameters<typeof buildInsightPrompt>[0]> = {}): string =>
  buildInsightPrompt({ brief: withFindings, channelName: 'Nollid', goal: 'views', ...over });

describe('buildInsightPrompt', () => {
  it('gives the model the findings as finished sentences, not numbers to work on', () => {
    const text = prompt();
    for (const fact of withFindings.usable) expect(text).toContain(fact.statement);
    expect(text).toContain('Nollid');
  });

  it('names what the person is trying to grow, because it decides what better means', () => {
    expect(prompt({ goal: 'subscribers' })).toContain('turning viewers into subscribers');
    expect(prompt({ goal: 'watch_time' })).toContain('keeping people watching for longer');
    expect(prompt({ goal: 'views' })).toContain('reaching as many people as possible');
  });

  // The rules that stand between this and confident nonsense about someone's channel.
  it('forbids inventing numbers and facts, and forbids generic advice', () => {
    const text = prompt();
    expect(text).toMatch(/Do not invent numbers/);
    expect(text).toMatch(/not state any fact that is not above/);
    expect(text).toMatch(/Post consistently/);
  });

  it('marks a weak finding as a hint rather than a fact to act on', () => {
    const weak = buildBrief([
      ...many(4, () => video({ publishedAt: '2026-09-01T19:00:00', views: 900 })),
      ...many(4, () => video({ publishedAt: '2026-09-02T09:00:00', views: 300 }))
    ]);
    expect(buildInsightPrompt({ brief: weak, channelName: null, goal: 'views' })).toContain('treat it as a hint');
  });

  it('lists what could not be measured, so the advice can be about finding it out', () => {
    const text = prompt();
    expect(text).toContain('could not be measured yet');
    for (const fact of withFindings.missing) expect(text).toContain(fact.statement);
  });

  // A channel with nothing measurable must not be handed four confident recommendations.
  it('says outright when there is nothing to go on', () => {
    const empty = buildBrief([video(), video()]);
    const text = buildInsightPrompt({ brief: empty, channelName: null, goal: 'views' });
    expect(text).toContain('no usable findings yet');
    expect(text).toMatch(/too little to go on, say so/);
  });

  it('passes on how the person works when they have said', () => {
    expect(prompt({ context: 'I can only render two new videos a week.' })).toContain('two new videos a week');
  });

  it('asks for JSON and keeps itself short enough to leave room to think', () => {
    const text = prompt();
    expect(text).toContain('JSON');
    expect(text.length).toBeLessThan(4000);
  });
});

describe('sanitizeAdvice', () => {
  it('keeps a well-formed answer', () => {
    const advice = sanitizeAdvice({
      headline: 'Evenings are working.',
      recommendations: [{ action: 'Move the 9am slot to 7pm.', because: 'Evening videos get three times the views.' }]
    });
    expect(advice).toEqual({
      headline: 'Evenings are working.',
      recommendations: [{ action: 'Move the 9am slot to 7pm.', because: 'Evening videos get three times the views.' }]
    });
  });

  it('drops half-written recommendations rather than showing a blank reason', () => {
    const advice = sanitizeAdvice({
      headline: 'Fine.',
      recommendations: [{ action: 'Do a thing' }, { because: 'Only a reason' }, { action: 'Real', because: 'Reason' }]
    });
    expect(advice?.recommendations).toEqual([{ action: 'Real', because: 'Reason' }]);
  });

  it('keeps at most four, so the answer stays something a person will read', () => {
    const recommendations = Array.from({ length: 9 }, (_, index) => ({ action: `Do ${index}`, because: 'Because' }));
    expect(sanitizeAdvice({ headline: 'x', recommendations })?.recommendations).toHaveLength(4);
  });

  it('strips angle brackets, which YouTube fields refuse anyway', () => {
    expect(sanitizeAdvice({ headline: 'a <b> c', recommendations: [] })?.headline).toBe('a b c');
  });

  it('returns nothing at all for a reply with nothing in it', () => {
    expect(sanitizeAdvice(null)).toBeNull();
    expect(sanitizeAdvice('a string')).toBeNull();
    expect(sanitizeAdvice({})).toBeNull();
    expect(sanitizeAdvice({ headline: '', recommendations: [] })).toBeNull();
  });
});
