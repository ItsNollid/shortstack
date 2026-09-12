import React from 'react';
import { Avatar, TonePill } from '../components/ui';
import { BrandMark } from '../components/BrandMark';
import { useAppStatus } from './status';
import styles from './TitleBar.module.css';

function schedulerTone(paused: boolean, auth: string): 'live' | 'waiting' | 'attention' {
  if (auth !== 'ok') return 'attention';
  return paused ? 'waiting' : 'live';
}

export function TitleBar(): React.JSX.Element {
  const { info, auth, scheduler } = useAppStatus();
  const channel = auth?.channel ?? null;

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
          {scheduler.auth !== 'ok' ? 'Not connected' : scheduler.paused ? 'Paused' : 'Running'}
        </TonePill>
      )}

      <span className={styles.channel}>
        <Avatar src={channel?.avatarUrl} name={channel?.title} size={24} />
        <span className={styles.channelName}>{channel?.title ?? 'No channel connected'}</span>
      </span>
    </header>
  );
}
