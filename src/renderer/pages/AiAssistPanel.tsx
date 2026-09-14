import React from 'react';
import { Sparkles } from 'lucide-react';
import type { AiStatus, MetadataSuggestionDTO, Result } from '../../shared/ipc';
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
}

/** One row per kind of title when the model offered them, otherwise the single title as before. */
function titleRows(suggestion: MetadataSuggestionDTO, current: AiAssistPanelProps['current']): Row[] {
  const options = suggestion.titleOptions ?? [];
  if (options.length === 0) {
    return [
      {
        key: 'title',
        field: 'title',
        label: 'Title',
        suggested: suggestion.title,
        value: suggestion.title,
        unchanged: suggestion.title === current.title
      }
    ];
  }
  return options.map((option) => ({
    key: `title-${option.angle}`,
    field: 'title',
    label: `Title · ${ANGLE_LABELS[option.angle]}`,
    suggested: option.title,
    value: option.title,
    angle: option.angle,
    unchanged: option.title === current.title
  }));
}

function rows(suggestion: MetadataSuggestionDTO, current: AiAssistPanelProps['current']): Row[] {
  const all: Row[] = [
    ...titleRows(suggestion, current),
    {
      key: 'description',
      field: 'description',
      label: 'Description',
      suggested: suggestion.description,
      value: suggestion.description,
      unchanged: suggestion.description === current.description
    },
    {
      key: 'tags',
      field: 'tags',
      label: 'Tags',
      suggested: suggestion.tags.join(', '),
      value: suggestion.tags,
      unchanged: JSON.stringify(suggestion.tags) === JSON.stringify(current.tags)
    }
  ];
  return all.filter((row) => row.suggested.trim() !== '');
}

/** Suggestions are never written into the form on their own: each field is applied only when the
 *  user accepts it, and even then it is only a draft until they save. */
export function AiAssistPanel({ queueId, current, onAccept, disabled }: AiAssistPanelProps): React.JSX.Element {
  const ai = useApiQuery(readAi, { key: 'ai' });
  const generate = useApiMutation(() => window.api.aiGenerate(queueId));

  const running = ai.data?.running === true && ai.data.models.length > 0;
  const suggestion = generate.data;
  const offersKinds = (suggestion?.titleOptions ?? []).length > 1;

  return (
    <section className={styles.panel} aria-label="Suggested details">
      <div className={styles.head}>
        <Sparkles size={16} />
        <span className={styles.title}>Suggested details</span>
        <Button
          size="small"
          disabled={!running || generate.pending || disabled === true}
          onClick={() => void generate.run()}
        >
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
            </div>
            {row.unchanged ? (
              <span className={styles.same}>Already used</span>
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
