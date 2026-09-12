import React, { useMemo, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ActivityEntryDTO, QueueItemDTO } from '../../shared/dto';
import type { Result } from '../../shared/ipc';
import { activityText, actorOf, isProblem } from '../../shared/activityCopy';
import { PageHeader } from '../components/PageHeader';
import { Banner, EmptyState, FilterChips, Skeleton } from '../components/ui';
import { useApiQuery } from '../hooks/useApi';
import styles from './History.module.css';

const FILTERS = ['all', 'shortstack', 'problems'] as const;
type HistoryFilter = (typeof FILTERS)[number];

const LABELS: Record<HistoryFilter, string> = {
  all: 'Everything',
  shortstack: 'Done for you',
  problems: 'Problems'
};

const EMPTY: Record<HistoryFilter, string> = {
  all: 'Nothing has happened yet. Approve a video and it will show up here.',
  shortstack: 'ShortStack has not done anything on your behalf yet.',
  problems: 'Nothing has gone wrong.'
};

const readActivity = (): Promise<Result<ActivityEntryDTO[]>> => window.api.activityList();
const readQueue = (): Promise<Result<QueueItemDTO[]>> => window.api.queueList();

const matches = (entry: ActivityEntryDTO, filter: HistoryFilter): boolean =>
  filter === 'all' || (filter === 'shortstack' ? actorOf(entry.action) === 'shortstack' : isProblem(entry.action));

const dayKey = (iso: string): string => new Date(iso).toDateString();

const dayLabel = (key: string): string => {
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();
  if (key === today) return 'Today';
  if (key === yesterday) return 'Yesterday';
  return new Date(key).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
};

export function History(): React.JSX.Element {
  const navigate = useNavigate();
  const activity = useApiQuery(readActivity, { key: 'activity', invalidateOn: ['queue:changed'] });
  const queue = useApiQuery(readQueue, { key: 'queue', invalidateOn: ['queue:changed'] });
  const [filter, setFilter] = useState<HistoryFilter>('all');

  const titles = useMemo(
    () => new Map((queue.data ?? []).map((item) => [item.id, item.title])),
    [queue.data]
  );

  const days = useMemo(() => {
    const entries = (activity.data ?? []).filter((entry) => matches(entry, filter));
    const grouped = new Map<string, ActivityEntryDTO[]>();
    for (const entry of entries) {
      const key = dayKey(entry.created_at);
      const list = grouped.get(key);
      if (list === undefined) grouped.set(key, [entry]);
      else list.push(entry);
    }
    return [...grouped.entries()];
  }, [activity.data, filter]);

  const counts = useMemo(() => {
    const all = activity.data ?? [];
    return {
      all: all.length,
      shortstack: all.filter((entry) => actorOf(entry.action) === 'shortstack').length,
      problems: all.filter((entry) => isProblem(entry.action)).length
    };
  }, [activity.data]);

  return (
    <>
      <PageHeader
        title="History"
        subtitle="Everything ShortStack has done, and everything you asked it to do"
      />

      {activity.error !== null && (
        <Banner kind="danger" title="Could not read the history">
          {activity.error}
        </Banner>
      )}

      <div className={styles.filters}>
        <FilterChips
          chips={FILTERS.map((id) => ({ id, label: LABELS[id], count: counts[id] }))}
          selected={filter}
          onSelect={setFilter}
          label="Filter the history"
        />
      </div>

      {activity.loading ? (
        [0, 1, 2].map((row) => (
          <div key={row} style={{ marginBottom: 'var(--space-2)' }}>
            <Skeleton height={32} radius="var(--radius-sm)" />
          </div>
        ))
      ) : days.length === 0 ? (
        <EmptyState icon={<ScrollText size={24} />} title="Nothing to show">
          {EMPTY[filter]}
        </EmptyState>
      ) : (
        days.map(([key, entries]) => (
          <section key={key} className={styles.day}>
            <div className={styles.dayHead}>{dayLabel(key)}</div>
            {entries.map((entry) => {
              const bad = isProblem(entry.action);
              const byApp = actorOf(entry.action) === 'shortstack';
              const title = entry.queue_id === null ? null : titles.get(entry.queue_id);
              return (
                <div key={entry.id} className={styles.entry}>
                  <span className={styles.time}>
                    {new Date(entry.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </span>
                  <span className={`${styles.dot} ${bad ? styles.bad : byApp ? styles.byApp : ''}`} />
                  <span className={styles.body}>
                    <span className={`${styles.label} ${bad ? styles.badText : ''}`}>
                      {activityText(entry.action, entry.detail)}
                    </span>
                  </span>
                  {title !== undefined && title !== null && (
                    <button
                      type="button"
                      className={styles.video}
                      title={title}
                      onClick={() => navigate(`/video/${entry.queue_id}`)}
                    >
                      {title}
                    </button>
                  )}
                </div>
              );
            })}
          </section>
        ))
      )}
    </>
  );
}
