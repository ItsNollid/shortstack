// Kept for maintenance: the raw state of every backend subsystem, without interpretation.
import React from 'react';
import type { Result } from '../../shared/ipc';
import type { AiStatus } from '../../shared/ipc';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui';
import { useApiQuery } from '../hooks/useApi';
import { useAppStatus } from '../app/status';
import styles from './Diagnostics.module.css';

const readAi = (): Promise<Result<AiStatus>> => window.api.aiStatus();

function Panel({ title, value }: { title: string; value: unknown }): React.JSX.Element {
  return (
    <section className={styles.panel}>
      <h2 className={styles.panelTitle}>{title}</h2>
      <pre className={styles.dump}>{JSON.stringify(value, null, 2)}</pre>
    </section>
  );
}

export function Diagnostics(): React.JSX.Element {
  const { info, auth, scheduler, settings, refreshAuth, refreshScheduler, refreshSettings } = useAppStatus();
  const ai = useApiQuery(readAi, { key: 'ai' });

  return (
    <>
      <PageHeader
        title="Diagnostics"
        subtitle="Raw backend state"
        actions={
          <Button
            onClick={() => {
              refreshAuth();
              refreshScheduler();
              refreshSettings();
              ai.refresh();
            }}
          >
            Refresh
          </Button>
        }
      />
      <div className={styles.grid}>
        <Panel title="App" value={info} />
        <Panel title="Scheduler" value={scheduler} />
        <Panel title="Connection" value={auth} />
        <Panel title="Local AI" value={ai.data ?? ai.error} />
        <Panel title="Settings" value={settings} />
      </div>
    </>
  );
}
