import { describe, expect, it } from 'vitest';
import { ACTION_KINDS } from '../../shared/channelActions';
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
  it('forbids numbers in the recommendation, and forbids generic advice', () => {
    const text = prompt();
    expect(text).toMatch(/Do not put numbers in your recommendation at all/);
    expect(text).toMatch(/can only introduce a mistake/);
    expect(text).toMatch(/Post consistently/);
  });

  // Asked to restate a finding, qwen3-vl:8b produced one percentage and put it on three unrelated
  // recommendations, two of which it had not described. It is not asked to restate them any more.
  it('labels each finding so a recommendation can point at one instead of describing it', () => {
    const text = prompt();
    for (const fact of withFindings.usable) expect(text).toContain(`[${fact.id}]`);
    expect(text).toMatch(/shows the finding itself underneath, word for word/);
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
      recommendations: [{ action: 'Move the 9am slot to 7pm.', basedOn: 'time-of-day' }]
    });
    expect(advice).toEqual({
      headline: 'Evenings are working.',
      recommendations: [{ action: 'Move the 9am slot to 7pm.', basedOn: 'time-of-day' }]
    });
  });

  it('drops half-written recommendations rather than showing a blank reason', () => {
    const advice = sanitizeAdvice({
      headline: 'Fine.',
      recommendations: [{ action: 'Do a thing' }, { basedOn: 'retention' }, { action: 'Real', basedOn: 'retention' }]
    });
    expect(advice?.recommendations).toEqual([{ action: 'Real', basedOn: 'retention' }]);
  });

  it('keeps at most four, so the answer stays something a person will read', () => {
    const recommendations = Array.from({ length: 9 }, (_, index) => ({ action: `Do ${index}`, basedOn: 'retention' }));
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

describe('changes the model may ask for', () => {
  it('lists every kind, so it has something real to pick from', () => {
    const text = prompt();
    for (const kind of ACTION_KINDS) expect(text, kind).toContain(kind);
  });

  it('tells it to leave the field out rather than invent one', () => {
    expect(prompt()).toMatch(/Leave "change" out entirely/);
    expect(prompt()).toMatch(/inventing one to fill the field is worse/);
  });

  it('shows the current times, so a move can name one that is actually there', () => {
    const text = prompt({ currentTimes: { newLane: ['09:00', '18:00'], rotationLane: ['11:00'] } });
    expect(text).toContain('09:00, 18:00');
    expect(text).toContain('11:00');
  });
});

describe('sanitizeAdvice and changes', () => {
  const recommendation = { action: 'Move the morning slot.', basedOn: 'time-of-day' };

  it('keeps a change that is one of the listed kinds', () => {
    const advice = sanitizeAdvice({
      headline: 'x',
      recommendations: [{ ...recommendation, change: { kind: 'set_upload_time', from: '09:00', to: '19:00' } }]
    });
    expect(advice?.recommendations[0]?.change).toMatchObject({ kind: 'set_upload_time', from: '09:00', to: '19:00' });
  });

  // The line between proposing and executing: anything else becomes no button at all.
  it('drops a change that is not on the list, keeping the advice itself', () => {
    const advice = sanitizeAdvice({
      headline: 'x',
      recommendations: [{ ...recommendation, change: { kind: 'delete_everything' } }]
    });
    expect(advice?.recommendations).toHaveLength(1);
    expect(advice?.recommendations[0]?.change).toBeUndefined();
  });

  it('drops a change whose parameters are nonsense', () => {
    const advice = sanitizeAdvice({
      headline: 'x',
      recommendations: [{ ...recommendation, change: { kind: 'add_upload_time', at: 'the evening' } }]
    });
    expect(advice?.recommendations[0]?.change).toBeUndefined();
  });

  it('is happy with a recommendation that has no change, which most will not', () => {
    expect(sanitizeAdvice({ headline: 'x', recommendations: [recommendation] })?.recommendations[0]?.change).toBeUndefined();
  });
});

describe('the finding a recommendation points at', () => {
  const known = withFindings.usable.map((fact) => fact.id);

  it('is kept when it names one that exists', () => {
    const advice = sanitizeAdvice({ headline: 'x', recommendations: [{ action: 'Do it', basedOn: known[0] }] }, known);
    expect(advice?.recommendations[0]?.basedOn).toBe(known[0]);
  });

  // A label naming no finding leaves nothing to show as the reason, so the recommendation goes too.
  it('drops the recommendation when it names one that does not', () => {
    const advice = sanitizeAdvice({ headline: 'x', recommendations: [{ action: 'Do it', basedOn: 'made-up' }] }, known);
    expect(advice?.recommendations).toEqual([]);
  });
});

describe('the label coming back with its brackets on', () => {
  const known = withFindings.usable.map((fact) => fact.id);

  // Measured: qwen3-vl:8b returns "basedOn": "[time-of-day]", copying the formatting it was shown.
  // Every recommendation was being dropped over a pair of square brackets.
  it('matches a label whether or not the brackets came back with it', () => {
    for (const spelling of [known[0], `[${known[0]}]`, ` [${known[0]}] `]) {
      const advice = sanitizeAdvice({ headline: 'x', recommendations: [{ action: 'Do it', basedOn: spelling }] }, known);
      expect(advice?.recommendations[0]?.basedOn, String(spelling)).toBe(known[0]);
    }
  });
});
