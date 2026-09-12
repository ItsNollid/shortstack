import React, { useEffect, useState } from 'react';
import styles from './Avatar.module.css';

export interface AvatarProps {
  src?: string | null;
  name?: string | null;
  size?: number;
}

const initial = (name: string | null | undefined): string =>
  name === null || name === undefined || name.trim() === '' ? '?' : [...name.trim()][0]!.toUpperCase();

/** Falls back to an initial whenever the avatar is absent or fails to load, so the title bar
 *  and sidebar never show a broken image after a disconnect. */
export function Avatar({ src, name, size = 28 }: AvatarProps): React.JSX.Element {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  const showImage = src !== null && src !== undefined && src !== '' && !failed;
  return (
    <span
      className={styles.avatar}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }}
      aria-hidden="true"
    >
      {showImage ? (
        <img className={styles.image} src={src} alt="" onError={() => setFailed(true)} draggable={false} />
      ) : (
        initial(name)
      )}
    </span>
  );
}
