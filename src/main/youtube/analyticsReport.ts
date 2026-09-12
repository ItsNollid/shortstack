// Parsing a YouTube Analytics report. The API answers with column headers and rows of bare values,
// so everything is read by column name: a report that comes back with its columns in a different
// order, or with one missing, must not silently shift the numbers.

import type { AnalyticsDay, ChannelAnalytics } from '../../shared/analytics';

export type { AnalyticsDay, ChannelAnalytics };

export const ANALYTICS_METRICS = ['views', 'estimatedMinutesWatched', 'likes', 'subscribersGained', 'subscribersLost'];

interface RawReport {
  columnHeaders?: Array<{ name?: string }>;
  rows?: unknown[][];
}

const numberAt = (row: unknown[], index: number): number => {
  const value = row[index];
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Turns the report into days and totals. A missing column reads as zero rather than throwing. */
export function parseAnalyticsReport(raw: unknown, startDate: string, endDate: string): ChannelAnalytics {
  const report = (raw ?? {}) as RawReport;
  const headers = (report.columnHeaders ?? []).map((header) => header.name ?? '');
  const column = (name: string): number => headers.indexOf(name);

  const dayColumn = column('day');
  const viewsColumn = column('views');
  const watchedColumn = column('estimatedMinutesWatched');
  const likesColumn = column('likes');
  const gainedColumn = column('subscribersGained');
  const lostColumn = column('subscribersLost');

  const days: AnalyticsDay[] = [];
  const totals = { views: 0, minutesWatched: 0, likes: 0, subscribersGained: 0, subscribersLost: 0, netSubscribers: 0 };

  for (const row of report.rows ?? []) {
    if (!Array.isArray(row)) continue;
    const views = viewsColumn < 0 ? 0 : numberAt(row, viewsColumn);
    const minutesWatched = watchedColumn < 0 ? 0 : numberAt(row, watchedColumn);
    const subscribersGained = gainedColumn < 0 ? 0 : numberAt(row, gainedColumn);
    const subscribersLost = lostColumn < 0 ? 0 : numberAt(row, lostColumn);

    totals.views += views;
    totals.minutesWatched += minutesWatched;
    totals.likes += likesColumn < 0 ? 0 : numberAt(row, likesColumn);
    totals.subscribersGained += subscribersGained;
    totals.subscribersLost += subscribersLost;

    if (dayColumn >= 0) {
      days.push({
        date: String(row[dayColumn] ?? ''),
        views,
        minutesWatched,
        subscribersGained,
        subscribersLost
      });
    }
  }

  totals.netSubscribers = totals.subscribersGained - totals.subscribersLost;
  days.sort((a, b) => a.date.localeCompare(b.date));
  return { startDate, endDate, totals, days };
}

/** YouTube Analytics wants plain YYYY-MM-DD, in the channel's own reporting calendar. */
export function reportRange(now: Date, days: number): { startDate: string; endDate: string } {
  const asDate = (value: Date): string => value.toISOString().slice(0, 10);
  // The most recent day or two are usually still being processed, so the window ends yesterday.
  const end = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  return { startDate: asDate(start), endDate: asDate(end) };
}
