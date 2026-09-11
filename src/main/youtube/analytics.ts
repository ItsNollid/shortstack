import { google } from 'googleapis';
import { getAuthenticatedClient } from './auth';

export const fetchChannelAnalytics = async () => {
  const authClient = await getAuthenticatedClient();
  const youtubeAnalytics = google.youtubeAnalytics({ version: 'v2', auth: authClient });

  // Calculate dates (last 28 days)
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 28);

  // Format as YYYY-MM-DD
  const endDate = end.toISOString().split('T')[0];
  const startDate = start.toISOString().split('T')[0];

  const response = await youtubeAnalytics.reports.query({
    ids: 'channel==MINE',
    startDate,
    endDate,
    metrics: 'views,estimatedMinutesWatched,subscribersGained',
    dimensions: 'day',
    sort: 'day',
  });

  const headers = response.data.columnHeaders || [];
  const rows = response.data.rows || [];

  const dateIdx = headers.findIndex((h) => h.name === 'day');
  const viewsIdx = headers.findIndex((h) => h.name === 'views');
  const watchTimeIdx = headers.findIndex((h) => h.name === 'estimatedMinutesWatched');
  const subsIdx = headers.findIndex((h) => h.name === 'subscribersGained');

  return rows.map((row) => ({
    date: row[dateIdx],
    views: row[viewsIdx],
    watchTime: row[watchTimeIdx],
    subs: row[subsIdx],
  }));
};
