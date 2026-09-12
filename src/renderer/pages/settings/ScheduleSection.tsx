import React from 'react';
import { Select, Switch } from '../../components/ui';
import type { SettingsWriter } from './useSettings';
import { Section } from './parts';
import { TimesEditor } from './TimesEditor';
import styles from './Settings.module.css';

const POSTING_OPTIONS = ['0', '2', '3', '4', '6', '10', '20'].map((value) => ({
  value,
  label: value === '0' ? 'Never repeat' : `${value} postings`
}));

const AHEAD_OPTIONS = ['7', '14', '21', '30', '60'].map((value) => ({ value, label: `${value} days` }));

const RETRY_OPTIONS = ['0', '1', '3', '5', '10'].map((value) => ({
  value,
  label: value === '0' ? 'Do not retry' : `${value} ${value === '1' ? 'try' : 'tries'}`
}));

export function RotationSection({ writer }: { writer: SettingsWriter }): React.JSX.Element {
  const { settings } = writer;
  if (settings === null) return <Section title="Re-runs">Loading…</Section>;

  return (
    <Section
      id="rotation"
      title="Re-runs"
      text="A video posted again later reaches people who missed it. Re-runs never notify your subscribers, whatever your default for new videos is."
    >
      <div className={styles.sectionText}>Times used for re-runs, kept apart from the ones above so a backlog of them never delays a new video.</div>
      <TimesEditor
        times={settings.rotation_upload_times}
        onChange={(times) => writer.set('rotation_upload_times', times)}
        problem={writer.problemFor('rotation_upload_times')}
      />

      <Select
        label="Post each video at most"
        value={String(settings.rotation_max_postings)}
        onChange={(value) => writer.set('rotation_max_postings', Number(value))}
        options={POSTING_OPTIONS}
        hint="Counting its first posting. You can always take a single video out of rotation, or post one again by hand."
        problem={writer.problemFor('rotation_max_postings')}
      />

      {settings.rotation_upload_times.length === 0 && settings.rotation_max_postings > 0 && (
        <div className={styles.problem}>
          Re-runs have no times to use, so none will be scheduled. Add one above, or set the limit to never repeat.
        </div>
      )}
    </Section>
  );
}

export function ScheduleSection({
  writer,
  onRequestAutoApprove
}: {
  writer: SettingsWriter;
  onRequestAutoApprove: () => void;
}): React.JSX.Element {
  const { settings } = writer;
  if (settings === null) return <Section title="Schedule">Loading…</Section>;

  return (
    <Section
      id="schedule"
      title="Daily schedule"
      text="Approved videos without a time of their own take the next free slot from this list. Drag one onto the Calendar to override it."
    >
      <TimesEditor
        times={settings.upload_times}
        onChange={(times) => writer.set('upload_times', times)}
        problem={writer.problemFor('upload_times')}
      />

      <Switch
        label="Approve new videos automatically"
        hint="Off by default. Turning this on means ShortStack acts on new files without you looking at them first."
        checked={settings.auto_approve}
        onChange={(value) => {
          if (value) onRequestAutoApprove();
          else writer.set('auto_approve', false);
        }}
      />
      {writer.problemFor('auto_approve') !== null && (
        <div className={styles.problem}>{writer.problemFor('auto_approve')}</div>
      )}

      <Select
        label="Book the schedule this far ahead"
        value={String(settings.auto_schedule_days)}
        onChange={(value) => writer.set('auto_schedule_days', Number(value))}
        options={AHEAD_OPTIONS}
        hint="Approved videos beyond this wait without a date, so the near-term schedule stays yours to change."
        problem={writer.problemFor('auto_schedule_days')}
      />

      <Select
        label="Retries after a failed upload"
        value={String(settings.auto_retry_max)}
        onChange={(value) => writer.set('auto_retry_max', Number(value))}
        options={RETRY_OPTIONS}
        hint="Waits get longer each time: a minute, five, half an hour, then two hours."
        problem={writer.problemFor('auto_retry_max')}
      />
    </Section>
  );
}
