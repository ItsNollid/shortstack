import React from 'react';
import { Eye } from 'lucide-react';
import type { AiStatus, Result } from '../../shared/ipc';
import { SCENE_LABELS, SCENE_NOUNS } from '../../shared/sceneCopy';
import { COVER_SCENES, clipTime, type StillReading, type VideoReport } from '../../shared/videoReading';
import { Banner, Button } from '../components/ui';
import { useApiMutation, useApiQuery } from '../hooks/useApi';
import { stillUrl, useVideoReport } from '../hooks/useVideoReport';
import styles from './VideoReadingPanel.module.css';

const readAi = (): Promise<Result<AiStatus>> => window.api.aiStatus();

const byTime = (a: StillReading, b: StillReading): number => (a.time ?? Number.MAX_VALUE) - (b.time ?? Number.MAX_VALUE);

/**
 * The model's part is describing single stills; the cover and the verdict on the opening are ShortStack's,
 * drawn from those descriptions. Nothing here changes the video.
 */
export function VideoReadingPanel({ queueId }: { queueId: number }): React.JSX.Element {
  const ai = useApiQuery(readAi, { key: 'ai' });
  const stored = useVideoReport(queueId);
  const look = useApiMutation(() => window.api.videoLook(queueId));

  const running = ai.data?.running === true && ai.data.models.length > 0;
  const canSee = ai.data?.models.some((model) => model.vision) === true;
  const report = look.data ?? stored.data;

  const idle = !running
    ? `${ai.data === null ? 'Checking for a local model…' : ai.data.message}. Looking is optional; everything works without it.`
    : !canSee
      ? 'Looking at a video needs a model that can see images, such as qwen3-vl:8b.'
      : 'The model describes each still from the video in turn, usually a second or two each. ShortStack then picks a cover frame, checks whether anything happens in the first second, and whether the title promises play the clip does not show.';

  return (
    <section className={styles.panel} aria-label="What the model sees">
      <div className={styles.head}>
        <Eye size={16} />
        <span className={styles.title}>What the model sees</span>
        <Button size="small" disabled={!running || !canSee || look.pending} onClick={() => void look.run()}>
          {look.pending ? 'Looking…' : report === null ? 'Look at the video' : 'Look again'}
        </Button>
      </div>

      {look.pending ? (
        <div className={styles.status}>
          Looking at each still in turn. Slower when a game or another app is using the graphics card.
        </div>
      ) : (
        report === null && <div className={styles.status}>{idle}</div>
      )}

      {look.error !== null && (
        <Banner kind="warning" title="Could not look at the video">
          {look.error}
        </Banner>
      )}

      {report !== null && <Findings queueId={queueId} report={report} />}
    </section>
  );
}

function Findings({ queueId, report }: { queueId: number; report: VideoReport }): React.JSX.Element {
  const { cover, hook } = report;

  return (
    <>
      {hook?.weak === true && (
        <Banner kind="warning" title="Nothing happens in the first second">
          It opens on {SCENE_NOUNS[hook.scene]}
          {hook.what === '' ? '' : ` (${hook.what})`}. People decide whether to keep watching in about that long, so
          consider starting it where the action starts.
        </Banner>
      )}

      <div className={styles.findings}>
        {cover !== null && (
          <div className={styles.finding}>
            <img className={styles.cover} src={stillUrl(queueId, cover.part)} alt="The suggested cover frame" />
            <div className={styles.body}>
              <div className={styles.label}>Cover</div>
              <div className={styles.text}>
                The frame at {clipTime(cover.time) ?? 'an unknown moment'}
                {cover.what === '' ? '' : ` — ${cover.what}`}
              </div>
              <div className={styles.hint}>
                {COVER_SCENES.has(cover.scene)
                  ? 'The most eye-catching still of play or reaction.'
                  : `No still shows play, so this is the best of the rest: ${SCENE_NOUNS[cover.scene]}.`}
              </div>
            </div>
          </div>
        )}

        {hook !== null && !hook.weak && (
          <div className={styles.finding}>
            <div className={styles.body}>
              <div className={styles.label}>First second</div>
              <div className={styles.text}>{hook.what === '' ? SCENE_LABELS[hook.scene] : hook.what}</div>
            </div>
          </div>
        )}
      </div>

      <div className={styles.stills}>
        {[...report.stills].sort(byTime).map((still) => (
          <figure key={still.part} className={styles.still} title={still.what}>
            <img src={stillUrl(queueId, still.part)} alt={still.what === '' ? SCENE_LABELS[still.scene] : still.what} />
            <figcaption>
              {clipTime(still.time) ?? '–'} · {SCENE_LABELS[still.scene]}
            </figcaption>
          </figure>
        ))}
      </div>

      <div className={styles.hint}>
        Looked at {new Date(report.readAt).toLocaleString()} with {report.model}.
      </div>
    </>
  );
}
