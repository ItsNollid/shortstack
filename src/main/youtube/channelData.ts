// Everything YouTube told us about the channel, taken off this computer. Disconnecting does it on request, and
// retention does it when access is gone or the details have gone a month unconfirmed. One routine for both, so
// the two can never end up deleting different things.
import type Database from 'better-sqlite3';
import type { UploadMethod } from '../../shared/queue';
import { clearPastUploadsCache } from '../ai/draft';
import { clearChannels } from '../db/channelRepo';
import { applyQueueEvent, listQueueItems } from '../db/queueRepo';
import { clearThumbnails } from '../media/thumbnails';

export interface ForgetChannelDeps {
  db: Database.Database;
  thumbnailDir: string;
  appIcon: { clear(): Promise<void> };
  /** The analytics kept for the page. */
  analytics: { clear(): void };
  now: Date;
  uploadMethod: UploadMethod;
}

/**
 * 'access_gone' is the full sweep: permission was taken away, so videos already on the channel are marked as
 * no longer ours to touch — which is also what stops one ever being uploaded a second time.
 * 'unconfirmed' is the lighter one: the details merely could not be checked for a month, perhaps because this
 * computer was off. What YouTube told us goes; the queue's own record of what it uploaded stays.
 */
export type ForgetReason = 'access_gone' | 'unconfirmed';

export async function forgetChannelData(deps: ForgetChannelDeps, reason: ForgetReason): Promise<void> {
  clearChannels(deps.db);
  await deps.appIcon.clear();
  deps.analytics.clear();
  clearPastUploadsCache();
  if (reason === 'unconfirmed') return;

  // Poster frames are drawn from the person's own videos, so they go with the rest of it.
  await clearThumbnails(deps.thumbnailDir);
  for (const item of listQueueItems(deps.db)) {
    if (item.youtube_video_id === null) continue;
    applyQueueEvent(deps.db, item.id, { type: 'disconnect' }, { now: deps.now, uploadMethod: deps.uploadMethod });
  }
}
