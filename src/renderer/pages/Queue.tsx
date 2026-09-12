import React, { useMemo, useState } from 'react';
import { FolderOpen, ListVideo, RefreshCw } from 'lucide-react';
import type { QueueItemDTO } from '../../shared/dto';
import type { Result } from '../../shared/ipc';
import { actionableIds } from '../../shared/queueActions';
import {
  FILTER_EMPTY,
  FILTER_LABELS,
  QUEUE_FILTERS,
  countByFilter,
  matchesFilter,
  type QueueFilter
} from '../../shared/queueFilters';
import { PageHeader } from '../components/PageHeader';
import { Banner, Button, EmptyState, FilterChips, Skeleton } from '../components/ui';
import { useApiMutation, useApiQuery } from '../hooks/useApi';
import { useAppStatus } from '../app/status';
import styles from './Queue.module.css';
import { QueueRow } from './QueueRow';

const readQueue = (): Promise<Result<QueueItemDTO[]>> => window.api.queueList();

export function Queue(): React.JSX.Element {
  const { settings } = useAppStatus();
  const queue = useApiQuery(readQueue, { key: 'queue', invalidateOn: ['queue:changed'] });
  const [filter, setFilter] = useState<QueueFilter>('all');
  const [selected, setSelected] = useState<number[]>([]);

  const items = queue.data ?? [];
  const counts = useMemo(() => countByFilter(items.map((item) => item.state)), [items]);
  const shown = useMemo(() => items.filter((item) => matchesFilter(item.state, filter)), [items, filter]);

  const clear = (): void => setSelected([]);
  const scan = useApiMutation(() => window.api.videosScan(), { onDone: queue.refresh });
  const approve = useApiMutation((ids: number[]) => window.api.queueApprove(ids), { onDone: clear });
  const unapprove = useApiMutation((ids: number[]) => window.api.queueUnapprove(ids), { onDone: clear });
  const reject = useApiMutation((ids: number[]) => window.api.queueReject(ids), { onDone: clear });
  const restore = useApiMutation((ids: number[]) => window.api.queueRestore(ids), { onDone: clear });
  const busy = approve.pending || unapprove.pending || reject.pending || restore.pending;
  const problem = queue.error ?? approve.error ?? unapprove.error ?? reject.error ?? restore.error ?? scan.error;

  const toggle = (id: number): void =>
    setSelected((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));

  const chips = QUEUE_FILTERS.map((id) => ({ id, label: FILTER_LABELS[id], count: counts[id] }));
  // Only offer what the selection can actually take, and apply it only to those videos: a mixed
  // selection must never quietly leave some behind.
  const chosen = items.filter((item) => selected.includes(item.id));
  const canApprove = actionableIds(chosen, 'approve');
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
      </div>

      {selected.length > 0 && (
        <div className={styles.bulk}>
          <span className={styles.bulkCount}>
            {selected.length} selected
          </span>
          {/* Approving is the only action that puts a video on a path to YouTube, so it is the one
              primary button and it is never triggered by dragging or by a bulk default. */}
          {canApprove.length > 0 && (
            <Button variant="primary" size="small" disabled={busy} onClick={() => void approve.run(canApprove)}>
              Approve {canApprove.length < selected.length && `(${canApprove.length})`}
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
            <QueueRow key={item.id} item={item} selected={selected.includes(item.id)} onToggle={toggle} />
          ))}
        </div>
      )}
    </>
  );
}
