import { describe, expect, it } from 'vitest';
import { matchUploadToFile, publishPlanFor, type UploadCandidate } from './publishPlan';

const item = (overrides: Partial<Parameters<typeof publishPlanFor>[0]> = {}) => ({
  privacy: 'public' as const,
  schedule_source: null,
  scheduled_for: null,
  ...overrides
});

describe('publishPlanFor', () => {
  it('uploads a scheduled video private with a publish time', () => {
    const plan = publishPlanFor(item({ scheduled_for: '2026-10-01T13:00:00.000Z', schedule_source: 'manual' }));
    expect(plan).toEqual({ privacyStatus: 'private', publishAt: '2026-10-01T13:00:00.000Z' });
  });

  it('keeps a video private once it is taken off the schedule', () => {
    // Sending "public" here would publish immediately, which is the opposite of unscheduling.
    expect(publishPlanFor(item({ schedule_source: 'hold' }))).toEqual({ privacyStatus: 'private', publishAt: null });
  });

  it('passes through the chosen visibility when nothing is scheduled', () => {
    expect(publishPlanFor(item({ privacy: 'unlisted' }))).toEqual({ privacyStatus: 'unlisted', publishAt: null });
    expect(publishPlanFor(item({ privacy: 'private' }))).toEqual({ privacyStatus: 'private', publishAt: null });
    expect(publishPlanFor(item())).toEqual({ privacyStatus: 'public', publishAt: null });
  });

  it('never schedules a non-public video', () => {
    const plan = publishPlanFor(item({ privacy: 'unlisted', scheduled_for: '2026-10-01T13:00:00.000Z', schedule_source: 'manual' }));
    expect(plan.publishAt).toBeNull();
  });
});

describe('matchUploadToFile', () => {
  const candidate = (overrides: Partial<UploadCandidate> = {}): UploadCandidate => ({
    videoId: 'v1',
    title: 'Clip',
    publishedAt: '2026-09-12T10:00:00Z',
    fileName: 'peter.mov',
    fileSize: 29_360_128,
    ...overrides
  });

  it('links an upload whose filename and size both match', () => {
    const match = matchUploadToFile([candidate()], { filename: 'peter.mov', fileSize: 29_360_128 });
    expect(match?.videoId).toBe('v1');
  });

  it('ignores case and surrounding spaces in the filename', () => {
    expect(matchUploadToFile([candidate({ fileName: ' PETER.MOV ' })], { filename: 'peter.mov', fileSize: 29_360_128 })).not.toBeNull();
  });

  it('refuses to link when the size disagrees', () => {
    expect(matchUploadToFile([candidate()], { filename: 'peter.mov', fileSize: 999 })).toBeNull();
  });

  it('refuses to guess between two uploads of the same filename', () => {
    const twins = [candidate({ videoId: 'v1' }), candidate({ videoId: 'v2' })];
    expect(matchUploadToFile(twins, { filename: 'peter.mov', fileSize: 29_360_128 })).toBeNull();
  });

  it('never matches on title alone', () => {
    const noFileDetails = candidate({ fileName: null, fileSize: null, title: 'peter' });
    expect(matchUploadToFile([noFileDetails], { filename: 'peter.mov', fileSize: 29_360_128 })).toBeNull();
  });

  it('accepts a match when YouTube did not report a size', () => {
    const match = matchUploadToFile([candidate({ fileSize: null })], { filename: 'peter.mov', fileSize: 29_360_128 });
    expect(match?.videoId).toBe('v1');
  });

  it('returns null when nothing resembles the file', () => {
    expect(matchUploadToFile([candidate({ fileName: 'other.mov' })], { filename: 'peter.mov', fileSize: 1 })).toBeNull();
    expect(matchUploadToFile([], { filename: 'peter.mov', fileSize: 1 })).toBeNull();
  });
});
