// Bringing videos already waiting into line with the house style, after showing exactly what changes.
import React, { useState } from 'react';
import type { Result } from '../../../shared/ipc';
import type { RestyleChange, RestyleResult } from '../../../shared/restyle';
import { Button, Dialog } from '../../components/ui';
import { useApiMutation, useApiQuery } from '../../hooks/useApi';
import styles from './Settings.module.css';

/** `rulesKey` changes whenever the house style does, so the count follows the rules as they are edited. */
export function RestyleWaiting({ rulesKey }: { rulesKey: string }): React.JSX.Element | null {
  const preview = useApiQuery((): Promise<Result<RestyleChange[]>> => window.api.queueRestylePreview(), {
    key: `restyle:${rulesKey}`,
    invalidateOn: ['queue:changed']
  });
  const apply = useApiMutation((ids: number[]): Promise<Result<RestyleResult>> => window.api.queueRestyle(ids), {
    onDone: preview.refresh
  });
  const [open, setOpen] = useState(false);

  const changes = preview.data ?? [];
  const done = apply.data;
  if (changes.length === 0 && done === null) return null;

  const count = changes.length;
  return (
    <div className={styles.restyle}>
      {count === 0 && done !== null ? (
        <span className={styles.sectionText}>
          House style applied to {done.changed} waiting video{done.changed === 1 ? '' : 's'}
          {done.skipped > 0 ? `. ${done.skipped} had changed in the meantime and were left as they were.` : '.'}
        </span>
      ) : (
        <>
          <span className={styles.sectionText}>
            {count} waiting video{count === 1 ? ' does' : 's do'} not match this house style yet. It is applied when details
            are saved, so videos written before a rule changed keep the old style.
          </span>
          <Button size="small" onClick={() => setOpen(true)}>
            Apply to waiting videos…
          </Button>
        </>
      )}

      <Dialog
        open={open}
        title="Apply house style to waiting videos"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={apply.pending || count === 0}
              onClick={() => void apply.run(changes.map((change) => change.id)).then(() => setOpen(false))}
            >
              {apply.pending ? 'Applying…' : `Apply to ${count}`}
            </Button>
          </>
        }
      >
        <ul className={styles.restyleList}>
          {changes.map((change) => (
            <li key={change.id} className={styles.restyleItem}>
              {change.title !== null ? (
                <span>
                  <span className={styles.restyleBefore}>{change.title.before}</span>
                  {' → '}
                  <strong>{change.title.after}</strong>
                </span>
              ) : (
                <span className={styles.restyleBefore}>Title already matches</span>
              )}
              {(change.description !== null || change.tagsChanged) && (
                <span className={styles.restyleNote}>
                  {[change.description !== null ? 'description tidied' : null, change.tagsChanged ? 'tags tidied' : null]
                    .filter((note): note is string => note !== null)
                    .join(', ')}
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className={styles.sectionText}>
          Only videos not yet on YouTube are changed. What you wrote stays yours — this only reformats it, and it is recorded
          in History.
        </p>
      </Dialog>
    </div>
  );
}
