import React, { useEffect, useState } from 'react';
import type { FillPlan } from '../../../shared/fillSchedule';
import type { Result } from '../../../shared/ipc';
import { Banner, Button, Dialog } from '../../components/ui';
import { useApiMutation, useApiQuery } from '../../hooks/useApi';
import styles from './Calendar.module.css';

export interface FillDialogProps {
  open: boolean;
  onCancel: () => void;
  onFilled: (result: { filled: Array<{ id: number; at: string }>; refused: number }) => void;
}

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;
const dayLabel = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
const timeLabel = (iso: string): string =>
  new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  });

/** Shows every time a fill would give before anything is written. Filling gives times; it never approves or uploads. */
export function FillDialog({ open, onCancel, onFilled }: FillDialogProps): React.JSX.Element {
  // Unset until the first preview: then videos waiting for approval are included only when nothing else would be filled.
  const [include, setInclude] = useState<boolean | null>(null);
  useEffect(() => {
    if (!open) setInclude(null);
  }, [open]);

  const preview = useApiQuery((): Promise<Result<FillPlan>> => window.api.queueFillPreview(include ?? false), {
    key: `fill-preview-${String(open)}-${String(include)}`,
    enabled: open,
    invalidateOn: ['queue:changed']
  });
  const fill = useApiMutation((includeUnapproved: boolean) => window.api.queueFill(includeUnapproved));

  const plan = preview.data;
  useEffect(() => {
    if (include === null && plan !== null) setInclude(plan.assignments.length === 0 && plan.awaitingApproval > 0);
  }, [include, plan]);

  const ready = plan !== null && include !== null && !preview.fetching;
  const count = ready ? plan.assignments.length : 0;

  const days: Array<{ label: string; entries: FillPlan['assignments'] }> = [];
  for (const entry of ready ? plan.assignments : []) {
    const label = dayLabel(entry.at);
    const last = days[days.length - 1];
    if (last !== undefined && last.label === label) last.entries.push(entry);
    else days.push({ label, entries: [entry] });
  }

  return (
    <Dialog
      open={open}
      title="Fill the calendar"
      onClose={onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!ready || count === 0 || fill.pending}
            onClick={() =>
              void fill.run(include === true).then((result) => {
                if (result !== null) onFilled(result);
              })
            }
          >
            {fill.pending ? 'Filling…' : count === 0 ? 'Nothing to fill' : `Give ${plural(count, 'time')}`}
          </Button>
        </>
      }
    >
      <div className={styles.fillText}>
        Every video without a time gets the next free one from your daily times, new videos before re-runs, the same way ShortStack fills
        approved videos on its own. Nothing is approved or uploaded by this, and any time can be dragged somewhere else afterwards.
      </div>

      {(preview.error ?? fill.error) !== null && (
        <Banner kind="danger" title="Could not fill the calendar">
          {preview.error ?? fill.error}
        </Banner>
      )}

      {plan !== null && plan.awaitingApproval > 0 && (
        <label className={styles.fillOption}>
          <input type="checkbox" checked={include === true} onChange={(event) => setInclude(event.target.checked)} />
          <span>
            Also give times to the {plural(plan.awaitingApproval, 'video')} still waiting for approval
            <span className={styles.fillHint}>Approving them stays up to you. Nothing goes out until you do.</span>
          </span>
        </label>
      )}

      {!ready ? (
        <div className={styles.fillText}>Working out the times…</div>
      ) : count === 0 ? (
        <div className={styles.fillText}>
          {plan.leftOver > 0
            ? 'There is no free time left in the days ShortStack books ahead.'
            : 'Every video that can have a time already has one.'}
        </div>
      ) : (
        <>
          <div className={styles.fillSummary}>
            {count === 1
              ? `1 video gets a time, on ${days[0]?.label}.`
              : `${plural(count, 'video')} get times, from ${days[0]?.label} to ${days[days.length - 1]?.label}.`}
          </div>
          <div className={styles.fillList} role="list" aria-label="Times to give">
            {days.map((day) => (
              <div key={day.label} className={styles.fillDayGroup}>
                <div className={styles.fillDay}>{day.label}</div>
                {day.entries.map((entry) => (
                  <div key={entry.id} className={styles.fillRow} role="listitem">
                    <span className={styles.fillTime}>{timeLabel(entry.at)}</span>
                    <span className={styles.fillTitle} title={entry.title}>
                      {entry.title}
                    </span>
                    {entry.awaitingApproval && <span className={styles.fillTag}>Needs approval</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      {ready && plan.leftOver > 0 && (
        <div className={styles.fillHint}>
          {plural(plan.leftOver, 'more video')} {plan.leftOver === 1 ? 'does' : 'do'} not fit in the next {plural(plan.horizonDays, 'day')}.
          ShortStack books that far ahead; change it in Settings, under Daily schedule.
        </div>
      )}
      {ready && plan.keptOff > 0 && (
        <div className={styles.fillHint}>
          {plural(plan.keptOff, 'video')} you took off the schedule {plan.keptOff === 1 ? 'stays' : 'stay'} off.
        </div>
      )}
    </Dialog>
  );
}
