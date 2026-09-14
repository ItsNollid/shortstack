import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { AiStatus, MetadataSuggestionDTO, Result } from '../../shared/ipc';
import { describeMerge, mergeDescription, mergeTags, type MergeMode } from '../../shared/suggestionMerge';
import { ANGLE_LABELS, type TitleAngle } from '../../shared/titleAngles';
import { Banner, Button } from '../components/ui';
import { useApiMutation, useApiQuery } from '../hooks/useApi';
import styles from './AiAssistPanel.module.css';

export type AiField = 'title' | 'description' | 'tags';

export interface AiAssistPanelProps {
  queueId: number;
  current: { title: string; description: string; tags: string[] };
  /** A title taken from the offers comes with its kind, so the kind can be remembered with it. */
  onAccept: (field: AiField, value: string | string[], angle?: TitleAngle) => void;
  disabled?: boolean;
}

const readAi = (): Promise<Result<AiStatus>> => window.api.aiStatus();

interface Row {
  key: string;
  field: AiField;
  label: string;
  suggested: string;
  value: string | string[];
  angle?: TitleAngle;
  unchanged: boolean;
  /** There is something already in the field, so the suggestion can be added to it instead of replacing it. */
  addable: boolean;
  /** Adding would change nothing: everything suggested is already there. */
  nothingNew: boolean;
}

/** One row per kind of title when the model offered them, otherwise the single title as before. */
function titleRows(suggestion: MetadataSuggestionDTO, current: AiAssistPanelProps['current']): Row[] {
  const options = suggestion.titleOptions ?? [];
  const row = (key: string, label: string, title: string, angle?: TitleAngle): Row => ({
    key,
    field: 'title',
    label,
    suggested: title,
    value: title,
    angle,
    unchanged: title === current.title,
    addable: false,
    nothingNew: false
  });
  return options.length === 0
    ? [row('title', 'Title', suggestion.title)]
    : options.map((option) => row(`title-${option.angle}`, `Title · ${ANGLE_LABELS[option.angle]}`, option.title, option.angle));
}

function rows(suggestion: MetadataSuggestionDTO, current: AiAssistPanelProps['current']): Row[] {
  const hasDescription = current.description.trim() !== '';
  const hasTags = current.tags.length > 0;
  const all: Row[] = [
    ...titleRows(suggestion, current),
    {
      key: 'description',
      field: 'description',
      label: 'Description',
      suggested: suggestion.description,
      value: suggestion.description,
      unchanged: suggestion.description === current.description,
      addable: hasDescription,
      nothingNew: hasDescription && mergeDescription(current.description, suggestion.description, 'end').value === current.description
    },
    {
      key: 'tags',
      field: 'tags',
      label: 'Tags',
      suggested: suggestion.tags.join(', '),
      value: suggestion.tags,
      unchanged: JSON.stringify(suggestion.tags) === JSON.stringify(current.tags),
      addable: hasTags,
      nothingNew: hasTags && mergeTags(current.tags, suggestion.tags, 'end').added === 0
    }
  ];
  return all.filter((row) => row.suggested.trim() !== '');
}

/** Suggestions are never written into the form on their own: each field is applied only when the
 *  user accepts it — replacing what is there, or added to its start or end. */
export function AiAssistPanel({ queueId, current, onAccept, disabled }: AiAssistPanelProps): React.JSX.Element {
  const ai = useApiQuery(readAi, { key: 'ai' });
  const generate = useApiMutation(() => window.api.aiGenerate(queueId));
  const [notes, setNotes] = useState<Record<string, string>>({});

  const running = ai.data?.running === true && ai.data.models.length > 0;
  const suggestion = generate.data;
  const offersKinds = (suggestion?.titleOptions ?? []).length > 1;
  useEffect(() => setNotes({}), [suggestion]);

  const take = (row: Row, mode: MergeMode): void => {
    let note: string | null = null;
    if (row.field === 'description' && typeof row.value === 'string') {
      const merged = mergeDescription(current.description, row.value, mode);
      if (merged.value !== current.description) onAccept('description', merged.value);
      note = describeMerge(merged, mode, 'hashtag');
    } else if (row.field === 'tags' && Array.isArray(row.value)) {
      const merged = mergeTags(current.tags, row.value, mode);
      if (merged.added > 0 || mode === 'replace') onAccept('tags', merged.value);
      note = describeMerge(merged, mode, 'tag');
    }
    setNotes((previous) => {
      const next = { ...previous };
      if (note === null) delete next[row.key];
      else next[row.key] = note;
      return next;
    });
  };

  return (
    <section className={styles.panel} aria-label="Suggested details">
      <div className={styles.head}>
        <Sparkles size={16} />
        <span className={styles.title}>Suggested details</span>
        <Button size="small" disabled={!running || generate.pending || disabled === true} onClick={() => void generate.run()}>
          {generate.pending ? 'Thinking…' : suggestion === null ? 'Suggest' : 'Suggest again'}
        </Button>
      </div>

      {!running && (
        <div className={styles.status}>
          {ai.data === null ? 'Checking for a local model…' : ai.data.message}. Suggestions are optional; everything
          works without them.
        </div>
      )}

      {generate.error !== null && (
        <Banner kind="warning" title="No suggestion this time">
          {generate.error}
        </Banner>
      )}

      {offersKinds && (
        <div className={styles.status}>
          A title of each kind. Whichever you use is remembered, so Analytics can say which kind works once enough are
          published.
        </div>
      )}

      {suggestion !== null &&
        rows(suggestion, current).map((row) => (
          <div key={row.key} className={styles.suggestion} role="group" aria-label={row.label}>
            <div className={styles.body}>
              <div className={styles.field}>{row.label}</div>
              <div className={styles.text}>{row.suggested}</div>
              {notes[row.key] !== undefined && <div className={styles.note}>{notes[row.key]}</div>}
            </div>
            {row.unchanged ? (
              <span className={styles.same}>Already used</span>
            ) : row.addable ? (
              <div className={styles.choices}>
                <Button size="small" disabled={disabled === true} onClick={() => take(row, 'replace')}>
                  Replace
                </Button>
                {!row.nothingNew && (
                  <>
                    <Button size="small" disabled={disabled === true} onClick={() => take(row, 'start')}>
                      Add to start
                    </Button>
                    <Button size="small" disabled={disabled === true} onClick={() => take(row, 'end')}>
                      Add to end
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <Button size="small" disabled={disabled === true} onClick={() => onAccept(row.field, row.value, row.angle)}>
                Use this
              </Button>
            )}
          </div>
        ))}
    </section>
  );
}
