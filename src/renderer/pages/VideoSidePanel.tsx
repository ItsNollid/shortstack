import React from 'react';
import { ExternalLink, FolderOpen } from 'lucide-react';
import type { QueueItemDTO } from '../../shared/dto';
import { formatDuration, formatFileSize, formatRelativeTime, presentAttention, shortsWarning } from '../../shared/presentation';
import { actionableIds, type BulkAction } from '../../shared/queueActions';
import { Banner, Button, StatusPill } from '../components/ui';
import styles from './VideoDetails.module.css';

export interface VideoSidePanelProps {
  item: QueueItemDTO;
  busy: boolean;
  onAction: (action: BulkAction) => void;
}

const ACTION_LABELS: Record<BulkAction, string> = {
  approve: 'Approve',
  unapprove: 'Unapprove',
  reject: 'Reject',
  restore: 'Restore'
};

export function VideoSidePanel({ item, busy, onAction }: VideoSidePanelProps): React.JSX.Element {
  const available = (['approve', 'unapprove', 'restore', 'reject'] as BulkAction[]).filter(
    (action) => actionableIds([{ ...item }], action).length === 1
  );
  const notAShort = shortsWarning(item.duration_s, item.width, item.height);
  const attention = item.attention_code === null ? null : presentAttention(item.attention_code);

  return (
    <aside className={styles.side}>
      <div className={styles.preview}>
        {item.missing ? 'The file is no longer in the folder' : `${formatDuration(item.duration_s)} preview`}
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>Status</div>
        <div>
          <StatusPill state={item.state} attentionCode={item.attention_code} />
        </div>
        {attention !== null && attention.action !== null && <div className={styles.factValue}>{attention.action}</div>}
        <div className={styles.facts}>
          <span className={styles.factLabel}>Publishes</span>
          <span className={styles.factValue}>
            {item.scheduled_for === null
              ? 'No time set yet'
              : `${new Date(item.scheduled_for).toLocaleString()} · ${formatRelativeTime(item.scheduled_for)}`}
          </span>
          {item.remote_sync !== null && (
            <>
              <span className={styles.factLabel}>YouTube</span>
              <span className={styles.factValue}>
                {item.remote_sync === 'synced'
                  ? 'Up to date'
                  : item.remote_sync === 'pending'
                    ? 'Changes waiting to reach YouTube'
                    : (item.remote_error ?? 'Could not update YouTube')}
              </span>
            </>
          )}
        </div>
      </div>

      {notAShort !== null && (
        <Banner kind="warning" title="Not a Short">
          {notAShort}. It will still upload as an ordinary video.
        </Banner>
      )}

      <div className={styles.card}>
        <div className={styles.cardTitle}>File</div>
        <div className={styles.facts}>
          <span className={styles.factLabel}>Name</span>
          <span className={styles.factValue}>{item.filename}</span>
          <span className={styles.factLabel}>Size</span>
          <span className={styles.factValue}>{formatFileSize(item.file_size)}</span>
          <span className={styles.factLabel}>Length</span>
          <span className={styles.factValue}>{formatDuration(item.duration_s)}</span>
          <span className={styles.factLabel}>Frame</span>
          <span className={styles.factValue}>
            {item.width === null || item.height === null ? 'Unknown' : `${item.width}×${item.height}`}
          </span>
        </div>
        <div className={styles.actions}>
          <Button size="small" icon={<FolderOpen size={14} />} onClick={() => void window.api.revealFile(item.id)}>
            Show in folder
          </Button>
          {item.youtube_video_id !== null && (
            <Button
              size="small"
              icon={<ExternalLink size={14} />}
              onClick={() => void window.api.openExternal(`https://www.youtube.com/watch?v=${item.youtube_video_id}`)}
            >
              Watch on YouTube
            </Button>
          )}
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>Actions</div>
        <div className={styles.actions}>
          {available.length === 0 ? (
            <span className={styles.factValue}>
              Nothing to do here. Videos already on YouTube are managed in YouTube Studio.
            </span>
          ) : (
            available.map((action) => (
              <Button
                key={action}
                size="small"
                variant={action === 'approve' ? 'primary' : action === 'reject' ? 'danger' : 'secondary'}
                disabled={busy}
                onClick={() => onAction(action)}
              >
                {ACTION_LABELS[action]}
              </Button>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
