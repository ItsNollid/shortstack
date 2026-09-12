import React, { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from './Button';
import styles from './CopyField.module.css';

export interface CopyFieldProps {
  label: string;
  value: string;
  emptyText?: string;
}

/** Shows exactly what will be pasted, and copies it through the main process. */
export function CopyField({ label, value, emptyText = 'Nothing to copy' }: CopyFieldProps): React.JSX.Element {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <div>
      <div className={styles.label}>{label}</div>
      <div className={styles.row}>
        <div className={`${styles.value} ${value === '' ? styles.empty : ''}`}>{value === '' ? emptyText : value}</div>
        <Button
          size="small"
          icon={copied ? <Check size={14} /> : <Copy size={14} />}
          disabled={value === ''}
          onClick={() => {
            void window.api.clipboardWrite(value).then((result) => setCopied(result.ok));
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  );
}
