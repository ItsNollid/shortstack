import React from 'react';
import styles from './Progress.module.css';

export interface ProgressProps {
  /** 0–1, or null when the total is unknown. */
  value: number | null;
  label?: string;
}

export function Progress({ value, label }: ProgressProps): React.JSX.Element {
  const clamped = value === null ? null : Math.min(1, Math.max(0, value));
  return (
    <div
      className={`${styles.track} ${clamped === null ? styles.indeterminate : ''}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped === null ? undefined : Math.round(clamped * 100)}
    >
      <div className={styles.fill} style={clamped === null ? undefined : { width: `${clamped * 100}%` }} />
    </div>
  );
}
