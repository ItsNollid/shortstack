import React from 'react';
import styles from './Skeleton.module.css';

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: string;
}

export function Skeleton({ width = '100%', height = 14, radius }: SkeletonProps): React.JSX.Element {
  return <div className={styles.skeleton} style={{ width, height, borderRadius: radius }} aria-hidden="true" />;
}
