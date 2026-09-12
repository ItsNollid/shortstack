import { describe, expect, it } from 'vitest';
import { parseAnalyticsReport, reportRange } from './analyticsReport';

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
