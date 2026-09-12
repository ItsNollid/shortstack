import React from 'react';
import { Avatar, TonePill } from '../components/ui';
import { BrandMark } from '../components/BrandMark';
import { connectionStage, describeConnection } from '../../shared/connection';
import { useAppStatus } from './status';
import styles from './TitleBar.module.css';

function schedulerTone(paused: boolean, auth: string): 'live' | 'waiting' | 'attention' {
  if (auth !== 'ok') return 'attention';
  return paused ? 'waiting' : 'live';
}

export function TitleBar(): React.JSX.Element {
  const { info, auth, scheduler } = useAppStatus();
  const channel = auth?.channel ?? null;
  const connection =
    auth === null
      ? null
      : describeConnection(
          connectionStage({ state: auth.state, hasClientSecret: auth.hasClientSecret, hasChannel: channel !== null }),
          { channelTitle: channel?.title, dryRun: info?.uploads === 'dry-run' }
        );

  return (
    <header className={styles.bar}>
      <BrandMark />
      <span className={styles.name}>ShortStack</span>
      {info !== null &&
        (info.uploads === 'live' ? (
          <span className={`${styles.badge} ${styles.live}`}>Live uploads</span>
        ) : (
          <span className={`${styles.badge} ${styles.dryRun}`}>Dry run</span>
        ))}

      <span className={styles.spacer} />

      {scheduler !== null && (
        <TonePill tone={schedulerTone(scheduler.paused, scheduler.auth)}>
          {scheduler.auth !== 'ok'
            ? (connection?.badge ?? 'Not connected')
            : scheduler.paused
              ? 'Paused'
              : 'Running'}
        </TonePill>
      )}

      <span className={styles.channel}>
        <Avatar src={channel?.avatarUrl} name={channel?.title} size={24} />
        <span className={styles.channelName}>{connection?.headline ?? ''}</span>
      </span>
    </header>
  );
}
