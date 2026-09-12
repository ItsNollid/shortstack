import React from 'react';
import { Select, Switch } from '../../components/ui';
import type { SettingsWriter } from './useSettings';
import { Section } from './parts';
import { TimesEditor } from './TimesEditor';
import styles from './Settings.module.css';

const RETRY_OPTIONS = ['0', '1', '3', '5', '10'].map((value) => ({
  value,
  label: value === '0' ? 'Do not retry' : `${value} ${value === '1' ? 'try' : 'tries'}`
}));

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
