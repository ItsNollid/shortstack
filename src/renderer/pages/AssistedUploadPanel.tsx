import React, { useState } from 'react';
import { ExternalLink, FolderOpen } from 'lucide-react';
import type { QueueItemDTO } from '../../shared/dto';
import { PRIVACY_OPTIONS } from '../../shared/privacyCopy';
import { parseVideoId } from '../../shared/youtubeUrl';
import { Banner, Button, CopyField, TextField } from '../components/ui';
import { useApiMutation } from '../hooks/useApi';
import { stillUrl, useVideoReport } from '../hooks/useVideoReport';
import { clipTime } from '../../shared/videoReading';
import styles from './AssistedUploadPanel.module.css';

function Step({ title, text, children }: { title: string; text?: string; children?: React.ReactNode }): React.JSX.Element {
  return (
    <div className={styles.step}>
      <span className={styles.number} />
      <div className={styles.stepBody}>
        <div className={styles.stepTitle}>{title}</div>
        {text !== undefined && <div className={styles.stepText}>{text}</div>}
        {children}
      </div>
    </div>
  );
}

/** Assisted mode: ShortStack does everything except the upload itself, which the user performs in
 *  YouTube Studio. Until their Cloud project passes YouTube's API audit, an upload made through
 *  the API would be locked private for good, so this is the path that actually works. */
export function AssistedUploadPanel({ item }: { item: QueueItemDTO }): React.JSX.Element {
  const [pasted, setPasted] = useState('');
  const link = useApiMutation((urlOrId: string) => window.api.queueLinkVideo(item.id, urlOrId), {
    onDone: () => setPasted('')
  });

  const cover = useVideoReport(item.id).data?.cover ?? null;
  const privacyLabel = PRIVACY_OPTIONS.find((option) => option.value === item.privacy)?.label ?? item.privacy;
  const when = item.scheduled_for === null ? null : new Date(item.scheduled_for);
  const parsedId = parseVideoId(pasted);
  const pasteProblem = pasted.trim() !== '' && parsedId === null ? 'That is not a YouTube video link or id' : null;

  return (
    <section className={styles.panel}>
      <div className={styles.head}>
        <h2 className={styles.title}>Upload it in YouTube Studio</h2>
      </div>

      <div className={styles.steps}>
        <Step title="Find the file" text={item.filename}>
          <div className={styles.stepActions}>
            <Button size="small" icon={<FolderOpen size={14} />} onClick={() => void window.api.revealFile(item.id)}>
              Show in folder
            </Button>
          </div>
        </Step>

        <Step title="Open the upload page" text="Studio opens in your browser. Drag the file in, or pick it there.">
          <div className={styles.stepActions}>
            <Button size="small" icon={<ExternalLink size={14} />} onClick={() => void window.api.openStudioUpload()}>
              Open YouTube Studio
            </Button>
          </div>
        </Step>

        <Step title="Paste the details">
          <CopyField label="Title" value={item.title} />
          <CopyField label="Description" value={item.description} emptyText="No description" />
          <CopyField label="Tags" value={item.tags.join(', ')} emptyText="No tags" />
        </Step>

        {cover !== null && (
          <Step
            title="Choose the cover"
            text={`Where YouTube lets you pick a frame for the Short's thumbnail, choose the moment at ${clipTime(cover.time) ?? 'the one shown here'}${cover.what === '' ? '' : ` — ${cover.what}`}. The local model picked it from the stills.`}
          >
            <img className={styles.cover} src={stillUrl(item.id, cover.part)} alt="The suggested cover frame" />
          </Step>
        )}

        {item.source_url !== null && (
          <Step
            title="Link the long video"
            text="Where Studio offers a related video for this Short, choose the long video it was cut from, so viewers can go from the clip to the whole thing."
          >
            <CopyField label={item.source_title ?? 'Long video'} value={item.source_url} />
          </Step>
        )}

        <Step title="Set visibility and timing">
          <div className={styles.setting}>
            <span className={styles.settingLabel}>Visibility</span>
            <span className={styles.settingValue}>{privacyLabel}</span>
          </div>
          {item.privacy !== 'public' ? (
            <div className={styles.stepText}>
              Unlisted and private videos are not scheduled, so publish it straight away.
            </div>
          ) : when === null ? (
            <div className={styles.stepText}>
              No time yet. ShortStack fills in the next free slot from your daily schedule, usually within a
              minute of approval — or pick one on the Calendar.
            </div>
          ) : (
            <>
              <div className={styles.setting}>
                <span className={styles.settingLabel}>Schedule</span>
                <span className={styles.settingValue}>{when.toLocaleString()}</span>
              </div>
              <CopyField label="Time to enter in Studio" value={when.toLocaleString()} />
            </>
          )}
        </Step>

        <Step
          title="Let ShortStack know"
          text="ShortStack looks at your channel every two minutes once this video is due within two hours, and every ten minutes before that, and links it by its file name and size. Paste the link here to link it straight away."
        >
          {link.error !== null && (
            <Banner kind="danger" title="Could not link that video">
              {link.error}
            </Banner>
          )}
          <div className={styles.link}>
            <div className={styles.linkInput}>
              <TextField
                label="Video link or id"
                value={pasted}
                onChange={setPasted}
                placeholder="https://youtube.com/shorts/…"
                problem={pasteProblem}
              />
            </div>
            <Button
              disabled={parsedId === null || link.pending}
              onClick={() => void link.run(pasted)}
              style={{ marginTop: 26 }}
            >
              {link.pending ? 'Linking…' : 'Link it'}
            </Button>
          </div>
        </Step>
      </div>
    </section>
  );
}
