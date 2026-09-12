import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '../../components/ui';
import styles from './Settings.module.css';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const pretty = (time: string): string => {
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

export function TimesEditor({
  times,
  onChange,
  problem
}: {
  times: string[];
  onChange: (times: string[]) => void;
  problem: string | null;
}): React.JSX.Element {
  const [draft, setDraft] = useState('');

  const add = (): void => {
    if (!HHMM.test(draft) || times.includes(draft)) return;
    // Sorted so the list reads like a day, whatever order they were added in.
    onChange([...times, draft].sort());
    setDraft('');
  };

  return (
    <div>
      <div className={styles.times}>
        {times.map((time) => (
          <span key={time} className={styles.time}>
            {pretty(time)}
            <button
              type="button"
              className={styles.timeRemove}
              aria-label={`Remove ${pretty(time)}`}
              onClick={() => onChange(times.filter((entry) => entry !== time))}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          type="time"
          className={styles.timeInput}
          value={draft}
          aria-label="New upload time"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button size="small" icon={<Plus size={14} />} disabled={!HHMM.test(draft) || times.includes(draft)} onClick={add}>
          Add
        </Button>
      </div>
      {problem !== null && <div className={styles.problem}>{problem}</div>}
    </div>
  );
}
