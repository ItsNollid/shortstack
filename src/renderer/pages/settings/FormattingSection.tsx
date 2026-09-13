import React from 'react';
import { Select, Switch, TextArea } from '../../components/ui';
import { formatDescription, formatTitle, formattingIsActive, type TitleCase } from '../../../shared/formatting';
import { formattingRules } from '../../../shared/settings';
import type { SettingsWriter } from './useSettings';
import { CommittedText, Section } from './parts';
import styles from './Settings.module.css';

/** Something recognisable to format, so the preview shows the rules doing their work. */
const SAMPLE_TITLE = 'this zombie round broke me';
const SAMPLE_DESCRIPTION = 'Round 87 and the wall ran out.\n\n#blackops3zombies #codzombies #blackops3zombies';

const CASES: ReadonlyArray<{ value: TitleCase; label: string }> = [
  { value: 'as_written', label: 'Leave as written' },
  { value: 'upper', label: 'ALL CAPS' },
  { value: 'title', label: 'Title Case' }
];

export function FormattingSection({ writer }: { writer: SettingsWriter }): React.JSX.Element {
  const { settings } = writer;
  if (settings === null) return <Section title="Formatting">Loading…</Section>;

  const rules = formattingRules(settings);
  const active = formattingIsActive(rules);

  return (
    <Section
      title="Formatting"
      text="House style, applied to every title and description — whether you typed it, the model drafted it, or it came from your defaults. Everything here is off until you switch it on."
    >
      <div className={styles.pair}>
        <Select
          label="Title case"
          value={settings.format_title_case}
          onChange={(value) => writer.set('format_title_case', value)}
          options={CASES.map((option) => ({ value: option.value, label: option.label }))}
          hint="Title Case leaves words that are already capitals alone, so COD stays COD."
        />
        <CommittedText
          label="Most hashtags in a description"
          value={String(settings.format_max_hashtags)}
          onCommit={(value) => writer.set('format_max_hashtags', Number(value))}
          problem={writer.problemFor('format_max_hashtags')}
          hint="0 means no limit. Past 60, YouTube ignores every hashtag on the video — not just the extras."
        />
      </div>

      <div className={styles.pair}>
        <CommittedText
          label="Before every title"
          value={settings.format_title_prefix}
          onCommit={(value) => writer.set('format_title_prefix', value)}
          problem={writer.problemFor('format_title_prefix')}
          placeholder="BO3: "
        />
        <CommittedText
          label="After every title"
          value={settings.format_title_suffix}
          onCommit={(value) => writer.set('format_title_suffix', value)}
          problem={writer.problemFor('format_title_suffix')}
          placeholder=" #shorts"
        />
      </div>

      <TextArea
        label="Under every description"
        value={settings.format_description_footer}
        onChange={(value) => writer.set('format_description_footer', value)}
        problem={writer.problemFor('format_description_footer')}
        rows={4}
        hint="Added below whatever the description already says, with a blank line between. Never added twice."
        placeholder={'Subscribe for more\n\n#shorts #gaming'}
      />

      <Switch
        label="Tidy up what goes in"
        hint="Removes quotes wrapped around a title, collapses runs of blank lines, and drops repeated hashtags and tags."
        checked={settings.format_tidy}
        onChange={(value) => writer.set('format_tidy', value)}
      />

      <div className={styles.preview}>
        <div className={styles.previewLabel}>{active ? 'What this does' : 'Nothing is being changed'}</div>
        <div className={styles.previewTitle}>{formatTitle(SAMPLE_TITLE, rules)}</div>
        <div className={styles.previewBody}>{formatDescription(SAMPLE_DESCRIPTION, rules)}</div>
      </div>
    </Section>
  );
}
