import { QueueItem, Video, Upload, AnalyticsData, ChannelAnalytics } from '../../shared/types';

declare global {
  interface Window {
    api: {
      getVideos(): Promise<Video[]>;
      getQueue(): Promise<QueueItem[]>;
      approveQueueItem(id: number): Promise<void>;
      rejectQueueItem(id: number): Promise<void>;
      updateQueueItem(id: number, data: Partial<QueueItem>): Promise<void>;
      bulkUpdateQueue(ids: number[], data: Partial<QueueItem>): Promise<void>;
      getUploads(): Promise<Upload[]>;
      getAnalytics(videoId?: string): Promise<AnalyticsData[]>;
      getChannelAnalytics(): Promise<ChannelAnalytics[]>;
      getSettings(): Promise<Record<string, any>>;
      setSetting(key: string, value: any): Promise<void>;
      scanFolder(): Promise<void>;
      pauseSchedule(): Promise<void>;
      resumeSchedule(): Promise<void>;
      getScheduleStatus(): Promise<{ paused: boolean, nextUpload: string | null }>;
      selectFolder(): Promise<string | null>;
      startOAuth(): Promise<{ success: boolean, channelName?: string }>;
      getAuthStatus(): Promise<{ authenticated: boolean, channelName?: string }>;
      onNotification(callback: (msg: string) => void): void;
    }
  }
}

export {};
