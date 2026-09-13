import React from 'react';
import type { QueueItemDTO } from '../../shared/dto';
import type { Result } from '../../shared/ipc';
import { describeMatch, disagreements } from '../../shared/scheduleMatch';
import { useApiMutation, useApiQuery } from '../hooks/useApi';
import { Banner, Button } from './ui';
import styles from './ScheduleMatchBanner.module.css';

const readQueue = (): Promise<Result<QueueItemDTO[]>> => window.api.queueList();

/**
 * Where the two schedules disagree. Nothing is fixed automatically in either direction: a time
 * changed deliberately in Studio and a sync that quietly failed look identical from here, and a
 * tool that picked a side would eventually move a video someone had rescheduled on purpose.
 *
 * Only one of the two buttons acts here. Taking YouTube's time is a local change ShortStack can
 * make on its own; making YouTube take ShortStack's is what the sync is already trying to do, and
 * saying so is more honest than a button that repeats a request that is already failing.
 */
export function ScheduleMatchBanner(): React.JSX.Element | null {
  const queue = useApiQuery(readQueue, { key: 'queue', invalidateOn: ['queue:changed'] });
  const accept = useApiMutation((id: number, publishAt: string) => window.api.queueSchedule(id, publishAt));

  if (queue.data === null) return null;
  const problems = disagreements(queue.data);
  if (problems.length === 0) return null;

  return (
    <Banner
      kind="warning"
      title={`${problems.length} video${problems.length === 1 ? '' : 's'} where ShortStack and YouTube do not agree`}
    >
      <div className={styles.list}>
        {problems.slice(0, 5).map((match) => (
          <div key={match.item.id} className={styles.row}>
            <div>
              <div className={styles.title}>{match.item.title}</div>
              <div className={styles.detail}>{describeMatch(match)}</div>
            </div>
            {match.item.remote_publish_at !== null && (
              <Button
                size="small"
                disabled={accept.pending}
                onClick={() => void accept.run(match.item.id, match.item.remote_publish_at as string)}
              >
                Use YouTube&apos;s time
              </Button>
            )}
          </div>
        ))}
        {problems.length > 5 && <div className={styles.detail}>and {problems.length - 5} more</div>}
      </div>
      <div className={styles.footnote}>
        YouTube is the one that actually publishes, so its time is the one that happens. ShortStack keeps trying to push
        its own; if that is the version you want, leave it, and if it stays out of step the video details screen says why.
      </div>
      {accept.error !== null && <div className={styles.detail}>{accept.error}</div>}
    </Banner>
  );
}
