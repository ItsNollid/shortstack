import React from 'react';
import type { QueueItemDTO } from '../../shared/dto';
import { approvalPlan } from '../../shared/consent';
import { privacyHint } from '../../shared/privacyCopy';
import { useAppStatus } from '../app/status';
import { Avatar, Banner, Button, Dialog } from './ui';
import styles from './ApproveDialog.module.css';

export interface ApproveDialogProps {
  items: readonly QueueItemDTO[];
  pending: boolean;
  problem: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

const PRIVACY_LABEL: Record<string, string> = { public: 'Public', unlisted: 'Unlisted', private: 'Private' };

/** Express consent before ShortStack acts for the user: it names the channel, what will happen
 *  without further input, and the exact visibility and time of every video in the selection. */
export function ApproveDialog({ items, pending, problem, onCancel, onConfirm }: ApproveDialogProps): React.JSX.Element {
  const { auth, settings } = useAppStatus();
  const channel = auth?.channel ?? null;
  const method = settings?.upload_method ?? 'assisted';
  const plan = approvalPlan(items, method, channel?.title ?? null);

  return (
    <Dialog
      open={items.length > 0}
      title={items.length === 1 ? 'Approve this video?' : `Approve ${items.length} videos?`}
      onClose={onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" disabled={pending} onClick={onConfirm}>
            {pending ? 'Approving…' : items.length === 1 ? 'Approve' : `Approve ${items.length}`}
          </Button>
        </>
      }
    >
      {problem !== null && (
        <Banner kind="danger" title="Not approved">
          {problem}
        </Banner>
      )}

      <div className={styles.channel}>
        <Avatar src={channel?.avatarUrl} name={channel?.title} size={32} />
        <div>
          <div className={styles.channelName}>{channel?.title ?? 'No channel connected'}</div>
          <div className={styles.channelMeta}>{channel?.handle ?? 'Connect a channel in Settings first'}</div>
        </div>
      </div>

      <ul className={styles.actions}>
        {plan.actions.map((action) => (
          <li key={action}>{action}</li>
        ))}
      </ul>

      <div className={styles.list}>
        {items.map((item) => (
          <div key={item.id} className={styles.row}>
            <span className={styles.rowTitle} title={item.title}>
              {item.title}
            </span>
            <span className={styles.rowWhen} title={privacyHint(item.privacy)}>
              {PRIVACY_LABEL[item.privacy] ?? item.privacy}
            </span>
            <span className={`${styles.rowWhen} ${item.scheduled_for === null ? styles.rowAuto : ''}`}>
              {item.privacy !== 'public'
                ? 'Uploaded straight away'
                : item.scheduled_for === null
                  ? 'Next free slot'
                  : new Date(item.scheduled_for).toLocaleString()}
            </span>
          </div>
        ))}
      </div>

      <div className={styles.lead}>You can unapprove any of these before they go out.</div>
    </Dialog>
  );
}
