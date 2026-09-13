import { describe, expect, it } from 'vitest';
import { parseAnalyticsReport, parseDemographics, parseNamedShares, parseSubscriberSplit, parseTopVideos, readReport, reportRange } from './analyticsReport';

const report = (columns: string[], rows: unknown[][]): unknown => ({
  columnHeaders: columns.map((name) => ({ name })),
  rows
});

describe('parseAnalyticsReport', () => {
  it('reads values by column name, not by position', () => {
    const ordinary = parseAnalyticsReport(
      report(
        ['day', 'views', 'estimatedMinutesWatched', 'likes', 'subscribersGained', 'subscribersLost'],
        [['2026-03-01', 100, 50, 7, 3, 1]]
      ),
      '2026-03-01',
      '2026-03-01'
    );
    const shuffled = parseAnalyticsReport(
      report(
        ['subscribersLost', 'likes', 'day', 'estimatedMinutesWatched', 'subscribersGained', 'views'],
        [[1, 7, '2026-03-01', 50, 3, 100]]
      ),
      '2026-03-01',
      '2026-03-01'
    );
    expect(shuffled.totals).toEqual(ordinary.totals);
    expect(shuffled.days).toEqual(ordinary.days);
  });

  it('adds the days up', () => {
    const parsed = parseAnalyticsReport(
      report(
        ['day', 'views', 'estimatedMinutesWatched', 'likes', 'subscribersGained', 'subscribersLost'],
        [
          ['2026-03-02', 10, 5, 1, 4, 1],
          ['2026-03-01', 20, 15, 2, 1, 3]
        ]
      ),
      '2026-03-01',
      '2026-03-02'
    );
    expect(parsed.totals.views).toBe(30);
    expect(parsed.totals.minutesWatched).toBe(20);
    expect(parsed.totals.likes).toBe(3);
    expect(parsed.totals.netSubscribers).toBe(1);
  });

  it('puts the days in order whatever order they arrive in', () => {
    const parsed = parseAnalyticsReport(
      report(['day', 'views'], [['2026-03-03', 1], ['2026-03-01', 2], ['2026-03-02', 3]]),
      '2026-03-01',
      '2026-03-03'
    );
    expect(parsed.days.map((day) => day.date)).toEqual(['2026-03-01', '2026-03-02', '2026-03-03']);
  });

  it('treats a missing column as zero rather than shifting the numbers along', () => {
    const parsed = parseAnalyticsReport(report(['day', 'views'], [['2026-03-01', 42]]), '2026-03-01', '2026-03-01');
    expect(parsed.totals.views).toBe(42);
    expect(parsed.totals.likes).toBe(0);
    expect(parsed.totals.netSubscribers).toBe(0);
  });

  it('survives an empty or unusable answer', () => {
    for (const raw of [null, undefined, {}, { rows: null }, { columnHeaders: [], rows: [] }]) {
      const parsed = parseAnalyticsReport(raw, '2026-03-01', '2026-03-02');
      expect(parsed.totals.views).toBe(0);
      expect(parsed.days).toEqual([]);
    }
  });

  it('reads numbers that arrive as strings', () => {
    const parsed = parseAnalyticsReport(report(['day', 'views'], [['2026-03-01', '17']]), 'a', 'b');
    expect(parsed.totals.views).toBe(17);
  });
});

describe('reportRange', () => {
  it('ends yesterday, because today is still being counted', () => {
    const range = reportRange(new Date('2026-03-10T12:00:00Z'), 28);
    expect(range.endDate).toBe('2026-03-09');
    expect(range.startDate).toBe('2026-02-10');
  });

  it('covers exactly the number of days asked for', () => {
    const range = reportRange(new Date('2026-03-10T12:00:00Z'), 7);
    const days = (Date.parse(range.endDate) - Date.parse(range.startDate)) / 86_400_000 + 1;
    expect(days).toBe(7);
  });
});

