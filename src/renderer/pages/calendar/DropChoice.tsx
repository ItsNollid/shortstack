import React from 'react';
import type { QueueItemDTO } from '../../../shared/dto';
import { UPDATE_UNITS, planInsert, planSwap, quotaCost, type DropStrategy, type Scheduled } from '../../../shared/reschedule';
import { Banner, Button, Dialog } from '../../components/ui';
import styles from './Calendar.module.css';

export interface DropChoiceProps {
  moving: QueueItemDTO | null;
  day: Date | null;
  items: readonly QueueItemDTO[];
  uploadTimes: readonly string[];
  pending: boolean;
  onCancel: () => void;
  onChoose: (strategy: DropStrategy) => void;
}

const asScheduled = (item: QueueItemDTO): Scheduled => ({
  id: item.id,
  scheduled_for: item.scheduled_for,
  onYouTube: item.youtube_video_id !== null
});

/** Offered when a day is full. The three answers differ mostly in how much else they disturb, so
 *  that is what the dialog leads with rather than making the user find out afterwards. */
export function DropChoice({
  moving,
  day,
  items,
  uploadTimes,
  pending,
  onCancel,
  onChoose
}: DropChoiceProps): React.JSX.Element {
  const open = moving !== null && day !== null;
  const query =
    moving === null || day === null
      ? null
      : { moving: asScheduled(moving), day, all: items.map(asScheduled), uploadTimes, now: new Date() };

  const swap = query === null ? null : planSwap(query);
  const insert = query === null ? null : planInsert(query);
  const insertCost = insert === null ? 0 : quotaCost(insert);

  return (
    <Dialog
      open={open}
      title={day === null ? '' : `${day.toLocaleDateString()} is full`}
      onClose={onCancel}
      footer={
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      }
    >
      <div className={styles.trayText}>
        {moving?.title} needs a slot on that day, and every time on it is taken. Three ways to make room.
      </div>

      <div className={styles.choice}>
        <div className={styles.choiceBody}>
          <div className={styles.choiceTitle}>Swap</div>
          <div className={styles.choiceText}>
            The video already there takes this one&apos;s old time
            {moving?.scheduled_for === null ? ', and loses its own' : ''}. Two videos move, whatever the size of
            the schedule.
          </div>
        </div>
        <Button variant="primary" disabled={pending || swap?.problem !== undefined} onClick={() => onChoose('swap')}>
          Swap
        </Button>
      </div>

      <div className={styles.choice}>
        <div className={styles.choiceBody}>
          <div className={styles.choiceTitle}>Push everything back</div>
          <div className={styles.choiceText}>
            Keeps the backlog in order: {insert === null ? 0 : Math.max(0, insert.changes.length - 1)} videos each
            move to the next slot.
          </div>
          {insert !== null && insert.remoteUpdates > 0 && (
            <Banner kind="warning" title={`${insert.remoteUpdates} are already on YouTube`}>
              Each one has to be told its new time: about {insertCost.toLocaleString()} of your 10,000 daily API
              units ({UPDATE_UNITS} each).
            </Banner>
          )}
          {insert?.problem !== undefined && <div className={styles.trayText}>{insert.problem}</div>}
        </div>
        <Button disabled={pending || insert?.problem !== undefined} onClick={() => onChoose('insert')}>
          Push back
        </Button>
      </div>

      <div className={styles.choice}>
        <div className={styles.choiceBody}>
          <div className={styles.choiceTitle}>Use the next free time instead</div>
          <div className={styles.choiceText}>Leaves that day alone and takes the first opening after it.</div>
        </div>
        <Button disabled={pending} onClick={() => onChoose('next_free')}>
          Next free
        </Button>
      </div>
    </Dialog>
  );
}
