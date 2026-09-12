import React from 'react';
import { Switch } from '../../components/ui';
import { useAppStatus } from '../../app/status';
import { useApiQuery } from '../../hooks/useApi';
import type { AiStatus, Result } from '../../../shared/ipc';
import type { SettingsWriter } from './useSettings';
import { CommittedText, Section } from './parts';
import styles from './Settings.module.css';

const readAi = (): Promise<Result<AiStatus>> => window.api.aiStatus();

export function AiSection({ writer }: { writer: SettingsWriter }): React.JSX.Element {
  const ai = useApiQuery(readAi, { key: 'ai-settings' });
  const { settings } = writer;
  if (settings === null) return <Section title="Suggestions">Loading…</Section>;

  return (
    <Section
      title="Suggestions from a local model"
      text="Optional. ShortStack can ask Ollama running on this computer to draft a title, description and tags. Nothing is sent anywhere else."
      actions={
        <span className={styles.sectionText}>{ai.data === null ? 'Checking…' : ai.data.message}</span>
      }
    >
      <div className={styles.pair}>
        <CommittedText
          label="Ollama address"
          value={settings.ai_host}
          onCommit={(value) => writer.set('ai_host', value)}
          problem={writer.problemFor('ai_host')}
          placeholder="http://127.0.0.1:11434"
        />
        <CommittedText
          label="Model"
          value={settings.ai_model}
          onCommit={(value) => writer.set('ai_model', value)}
          problem={writer.problemFor('ai_model')}
          placeholder={ai.data?.models[0] ?? 'llama3.2'}
          hint={
            ai.data === null || ai.data.models.length === 0
              ? 'Install a model with: ollama pull llama3.2'
              : `Installed: ${ai.data.models.join(', ')}`
          }
        />
      </div>
    </Section>
  );
}

export function AppSection({ writer }: { writer: SettingsWriter }): React.JSX.Element {
  const { settings } = writer;
  if (settings === null) return <Section title="This app">Loading…</Section>;

  return (
    <Section title="This app">
      <Switch
        label="Keep running in the tray when the window is closed"
        hint="Scheduled uploads only happen while ShortStack is running. Videos already scheduled on YouTube publish either way."
        checked={settings.close_to_tray}
        onChange={(value) => writer.set('close_to_tray', value)}
      />
      <Switch
        label="Start with Windows"
        checked={settings.start_with_windows}
        onChange={(value) => writer.set('start_with_windows', value)}
      />
    </Section>
  );
}

export function PlatformsSection(): React.JSX.Element {
  return (
    <Section title="Other platforms" text="ShortStack uploads to YouTube today.">
      <Switch label="TikTok" hint="Coming soon." checked={false} onChange={() => undefined} disabled />
      <Switch label="Instagram" hint="Coming soon." checked={false} onChange={() => undefined} disabled />
    </Section>
  );
}

export function VersionNote(): React.JSX.Element {
  const { info } = useAppStatus();
  return (
    <div className={styles.sectionText}>
      {info === null
        ? ''
        : `ShortStack ${info.version} · ${info.profile} profile · uploads ${info.uploads} · ShortStack is not affiliated with YouTube or Google.`}
    </div>
  );
}
