// A suggested settings change, as a button that says exactly what it will do before it does it. Shared by the
// Analytics advice and the assistant, so both change settings the same way.
import React from 'react';
import { describeChange, type ChannelAction, type SettingChange } from '../../shared/channelActions';
import type { Result } from '../../shared/ipc';
import { useApiMutation, useApiQuery } from '../hooks/useApi';
import { Button } from './ui';
import styles from './SettingChangeRow.module.css';

export function SettingChangeRow({ change }: { change: ChannelAction }): React.JSX.Element {
  const preview = useApiQuery((): Promise<Result<SettingChange | null>> => window.api.actionPreview(change), {
    key: `preview:${JSON.stringify(change)}`
  });
  const apply = useApiMutation(() => window.api.actionApply(change), { onDone: preview.refresh });

  if (apply.data !== null) return <div className={styles.applied}>Done — {describeChange(apply.data)}</div>;
  const proposed = preview.data;
  return (
    <>
      {/* Nothing to show when the change would change nothing. */}
      {proposed !== null && proposed !== undefined && (
        <div className={styles.row}>
          <code className={styles.diff}>{describeChange(proposed)}</code>
          <Button size="small" disabled={apply.pending} onClick={() => void apply.run()}>
            {apply.pending ? 'Changing…' : 'Make this change'}
          </Button>
        </div>
      )}
      {apply.error !== null && <div className={styles.error}>{apply.error}</div>}
    </>
  );
}
