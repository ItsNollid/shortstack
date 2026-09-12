import React from 'react';
import type { AttentionCode, QueueState } from '../../../shared/queue';
import { presentState, type Tone } from '../../../shared/presentation';
import styles from './StatusPill.module.css';

export interface StatusPillProps {
  state: QueueState;
  attentionCode?: AttentionCode | null;
  /** Overrides the label; the tone and hint still come from the state. */
  label?: string;
  pulsing?: boolean;
}

/** A pill for statuses that are not queue states (auth, sync, scheduler). */
export function TonePill({ tone, children }: { tone: Tone; children: React.ReactNode }): React.JSX.Element {
  return (
    <span className={`${styles.pill} ${styles[tone]}`}>
      <span className={styles.dot} />
      {children}
    </span>
  );
}

export function StatusPill({ state, attentionCode = null, label, pulsing }: StatusPillProps): React.JSX.Element {
  const shown = presentState(state, attentionCode);
  const animate = pulsing ?? (state === 'uploading' || state === 'failed');
  return (
    <span
      className={`${styles.pill} ${styles[shown.tone]} ${animate ? styles.pulsing : ''}`}
      title={shown.hint}
    >
      <span className={styles.dot} />
      {label ?? shown.label}
    </span>
  );
}
