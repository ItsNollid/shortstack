import React, { useId } from 'react';
import styles from './Field.module.css';

export interface FieldProps {
  label: string;
  hint?: string;
  optional?: boolean;
  /** Shown at the end of the label row, e.g. "72 / 100". */
  counter?: string;
  counterOver?: boolean;
  problem?: string | null;
  children: (id: string, invalid: boolean) => React.ReactNode;
}

export function Field({
  label,
  hint,
  optional,
  counter,
  counterOver,
  problem = null,
  children
}: FieldProps): React.JSX.Element {
  const id = useId();
  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <label className={styles.label} htmlFor={id}>
          {label}
        </label>
        {optional === true && <span className={styles.optional}>optional</span>}
        {counter !== undefined && (
          <span className={`${styles.counter} ${counterOver === true ? styles.over : ''}`}>{counter}</span>
        )}
      </div>
      {children(id, problem !== null)}
      {problem !== null ? (
        <div className={styles.problem}>{problem}</div>
      ) : (
        hint !== undefined && <div className={styles.hint}>{hint}</div>
      )}
    </div>
  );
}

export interface TextFieldProps extends Omit<FieldProps, 'children'> {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function TextField(props: TextFieldProps): React.JSX.Element {
  const { value, onChange, placeholder, disabled, ...field } = props;
  return (
    <Field {...field}>
      {(id, invalid) => (
        <input
          id={id}
          className={`${styles.control} ${invalid ? styles.invalid : ''}`}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  );
}

export interface TextAreaProps extends TextFieldProps {
  rows?: number;
  /** Off where ShortStack checks the text itself: the browser's own checker underlines every hashtag. */
  spellCheck?: boolean;
}

export function TextArea(props: TextAreaProps): React.JSX.Element {
  const { value, onChange, placeholder, disabled, rows = 6, spellCheck, ...field } = props;
  return (
    <Field {...field}>
      {(id, invalid) => (
        <textarea
          id={id}
          rows={rows}
          className={`${styles.control} ${invalid ? styles.invalid : ''}`}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          spellCheck={spellCheck}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  );
}

export interface SelectProps<T extends string> extends Omit<FieldProps, 'children'> {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string; disabled?: boolean }>;
  disabled?: boolean;
}

export function Select<T extends string>(props: SelectProps<T>): React.JSX.Element {
  const { value, onChange, options, disabled, ...field } = props;
  return (
    <Field {...field}>
      {(id, invalid) => (
        <select
          id={id}
          className={`${styles.control} ${invalid ? styles.invalid : ''}`}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value as T)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export interface SwitchProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function Switch({ label, hint, checked, onChange, disabled }: SwitchProps): React.JSX.Element {
  const id = useId();
  return (
    <div className={styles.switchRow}>
      <div className={styles.switchText}>
        <label className={styles.label} htmlFor={id}>
          {label}
        </label>
        {hint !== undefined && <div className={styles.hint}>{hint}</div>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={styles.switch}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.knob} />
      </button>
    </div>
  );
}
