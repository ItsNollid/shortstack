import React, { useState } from 'react';
import { DescriptionCheck } from '../../components/DescriptionCheck';
import { Banner, Button, Select, Switch, TextArea } from '../../components/ui';
import { formatDescription, formatTitle, formattingIsActive, type TitleCase } from '../../../shared/formatting';
import { FOOTER_MAX_HASHTAGS, formattingRules, type IgnoredSetting } from '../../../shared/settings';
import type { SettingsWriter } from './useSettings';
import { CommittedText, Section } from './parts';
import { RestyleWaiting } from './RestyleWaiting';
import styles from './Settings.module.css';

/** Something recognisable to format, so the preview shows the rules doing their work. */
const SAMPLE_TITLE = 'this zombie round broke me';
const SAMPLE_DESCRIPTION = 'Round 87 and the wall ran out.\n\n#blackops3zombies #codzombies #blackops3zombies';

const CASES: ReadonlyArray<{ value: TitleCase; label: string }> = [
  { value: 'as_written', label: 'Leave as written' },
  { value: 'upper', label: 'ALL CAPS' },
  { value: 'title', label: 'Title Case' }
];

export function FormattingSection({
  writer,
  ignored
}: {
  writer: SettingsWriter;
  ignored: readonly IgnoredSetting[];
}): React.JSX.Element {
  const { settings } = writer;
  // What is in the footer box. Kept here rather than read back from the saved setting, because a footer
  // that breaks a rule is refused, and the box used to snap back and throw away what was typed.
  const [footerDraft, setFooterDraft] = useState<string | null>(null);
  if (settings === null) return <Section title="Formatting">Loading…</Section>;

  const rules = formattingRules(settings);
  const active = formattingIsActive(rules);
  const lostFooter = ignored.find((entry) => entry.key === 'format_description_footer') ?? null;
  const footer = footerDraft ?? settings.format_description_footer;
  const changeFooter = (value: string): void => {
    setFooterDraft(value);
    writer.set('format_description_footer', value);
  };

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

      {lostFooter !== null && footerDraft === null && (
        <Banner
          kind="warning"
          title="Your saved footer is not being used"
          actions={
            <Button size="small" onClick={() => changeFooter(lostFooter.stored)}>
              Put it back in the box
            </Button>
          }
        >
          {lostFooter.reason}. It no longer passes the rules for a footer, so nothing has gone under your descriptions
          since. Put it back, use Fix all under the box to clean it up, and it saves as soon as it fits.
        </Banner>
      )}

      <DescriptionCheck text={footer} onChange={changeFooter} game={null} maxHashtags={FOOTER_MAX_HASHTAGS}>
        <TextArea
          label="Under every description"
          value={footer}
          onChange={changeFooter}
          problem={writer.problemFor('format_description_footer')}
          rows={4}
          spellCheck={false}
          hint="Added below whatever the description already says, with a blank line between. Never added twice."
          placeholder={'Subscribe for more\n\n#shorts #gaming'}
        />
      </DescriptionCheck>

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

      <RestyleWaiting rulesKey={JSON.stringify(rules)} />
    </Section>
  );
}
