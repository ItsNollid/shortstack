import React from 'react';
import type { AuthStatus } from '../../../shared/ipc';
import { connectionStage, describeConnection } from '../../../shared/connection';
import { Avatar, Button, TonePill } from '../../components/ui';
import styles from './Settings.module.css';

export interface ChannelBlockProps {
  auth: AuthStatus;
  dryRun: boolean;
  connecting: boolean;
  refreshing: boolean;
  onConnect: () => void;
  onRefreshChannel: () => void;
}

/** The headline and the line beneath it come from one decision, so they cannot disagree. */
export function ChannelBlock({
  auth,
  dryRun,
  connecting,
  refreshing,
  onConnect,
  onRefreshChannel
}: ChannelBlockProps): React.JSX.Element {
  const stage = connectionStage({
    state: auth.state,
    hasClientSecret: auth.hasClientSecret,
    hasChannel: auth.channel !== null
  });
  const copy = describeConnection(stage, { channelTitle: auth.channel?.title, dryRun });

  return (
    <div className={styles.row}>
      <Avatar src={auth.channel?.avatarUrl} name={auth.channel?.title} size={40} />
      <div className={styles.grow}>
        <div className={styles.row}>
          <span>{copy.headline}</span>
          <TonePill tone={copy.tone}>{copy.badge}</TonePill>
        </div>
        <div className={styles.sectionText}>{copy.detail}</div>
      </div>

      {stage === 'channel_unknown' && !dryRun && (
        <Button size="small" disabled={refreshing} onClick={onRefreshChannel}>
          {refreshing ? 'Reading…' : 'Read channel again'}
        </Button>
      )}
      {copy.offerConnect && (
        <Button
          variant={stage === 'disconnected' ? 'primary' : 'secondary'}
          disabled={connecting || !auth.hasClientSecret}
          onClick={onConnect}
        >
          {connecting ? 'Waiting for Google…' : stage === 'disconnected' ? 'Connect' : 'Reconnect'}
        </Button>
      )}
    </div>
  );
}
