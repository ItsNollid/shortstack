import React, { useEffect, useRef } from 'react';
import { buildInfo } from '../../shared/buildInfo';
import { whatsNew } from '../../shared/whatsNew';
import { useAppStatus } from '../app/status';
import { useApiMutation } from '../hooks/useApi';
import { Button, Dialog } from './ui';
import styles from './WhatsNew.module.css';

/**
 * Shown once after an update. Nothing about it blocks the app — an update notice that has to be
 * dealt with before anything else is a worse experience than the update it is announcing.
 */
export function WhatsNew(): React.JSX.Element | null {
  const { settings, refreshSettings } = useAppStatus();
  const mark = useApiMutation((version: string) => window.api.settingsSet('last_seen_version', version), {
    onDone: refreshSettings
  });

  const { show, markSeen } = whatsNew(settings, buildInfo().version);
  const nothingToShow = show.length === 0;

  // Tried once per version, never again. The mutation object is new on every render, so an effect
  // that depended on it re-ran after every render: a handful of duplicate writes on a good day, and
  // on a day the write failed, a write attempt on every single render for as long as the app was open.
  const attempted = useRef<string | null>(null);
  const markRun = mark.run;

  // A fresh install, or a build older than what was last seen: recorded quietly, so the next real
  // update announces only itself rather than everything that ever happened.
  useEffect(() => {
    if (!nothingToShow || markSeen === null || attempted.current === markSeen) return;
    attempted.current = markSeen;
    void markRun(markSeen);
  }, [nothingToShow, markSeen, markRun]);

  if (nothingToShow || markSeen === null) return null;

  return (
    <Dialog open title={show.length === 1 ? `What’s new in ${show[0].version}` : 'What’s new'} onClose={() => void mark.run(markSeen)}>
      {show.map((entry) => (
        <div key={entry.version} className={styles.release}>
          <div className={styles.head}>
            <span className={styles.version}>{entry.version}</span>
            <span className={styles.date}>{new Date(entry.date).toLocaleDateString()}</span>
          </div>
          <div className={styles.headline}>{entry.headline}</div>
          <ul className={styles.changes}>
            {entry.changes.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
          {entry.legal !== undefined && entry.legal.length > 0 && (
            <div className={styles.legal}>
              {entry.legal.map((note) => (
                <div key={note}>{note}</div>
              ))}
            </div>
          )}
        </div>
      ))}

      <div className={styles.actions}>
        <Button variant="primary" onClick={() => void mark.run(markSeen)} disabled={mark.pending}>
          Got it
        </Button>
      </div>
    </Dialog>
  );
}
