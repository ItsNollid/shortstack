// What went to TikTok and Instagram, per posting. A platform a video is going to with no row yet is simply waiting.
import type Database from 'better-sqlite3';
import {
  PLATFORM_NAMES,
  approvedForPosting,
  isOtherPlatform,
  isPostState,
  nextPostState,
  type OtherPlatform,
  type PlatformPostDTO,
  type PostEvent
} from '../../shared/platformPosts';
import type { ActivityAction } from '../../shared/activityCopy';
import { appendActivity } from './activityRepo';
import { getQueueItem } from './queueRepo';

/** Typed against the History wording, so an action here can never reach the screen without words. */
const ACTION_FOR: Record<PostEvent['type'], ActivityAction> = {
  posted: 'platform_posted',
  skip: 'platform_skipped',
  restore: 'platform_restored'
};

interface Row {
  platform: string;
  state: string;
  url: string | null;
  posted_at: string | null;
}

/** One entry for each platform besides YouTube that this posting is going to. Null when the posting is gone. */
export function listPlatformPosts(db: Database.Database, queueId: number): PlatformPostDTO[] | null {
  const item = getQueueItem(db, queueId);
  if (item === undefined) return null;
  const rows = db.prepare('SELECT platform, state, url, posted_at FROM platform_posts WHERE queue_id = ?').all(queueId) as Row[];
  return item.platforms.filter(isOtherPlatform).map((platform) => {
    const row = rows.find((entry) => entry.platform === platform);
    return {
      queueId,
      platform,
      state: row !== undefined && isPostState(row.state) ? row.state : 'waiting',
      url: row?.url ?? null,
      postedAt: row?.posted_at ?? null
    };
  });
}

export type PlatformPostResult = { ok: true; post: PlatformPostDTO } | { ok: false; reason: string };

export function applyPlatformPost(
  db: Database.Database,
  queueId: number,
  platform: OtherPlatform,
  event: PostEvent,
  now: Date
): PlatformPostResult {
  const run = db.transaction((): PlatformPostResult => {
    const item = getQueueItem(db, queueId);
    if (item === undefined) return { ok: false, reason: 'That video is no longer in the queue' };
    const name = PLATFORM_NAMES[platform];
    if (!item.platforms.includes(platform)) return { ok: false, reason: `This video is not set to go to ${name}` };
    // The approval gate covers every platform: nothing is marked as out anywhere before the person said yes.
    if (event.type === 'posted' && !approvedForPosting(item)) return { ok: false, reason: 'Approve the video first' };

    const current = listPlatformPosts(db, queueId)?.find((post) => post.platform === platform);
    const next = nextPostState(current?.state ?? 'waiting', event);
    if (!next.ok) return next;

    const stamp = now.toISOString();
    const url = event.type === 'posted' ? event.url : null;
    const postedAt = event.type === 'posted' ? stamp : null;
    db.prepare(
      `INSERT INTO platform_posts (queue_id, platform, state, url, posted_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(queue_id, platform) DO UPDATE SET state = excluded.state, url = excluded.url, posted_at = excluded.posted_at,
         updated_at = excluded.updated_at`
    ).run(queueId, platform, next.state, url, postedAt, stamp);

    appendActivity(db, {
      queueId,
      action: ACTION_FOR[event.type],
      detail:
        event.type === 'posted'
          ? `Marked as posted to ${name}${url === null ? '' : `: ${url}`}`
          : event.type === 'skip'
            ? `Not posting this one to ${name}`
            : `Back to waiting to be posted to ${name}`,
      now
    });
    return { ok: true, post: { queueId, platform, state: next.state, url, postedAt } };
  });
  return run();
}
