import React, { useEffect, useRef, useState } from 'react';
import { FileVideo } from 'lucide-react';
import { formatDuration } from '../../shared/presentation';
import styles from './VideoPreview.module.css';

export interface VideoPreviewProps {
  queueId: number;
  durationS: number | null;
  missing: boolean;
  /** Starts muted: a review session is dozens of videos and none of them should shout. */
  autoPlay?: boolean;
}

/** Plays the real file through the ss-media scheme, which is the only way the renderer can read it. */
export function VideoPreview({ queueId, durationS, missing, autoPlay = false }: VideoPreviewProps): React.JSX.Element {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);

  // Moving to another video should start it from the beginning, not from wherever the last one was.
  useEffect(() => {
    setFailed(false);
    const element = ref.current;
    if (element === null) return;
    element.currentTime = 0;
    if (autoPlay) void element.play().catch(() => undefined);
  }, [queueId, autoPlay]);

  if (missing) {
    return (
      <div className={styles.frame}>
        <div className={styles.fallback}>
          <FileVideo size={22} />
          The file is no longer in the folder, so there is nothing to play.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.frame}>
      {failed ? (
        <div className={styles.fallback}>
          <FileVideo size={22} />
          This file will not play here. It will still upload — the preview is the only thing affected.
        </div>
      ) : (
        <video
          ref={ref}
          className={styles.video}
          src={`ss-media://video/${queueId}`}
          controls
          muted
          loop
          playsInline
          preload="metadata"
          onError={() => setFailed(true)}
        />
      )}
      {durationS !== null && !failed && <span className={styles.badge}>{formatDuration(durationS)}</span>}
    </div>
  );
}
