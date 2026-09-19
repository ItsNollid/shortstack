// A suggested title, description or tags for the video the answer was about, landing like any other suggestion:
// a title replaces; a description or tags can replace, or be added to the start or end of what is there.
import React, { useState } from 'react';
import type { AssistantChange } from '../../../shared/assistant/types';
import { describeMerge, mergeDescription, mergeTags, type MergeMode } from '../../../shared/suggestionMerge';
import type { QueueMetadataPatch } from '../../../shared/videoMetadata';
import { Button } from '../ui';
import styles from './AssistantPanel.module.css';

type VideoChange = Extract<AssistantChange, { kind: 'video' }>;

export function VideoDraftRow({ queueId, change }: { queueId: number; change: VideoChange }): React.JSX.Element {
  const [done, setDone] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const use = async (mode: MergeMode): Promise<void> => {
    setBusy(true);
    setProblem(null);
    // Read fresh, so adding to a description adds to what is there now, not what was there when it answered.
    const current = await window.api.queueGet(queueId);
    if (!current.ok) {
      setBusy(false);
      setProblem(current.error.message);
      return;
    }
    const item = current.data;
    let patch: QueueMetadataPatch;
    let note: string | null = null;
    if (change.field === 'title') {
      patch = { title: change.value };
    } else if (change.field === 'description') {
      const merged = mergeDescription(item.description, change.value, mode);
      patch = { description: merged.value };
      note = describeMerge(merged, mode, 'hashtag');
    } else {
      const merged = mergeTags(item.tags, change.value, mode);
      patch = { tags: merged.value };
      note = describeMerge(merged, mode, 'tag');
    }
    const saved = await window.api.queueUpdateMetadata(queueId, patch, item.updated_at);
    setBusy(false);
    if (!saved.ok) {
      setProblem(saved.error.message);
      return;
    }
    setDone(note ?? `Used as the ${change.field}`);
  };

  const shown = change.field === 'tags' ? change.value.join(', ') : change.value;
  return (
    <div className={styles.draft}>
      <div className={styles.draftLabel}>Suggested {change.field}</div>
      <div className={styles.draftValue}>{shown}</div>
      {done !== null ? (
        <div className={styles.applied}>{done}</div>
      ) : (
        <div className={styles.draftButtons}>
          {change.field === 'title' ? (
            <Button size="small" disabled={busy} onClick={() => void use('replace')}>
              Use this
            </Button>
          ) : (
            <>
              <Button size="small" disabled={busy} onClick={() => void use('replace')}>
                Replace
              </Button>
              <Button size="small" disabled={busy} onClick={() => void use('start')}>
                Add to start
              </Button>
              <Button size="small" disabled={busy} onClick={() => void use('end')}>
                Add to end
              </Button>
            </>
          )}
        </div>
      )}
      {problem !== null && <div className={styles.note}>{problem}</div>}
    </div>
  );
}
