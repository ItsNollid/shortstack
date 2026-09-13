import React from 'react';
import { describeMood } from '../../../shared/quota';
import type { QuotaView, Result } from '../../../shared/ipc';
import { useApiQuery } from '../../hooks/useApi';
import type { SettingsWriter } from './useSettings';
import { CommittedText, Section } from './parts';
import styles from './QuotaSection.module.css';

const readQuota = (): Promise<Result<QuotaView>> => window.api.quotaGet();

/** "7 hours" rather than a timestamp: the question is how long, not when. */
function untilReset(iso: string, now: Date = new Date()): string {
  const hours = Math.max(0, Math.round((Date.parse(iso) - now.getTime()) / 3_600_000));
  if (hours <= 1) return 'within the hour';
  return `in about ${hours} hours`;
}

const METHOD_WORDS: Record<string, string> = {
  'videos.insert': 'Uploads',
  'videos.update': 'Schedule and detail changes',
  'thumbnails.set': 'Thumbnails',
  'search.list': 'Searches',
  'videos.list': 'Checking videos',
  'channels.list': 'Reading the channel',
  'playlistItems.list': 'Reading your uploads'
};

/**
 * How much of the day's allowance is gone, in the terms that matter. Units mean nothing on their
 * own; "1,700 left" only becomes useful once it says "one more upload".
 *
 * Honest about its limits in the text itself: this is what ShortStack has spent, counted call by
 * call. YouTube offers no way to ask for the real figure, and anything else using the same Cloud
 * project is invisible from here.
 */
export function QuotaSection({ writer }: { writer: SettingsWriter }): React.JSX.Element {
  const quota = useApiQuery(readQuota, { key: 'quota', invalidateOn: ['queue:changed', 'scheduler:status'] });
  const { settings } = writer;
  const view = quota.data;

  return (
    <Section
      title="Today's YouTube allowance"
      text="Every call to YouTube costs units from a daily allowance that resets at midnight Pacific time. An upload is 1,600 of them, so on the default allowance six uploads is a full day."
    >
      {view === null ? (
        <div className={styles.muted}>{quota.error ?? 'Counting…'}</div>
      ) : (
        <>
          {!view.counting && (
            <div className={styles.muted}>
              This is a test build that never calls YouTube, so there is nothing to count. The meter works in the real
              build.
            </div>
          )}

          <div className={styles.head}>
            <span className={`${styles.mood} ${styles[view.mood]}`}>{describeMood(view.mood)}</span>
            <span className={styles.numbers}>
              {view.used.toLocaleString()} of {view.limit.toLocaleString()} used · resets {untilReset(view.resetsAt)}
            </span>
          </div>

          <div
            className={styles.track}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={view.limit}
            aria-valuenow={view.used}
            aria-label="YouTube allowance used today"
          >
            <span className={`${styles.fill} ${styles[view.mood]}`} style={{ width: `${view.percentUsed}%` }} />
          </div>

          <div className={styles.block}>
            <div className={styles.label}>{view.remaining.toLocaleString()} units left will still cover</div>
            {view.affordable.length === 0 ? (
              <div className={styles.muted}>Nothing until it resets. Anything that needs YouTube will wait and try again.</div>
            ) : (
              <ul className={styles.list}>
                {view.affordable.map((entry) => (
                  <li key={entry.what}>
                    <strong>{entry.count.toLocaleString()}</strong> {entry.what}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {view.breakdown.length > 0 && (
            <div className={styles.block}>
              <div className={styles.label}>Where today's went</div>
              <ul className={styles.list}>
                {view.breakdown.map((entry) => (
                  <li key={entry.method}>
                    {METHOD_WORDS[entry.method] ?? entry.method}: <strong>{entry.units.toLocaleString()}</strong> units across{' '}
                    {entry.calls} call{entry.calls === 1 ? '' : 's'}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className={styles.block}>
            <div className={styles.label}>Worth knowing</div>
            <ul className={styles.list}>
              <li>
                Uploading through YouTube Studio yourself costs ShortStack nothing. Assisted mode only reads, so it barely
                touches this.
              </li>
              <li>
                This counts what ShortStack spent. Anything else using the same Google Cloud project is invisible from
                here — the real figure is on the Quotas page in the Cloud console.
              </li>
              <li>If you run out, nothing breaks: uploads and schedule changes wait for the reset and carry on.</li>
            </ul>
          </div>
        </>
      )}

      {settings !== null && (
        <CommittedText
          label="Daily allowance"
          value={String(settings.quota_daily_units)}
          onCommit={(value) => writer.set('quota_daily_units', Number(value))}
          problem={writer.problemFor('quota_daily_units')}
          hint="10,000 is what a new project gets. If Google raised yours, put the real number here so the meter measures against it."
        />
      )}
    </Section>
  );
}
