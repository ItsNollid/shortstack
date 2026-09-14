import type { VideoReport } from '../../shared/videoReading';
import { useApiQuery, type QueryResult } from './useApi';

/** What the local model saw in a video last time it looked. Shared by every screen that shows a part of it. */
export function useVideoReport(queueId: number): QueryResult<VideoReport | null> {
  return useApiQuery(() => window.api.videoReading(queueId), { key: `reading-${queueId}`, invalidateOn: ['reading:changed'] });
}

/** One still, by name. Served from the stills already on disk, never from the video file. */
export const stillUrl = (queueId: number, part: string): string => `ss-media://frame/${queueId}/${part}`;
