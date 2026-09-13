// What a channel analytics report contains, shared so the parser in the main process and the page
// in the renderer cannot drift apart on its shape.
//
// Everything past the summary is optional. Each section comes from its own request, and a channel
// too small for demographics, or one report failing while the rest succeed, should cost that
// section and nothing else.

export interface AnalyticsDay {
  date: string;
  views: number;
  minutesWatched: number;
  subscribersGained: number;
  subscribersLost: number;
}

export interface AnalyticsTotals {
  views: number;
  minutesWatched: number;
  likes: number;
  comments: number;
  shares: number;
  subscribersGained: number;
  subscribersLost: number;
  /** Gained minus lost, which is the number people actually mean by "subscribers". */
  netSubscribers: number;
  /** Seconds. How long a view lasts on average. */
  averageViewDuration: number;
  /** How much of the video an average view gets through, 0-100. The number that matters for Shorts. */
  averageViewPercentage: number;
}

/** Views split by whether the viewer was already subscribed when they watched. */
export interface SubscriberSplit {
  subscribedViews: number;
  unsubscribedViews: number;
  /** Average view percentage for each group, which is usually the more interesting difference. */
  subscribedRetention: number;
  unsubscribedRetention: number;
}

export interface TopVideo {
  videoId: string;
  /** Filled in from the Data API; the analytics report only knows ids. */
  title: string | null;
  views: number;
  minutesWatched: number;
  averageViewPercentage: number;
  likes: number;
  subscribersGained: number;
}

export interface NamedShare {
  /** The raw key from YouTube, kept so the UI can map it to words it controls. */
  key: string;
  views: number;
}

export interface DemographicSlice {
  ageGroup: string;
  gender: string;
  /** Percentage of views, as YouTube reports it. These sum to roughly 100 across the report. */
  viewerPercentage: number;
}

export interface ChannelAnalytics {
  startDate: string;
  endDate: string;
  totals: AnalyticsTotals;
  days: AnalyticsDay[];
  /** Null when the report could not be read, which is different from an empty one. */
  subscriberSplit: SubscriberSplit | null;
  topVideos: TopVideo[] | null;
  trafficSources: NamedShare[] | null;
  countries: NamedShare[] | null;
  demographics: DemographicSlice[] | null;
}
