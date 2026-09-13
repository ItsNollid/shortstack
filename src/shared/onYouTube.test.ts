import { describe, expect, it } from 'vitest';
import type { QueueItemDTO } from './dto';
import { explainWhereabouts, whereabouts, youTubeHasTheTime } from './onYouTube';

const item = (over: Partial<QueueItemDTO>): QueueItemDTO => ({ youtube_video_id: null, ...over }) as QueueItemDTO;

describe('whereabouts', () => {
  it('is local only until something is actually uploaded', () => {
    for (const state of ['pending', 'approved', 'awaiting_manual_upload', 'rejected'] as const) {
      expect(whereabouts(item({ state })), state).toBe('local_only');
    }
  });

  it('is on YouTube once there is a video id but no agreed time', () => {
    expect(whereabouts(item({ state: 'uploaded', youtube_video_id: 'abc' }))).toBe('on_youtube');
  });

  // The distinction that matters: only here does the video go out with the computer switched off.
  it('is YouTube holding the time only when scheduled or published', () => {
    expect(youTubeHasTheTime(item({ state: 'scheduled', youtube_video_id: 'abc' }))).toBe(true);
    expect(youTubeHasTheTime(item({ state: 'published', youtube_video_id: 'abc' }))).toBe(true);
    expect(youTubeHasTheTime(item({ state: 'approved', scheduled_for: '2026-09-13T12:00:00.000Z' }))).toBe(false);
  });

  it('says so in words', () => {
    expect(explainWhereabouts(item({ state: 'approved' }))).toMatch(/Only in ShortStack/);
    expect(explainWhereabouts(item({ state: 'scheduled' }))).toMatch(/even if this computer is off/);
  });
});
