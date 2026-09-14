import React, { useEffect, useState } from 'react';
import type { QueueItemDTO } from '../../shared/dto';
import { OTHER_PLATFORMS, PLATFORM_NAMES, type OtherPlatform } from '../../shared/platformPosts';
import { PLATFORMS, type Platform } from '../../shared/queue';
import { useApiMutation } from '../hooks/useApi';
import styles from './PlatformChoice.module.css';

/** Where a video goes. YouTube always; TikTok and Instagram when ticked, posted by the person with ShortStack's help. */
export function PlatformChoice({ item }: { item: QueueItemDTO }): React.JSX.Element {
  const save = useApiMutation((platforms: Platform[]) => window.api.queueSetPlatforms(item.id, platforms));
  // What was just clicked, shown straight away. Without it the box stayed as it was until the save came back,
  // which reads as the click not having worked.
  const [clicked, setClicked] = useState<Platform[] | null>(null);
  const saved = item.platforms.join(',');
  useEffect(() => setClicked(null), [item.id, saved]);

  const shown = clicked ?? item.platforms;

  const toggle = (platform: OtherPlatform, on: boolean): void => {
    const next = PLATFORMS.filter((each) => each === 'youtube' || (each === platform ? on : shown.includes(each)));
    setClicked(next);
    void save.run(next).then((updated) => {
      if (updated === null) setClicked(null);
    });
  };

  return (
    <div className={styles.card} role="group" aria-label="Where it goes">
      <div className={styles.title}>Where it goes</div>
      <label className={styles.option}>
        <input type="checkbox" checked disabled />
        YouTube
      </label>
      {OTHER_PLATFORMS.map((platform) => (
        <label key={platform} className={styles.option}>
          <input type="checkbox" checked={shown.includes(platform)} disabled={save.pending} onChange={(event) => toggle(platform, event.target.checked)} />
          {PLATFORM_NAMES[platform]}
        </label>
      ))}
      <div className={save.error === null ? styles.hint : styles.problem}>
        {save.error ?? 'You post to TikTok and Instagram yourself. ShortStack makes the file and writes the caption.'}
      </div>
    </div>
  );
}
