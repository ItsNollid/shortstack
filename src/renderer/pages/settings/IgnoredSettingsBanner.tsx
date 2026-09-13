// Saved settings that could not be used, said out loud. A rule tightened after a value was saved makes
// that value unusable and its default quietly takes over — which is how a footer stopped appearing
// under every description with nothing on screen to say so.
import React from 'react';
import type { IgnoredSetting } from '../../../shared/settings';
import { Banner } from '../../components/ui';
import styles from './Settings.module.css';

/** Settings shown in their own section instead, with a way to get the saved value back. */
const HANDLED_IN_PLACE: ReadonlySet<string> = new Set(['format_description_footer']);

export function IgnoredSettingsBanner({ ignored }: { ignored: readonly IgnoredSetting[] }): React.JSX.Element | null {
  const rest = ignored.filter((entry) => !HANDLED_IN_PLACE.has(entry.key));
  if (rest.length === 0) return null;
  return (
    <Banner
      kind="warning"
      title={rest.length === 1 ? 'A saved setting is not being used' : `${rest.length} saved settings are not being used`}
    >
      Each is back to its default until it is set again below.
      <ul className={styles.ignoredList}>
        {rest.map((entry) => (
          <li key={entry.key}>
            <strong>{entry.key.replace(/_/g, ' ')}</strong>: {entry.reason}
          </li>
        ))}
      </ul>
    </Banner>
  );
}
