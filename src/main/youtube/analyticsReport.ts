// Parsing YouTube Analytics reports. The API answers with column headers and rows of bare values,
// so everything is read by column name: a report that comes back with its columns in a different
// order, or with one missing, must not silently shift the numbers into the wrong fields.

import type {
  AnalyticsDay,
  AnalyticsTotals,
  ChannelAnalytics,
  DemographicSlice,
  NamedShare,
  SubscriberSplit,
  TopVideo
} from '../../shared/analytics';

export type { AnalyticsDay, ChannelAnalytics };

/** The daily summary: everything the top of the page is built from. */
export const ANALYTICS_METRICS = [
  'views',
  'estimatedMinutesWatched',
  'averageViewDuration',
  'averageViewPercentage',
  'likes',
  'comments',
  'shares',
  'subscribersGained',
  'subscribersLost'
];

export const SPLIT_METRICS = ['views', 'averageViewPercentage'];
export const VIDEO_METRICS = ['views', 'estimatedMinutesWatched', 'averageViewPercentage', 'likes', 'subscribersGained'];
export const SOURCE_METRICS = ['views'];
export const DEMOGRAPHIC_METRICS = ['viewerPercentage'];

interface RawReport {
  columnHeaders?: Array<{ name?: string }>;
  rows?: unknown[][];
}

/** A report read by column name, with a missing column reading as zero rather than throwing. */
export interface Reader {
  rows: unknown[][];
  number(row: unknown[], column: string): number;
  text(row: unknown[], column: string): string;
  has(column: string): boolean;
}

export function readReport(raw: unknown): Reader {
  const report = (raw ?? {}) as RawReport;
  const headers = (report.columnHeaders ?? []).map((header) => header.name ?? '');
  const indexOf = (name: string): number => headers.indexOf(name);
  const rows = (report.rows ?? []).filter((row): row is unknown[] => Array.isArray(row));

  return {
    rows,
    has: (column) => indexOf(column) >= 0,
    number(row, column) {
      const index = indexOf(column);
      if (index < 0) return 0;
      const value = row[index];
      const parsed = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    },
    text(row, column) {
      const index = indexOf(column);
      return index < 0 ? '' : String(row[index] ?? '');
    }
  };
}

const emptyTotals = (): AnalyticsTotals => ({
  views: 0,
  minutesWatched: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  subscribersGained: 0,
  subscribersLost: 0,
  netSubscribers: 0,
  averageViewDuration: 0,
  averageViewPercentage: 0
});

/**
 * Averages are weighted by views rather than averaged across days. A day with three views and a day
 * with three thousand do not carry the same weight, and treating them as equal is how a channel ends
 * up being told its retention is far better or worse than it really is.
 */
export function parseAnalyticsReport(raw: unknown, startDate: string, endDate: string): ChannelAnalytics {
  const reader = readReport(raw);
  const days: AnalyticsDay[] = [];
  const totals = emptyTotals();
  let durationWeighted = 0;
  let percentageWeighted = 0;

  for (const row of reader.rows) {
    const views = reader.number(row, 'views');
    const minutesWatched = reader.number(row, 'estimatedMinutesWatched');
    const subscribersGained = reader.number(row, 'subscribersGained');
    const subscribersLost = reader.number(row, 'subscribersLost');

    totals.views += views;
    totals.minutesWatched += minutesWatched;
    totals.likes += reader.number(row, 'likes');
    totals.comments += reader.number(row, 'comments');
    totals.shares += reader.number(row, 'shares');
    totals.subscribersGained += subscribersGained;
    totals.subscribersLost += subscribersLost;
    durationWeighted += reader.number(row, 'averageViewDuration') * views;
    percentageWeighted += reader.number(row, 'averageViewPercentage') * views;

    if (reader.has('day')) {
      days.push({ date: reader.text(row, 'day'), views, minutesWatched, subscribersGained, subscribersLost });
    }
  }

  totals.netSubscribers = totals.subscribersGained - totals.subscribersLost;
  totals.averageViewDuration = totals.views === 0 ? 0 : durationWeighted / totals.views;
  totals.averageViewPercentage = totals.views === 0 ? 0 : percentageWeighted / totals.views;

  days.sort((a, b) => a.date.localeCompare(b.date));
  return {
    startDate,
    endDate,
    totals,
    days,
    subscriberSplit: null,
    topVideos: null,
    trafficSources: null,
    countries: null,
    demographics: null
  };
}

/**
 * Whether the people watching had already subscribed. For a channel posting the same videos again
 * to reach people who missed them, this is the report that says whether it is working.
 */
export function parseSubscriberSplit(raw: unknown): SubscriberSplit {
  const reader = readReport(raw);
  const split: SubscriberSplit = {
    subscribedViews: 0,
    unsubscribedViews: 0,
    subscribedRetention: 0,
    unsubscribedRetention: 0
  };

  for (const row of reader.rows) {
    const views = reader.number(row, 'views');
    const retention = reader.number(row, 'averageViewPercentage');
    // YouTube spells these "subscribed" and "unsubscribed".
    if (reader.text(row, 'subscribedStatus').toLowerCase() === 'subscribed') {
      split.subscribedViews += views;
      split.subscribedRetention = retention;
    } else {
      split.unsubscribedViews += views;
      split.unsubscribedRetention = retention;
    }
  }
  return split;
}

export function parseTopVideos(raw: unknown): TopVideo[] {
  const reader = readReport(raw);
  return reader.rows
    .map((row) => ({
      videoId: reader.text(row, 'video'),
      title: null,
      views: reader.number(row, 'views'),
      minutesWatched: reader.number(row, 'estimatedMinutesWatched'),
      averageViewPercentage: reader.number(row, 'averageViewPercentage'),
      likes: reader.number(row, 'likes'),
      subscribersGained: reader.number(row, 'subscribersGained')
    }))
    .filter((video) => video.videoId !== '');
}

/** Traffic sources and countries share a shape: a key and a number of views. */
export function parseNamedShares(raw: unknown, keyColumn: string, limit = 8): NamedShare[] {
  const reader = readReport(raw);
  return reader.rows
    .map((row) => ({ key: reader.text(row, keyColumn), views: reader.number(row, 'views') }))
    .filter((share) => share.key !== '' && share.views > 0)
    .sort((left, right) => right.views - left.views)
    .slice(0, limit);
}

export function parseDemographics(raw: unknown): DemographicSlice[] {
  const reader = readReport(raw);
  return reader.rows
    .map((row) => ({
      ageGroup: reader.text(row, 'ageGroup'),
      gender: reader.text(row, 'gender'),
      viewerPercentage: reader.number(row, 'viewerPercentage')
    }))
    .filter((slice) => slice.ageGroup !== '' && slice.viewerPercentage > 0)
    .sort((left, right) => right.viewerPercentage - left.viewerPercentage);
}

/** YouTube Analytics wants plain YYYY-MM-DD, in the channel's own reporting calendar. */
export function reportRange(now: Date, days: number): { startDate: string; endDate: string } {
  const asDate = (value: Date): string => value.toISOString().slice(0, 10);
  // The most recent day or two are usually still being processed, so the window ends yesterday.
  const end = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  return { startDate: asDate(start), endDate: asDate(end) };
}
