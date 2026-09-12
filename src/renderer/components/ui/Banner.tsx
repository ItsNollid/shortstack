import React, { useState } from 'react';
import { X } from 'lucide-react';
import styles from './Banner.module.css';

export type BannerKind = 'info' | 'warning' | 'danger' | 'success';

export interface BannerProps {
  kind?: BannerKind;
  title?: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  /** Set to let the reader put an explanatory notice away for good. Never use it for a warning
   *  that still needs acting on. */
  dismissKey?: string;
}

const STORAGE_PREFIX = 'shortstack.banner.';

function readDismissed(key: string | undefined): boolean {
  if (key === undefined) return false;
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + key) === 'dismissed';
  } catch {
    return false;
  }
}

export function Banner({ kind = 'info', title, children, actions, dismissKey }: BannerProps): React.JSX.Element | null {
  const [dismissed, setDismissed] = useState(() => readDismissed(dismissKey));
  if (dismissed) return null;

  const dismiss = (): void => {
    setDismissed(true);
    try {
      if (dismissKey !== undefined) window.localStorage.setItem(STORAGE_PREFIX + dismissKey, 'dismissed');
    } catch {
      // A browser with storage blocked still hides it for this session; nothing else depends on it.
    }
  };

  return (
    <div className={`${styles.banner} ${styles[kind]}`} role={kind === 'danger' ? 'alert' : 'status'}>
      <div className={styles.body}>
        {title !== undefined && <div className={styles.title}>{title}</div>}
        {children !== undefined && <div className={styles.text}>{children}</div>}
      </div>
      {actions !== undefined && <div className={styles.actions}>{actions}</div>}
      {dismissKey !== undefined && (
        <button type="button" className={styles.dismiss} onClick={dismiss} aria-label="Dismiss">
          <X size={15} />
        </button>
      )}
    </div>
  );
}
