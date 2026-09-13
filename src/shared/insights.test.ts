import { describe, expect, it } from 'vitest';
import {
  MIN_PER_GROUP,
  allFacts,
  buildBrief,
  median,
  questionTitleFact,
  retentionFact,
  shoutedTitleFact,
  tagFact,
  timeOfDayFact,
  weekdayFact,
  type VideoStat
} from './insights';

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

/** Local time on purpose: a posting schedule is set in the hours a person lives in. */
const at = (iso: string, views: number, over: Partial<VideoStat> = {}): VideoStat =>
  video({ publishedAt: iso, views, ...over });

const many = (count: number, make: (index: number) => VideoStat): VideoStat[] =>
  Array.from({ length: count }, (_, index) => make(index));

describe('median', () => {
  it('is the middle, and the mean of the middle two when even', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBe(0);
  });

  // A mean would let one video with a million views rewrite every conclusion on the page.
  it('ignores an outlier the way a mean cannot', () => {
    expect(median([10, 12, 11, 1_000_000])).toBe(11.5);
  });
});

describe('timeOfDayFact', () => {
  it('says nothing when a channel has only ever posted at one time of day', () => {
    const fact = timeOfDayFact(many(12, (index) => at(`2026-09-${String(index + 1).padStart(2, '0')}T09:30:00`, 100 + index)));
    expect(fact.confidence).toBe('insufficient');
    expect(fact.statement).toMatch(/nothing to compare/i);
    expect(fact.statement).toMatch(/posting at other times/i);
  });

  it('says nothing at all when no part of the day has enough videos', () => {
    expect(timeOfDayFact([at('2026-09-01T09:00:00', 100), at('2026-09-02T18:00:00', 300)]).confidence).toBe('insufficient');
  });

  it('names the better part of the day when there is something to compare', () => {
    const evening = many(6, (index) => at(`2026-09-0${(index % 9) + 1}T19:00:00`, 900));
    const morning = many(6, (index) => at(`2026-09-1${index}T09:00:00`, 300));
    const fact = timeOfDayFact([...evening, ...morning]);

    expect(fact.statement).toMatch(/evening/);
    expect(fact.statement).toContain('900');
    expect(fact.statement).toContain('300');
    expect(fact.confidence).toBe('weak');
  });

  it('calls a small difference no difference, rather than dressing it up as a finding', () => {
    const evening = many(6, () => at('2026-09-01T19:00:00', 520));
    const morning = many(6, () => at('2026-09-02T09:00:00', 500));
    expect(timeOfDayFact([...evening, ...morning]).statement).toMatch(/little difference/i);
  });

  it('calls a large, well-populated comparison strong', () => {
    const evening = many(10, () => at('2026-09-01T19:00:00', 900));
    const morning = many(10, () => at('2026-09-02T09:00:00', 300));
    expect(timeOfDayFact([...evening, ...morning]).confidence).toBe('strong');
  });
});

describe('weekdayFact', () => {
  it('names the best and worst day once both have enough videos', () => {
    // 2026-09-05 is a Saturday, 2026-09-07 a Monday.
    const saturdays = many(4, () => at('2026-09-05T12:00:00', 800));
    const mondays = many(4, () => at('2026-09-07T12:00:00', 200));
    const fact = weekdayFact([...saturdays, ...mondays]);

    expect(fact.statement).toContain('Saturday');
    expect(fact.statement).toContain('Monday');
    expect(fact.confidence).not.toBe('insufficient');
  });

  it('says nothing on a channel that only posts one day a week', () => {
    expect(weekdayFact(many(10, () => at('2026-09-05T12:00:00', 500))).confidence).toBe('insufficient');
  });
});

