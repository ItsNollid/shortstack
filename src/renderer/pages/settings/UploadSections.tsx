import React from 'react';
import { VIDEO_CATEGORIES } from '../../../shared/categories';
import { PRIVACY_OPTIONS, privacyHint } from '../../../shared/privacyCopy';
import type { Privacy } from '../../../shared/queue';
import {
  DESCRIPTION_MAX_BYTES,
  TAGS_MAX_CHARS,
  TITLE_MAX_CHARS,
  charCount,
  tagsCharCount,
  utf8Bytes
} from '../../../shared/settings';
import { Banner, Select, Switch, TagInput } from '../../components/ui';
import type { SettingsWriter } from './useSettings';
import { CommittedText, Section } from './parts';
import styles from './Settings.module.css';

function Choice({
  selected,
  disabled,
  title,
  text,
  onSelect
}: {
  selected: boolean;
  disabled?: boolean;
  title: string;
  text: string;
  onSelect: () => void;
}): React.JSX.Element {
  return (
    <div
      className={`${styles.choice} ${selected ? styles.choiceOn : ''} ${disabled === true ? styles.choiceDisabled : ''}`}
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled === true}
      tabIndex={0}
      onClick={() => {
        if (disabled !== true) onSelect();
      }}
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && disabled !== true) {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <div className={styles.choiceBody}>
        <div className={styles.choiceTitle}>{title}</div>
        <div className={styles.choiceText}>{text}</div>
      </div>
    </div>
  );
}

export function UploadMethodSection({
  writer,
  onRequestApiMode
}: {
  writer: SettingsWriter;
  onRequestApiMode: () => void;
}): React.JSX.Element {
  const { settings } = writer;
  const method = settings?.upload_method ?? 'assisted';
  const audited = settings?.api_audit_confirmed_at !== null && settings?.api_audit_confirmed_at !== undefined;

  return (
    <Section id="upload-method" title="How videos get uploaded">
      <div role="radiogroup" aria-label="Upload method" style={{ display: 'grid', gap: 'var(--space-2)' }}>
        <Choice
          selected={method === 'assisted'}
          title="Assisted — you upload in YouTube Studio"
          text="ShortStack prepares each video, hands you the exact title, description, tags and time, then links the result back automatically."
          onSelect={() => writer.set('upload_method', 'assisted')}
        />
        <Choice
          selected={method === 'api'}
          title="Automatic — ShortStack uploads for you"
          text={
            audited
              ? 'ShortStack uploads each approved video as private and sets its publish time.'
              : 'Available once your Google Cloud project has passed YouTube’s API audit. Until then, anything uploaded this way stays private for good.'
          }
          onSelect={onRequestApiMode}
        />
      </div>
      {writer.problemFor('upload_method') !== null && (
        <div className={styles.problem}>{writer.problemFor('upload_method')}</div>
      )}
      {audited && (
        <div className={styles.sectionText}>
          Audit confirmed on {new Date(settings?.api_audit_confirmed_at ?? '').toLocaleDateString()}.
        </div>
      )}
    </Section>
  );
}

export function DefaultsSection({ writer }: { writer: SettingsWriter }): React.JSX.Element {
  const { settings } = writer;
  if (settings === null) return <Section title="Defaults for new videos">Loading…</Section>;

  return (
    <Section
      title="Defaults for new videos"
      text="Applied when a file is first found. You can change any of it per video before approving."
    >
      {settings.default_privacy === 'public' && (
        <Banner kind="warning" title="New videos will be public">
          Anything you approve goes out publicly at its scheduled time. Choose private or unlisted if you
          would rather decide one at a time.
        </Banner>
      )}

      <CommittedText
        label="Title"
        hint="Use {filename} to insert the file name without its extension."
        value={settings.default_title_template}
        onCommit={(value) => writer.set('default_title_template', value)}
        problem={writer.problemFor('default_title_template')}
        counter={`${charCount(settings.default_title_template)} / ${TITLE_MAX_CHARS}`}
        counterOver={charCount(settings.default_title_template) > TITLE_MAX_CHARS}
      />

      <CommittedText
        label="Description"
        multiline
        value={settings.default_description}
        onCommit={(value) => writer.set('default_description', value)}
        problem={writer.problemFor('default_description')}
        counter={`${utf8Bytes(settings.default_description)} / ${DESCRIPTION_MAX_BYTES} bytes`}
        counterOver={utf8Bytes(settings.default_description) > DESCRIPTION_MAX_BYTES}
      />

      <TagInput
        label="Tags"
        value={settings.default_tags}
        onChange={(tags) => writer.set('default_tags', tags)}
        problem={writer.problemFor('default_tags')}
        counter={`${tagsCharCount(settings.default_tags)} / ${TAGS_MAX_CHARS}`}
        counterOver={tagsCharCount(settings.default_tags) > TAGS_MAX_CHARS}
      />

      <div className={styles.pair}>
        <Select
          label="Visibility"
          value={settings.default_privacy}
          onChange={(value: Privacy) => writer.set('default_privacy', value)}
          options={PRIVACY_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
          hint={privacyHint(settings.default_privacy)}
          problem={writer.problemFor('default_privacy')}
        />
        <Select
          label="Category"
          value={settings.default_category_id}
          onChange={(value) => writer.set('default_category_id', value)}
          options={VIDEO_CATEGORIES.map((category) => ({ value: category.id, label: category.label }))}
          problem={writer.problemFor('default_category_id')}
        />
      </div>

      <Switch
        label="Tell subscribers"
        hint="Sends the usual notification when a video goes live."
        checked={settings.notify_subscribers}
        onChange={(value) => writer.set('notify_subscribers', value)}
      />
      <Switch
        label="Made for kids"
        hint="YouTube turns off comments and some features on videos marked for kids."
        checked={settings.made_for_kids}
        onChange={(value) => writer.set('made_for_kids', value)}
      />
    </Section>
  );
}
