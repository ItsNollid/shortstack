import React from 'react';
import { Button, Select, Switch, TextArea } from '../../components/ui';
import { useAppStatus } from '../../app/status';
import { useApiMutation, useApiQuery } from '../../hooks/useApi';
import type { AiStatus, Result } from '../../../shared/ipc';
import { findModel, isVisionModel, type AiModel } from '../../../shared/aiModels';
import { DRAFT_FIELDS, describeDraftFields, toggleDraftField } from '../../../shared/draftFields';
import { buildInfo, describeBuild } from '../../../shared/buildInfo';
import { CHANGELOG, sortedChangelog } from '../../../shared/changelog';
import { GOAL_LABELS, type InsightGoal } from '../../../shared/insightGoal';
import { describeUpdate, type UpdateStatus } from '../../../shared/updates';
import type { SettingsWriter } from './useSettings';
import { ModelPicker } from './ModelPicker';
import { CommittedText, Section } from './parts';
import styles from './Settings.module.css';

const readAi = (): Promise<Result<AiStatus>> => window.api.aiStatus();
const readUpdates = (): Promise<Result<UpdateStatus>> => window.api.updateStatus();

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
            : `${settings.ai_model} writes ${describeDraftFields(settings.ai_auto_draft_fields)} for each new video shortly after it is scanned, a few at a time. It only writes where you have not: anything you have edited yourself is left exactly as it is, and nothing is uploaded without your approval either way.`
        }
        checked={settings.ai_auto_draft}
        disabled={settings.ai_model === ''}
        onChange={(value) => writer.set('ai_auto_draft', value)}
      />

      {settings.ai_auto_draft && (
        <fieldset className={styles.draftFields}>
          <legend className={styles.draftFieldsLegend}>Which details to write</legend>
          <div className={styles.draftFieldsRow}>
            {DRAFT_FIELDS.map((field) => {
              const selected = settings.ai_auto_draft_fields.includes(field);
              // The last one stays ticked: drafting nothing at all is what the switch above is for.
              const onlyOne = selected && settings.ai_auto_draft_fields.length === 1;
              return (
                <label key={field} className={styles.draftField}>
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={onlyOne}
                    onChange={() => writer.set('ai_auto_draft_fields', toggleDraftField(settings.ai_auto_draft_fields, field))}
                  />
                  {field === 'title' ? 'Title' : field === 'description' ? 'Description' : 'Tags'}
                </label>
              );
            })}
          </div>
          <div className={styles.sectionText}>
            {writer.problemFor('ai_auto_draft_fields') ??
              'Applies to videos drafted from now on. Anything left unticked keeps whatever it already had — your default, or what you typed.'}
          </div>
        </fieldset>
      )}
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

export function InsightsSection({ writer }: { writer: SettingsWriter }): React.JSX.Element {
  const { settings } = writer;
  if (settings === null) return <Section title="What to aim for">Loading…</Section>;

  return (
    <Section
      title="What to aim for"
      text="Used when Analytics works out what your videos have in common, and when the model suggests what to do about it. It decides what counts as better."
    >
      <Select
        label="What you want more of"
        value={settings.insight_goal}
        onChange={(value) => writer.set('insight_goal', value)}
        options={(Object.keys(GOAL_LABELS) as InsightGoal[]).map((goal) => ({ value: goal, label: GOAL_LABELS[goal] }))}
        hint="Reach and subscribers often pull in different directions, which is why they can be asked for together."
      />

      <TextArea
        label="How you work"
        value={settings.insight_context}
        onChange={(value) => writer.set('insight_context', value)}
        problem={writer.problemFor('insight_context')}
        rows={3}
        placeholder="I make 5 to 10 Shorts out of each long-form video. Mostly CS2, Minecraft and games with friends."
        hint="A couple of sentences. Advice is useless if it asks for something you cannot do, and this is how it knows."
      />
    </Section>
  );
}

export function UpdatesSection(): React.JSX.Element {
  const updates = useApiQuery(readUpdates, { key: 'updates-settings', invalidateOn: ['update:changed'] });
  const check = useApiMutation(() => window.api.updateCheck());
  const [showAll, setShowAll] = React.useState(false);

  const status = updates.data;
  const releases = sortedChangelog(CHANGELOG);
  const shown = showAll ? releases : releases.slice(0, 1);

  return (
    <Section
      title="Updates"
      text={
        status?.channel === 'development'
          ? 'This copy was built from source on this computer, so its updates are rebuilds rather than downloads.'
          : 'ShortStack checks for a newer release when it starts, and every few hours after that. Nothing downloads until you ask it to.'
      }
      actions={
        <Button onClick={() => void check.run()} disabled={check.pending}>
          {check.pending ? 'Checking…' : 'Check now'}
        </Button>
      }
    >
      <div className={styles.sectionText}>
        {status === null || status === undefined ? 'Checking…' : describeUpdate(status)}
        {status?.commitsBehind !== undefined && status.commitsBehind > 0 && (
          <> · your source is {status.commitsBehind} commit{status.commitsBehind === 1 ? '' : 's'} ahead of this build</>
        )}
      </div>

      <div className={styles.sectionText}>This build: {describeBuild(buildInfo())}</div>

      {shown.map((release) => (
        <div key={release.version} className={styles.release}>
          <div className={styles.releaseHead}>
            {release.version} — {release.headline}
          </div>
          <ul className={styles.releaseChanges}>
            {release.changes.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
          {release.legal !== undefined && release.legal.length > 0 && (
            <div className={styles.releaseLegal}>
              {release.legal.map((note) => (
                <div key={note}>{note}</div>
              ))}
            </div>
          )}
        </div>
      ))}

      {releases.length > 1 && (
        <Button onClick={() => setShowAll(!showAll)}>{showAll ? 'Show only the latest' : `Show all ${releases.length} releases`}</Button>
      )}
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
