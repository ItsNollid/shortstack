import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import type { QueueItemDTO } from '../../shared/dto';
import { DEFAULT_CATEGORY_ID, VIDEO_CATEGORIES } from '../../shared/categories';
import { PRIVACY_OPTIONS, privacyHint } from '../../shared/privacyCopy';
import type { Privacy } from '../../shared/queue';
import type { BulkAction } from '../../shared/queueActions';
import {
  DESCRIPTION_MAX_BYTES,
  TAGS_MAX_CHARS,
  TITLE_MAX_CHARS,
  charCount,
  tagsCharCount,
  utf8Bytes
} from '../../shared/settings';
import { descriptionProblem, tagsProblem, titleProblem, type QueueMetadataPatch } from '../../shared/videoMetadata';
import { Banner, Button, Select, Switch, TagInput, TextArea, TextField } from '../components/ui';
import { DescriptionCheck } from '../components/DescriptionCheck';
import { GameField } from '../components/GameField';
import { ScreenCheck } from '../components/ScreenCheck';
import { useAppStatus } from '../app/status';
import { useApiMutation, useApiQuery } from '../hooks/useApi';
import { AiAssistPanel, type AiField } from './AiAssistPanel';
import { VideoReadingPanel } from './VideoReadingPanel';
import { AssistedUploadPanel } from './AssistedUploadPanel';
import styles from './VideoDetails.module.css';
import { VideoSidePanel } from './VideoSidePanel';
import { SourceField } from '../components/SourceField';
import { keepsAngle, type TitleAngle } from '../../shared/titleAngles';
import { HeardPanel } from './HeardPanel';
import { PlatformPostsPanel } from './PlatformPostsPanel';

interface Draft {
  title: string;
  description: string;
  tags: string[];
  category_id: string;
  privacy: Privacy;
  notify_subscribers: boolean;
  made_for_kids: boolean;
  title_angle: TitleAngle | null;
}

const draftOf = (item: QueueItemDTO): Draft => ({
  title: item.title,
  description: item.description,
  tags: item.tags,
  category_id: item.category_id === '' ? DEFAULT_CATEGORY_ID : item.category_id,
  privacy: item.privacy,
  notify_subscribers: item.notify_subscribers,
  made_for_kids: item.made_for_kids,
  title_angle: item.title_angle
});

const sameDraft = (a: Draft, b: Draft): boolean =>
  a.title === b.title &&
  a.description === b.description &&
  a.category_id === b.category_id &&
  a.privacy === b.privacy &&
  a.notify_subscribers === b.notify_subscribers &&
  a.made_for_kids === b.made_for_kids &&
  a.title_angle === b.title_angle &&
  a.tags.length === b.tags.length &&
  a.tags.every((tag, index) => tag === b.tags[index]);

