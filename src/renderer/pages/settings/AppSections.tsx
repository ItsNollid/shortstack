import React from 'react';
import { Switch } from '../../components/ui';
import { useAppStatus } from '../../app/status';
import { useApiQuery } from '../../hooks/useApi';
import type { AiStatus, Result } from '../../../shared/ipc';
import { findModel, isVisionModel, type AiModel } from '../../../shared/aiModels';
import type { SettingsWriter } from './useSettings';
import { ModelPicker } from './ModelPicker';
import { CommittedText, Section } from './parts';
import styles from './Settings.module.css';

const readAi = (): Promise<Result<AiStatus>> => window.api.aiStatus();

/**
 * Whether the chosen model will actually be shown the video. Ollama's own answer where we have it,
 * because a name is only a guess, and this is the difference between suggestions written from the
 * video and suggestions written from a file name.
 */
function canSee(models: readonly AiModel[], name: string): boolean {
  return findModel(models, name)?.vision ?? isVisionModel(name);
}

export function AiSection({ writer }: { writer: SettingsWriter }): React.JSX.Element {
  const ai = useApiQuery(readAi, { key: 'ai-settings' });
  const { settings } = writer;
  if (settings === null) return <Section title="Suggestions">Loading…</Section>;

  const models = ai.data?.models ?? [];

  return (
    <Section
      title="Suggestions from a local model"
      text="Optional. ShortStack can ask Ollama running on this computer to draft a title, description and tags. Nothing is sent anywhere else."
      actions={
        <span className={styles.sectionText}>{ai.data === null ? 'Checking…' : ai.data.message}</span>
      }
    >
      {settings.ai_model !== '' && (
        <div className={styles.sectionText}>
          {canSee(models, settings.ai_model)
            ? `${settings.ai_model} can look at the video. ShortStack sends it stills from three points in the clip, so it can name the game and what is happening instead of guessing from the file name.`
            : `${settings.ai_model} cannot look at images, so suggestions come from the file name and your past uploads alone. A model that can see the video, such as qwen3-vl or gemma3, would do better.`}
        </div>
      )}

      <CommittedText
        label="Ollama address"
        value={settings.ai_host}
        onCommit={(value) => writer.set('ai_host', value)}
        problem={writer.problemFor('ai_host')}
        placeholder="http://127.0.0.1:11434"
      />

      <ModelPicker models={models} value={settings.ai_model} onChange={(model) => writer.set('ai_model', model)} />

      <Switch
        label="Draft details for new videos automatically"
        hint={
          settings.ai_model === ''
            ? 'Choose a model above first.'
            : `${settings.ai_model} writes a title, description and tags for each new video shortly after it is scanned, a few at a time. It only writes where you have not: anything you have edited yourself is left exactly as it is, and nothing is uploaded without your approval either way.`
        }
        checked={settings.ai_auto_draft}
        disabled={settings.ai_model === ''}
        onChange={(value) => writer.set('ai_auto_draft', value)}
      />
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
