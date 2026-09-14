import React from 'react';
import { Mic } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Result } from '../../shared/ipc';
import { findModel, type ListeningStatus } from '../../shared/listening';
import type { HeardDTO } from '../../shared/transcript';
import { clipTime } from '../../shared/videoReading';
import { Banner, Button } from '../components/ui';
import { useApiMutation, useApiQuery } from '../hooks/useApi';
import styles from './HeardPanel.module.css';

const readStatus = (): Promise<Result<ListeningStatus>> => window.api.listeningStatus();

const WHERE: Record<HeardDTO['backend'], string> = { gpu: 'the graphics card', cpu: 'the processor', unknown: 'this computer' };

/** What was said in the clip. Quiet unless listening is switched on or something has already been heard. */
export function HeardPanel({ queueId, enabled }: { queueId: number; enabled: boolean }): React.JSX.Element | null {
  const heard = useApiQuery(() => window.api.videoHeard(queueId), { key: `heard-${queueId}`, invalidateOn: ['listening:changed'] });
  const status = useApiQuery(readStatus, { key: 'listening-status', invalidateOn: ['listening:changed'], enabled });
  const listen = useApiMutation(() => window.api.videoListen(queueId));

  const transcript = listen.data ?? heard.data;
  if (!enabled && transcript === null) return null;
  const notReady = status.data?.notReady ?? null;

  return (
    <section className={styles.panel} aria-label="What was said">
      <div className={styles.head}>
        <Mic size={16} />
        <span className={styles.title}>What was said</span>
        {transcript === null && (
          <Button size="small" disabled={listen.pending || status.data === null || notReady !== null} onClick={() => void listen.run()}>
            {listen.pending ? 'Listening…' : 'Listen to the video'}
          </Button>
        )}
      </div>

      {transcript === null && !listen.pending && (
        <div className={styles.status}>
          {notReady !== null ? (
            <>
              {notReady}. <Link to="/settings">Set up listening in Settings</Link>.
            </>
          ) : (
            'Drafting listens to it the first time it writes details. You can listen now instead.'
          )}
        </div>
      )}
      {listen.pending && <div className={styles.status}>Listening. Seconds on a graphics card, longer on the processor.</div>}
      {listen.error !== null && (
        <Banner kind="warning" title="Could not listen to it">
          {listen.error}
        </Banner>
      )}

      {transcript !== null &&
        (transcript.segments.length === 0 ? (
          <div className={styles.status}>Nothing was said in this clip.</div>
        ) : (
          <ol className={styles.lines}>
            {transcript.segments.map((segment) => (
              <li key={`${segment.from}-${segment.to}`} className={styles.line}>
                <span className={styles.time}>{clipTime(segment.from / 1000)}</span>
                <span className={styles.words}>{segment.text}</span>
              </li>
            ))}
          </ol>
        ))}
      {transcript !== null && (
        <div className={styles.status}>
          Heard with the {findModel(transcript.model)?.label ?? transcript.model} model, on {WHERE[transcript.backend]}. Speech
          models can mishear words.
        </div>
      )}
    </section>
  );
}