describe('weighted averages', () => {
  // Averaging the two days gives 55%. Weighting by views gives 20.3%, which is the truth: almost
  // nobody saw the good day. Getting this wrong tells a channel its retention is nearly triple.
  it('weights retention by views rather than treating every day the same', () => {
    const raw = report(
      ['day', 'views', 'estimatedMinutesWatched', 'averageViewDuration', 'averageViewPercentage'],
      [
        ['2026-09-01', 10, 5, 30, 90],
        ['2026-09-02', 1000, 200, 6, 20]
      ]
    );
    const parsed = parseAnalyticsReport(raw, '2026-09-01', '2026-09-02');
    expect(parsed.totals.averageViewPercentage).toBeCloseTo(20.69, 1);
    expect(parsed.totals.averageViewDuration).toBeCloseTo(6.24, 1);
  });

  it('reports zero rather than dividing by no views at all', () => {
    const parsed = parseAnalyticsReport(report(['day', 'views'], [['2026-09-01', 0]]), 'a', 'b');
    expect(parsed.totals.averageViewPercentage).toBe(0);
    expect(parsed.totals.averageViewDuration).toBe(0);
  });
});

describe('parseSubscriberSplit', () => {
  it('separates people who had already subscribed from people who had not', () => {
    const raw = report(
      ['subscribedStatus', 'views', 'averageViewPercentage'],
      [
        ['SUBSCRIBED', 300, 65],
        ['UNSUBSCRIBED', 1700, 41]
      ]
    );
    expect(parseSubscriberSplit(raw)).toEqual({
      subscribedViews: 300,
      unsubscribedViews: 1700,
      subscribedRetention: 65,
      unsubscribedRetention: 41
    });
  });

  it('reads an empty report as zeroes rather than throwing', () => {
    expect(parseSubscriberSplit({}).subscribedViews).toBe(0);
  });
});

describe('parseTopVideos', () => {
  it('reads the rows and leaves titles to be filled in', () => {
    const raw = report(
      ['video', 'views', 'estimatedMinutesWatched', 'averageViewPercentage', 'likes', 'subscribersGained'],
      [
        ['abc123', 900, 40, 62, 30, 4],
        ['def456', 120, 5, 38, 2, 0]
      ]
    );
    const videos = parseTopVideos(raw);
    expect(videos).toHaveLength(2);
    expect(videos[0]).toMatchObject({ videoId: 'abc123', views: 900, averageViewPercentage: 62, title: null });
  });

  it('drops rows with no video id', () => {
    expect(parseTopVideos(report(['video', 'views'], [['', 10]]))).toEqual([]);
  });
});

describe('parseNamedShares', () => {
  it('sorts by views and keeps the top few', () => {
    const raw = report(
      ['insightTrafficSourceType', 'views'],
      [
        ['SUBSCRIBER', 100],
        ['SHORTS', 5000],
        ['YT_SEARCH', 700]
      ]
    );
    expect(parseNamedShares(raw, 'insightTrafficSourceType', 2)).toEqual([
      { key: 'SHORTS', views: 5000 },
      { key: 'YT_SEARCH', views: 700 }
    ]);
  });

  it('leaves out sources that brought nothing', () => {
    expect(parseNamedShares(report(['country', 'views'], [['GB', 0]]), 'country')).toEqual([]);
  });
});

describe('parseDemographics', () => {
  it('sorts the slices by size', () => {
    const raw = report(
      ['ageGroup', 'gender', 'viewerPercentage'],
      [
        ['age18-24', 'male', 30.5],
        ['age25-34', 'male', 41.2],
        ['age13-17', 'female', 0]
      ]
    );
    expect(parseDemographics(raw)).toEqual([
      { ageGroup: 'age25-34', gender: 'male', viewerPercentage: 41.2 },
      { ageGroup: 'age18-24', gender: 'male', viewerPercentage: 30.5 }
    ]);
  });
});

describe('readReport', () => {
  // The whole reason everything is read by name: a report with its columns in a different order
  // must not silently put watch time into the views field.
  it('follows the column names, not their positions', () => {
    const swapped = report(['estimatedMinutesWatched', 'views', 'day'], [[999, 12, '2026-09-01']]);
    const parsed = parseAnalyticsReport(swapped, 'a', 'b');
    expect(parsed.totals.views).toBe(12);
    expect(parsed.totals.minutesWatched).toBe(999);
  });

  it('reads a missing column as zero', () => {
    expect(parseAnalyticsReport(report(['day', 'views'], [['2026-09-01', 5]]), 'a', 'b').totals.likes).toBe(0);
  });
});
