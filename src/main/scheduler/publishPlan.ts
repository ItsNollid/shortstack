// Two decisions kept out of the effects so they can be tested directly: what to ask YouTube to
// do with a video, and whether an upload found on the channel is definitely the file on disk.
import type { Privacy } from '../../shared/queue';
import { desiredPublishAt, type QueueStateFields } from '../domain/queueState';

export interface PublishPlan {
  privacyStatus: Privacy;
  publishAt: string | null;
}

/**
 * A scheduled video is uploaded private and handed a publish time: that is the only combination
 * YouTube accepts, and it is what lets a video go public with the machine switched off. A video
 * taken off the schedule stays private rather than going public the moment sync runs.
 */
export function publishPlanFor(item: Pick<QueueStateFields, 'privacy' | 'schedule_source' | 'scheduled_for'>): PublishPlan {
  const publishAt = desiredPublishAt(item);
  if (publishAt !== null) return { privacyStatus: 'private', publishAt };
  if (item.schedule_source === 'hold') return { privacyStatus: 'private', publishAt: null };
  return { privacyStatus: item.privacy, publishAt: null };
}

export interface UploadCandidate {
  videoId: string;
  title: string;
  publishedAt: string | null;
  fileName: string | null;
  fileSize: number | null;
}

export interface LocalFile {
  filename: string;
  fileSize: number | null;
}

const sameName = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Only an unambiguous match links automatically. Linking the wrong video would attach a queue
 * item to someone else's upload permanently, so anything less certain is left for the user to
 * confirm by pasting the link.
 */
export function matchUploadToFile(candidates: readonly UploadCandidate[], file: LocalFile): UploadCandidate | null {
  const byName = candidates.filter((candidate) => candidate.fileName !== null && sameName(candidate.fileName, file.filename));
  if (byName.length === 0) return null;

  const bySize =
    file.fileSize === null ? byName : byName.filter((candidate) => candidate.fileSize === null || candidate.fileSize === file.fileSize);
  const usable = bySize.length > 0 ? bySize : [];
  if (usable.length !== 1) return null;
  return usable[0];
}
