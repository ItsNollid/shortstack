import React from 'react';
import type { QueueItemDTO } from '../../shared/dto';
import {
  formatDuration,
  formatFileSize,
  formatRelativeTime,
  presentAttention,
  shortsWarning
} from '../../shared/presentation';
import { StatusPill } from '../components/ui';
import styles from './Queue.module.css';

export interface QueueRowProps {
  item: QueueItemDTO;
  selected: boolean;
  onToggle: (id: number) => void;
  onOpen: (id: number) => void;
}

const scheduleSourceLabel: Record<string, string> = {
  auto: 'automatic slot',
  manual: 'you picked this',
  hold: 'held back'
};

export function QueueRow({ item, selected, onToggle, onOpen }: QueueRowProps): React.JSX.Element {
  const problem =
    item.attention_code !== null
      ? presentAttention(item.attention_code).hint
      : item.missing
        ? 'The file is no longer in the folder'
        : null;
  // Worth seeing before approval, not after: YouTube decides Shorts eligibility from the file.
  const notAShort = problem === null ? shortsWarning(item.duration_s, item.width, item.height) : null;

  return (
    <div
      className={`${styles.row} ${selected ? styles.selected : ''}`}
      onClick={() => onOpen(item.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        // Enter opens the video; Space selects it, matching how file lists behave elsewhere.
        if (event.key === 'Enter') {
          event.preventDefault();
          onOpen(item.id);
        } else if (event.key === ' ') {
          event.preventDefault();
          onToggle(item.id);
        }
      }}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggle(item.id)}
        onClick={(event) => event.stopPropagation()}
        aria-label={`Select ${item.title}`}
      />

      <div className={styles.thumb}>
        <span className={styles.duration}>{formatDuration(item.duration_s)}</span>
      </div>

      <div className={styles.name}>
        <div className={styles.title}>
          {item.posting_kind === 'rotation' && (
            <span className={styles.rerun} title={`Posting ${item.postings} of this video. Re-runs never notify subscribers.`}>
              Re-run {item.postings > 1 ? `#${item.postings}` : ''}
            </span>
          )}
          {item.title}
        </div>
        <div className={styles.file}>{item.filename}</div>
        {problem !== null && <div className={styles.problem}>{problem}</div>}
        {notAShort !== null && <div className={styles.warning}>{notAShort}</div>}
      </div>

      <StatusPill state={item.state} attentionCode={item.attention_code} />

      <div>
        <div className={styles.when}>
          {item.scheduled_for === null ? 'No time set' : new Date(item.scheduled_for).toLocaleString()}
        </div>
        {item.scheduled_for !== null && (
          <div className={`${styles.whenSource} ${item.schedule_source === 'auto' ? styles.auto : ''}`}>
            {formatRelativeTime(item.scheduled_for)}
            {item.schedule_source !== null && ` · ${scheduleSourceLabel[item.schedule_source] ?? item.schedule_source}`}
          </div>
        )}
      </div>

      <div className={styles.facts}>
        <div>{item.width === null || item.height === null ? '—' : `${item.width}×${item.height}`}</div>
        <div>{formatFileSize(item.file_size)}</div>
      </div>
    </div>
  );
}