describe('title patterns', () => {
  it('needs both sides before it will compare them', () => {
    const fact = questionTitleFact([...many(10, () => video({ title: 'NO QUESTION HERE' })), video({ title: 'ONE?' })]);
    expect(fact.confidence).toBe('insufficient');
    expect(fact.statement).toMatch(/Not enough videos on both sides/);
  });

  it('reports which side does better', () => {
    const asking = many(5, () => video({ title: 'DOES THIS WORK?', views: 900 }));
    const not = many(5, () => video({ title: 'THIS IS A TITLE', views: 300 }));
    const fact = questionTitleFact([...asking, ...not]);

    expect(fact.statement).toMatch(/asks a question/);
    expect(fact.statement).toContain('900');
  });

  it('knows a shouted title from a normal one', () => {
    const shouted = many(5, () => video({ title: 'THIS ZOMBIE ROUND BROKE ME', views: 900 }));
    const normal = many(5, () => video({ title: 'A quiet little clip from last night', views: 200 }));
    const fact = shoutedTitleFact([...shouted, ...normal]);

    expect(fact.statement).toMatch(/in capitals/);
    expect(fact.confidence).not.toBe('insufficient');
  });

  // Punctuation and numbers must not tip a normal title into looking shouted.
  it('does not call a title with numbers and symbols shouted', () => {
    const mixed = many(5, () => video({ title: 'round 100 (finally) — 2026 run', views: 500 }));
    const shouted = many(5, () => video({ title: 'ROUND 100 FINALLY', views: 500 }));
    expect(shoutedTitleFact([...mixed, ...shouted]).confidence).not.toBe('insufficient');
  });
});

describe('retentionFact', () => {
  it('waits until enough videos have retention figures', () => {
    expect(retentionFact(many(4, () => video({ averageViewPercentage: 0 }))).confidence).toBe('insufficient');
  });

  it('compares the halves people watch furthest through', () => {
    const good = many(5, () => video({ averageViewPercentage: 80, views: 1000 }));
    const poor = many(5, () => video({ averageViewPercentage: 20, views: 100 }));
    const fact = retentionFact([...good, ...poor]);

    expect(fact.statement).toContain('80%');
    expect(fact.statement).toContain('1000');
  });
});

describe('tagFact', () => {
  it('waits for enough videos', () => {
    expect(tagFact(many(4, () => video())).confidence).toBe('insufficient');
  });

  it('names the topics that show up on the best videos', () => {
    const winners = many(4, () => video({ views: 5000, tags: ['cod zombies', 'shorts'] }));
    const rest = many(12, () => video({ views: 100, tags: ['shorts'] }));
    expect(tagFact([...winners, ...rest]).statement).toContain('cod zombies');
  });

  it('says so plainly when nothing stands out', () => {
    expect(tagFact(many(12, (index) => video({ views: 100 + index, tags: ['shorts'] }))).statement).toMatch(/No topic stands out/);
  });
});

describe('buildBrief', () => {
  // The whole point of the design: with nothing to go on, advice would be invention.
  it('says it is too early when nothing can be measured', () => {
    const brief = buildBrief(many(2, () => video()));
    expect(brief.tooEarly).toBe(true);
    expect(brief.usable).toEqual([]);
    expect(brief.missing.length).toBeGreaterThan(0);
  });

  it('separates what can be said from what cannot', () => {
    const evening = many(10, () => at('2026-09-01T19:00:00', 900, { title: 'ROUND 100?' }));
    const morning = many(10, () => at('2026-09-02T09:00:00', 300, { title: 'a quiet clip' }));
    const brief = buildBrief([...evening, ...morning]);

    expect(brief.tooEarly).toBe(false);
    expect(brief.usable.length).toBeGreaterThan(0);
    expect(brief.videoCount).toBe(20);
    for (const fact of brief.usable) expect(fact.confidence).not.toBe('insufficient');
    for (const fact of brief.missing) expect(fact.confidence).toBe('insufficient');
  });
});

describe('allFacts', () => {
  it('always answers for every measure, even on an empty channel', () => {
    const facts = allFacts([]);
    expect(facts.map((fact) => fact.id).sort()).toEqual(
      ['question-title', 'retention', 'shouted-title', 'tags', 'time-of-day', 'weekday'].sort()
    );
    for (const fact of facts) {
      expect(fact.confidence).toBe('insufficient');
      expect(fact.statement.length).toBeGreaterThan(0);
    }
  });

  it('never claims more than MIN_PER_GROUP videos support', () => {
    const facts = allFacts(many(MIN_PER_GROUP - 1, () => video()));
    expect(facts.every((fact) => fact.confidence === 'insufficient')).toBe(true);
  });
});
