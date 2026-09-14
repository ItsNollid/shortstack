// Setting or changing when a video publishes, on the video itself. Until now a time could only be given
// by dragging a video onto the Calendar, so reviewing one meant leaving it to change when it goes out.
// A video already on YouTube is the exception: its time is changed in Studio, and ShortStack follows.
import React, { useId, useMemo, useState } from 'react';
import type { QueueItemDTO } from '../../shared/dto';
import type { Result } from '../../shared/ipc';
import { formatRelativeTime } from '../../shared/presentation';
import { MIN_SCHEDULE_LEAD_MS } from '../../shared/queue';
import { fromLocalInput, nextFreeSlots, toLocalInput } from '../../shared/slotChoices';
import { useAppStatus } from '../app/status';
import { useApiMutation, useApiQuery } from '../hooks/useApi';
import { Button } from './ui';
import styles from './ScheduleEditor.module.css';

const readQueue = (): Promise<Result<QueueItemDTO[]>> => window.api.queueList();
/** Enough to choose between, few enough to take in at a glance. */
const SLOT_CHOICES = 3;

const slotLabel = (iso: string): string =>
  new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function ScheduleEditor({ item, label }: { item: QueueItemDTO; label?: string }): React.JSX.Element {
  const inputId = useId();
  const { settings } = useAppStatus();
  const [editing, setEditing] = useState(false);
  const [typed, setTyped] = useState('');
  const queue = useApiQuery(readQueue, { key: 'queue', invalidateOn: ['queue:changed'] });
  const schedule = useApiMutation((at: string) => window.api.queueSchedule(item.id, at), { onDone: () => setEditing(false) });
  const hold = useApiMutation(() => window.api.queueHold(item.id), { onDone: () => setEditing(false) });

  const lane = item.posting_kind === 'rotation' ? settings?.rotation_upload_times : settings?.upload_times;
  const choices = useMemo(() => {
    if (settings === null) return [];
    const taken = (queue.data ?? [])
      .filter((entry) => entry.id !== item.id && entry.state !== 'rejected' && entry.state !== 'published')
      .map((entry) => entry.scheduled_for)
      .filter((at): at is string => at !== null);
    return nextFreeSlots({ uploadTimes: lane ?? [], taken, now: new Date(), horizonDays: settings.auto_schedule_days, count: SLOT_CHOICES });
  }, [settings, lane, queue.data, item.id]);

  const when = item.scheduled_for;
  const current =
    when === null
      ? item.schedule_source === 'hold'
        ? 'Kept off the schedule'
        : 'No time yet'
      : `${slotLabel(when)} · ${formatRelativeTime(when)}`;

  const header = (
    <>
      {label !== undefined && <span className={styles.label}>{label}</span>}
      <div className={styles.row}>
        <span className={styles.current}>{current}</span>
        {editable(item) && !editing && (
          <Button
            size="small"
            onClick={() => {
              setTyped(when === null ? '' : toLocalInput(new Date(when)));
              setEditing(true);
            }}
          >
            {when === null ? 'Set a time' : 'Change'}
          </Button>
        )}
      </div>
    </>
  );

  const reason = whyFixed(item);
  if (reason !== null) {
    return (
      <section aria-label="Schedule" className={styles.schedule}>
        {header}
        <div className={styles.note}>{reason}</div>
      </section>
    );
  }

  const earliest = new Date(Date.now() + MIN_SCHEDULE_LEAD_MS);
  const typedAt = fromLocalInput(typed);
  const typedProblem =
    typed === ''
      ? null
      : typedAt === null
        ? 'That is not a date and time'
        : Date.parse(typedAt) < earliest.getTime()
          ? 'Pick a time at least 30 minutes from now'
          : null;
  const error = schedule.error ?? hold.error;

  return (
    <section aria-label="Schedule" className={styles.schedule}>
      {header}
      {editing && (
        <div className={styles.editor}>
          {choices.length > 0 && (
            <div className={styles.choices}>
              <span className={styles.label}>Next free times</span>
              <div className={styles.chips}>
                {choices.map((slot) => (
                  <Button
                    key={slot}
                    size="small"
                    aria-label={`Publish ${slotLabel(slot)}`}
                    disabled={schedule.pending}
                    onClick={() => void schedule.run(slot)}
                  >
                    {slotLabel(slot)}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <label className={styles.label} htmlFor={inputId}>
            Or pick a time
          </label>
          <div className={styles.row}>
            <input
              id={inputId}
              type="datetime-local"
              className={styles.input}
              value={typed}
              min={toLocalInput(earliest)}
              onChange={(event) => setTyped(event.target.value)}
            />
            <Button
              size="small"
              variant="primary"
              disabled={typedAt === null || typedProblem !== null || schedule.pending}
              onClick={() => {
                if (typedAt !== null) void schedule.run(typedAt);
              }}
            >
              Save time
            </Button>
            <Button size="small" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
          {typedProblem !== null && <div className={styles.problem}>{typedProblem}</div>}

          {when !== null && (
            <Button size="small" variant="ghost" disabled={hold.pending} onClick={() => void hold.run()}>
              Take off the schedule
            </Button>
          )}
          <div className={styles.note}>
            When it goes up, this is when it publishes. Taken off the schedule, it waits without a time until you give it one.
          </div>
        </div>
      )}
      {error !== null && <div className={styles.problem}>{error}</div>}
    </section>
  );
}

/** Why this video's time cannot be changed here, or null when it can. */
function whyFixed(item: QueueItemDTO): string | null {
  if (item.youtube_video_id !== null || item.remote_tombstone) {
    return 'It is on YouTube, so its time is changed in YouTube Studio. ShortStack follows what YouTube says.';
  }
  if (item.state === 'uploading') return 'It is uploading, so its time cannot change until the upload finishes.';
  if (item.state === 'published') return 'It has published.';
  if (item.state === 'rejected') return 'It is set aside. Restore it to give it a time.';
  if (item.privacy !== 'public') return 'Only public videos get a publish time. Unlisted and private ones go up without one.';
  return null;
}

const editable = (item: QueueItemDTO): boolean => whyFixed(item) === null;
