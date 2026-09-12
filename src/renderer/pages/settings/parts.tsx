import React, { useEffect, useState } from 'react';
import { TextArea, TextField } from '../../components/ui';
import styles from './Settings.module.css';

export function Section({
  id,
  title,
  text,
  actions,
  children
}: {
  id?: string;
  title: string;
  text?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className={styles.section} id={id}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {actions}
      </div>
      {text !== undefined && <div className={styles.sectionText}>{text}</div>}
      {children}
    </section>
  );
}

export interface CommittedTextProps {
  label: string;
  hint?: string;
  value: string;
  onCommit: (value: string) => void;
  problem?: string | null;
  placeholder?: string;
  multiline?: boolean;
  counter?: string;
  counterOver?: boolean;
}

/** Holds what is being typed locally and reports it once, when the field is finished. */
export function CommittedText({
  label,
  hint,
  value,
  onCommit,
  problem = null,
  placeholder,
  multiline,
  counter,
  counterOver
}: CommittedTextProps): React.JSX.Element {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const commit = (): void => {
    if (draft !== value) onCommit(draft);
  };

  const shared = {
    label,
    hint,
    value: draft,
    onChange: setDraft,
    placeholder,
    problem,
    counter,
    counterOver
  };

  return (
    <div
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && multiline !== true) commit();
        if (event.key === 'Escape') setDraft(value);
      }}
    >
      {multiline === true ? <TextArea {...shared} rows={4} /> : <TextField {...shared} />}
    </div>
  );
}
