import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DRAG_TYPE, dropOnDay, scheduleBlocker } from '../../../shared/calendarDnd';
import type { QueueItemDTO } from '../../../shared/dto';
import type { Result } from '../../../shared/ipc';
import { PageHeader } from '../../components/PageHeader';
import { Banner, Button } from '../../components/ui';
import { useAppStatus } from '../../app/status';
import { useToast } from '../../app/toast';
import { useApiMutation, useApiQuery } from '../../hooks/useApi';
import { Chip } from './Chip';
import styles from './Calendar.module.css';

const readQueue = (): Promise<Result<QueueItemDTO[]>> => window.api.queueList();

const dayKey = (date: Date): string => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

const WEEKDAYS = Array.from({ length: 7 }, (_, index) =>
  new Date(2024, 0, 7 + index).toLocaleDateString(undefined, { weekday: 'short' })
);

/** Six weeks from the Sunday on or before the 1st: the same shape every month. */
function gridDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  return Array.from(
    { length: 42 },
    (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
  );
}

export function Calendar(): React.JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const { settings } = useAppStatus();
  const queue = useApiQuery(readQueue, { key: 'queue', invalidateOn: ['queue:changed'] });
  const [cursor, setCursor] = useState(() => new Date());
  const [dragging, setDragging] = useState<QueueItemDTO | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const schedule = useApiMutation((id: number, at: string) => window.api.queueSchedule(id, at));
  const hold = useApiMutation((id: number) => window.api.queueHold(id));

  const items = queue.data ?? [];
  const uploadTimes = settings?.upload_times ?? [];
  const now = new Date();

  const byDay = useMemo(() => {
    const map = new Map<string, QueueItemDTO[]>();
    for (const item of items) {
      if (item.scheduled_for === null) continue;
      const key = dayKey(new Date(item.scheduled_for));
      const list = map.get(key);
      if (list === undefined) map.set(key, [item]);
      else list.push(item);
    }
    for (const list of map.values()) {
      list.sort((a, b) => Date.parse(a.scheduled_for ?? '') - Date.parse(b.scheduled_for ?? ''));
    }
    return map;
  }, [items]);

  const undated = useMemo(
    () =>
      items.filter((item) => item.scheduled_for === null && item.state !== 'published' && item.state !== 'rejected'),
    [items]
  );

  const days = useMemo(() => gridDays(cursor.getFullYear(), cursor.getMonth()), [cursor]);

  const verdictFor = (day: Date): ReturnType<typeof dropOnDay> | null =>
    dragging === null ? null : dropOnDay({ item: dragging, day, uploadTimes, taken: items, now });

  /** Restores whatever the video had before, so a mis-drop costs one click. The old time is
   *  captured as a value at drop time; reading it back off the item when Undo is pressed would
   *  read the new one. */
  const undoTo = (id: number, previous: string | null): (() => void) => () => {
    if (previous === null) void hold.run(id);
    else void schedule.run(id, previous);
  };

  const handleDrop = (day: Date, event: React.DragEvent): void => {
    event.preventDefault();
    const id = Number(event.dataTransfer.getData(DRAG_TYPE));
    setDragging(null);
    setHovered(null);
    const item = items.find((entry) => entry.id === id);
    if (item === undefined) return;

    const previous = item.scheduled_for;
    const verdict = dropOnDay({ item, day, uploadTimes, taken: items, now: new Date() });
    if (!verdict.ok) {
      toast({ text: verdict.reason, kind: 'bad' });
      return;
    }
    void schedule.run(item.id, verdict.at).then((updated) => {
      if (updated === null) {
        toast({ text: schedule.error ?? 'Could not set that time', kind: 'bad' });
        return;
      }
      toast({
        text: `${item.title} publishes ${new Date(verdict.at).toLocaleString()}`,
        action: { label: 'Undo', run: undoTo(item.id, previous) }
      });
    });
  };

  const handleTrayDrop = (event: React.DragEvent): void => {
    event.preventDefault();
    const id = Number(event.dataTransfer.getData(DRAG_TYPE));
    setDragging(null);
    setHovered(null);
    const item = items.find((entry) => entry.id === id);
    if (item === undefined || item.scheduled_for === null) return;
    const previous = item.scheduled_for;
    void hold.run(item.id).then((updated) => {
      if (updated === null) {
        toast({ text: hold.error ?? 'Could not take it off the schedule', kind: 'bad' });
        return;
      }
      toast({ text: `${item.title} has no time now`, action: { label: 'Undo', run: undoTo(item.id, previous) } });
    });
  };

  const carriesQueueItem = (event: React.DragEvent): boolean => event.dataTransfer.types.includes(DRAG_TYPE);

  const clearDrag = (): void => {
    setDragging(null);
    setHovered(null);
  };

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle="Drag a video onto a day to set when it publishes"
        actions={
          <div className={styles.toolbar}>
            <Button
              icon={<ChevronLeft size={15} />}
              aria-label="Previous month"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            />
            <span className={styles.month}>
              {cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </span>
            <Button
              icon={<ChevronRight size={15} />}
              aria-label="Next month"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            />
            <Button onClick={() => setCursor(new Date())}>Today</Button>
          </div>
        }
      />

      {uploadTimes.length === 0 && (
        <div style={{ marginBottom: 'var(--space-3)' }}>
          <Banner kind="warning" title="No daily times set">
            Add at least one upload time in Settings before scheduling from here.
          </Banner>
        </div>
      )}

      <div className={styles.layout}>
        <div>
          <div className={styles.weekdays}>
            {WEEKDAYS.map((name) => (
              <div key={name} className={styles.weekday}>
                {name}
              </div>
            ))}
          </div>
          <div className={styles.grid}>
            {days.map((day) => {
              const key = dayKey(day);
              const verdict = hovered === key ? verdictFor(day) : null;
              const isToday = key === dayKey(now);
              const outside = day.getMonth() !== cursor.getMonth();
              const past = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1) <= now;

              return (
                <div
                  key={key}
                  className={[
                    styles.day,
                    outside ? styles.outside : '',
                    past ? styles.past : '',
                    isToday ? styles.today : '',
                    verdict?.ok === true ? styles.ok : '',
                    verdict?.ok === false ? styles.no : ''
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onDragOver={(event) => {
                    if (!carriesQueueItem(event)) return;
                    // Without preventDefault the browser refuses the drop outright.
                    event.preventDefault();
                    setHovered(key);
                  }}
                  onDragLeave={() => setHovered((current) => (current === key ? null : current))}
                  onDrop={(event) => handleDrop(day, event)}
                >
                  <span className={`${styles.dayNumber} ${isToday ? styles.todayNumber : ''}`}>{day.getDate()}</span>
                  {(byDay.get(key) ?? []).map((item) => (
                    <Chip
                      key={item.id}
                      item={item}
                      onDragStart={setDragging}
                      onDragEnd={clearDrag}
                      onOpen={(id) => navigate(`/video/${id}`)}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        <aside
          className={styles.tray}
          onDragOver={(event) => {
            if (!carriesQueueItem(event)) return;
            event.preventDefault();
            setHovered('tray');
          }}
          onDragLeave={() => setHovered((current) => (current === 'tray' ? null : current))}
          onDrop={handleTrayDrop}
        >
          <div className={styles.trayTitle}>No time yet</div>
          <div className={styles.trayText}>
            Drag one onto a day to pick its time. Drop a scheduled video back here to take its time away.
          </div>
          <div className={`${styles.trayDrop} ${hovered === 'tray' ? styles.ok : ''}`}>
            {undated.length === 0 ? (
              <div className={styles.trayText}>Everything has a time.</div>
            ) : (
              undated.map((item) => (
                <Chip
                  key={item.id}
                  item={item}
                  onDragStart={setDragging}
                  onDragEnd={clearDrag}
                  onOpen={(id) => navigate(`/video/${id}`)}
                />
              ))
            )}
          </div>
          {dragging !== null && scheduleBlocker(dragging) !== null && (
            <div className={styles.trayText}>{scheduleBlocker(dragging)}</div>
          )}
        </aside>
      </div>
    </>
  );
}
