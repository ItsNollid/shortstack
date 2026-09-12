// What a channel analytics report contains, shared so the parser in the main process and the page
// in the renderer cannot drift apart on its shape.

export interface AnalyticsDay {
  date: string;
  views: number;
  minutesWatched: number;
  subscribersGained: number;
  subscribersLost: number;
}

export interface ChannelAnalytics {
  startDate: string;
  endDate: string;
  totals: {
    views: number;
    minutesWatched: number;
    likes: number;
    subscribersGained: number;
    subscribersLost: number;
    /** Gained minus lost, which is the number people actually mean by "subscribers". */
    netSubscribers: number;
  };
  days: AnalyticsDay[];
}
