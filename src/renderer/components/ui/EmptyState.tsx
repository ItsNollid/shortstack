import React from 'react';
import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}

/** An empty list should say why it is empty and what to do next, never just sit blank. */
export function EmptyState({ icon, title, children, action }: EmptyStateProps): React.JSX.Element {
  return (
    <div className={styles.empty}>
      {icon !== undefined && <div className={styles.glyph}>{icon}</div>}
      <div className={styles.title}>{title}</div>
      {children !== undefined && <div className={styles.text}>{children}</div>}
      {action}
    </div>
  );
}
