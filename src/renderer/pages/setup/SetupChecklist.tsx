import React from 'react';
import { Check, Circle } from 'lucide-react';
import { BrandMark } from '../../components/BrandMark';
import { Banner, Button } from '../../components/ui';
import { useAppStatus } from '../../app/status';
import { useApiMutation } from '../../hooks/useApi';
import styles from './FirstRun.module.css';

interface Step {
  title: string;
  text: string;
  done: boolean;
  action: React.ReactNode;
}

/** Shown once, after the legal gate. Every step can be done later from Settings, so it finishes
 *  whenever the user says so rather than trapping them here. */
export function SetupChecklist({ onFinish, pending }: { onFinish: () => void; pending: boolean }): React.JSX.Element {
  const { auth, settings, refreshAuth, refreshSettings } = useAppStatus();

  const importSecret = useApiMutation(() => window.api.authImportClientSecret(), { onDone: refreshAuth });
  const connect = useApiMutation(() => window.api.authConnect(), { onDone: refreshAuth });
  const chooseFolder = useApiMutation(() => window.api.selectFolder());
  const setFolder = useApiMutation((folder: string) => window.api.settingsSet('shorts_folder', folder), {
    onDone: refreshSettings
  });

  const hasSecret = auth?.hasClientSecret === true;
  const connected = auth?.state === 'ok';
  const hasFolder = settings !== null && settings.shorts_folder !== '';
  const problem = importSecret.error ?? connect.error ?? chooseFolder.error ?? setFolder.error;

  const steps: Step[] = [
    {
      title: 'Install your Google credentials',
      text: 'ShortStack uses a Google Cloud project you own, so your channel stays tied to credentials you control. Download its client_secret.json and point ShortStack at it.',
      done: hasSecret,
      action: (
        <Button size="small" disabled={importSecret.pending} onClick={() => void importSecret.run()}>
          {hasSecret ? 'Replace' : 'Choose file'}
        </Button>
      )
    },
    {
      title: 'Connect your channel',
      text: connected
        ? (auth?.channel?.title ?? 'Connected')
        : 'Google will ask you to sign in and approve what ShortStack may do.',
      done: connected,
      action: (
        <Button size="small" disabled={!hasSecret || connect.pending} onClick={() => void connect.run()}>
          {connect.pending ? 'Waiting…' : connected ? 'Reconnect' : 'Connect'}
        </Button>
      )
    },
    {
      title: 'Choose your videos folder',
      text: hasFolder ? (settings?.shorts_folder ?? '') : 'The folder your finished Shorts are rendered into. ShortStack only reads it.',
      done: hasFolder,
      action: (
        <Button
          size="small"
          disabled={chooseFolder.pending}
          onClick={() => {
            void chooseFolder.run().then((folder) => {
              if (folder !== null && folder !== '') void setFolder.run(folder);
            });
          }}
        >
          {hasFolder ? 'Change' : 'Choose folder'}
        </Button>
      )
    }
  ];

  const outstanding = steps.filter((step) => !step.done).length;

  return (
    <div className={styles.screen}>
      <div className={styles.panel}>
        <div className={styles.brand}>
          <BrandMark size={28} />
          <span className={styles.name}>Set up ShortStack</span>
        </div>
        <p className={styles.lead}>Three things, and you can change any of them later in Settings.</p>

        {problem !== null && (
          <Banner kind="danger" title="That did not work">
            {problem}
          </Banner>
        )}

        {steps.map((step) => (
          <div key={step.title} className={`${styles.step} ${step.done ? styles.stepDone : ''}`}>
            {step.done ? <Check size={16} className={styles.tick} /> : <Circle size={16} className={styles.pending} />}
            <div className={styles.stepBody}>
              <div className={styles.stepTitle}>{step.title}</div>
              <div className={styles.stepText}>{step.text}</div>
            </div>
            {step.action}
          </div>
        ))}

        <div className={styles.actions}>
          <Button variant={outstanding === 0 ? 'primary' : 'secondary'} disabled={pending} onClick={onFinish}>
            {outstanding === 0 ? 'Start using ShortStack' : `Finish later (${outstanding} left)`}
          </Button>
        </div>
      </div>
    </div>
  );
}