export function VideoDetails({ onApprove }: { onApprove: (item: QueueItemDTO) => void }): React.JSX.Element {
  const { settings } = useAppStatus();
  const { id = '' } = useParams();
  const queueId = Number(id);
  const item = useApiQuery(() => window.api.queueGet(queueId), {
    key: `video:${queueId}`,
    invalidateOn: ['queue:changed'],
    enabled: Number.isFinite(queueId)
  });

  const loaded = item.data;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [baseline, setBaseline] = useState<QueueItemDTO | null>(null);
  // The offer a kind of title was taken from, for the video it was taken on.
  const [angleTitle, setAngleTitle] = useState<{ id: number; title: string } | null>(null);

  // Adopt fresh server data only while there is nothing unsaved to lose; otherwise say so and let
  // the user decide, rather than silently overwriting what they typed.
  useEffect(() => {
    if (loaded === null) return;
    setDraft((current) => {
      if (current === null || baseline === null || baseline.id !== loaded.id) {
        setBaseline(loaded);
        return draftOf(loaded);
      }
      if (sameDraft(current, draftOf(baseline))) {
        setBaseline(loaded);
        return draftOf(loaded);
      }
      return current;
    });
  }, [loaded, baseline]);

  const save = useApiMutation((patch: QueueMetadataPatch, expected: string) =>
    window.api.queueUpdateMetadata(queueId, patch, expected)
  );
  const act = useApiMutation((action: BulkAction, ids: number[]) => {
    if (action === 'unapprove') return window.api.queueUnapprove(ids);
    if (action === 'reject') return window.api.queueReject(ids);
    return window.api.queueRestore(ids);
  });

  const problems = useMemo(() => {
    if (draft === null) return { title: null, description: null, tags: null };
    return {
      title: titleProblem(draft.title),
      description: descriptionProblem(draft.description),
      tags: tagsProblem(draft.tags)
    };
  }, [draft]);

  if (!Number.isFinite(queueId)) return <Banner kind="danger" title="Unknown video" />;
  if (item.error !== null)
    return (
      <Banner kind="danger" title="Could not open this video">
        {item.error}
      </Banner>
    );
  if (loaded === null || draft === null || baseline === null) return <Banner kind="info" title="Loading…" />;

  const dirty = !sameDraft(draft, draftOf(baseline));
  const changedElsewhere = loaded.updated_at !== baseline.updated_at;
  const blocked = loaded.state === 'uploading';
  const invalid = problems.title !== null || problems.description !== null || problems.tags !== null;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void => setDraft({ ...draft, [key]: value });
  // The title the recorded kind belongs to: the offer that was taken here, or else the saved title.
  const angleSource = angleTitle !== null && angleTitle.id === loaded.id ? angleTitle.title : baseline.title;
  // Typing keeps the kind only while the title is still recognisably that one.
  const angleAfterTyping = (value: string): TitleAngle | null =>
    draft.title_angle !== null && keepsAngle(angleSource, value) ? draft.title_angle : null;
  const acceptSuggestion = (field: AiField, value: string | string[], angle?: TitleAngle): void => {
    if (field === 'tags' && Array.isArray(value)) set('tags', value);
    else if (field === 'title' && typeof value === 'string') {
      // A title taken from the offers carries its kind, and later typing is measured against it.
      setAngleTitle({ id: loaded.id, title: value });
      setDraft({ ...draft, title: value, title_angle: angle ?? null });
    } else if (field !== 'tags' && typeof value === 'string') set(field, value);
  };

  const assisted =
    settings?.upload_method === 'assisted' &&
    (loaded.state === 'approved' || loaded.state === 'awaiting_manual_upload');

  const submit = (): void => {
    void save.run(draft, baseline.updated_at).then((updated) => {
      if (updated !== null) {
        setBaseline(updated);
        setDraft(draftOf(updated));
      }
    });
  };

  return (
    <>
      <Link to="/queue" className={styles.back}>
        <ArrowLeft size={15} /> Queue
      </Link>

      <div className={styles.columns}>
        <div className={styles.form}>
          {blocked && (
            <Banner kind="info" title="Uploading right now">
              Details are locked until the upload finishes, so the file and its information stay in step.
            </Banner>
          )}
          {changedElsewhere && (
            <Banner kind="warning" title="This video changed elsewhere">
              Saving will overwrite the newer version. Discard your edits to see it instead.
            </Banner>
          )}
          {save.error !== null && (
            <Banner kind="danger" title="Not saved">
              {save.error}
            </Banner>
          )}
          {act.error !== null && (
            <Banner kind="danger" title="That did not work">
              {act.error}
            </Banner>
          )}

          {assisted && <AssistedUploadPanel item={loaded} />}

          <PlatformPostsPanel item={loaded} />

          <AiAssistPanel
            queueId={loaded.id}
            current={{ title: draft.title, description: draft.description, tags: draft.tags }}
            onAccept={acceptSuggestion}
            disabled={blocked}
          />

          <VideoReadingPanel key={`reading-${loaded.id}`} queueId={loaded.id} />
          <HeardPanel key={`heard-${loaded.id}`} queueId={loaded.id} enabled={settings?.listen_enabled === true} />

          <TextField
            label="Title"
            value={draft.title}
            onChange={(value) => setDraft({ ...draft, title: value, title_angle: angleAfterTyping(value) })}
            disabled={blocked}
            counter={`${charCount(draft.title)} / ${TITLE_MAX_CHARS}`}
            counterOver={charCount(draft.title) > TITLE_MAX_CHARS}
            problem={problems.title}
          />
          <ScreenCheck queueId={loaded.id} title={draft.title} />

          <DescriptionCheck
            key={loaded.id}
            text={draft.description}
            onChange={(value) => set('description', value)}
            game={loaded.game}
            disabled={blocked}
          >
            <TextArea
              label="Description"
              value={draft.description}
              onChange={(value) => set('description', value)}
              disabled={blocked}
              optional
              rows={8}
              spellCheck={false}
              counter={`${utf8Bytes(draft.description)} / ${DESCRIPTION_MAX_BYTES} bytes`}
              counterOver={utf8Bytes(draft.description) > DESCRIPTION_MAX_BYTES}
              problem={problems.description}
              hint="YouTube measures descriptions in bytes, so emoji and accents count for more than one."
            />
          </DescriptionCheck>

          <GameField queueId={loaded.id} value={loaded.game} />
          <SourceField queueId={loaded.id} title={loaded.source_title} url={loaded.source_url} />

          <TagInput
            label="Tags"
            value={draft.tags}
            onChange={(tags) => set('tags', tags)}
            disabled={blocked}
            counter={`${tagsCharCount(draft.tags)} / ${TAGS_MAX_CHARS}`}
            counterOver={tagsCharCount(draft.tags) > TAGS_MAX_CHARS}
            problem={problems.tags}
          />

          <div className={styles.pair}>
            <Select
              label="Visibility"
              value={draft.privacy}
              onChange={(value) => set('privacy', value)}
              disabled={blocked}
              options={PRIVACY_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
              hint={privacyHint(draft.privacy)}
            />
            <Select
              label="Category"
              value={draft.category_id}
              onChange={(value) => set('category_id', value)}
              disabled={blocked}
              options={VIDEO_CATEGORIES.map((category) => ({ value: category.id, label: category.label }))}
            />
          </div>

          <Switch
            label="Tell subscribers"
            hint="Sends the usual notification when the video goes live."
            checked={draft.notify_subscribers}
            onChange={(value) => set('notify_subscribers', value)}
            disabled={blocked}
          />
          <Switch
            label="Made for kids"
            hint="YouTube turns off comments and some features on videos marked for kids."
            checked={draft.made_for_kids}
            onChange={(value) => set('made_for_kids', value)}
            disabled={blocked}
          />

          {dirty && (
            <div className={styles.saveBar}>
              <span className={styles.saveText}>
                {invalid ? 'Fix the highlighted fields to save.' : 'You have unsaved changes.'}
              </span>
              <Button
                variant="ghost"
                onClick={() => {
                  setBaseline(loaded);
                  setDraft(draftOf(loaded));
                  setAngleTitle(null);
                }}
              >
                Discard
              </Button>
              <Button variant="primary" disabled={invalid || save.pending} onClick={submit}>
                {save.pending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          )}
        </div>

        <VideoSidePanel
          item={loaded}
          busy={act.pending || save.pending}
          onAction={(action) => {
            if (action === 'approve') onApprove(loaded);
            else void act.run(action, [loaded.id]);
          }}
        />
      </div>
    </>
  );
}
