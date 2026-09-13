import React, { useMemo, useState } from 'react';
import { FolderOpen, ListVideo, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { QueueItemDTO } from '../../shared/dto';
import type { Result } from '../../shared/ipc';
import { actionableIds } from '../../shared/queueActions';
import {
  FILTER_EMPTY,
  FILTER_LABELS,
  KIND_FILTERS,
  KIND_LABELS,
  QUEUE_FILTERS,
  countByFilter,
  matchesFilter,
  matchesKind,
  type KindFilter,
  type QueueFilter
} from '../../shared/queueFilters';
import { PageHeader } from '../components/PageHeader';
import { Banner, Button, EmptyState, FilterChips, Skeleton } from '../components/ui';
import { useApiMutation, useApiQuery } from '../hooks/useApi';
import { useThumbnailBackfill } from '../hooks/useThumbnails';
import { useRequestApproval } from '../app/approval';
import { useAppStatus } from '../app/status';
import styles from './Queue.module.css';
import { QueueRow } from './QueueRow';

const readQueue = (): Promise<Result<QueueItemDTO[]>> => window.api.queueList();

export function Queue(): React.JSX.Element {
  const { settings } = useAppStatus();
  const navigate = useNavigate();
  const requestApproval = useRequestApproval();
  const queue = useApiQuery(readQueue, { key: 'queue', invalidateOn: ['queue:changed'] });
  const [filter, setFilter] = useState<QueueFilter>('all');
  const [kind, setKind] = useState<KindFilter>('any');
  const [selected, setSelected] = useState<number[]>([]);

  const items = queue.data ?? [];
  // Poster frames are drawn in the background once the list is on screen.
  useThumbnailBackfill(queue.data !== null);
  const counts = useMemo(() => countByFilter(items.map((item) => item.state)), [items]);
  const shown = useMemo(
    () => items.filter((item) => matchesFilter(item.state, filter) && matchesKind(item.posting_kind, kind)),
    [items, filter, kind]
  );

  const clear = (): void => setSelected([]);
  const scan = useApiMutation(() => window.api.videosScan(), { onDone: queue.refresh });
  const unapprove = useApiMutation((ids: number[]) => window.api.queueUnapprove(ids), { onDone: clear });
  const reject = useApiMutation((ids: number[]) => window.api.queueReject(ids), { onDone: clear });
  const restore = useApiMutation((ids: number[]) => window.api.queueRestore(ids), { onDone: clear });
  const markReupload = useApiMutation(
    (ids: number[], published: boolean) => window.api.rotationMarkPublishedBefore(ids, published),
    { onDone: clear }
  );
  const postAgain = useApiMutation((ids: number[]) => window.api.rotationPostAgain(ids), { onDone: clear });
  const busy = unapprove.pending || reject.pending || restore.pending || markReupload.pending || postAgain.pending;
  const problem =
    queue.error ?? unapprove.error ?? reject.error ?? restore.error ?? markReupload.error ?? postAgain.error ?? scan.error;

  const toggle = (id: number): void =>
    setSelected((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));

  const chips = QUEUE_FILTERS.map((id) => ({ id, label: FILTER_LABELS[id], count: counts[id] }));
  // Only offer what the selection can actually take, and apply it only to those videos: a mixed
  // selection must never quietly leave some behind.
  const chosen = items.filter((item) => selected.includes(item.id));
  const approvable = chosen.filter((item) => actionableIds([item], 'approve').length === 1);
  const canUnapprove = actionableIds(chosen, 'unapprove');
  const canReject = actionableIds(chosen, 'reject');
  const canRestore = actionableIds(chosen, 'restore');
  const scanned = scan.pending ? 'Scanning…' : 'Scan folder';

  return (
    <>
      <PageHeader
        title="Queue"
        subtitle={
          settings?.shorts_folder === '' || settings === null
            ? 'Choose a folder in Settings to start finding videos'
            : settings.shorts_folder
        }
        actions={
          <Button icon={<RefreshCw size={15} />} disabled={scan.pending} onClick={() => void scan.run()}>
            {scanned}
          </Button>
        }
      />

      {problem !== null && (
        <div style={{ marginBottom: 'var(--space-3)' }}>
          <Banner kind="danger" title="That did not work">
            {problem}
          </Banner>
        </div>
      )}

      <div className={styles.toolbar}>
        <div className={styles.chips}>
          <FilterChips chips={chips} selected={filter} onSelect={setFilter} label="Filter the queue" />
        </div>
        <FilterChips
          chips={KIND_FILTERS.map((id) => ({ id, label: KIND_LABELS[id] }))}
          selected={kind}
          onSelect={setKind}
          label="Announcements or re-runs"
        />
      </div>

      {selected.length > 0 && (
        <div className={styles.bulk}>
          <span className={styles.bulkCount}>
            {selected.length} selected
          </span>
          {/* Approving is the only action that puts a video on a path to YouTube, so it is the one
              primary button and it is never triggered by dragging or by a bulk default. */}
          {approvable.length > 0 && (
            <Button variant="primary" size="small" disabled={busy} onClick={() => requestApproval(approvable, clear)}>
              Approve {approvable.length < selected.length && `(${approvable.length})`}
            </Button>
          )}
          {canUnapprove.length > 0 && (
            <Button size="small" disabled={busy} onClick={() => void unapprove.run(canUnapprove)}>
              Unapprove {canUnapprove.length < selected.length && `(${canUnapprove.length})`}
            </Button>
          )}
          {canRestore.length > 0 && (
            <Button size="small" disabled={busy} onClick={() => void restore.run(canRestore)}>
              Restore {canRestore.length < selected.length && `(${canRestore.length})`}
            </Button>
          )}
          {canReject.length > 0 && (
            <Button variant="danger" size="small" disabled={busy} onClick={() => void reject.run(canReject)}>
              Reject {canReject.length < selected.length && `(${canReject.length})`}
            </Button>
          )}
          {chosen.some((item) => !item.published_before) && (
            <Button
              size="small"
              disabled={busy}
              title="Their next posting becomes a re-run and will not notify subscribers"
              onClick={() => void markReupload.run(selected, true)}
            >
              These are re-uploads
            </Button>
          )}
          {chosen.some((item) => item.published_before) && (
            <Button size="small" disabled={busy} onClick={() => void markReupload.run(selected, false)}>
              Not re-uploads
            </Button>
          )}
          {chosen.some((item) => item.state === 'published') && (
            <Button size="small" disabled={busy} onClick={() => void postAgain.run(selected)}>
              Post again
            </Button>
          )}
          <Button variant="ghost" size="small" onClick={clear}>
            Clear
          </Button>
        </div>
      )}

      {queue.loading ? (
        <div className={styles.list}>
          {[0, 1, 2, 3].map((row) => (
            <div key={row} style={{ padding: 'var(--space-2) var(--space-3)' }}>
              <Skeleton height={56} radius="var(--radius)" />
            </div>
          ))}
        </div>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={settings?.shorts_folder === '' ? <FolderOpen size={24} /> : <ListVideo size={24} />}
          title={items.length === 0 ? 'Nothing in the queue' : `No videos under ${FILTER_LABELS[filter]}`}
        >
          {FILTER_EMPTY[filter]}
        </EmptyState>
      ) : (
        <div className={styles.list}>
          {shown.map((item) => (
            <QueueRow
              key={item.id}
              item={item}
              selected={selected.includes(item.id)}
              onToggle={toggle}
              onOpen={(id) => navigate(`/video/${id}`)}
            />
          ))}
        </div>
      )}
    </>
  );
}
