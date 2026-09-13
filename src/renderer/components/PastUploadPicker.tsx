import React, { useEffect, useMemo, useState } from 'react';
import { formatRelativeTime } from '../../shared/presentation';
import { copyableFrom, matchesSearch, type CopyableDetails, type PastUpload } from '../../shared/pastUploads';
import { Banner, Button, Dialog, Skeleton, TextField } from './ui';
import styles from './PastUploadPicker.module.css';

export interface PastUploadPickerProps {
  open: boolean;
  onClose: () => void;
  onPick: (details: CopyableDetails, from: PastUpload) => void;
}

/**
 * Details from something already on the channel. It hands back the title, description, tags and
 * category — never the visibility or the timing, which are decisions about the new posting rather
 * than facts about the old one. Nothing is applied until the user picks a video.
 */
export function PastUploadPicker({ open, onClose, onPick }: PastUploadPickerProps): React.JSX.Element {
  const [items, setItems] = useState<PastUpload[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = (pageToken?: string): void => {
    setLoading(true);
    setProblem(null);
    void window.api.pastUploadsList(pageToken).then((result) => {
      setLoading(false);
      if (!result.ok) {
        setProblem(result.error.message);
        return;
      }
      setItems((current) => (pageToken === undefined ? result.data.items : [...current, ...result.data.items]));
      setNextPageToken(result.data.nextPageToken);
    });
  };

  // Fetched when the dialog opens rather than on mount: this costs a call to YouTube.
  useEffect(() => {
    if (!open) return;
    setItems([]);
    setSearch('');
    load();
  }, [open]);

  const shown = useMemo(() => items.filter((item) => matchesSearch(item, search)), [items, search]);

  return (
    <Dialog open={open} title="Use details from a past upload" onClose={onClose}>
      {problem !== null && (
        <Banner kind="warning" title="Could not read your uploads">
          {problem}
        </Banner>
      )}

      <div className={styles.search}>
        <TextField label="Search" value={search} onChange={setSearch} placeholder="Title, description or tag" />
      </div>

      {loading && items.length === 0 ? (
        <div className={styles.list}>
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} height={64} radius="var(--radius-sm)" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className={styles.empty}>
          {items.length === 0 ? 'Nothing has been published on this channel yet.' : 'No uploads match that search.'}
        </div>
      ) : (
        <div className={styles.list}>
          {shown.map((item) => (
            <button
              key={item.videoId}
              type="button"
              className={styles.row}
              onClick={() => {
                onPick(copyableFrom(item), item);
                onClose();
              }}
            >
              {item.thumbnailUrl === null ? (
                <span className={`${styles.thumb} ${styles.thumbMissing}`} />
              ) : (
                <img className={styles.thumb} src={item.thumbnailUrl} alt="" loading="lazy" />
              )}
              <span className={styles.body}>
                <span className={styles.title}>{item.title || 'Untitled'}</span>
                <span className={styles.meta}>
                  {item.privacy} · {formatRelativeTime(item.publishedAt)}
                </span>
                {item.tags.length > 0 && <span className={styles.tags}>{item.tags.join(', ')}</span>}
              </span>
              <span className={styles.meta}>Use</span>
            </button>
          ))}
        </div>
      )}

      {nextPageToken !== null && (
        <div className={styles.more}>
          <Button size="small" disabled={loading} onClick={() => load(nextPageToken)}>
            {loading ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </Dialog>
  );
}
