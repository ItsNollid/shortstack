import React from 'react';
import { CircleAlert, CloudCheck, Upload } from 'lucide-react';
import type { QueueItemDTO } from '../../../shared/dto';
import { DRAG_TYPE, canDrag, scheduleBlocker } from '../../../shared/calendarDnd';
import { explainWhereabouts, youTubeHasTheTime } from '../../../shared/onYouTube';
import styles from './Calendar.module.css';

export interface ChipProps {
  item: QueueItemDTO;
  onDragStart: (item: QueueItemDTO) => void;
  onDragEnd: () => void;
  onOpen: (id: number) => void;
}

function toneClass(item: QueueItemDTO): string {
  if (item.state === 'needs_attention' || item.state === 'failed') return styles.attention;
  if (item.state === 'published') return styles.live;
  if (item.state === 'pending') return styles.pending;
  return item.schedule_source === 'auto' ? styles.auto : styles.manual;
}

const time = (iso: string | null): string =>
  iso === null ? '' : new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function Chip({ item, onDragStart, onDragEnd, onOpen }: ChipProps): React.JSX.Element {
  const draggable = canDrag(item);
  const blocker = scheduleBlocker(item);
  // A time on this calendar is a plan; a time YouTube has agreed to is a promise. The badge is the
  // difference, and it is the first thing anyone asks when they see a schedule.
  const onYouTube = youTubeHasTheTime(item);
  const where = explainWhereabouts(item);

  return (
    <div
      className={`${styles.chip} ${toneClass(item)} ${draggable ? '' : styles.fixed}`}
      draggable={draggable}
      title={blocker === null ? `${item.title} — ${where}` : `${item.title} — ${blocker}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onOpen(item.id);
        }
      }}
      onDragStart={(event) => {
        // The id travels in the payload; the type is what dragover can see to decide.
        event.dataTransfer.setData(DRAG_TYPE, String(item.id));
        event.dataTransfer.effectAllowed = 'move';
        onDragStart(item);
      }}
      onDragEnd={onDragEnd}
    >
      {onYouTube && <CloudCheck size={11} className={styles.onYouTube} aria-label="YouTube has this" />}
      {item.state === 'awaiting_manual_upload' && <Upload size={11} />}
      {(item.state === 'needs_attention' || item.state === 'failed') && <CircleAlert size={11} />}
      {item.scheduled_for !== null && <span className={styles.chipTime}>{time(item.scheduled_for)}</span>}
      <span className={styles.chipTitle}>{item.title}</span>
    </div>
  );
}
