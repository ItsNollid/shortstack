import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Field } from './Field';
import styles from './TagInput.module.css';

export interface TagInputProps {
  label: string;
  hint?: string;
  counter?: string;
  counterOver?: boolean;
  problem?: string | null;
  value: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
}

export function TagInput({
  label,
  hint,
  counter,
  counterOver,
  problem = null,
  value,
  onChange,
  disabled
}: TagInputProps): React.JSX.Element {
  const [draft, setDraft] = useState('');

  const commit = (text: string): void => {
    // A pasted "a, b, c" becomes three tags, which is how people actually paste them.
    const added = text
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag !== '' && !value.includes(tag));
    if (added.length > 0) onChange([...value, ...added]);
    setDraft('');
  };

  return (
    <Field label={label} hint={hint} optional counter={counter} counterOver={counterOver} problem={problem}>
      {(id, invalid) => (
        <div className={`${styles.box} ${invalid ? styles.invalid : ''}`}>
          {value.map((tag) => (
            <span key={tag} className={styles.tag}>
              <span className={styles.tagText}>{tag}</span>
              <button
                type="button"
                className={styles.remove}
                aria-label={`Remove ${tag}`}
                disabled={disabled}
                onClick={() => onChange(value.filter((entry) => entry !== tag))}
              >
                <X size={11} />
              </button>
            </span>
          ))}
          <input
            id={id}
            className={styles.input}
            value={draft}
            disabled={disabled}
            placeholder={value.length === 0 ? 'Add a tag, then press Enter' : ''}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => commit(draft)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ',') {
                event.preventDefault();
                commit(draft);
              } else if (event.key === 'Backspace' && draft === '' && value.length > 0) {
                onChange(value.slice(0, -1));
              }
            }}
          />
        </div>
      )}
    </Field>
  );
}
