import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, CircleSlash, FolderOpen, History, Repeat, RotateCw, X } from 'lucide-react';
import type { QueueItemDTO } from '../../../shared/dto';
import type { Result } from '../../../shared/ipc';
import { VIDEO_CATEGORIES } from '../../../shared/categories';
import { PRIVACY_OPTIONS, privacyHint } from '../../../shared/privacyCopy';
import type { Privacy } from '../../../shared/queue';
import { formatDuration, formatFileSize, formatRelativeTime, shortsWarning } from '../../../shared/presentation';
import { needsReview, positionAfterChange, progress, step } from '../../../shared/review';
import {
  DESCRIPTION_MAX_BYTES,
  TAGS_MAX_CHARS,
  TITLE_MAX_CHARS,
  charCount,
  tagsCharCount,
  utf8Bytes
} from '../../../shared/settings';
import { nextFreeSlot } from '../../../shared/slots';
import { PastUploadPicker } from '../../components/PastUploadPicker';
import { VideoPreview } from '../../components/VideoPreview';
import { Banner, Button, EmptyState, Select, StatusPill, Switch, TagInput, TextArea, TextField } from '../../components/ui';
import { DescriptionCheck } from '../../components/DescriptionCheck';
import { GameField } from '../../components/GameField';
import { ScreenCheck } from '../../components/ScreenCheck';
import { useRequestApproval } from '../../app/approval';
import { useAppStatus } from '../../app/status';
import { useToast } from '../../app/toast';
import { useApiMutation, useApiQuery } from '../../hooks/useApi';
import styles from './Review.module.css';
import { SourceField } from '../../components/SourceField';
import { ScheduleEditor } from '../../components/ScheduleEditor';
import type { TitleAngle } from '../../../shared/titleAngles';
import { AiAssistPanel, type AiField } from '../AiAssistPanel';
import { VideoReadingPanel } from '../VideoReadingPanel';
import { HeardPanel } from '../HeardPanel';
import { PlatformChoice } from '../../components/PlatformChoice';

const readQueue = (): Promise<Result<QueueItemDTO[]>> => window.api.queueList();

interface Draft {
  title: string;
  description: string;
  tags: string[];
  privacy: Privacy;
  category_id: string;
  notify_subscribers: boolean;
  made_for_kids: boolean;
  title_angle: TitleAngle | null;
}

const draftOf = (item: QueueItemDTO): Draft => ({
  title: item.title,
  description: item.description,
  tags: item.tags,
  privacy: item.privacy,
  category_id: item.category_id === '' ? '22' : item.category_id,
  notify_subscribers: item.notify_subscribers,
  made_for_kids: item.made_for_kids,
  title_angle: item.title_angle
});

export function Review(): React.JSX.Element {
  const toast = useToast();
  const requestApproval = useRequestApproval();
  const { settings } = useAppStatus();
  const queue = useApiQuery(readQueue, { key: 'queue', invalidateOn: ['queue:changed'] });
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [pickingPast, setPickingPast] = useState(false);
  const startedWith = useRef<number | null>(null);

  const pending = useMemo(() => (queue.data ?? []).filter((item) => needsReview(item.state)), [queue.data]);
  if (startedWith.current === null && queue.data !== null) startedWith.current = pending.length;

  useEffect(() => {
    setIndex((current) => positionAfterChange(current, pending.length));
  }, [pending.length]);

  const item = pending[index] ?? null;

  // Editing follows the card: moving to another video loads its details, not the last one's.
  useEffect(() => {
    setDraft(item === null ? null : draftOf(item));
  }, [item?.id, item?.updated_at]);

  const save = useApiMutation((id: number, patch: Partial<Draft>, expected: string) =>
    window.api.queueUpdateMetadata(id, patch, expected)
  );
  const reject = useApiMutation((ids: number[]) => window.api.queueReject(ids));
  const markReupload = useApiMutation((ids: number[], published: boolean) =>
    window.api.rotationMarkPublishedBefore(ids, published)
  );
  const setRotation = useApiMutation((ids: number[], paused: boolean) => window.api.rotationSetPaused(ids, paused));

  const move = (delta: number): void => setIndex((current) => step(current, delta, pending.length));

  /** Writes a field when it is finished with, rather than on every keystroke. */
  const commit = (patch: Partial<Draft>): void => {
    if (item === null) return;
    const unchanged = Object.entries(patch).every(([key, value]) =>
      Array.isArray(value) ? JSON.stringify(value) === JSON.stringify(item[key as keyof QueueItemDTO]) : value === item[key as keyof QueueItemDTO]
    );
    if (unchanged) return;
    void save.run(item.id, patch, item.updated_at).then((done) => {
      if (done !== null) setJustSaved(true);
    });
  };

  /** A suggestion taken here is saved at once, like every other field on this screen. */
  const acceptSuggestion = (field: AiField, value: string | string[], angle?: TitleAngle): void => {
    if (draft === null) return;
    if (field === 'tags' && Array.isArray(value)) {
      setDraft({ ...draft, tags: value });
      commit({ tags: value });
    } else if (field === 'title' && typeof value === 'string') {
      setDraft({ ...draft, title: value, title_angle: angle ?? null });
      commit({ title: value, title_angle: angle ?? null });
    } else if (field === 'description' && typeof value === 'string') {
      setDraft({ ...draft, description: value });
      commit({ description: value });
    }
  };

  useEffect(() => {
    if (!justSaved) return;
    const timer = window.setTimeout(() => setJustSaved(false), 2000);
    return () => window.clearTimeout(timer);
  }, [justSaved]);

  const outOfRotation = item?.rotation_paused === true;
  const isReupload = item?.published_before === true;

  const actions = [
    { key: 'a', run: () => item !== null && requestApproval([item]) },
    {
      key: 'r',
      run: () => {
        if (item === null) return;
        void reject.run([item.id]).then((done) => {
          if (done !== null) toast({ text: `${item.title} set aside — restore it any time from the Queue` });
        });
      }
    },
    {
      key: 'u',
      run: () => {
        if (item === null) return;
        void markReupload.run([item.id], !isReupload).then((done) => {
          if (done !== null) {
            toast({
              text: isReupload
                ? `${item.title} counts as new again`
                : `${item.title} marked as already posted — it will not notify subscribers`
            });
          }
        });
      }
    },
    {
      key: 'o',
      run: () => {
        if (item === null) return;
        void setRotation.run([item.id], !outOfRotation).then((done) => {
          if (done !== null) {
            toast({ text: outOfRotation ? `${item.title} will be re-run again` : `${item.title} will not be re-run` });
          }
        });
      }
    },
    { key: 'f', run: () => item !== null && void window.api.revealFile(item.id) }
  ];

  // Keyboard first: this screen exists to get through hundreds of videos, and reaching for the
  // mouse each time is what makes that slow. Typing in a field never triggers a shortcut.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target !== null && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      // Nor while a dialog is open. A native modal dialog traps focus but not key events, which still
      // reach this listener — so with the approval dialog or the past-uploads picker open and a button
      // inside it focused, "r" rejected the video behind the dialog and the arrows moved it away.
      if (document.querySelector('dialog[open]') !== null) return;
      if (event.metaKey || event.ctrlKey || event.altKey || item === null) return;

      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        move(event.key === 'ArrowRight' ? 1 : -1);
        return;
      }
      const action = actions.find((entry) => entry.key === event.key.toLowerCase());
      if (action !== undefined) {
        event.preventDefault();
        action.run();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const total = startedWith.current ?? 0;
  const counted = progress(index, pending.length, total);
  const problem = queue.error ?? save.error ?? reject.error ?? markReupload.error ?? setRotation.error;

  if (item === null || draft === null) {
    return (
      <EmptyState icon={<Check size={24} />} title="Nothing waiting">
        Every video has had a decision. Anything new from your folder turns up here.
      </EmptyState>
    );
  }

  const warning = shortsWarning(item.duration_s, item.width, item.height);
  const lane = item.posting_kind === 'rotation' ? settings?.rotation_upload_times : settings?.upload_times;
  // A time picked on the video wins; one kept off the schedule gets none; otherwise the next free slot.
  const held = item.scheduled_for === null && item.schedule_source === 'hold';
  const wouldPublishAt =
    draft.privacy !== 'public' || settings === null || held
      ? null
      : (item.scheduled_for ??
        nextFreeSlot({
          uploadTimes: lane ?? [],
          taken: (queue.data ?? []).map((entry) => entry.scheduled_for).filter((at): at is string => at !== null),
          now: new Date(),
          horizonDays: settings.auto_schedule_days
        }));

  const outcome =
    draft.privacy !== 'public'
      ? `Approving uploads this as ${draft.privacy}, with no publish time.`
      : held
        ? 'Approving leaves it without a time: it is kept off the schedule until you give it one.'
        : wouldPublishAt === null
        ? 'Approving leaves it without a time: the schedule is full as far ahead as it books.'
        : `Approving publishes this ${new Date(wouldPublishAt).toLocaleString()}, ${formatRelativeTime(wouldPublishAt)}.`;

  return (
    <div className={styles.screen}>
      <div className={styles.head}>
        <span className={styles.count}>
          {counted.position} <span className={styles.of}>of {counted.total} to decide</span>
        </span>
        <StatusPill state={item.state} attentionCode={item.attention_code} />
        {item.posting_kind === 'rotation' && <span className={styles.hint}>Re-run · posting {item.postings}</span>}
        <span className={styles.spacer} />
        {save.pending && <span className={styles.saving}>Saving…</span>}
        {!save.pending && justSaved && <span className={styles.saved}>Saved</span>}
        <div className={styles.nav}>
          <Button size="small" icon={<ChevronLeft size={14} />} aria-label="Previous video" onClick={() => move(-1)} />
          <Button size="small" icon={<ChevronRight size={14} />} aria-label="Next video" onClick={() => move(1)} />
        </div>
      </div>

      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${total === 0 ? 0 : (counted.done / total) * 100}%` }} />
      </div>

      {problem !== null && (
        <Banner kind="danger" title="That did not save">
          {problem}
        </Banner>
      )}

      <div className={styles.body}>
        <div className={styles.left}>
          <VideoPreview queueId={item.id} durationS={item.duration_s} missing={item.missing} />
          <div className={styles.facts}>
            <span className={styles.factLabel}>File</span>
            <span className={styles.factValue}>{item.filename}</span>
            <span className={styles.factLabel}>Size</span>
            <span className={styles.factValue}>
              {item.width === null || item.height === null ? 'Unknown' : `${item.width}×${item.height}`} ·{' '}
              {formatFileSize(item.file_size)}
            </span>
            <span className={styles.factLabel}>Length</span>
            <span className={styles.factValue}>{formatDuration(item.duration_s)}</span>
            {(item.ai_drafted_at !== null || item.metadata_edited_at !== null) && (
              <>
                <span className={styles.factLabel}>Details</span>
                <span className={styles.factValue}>
                  {item.metadata_edited_at !== null ? 'Written by you' : 'Drafted by the local model'}
                </span>
              </>
            )}
          </div>
          {warning !== null && <Banner kind="warning" title="Not a Short">{warning}</Banner>}
          <PlatformChoice item={item} />
        </div>

        <div className={styles.right}>
          <div onBlur={() => commit({ title: draft.title })}>
            <TextField
              label="Title"
              value={draft.title}
              onChange={(value) => setDraft({ ...draft, title: value })}
              counter={`${charCount(draft.title)} / ${TITLE_MAX_CHARS}`}
              counterOver={charCount(draft.title) > TITLE_MAX_CHARS}
            />
          </div>
          <ScreenCheck queueId={item.id} title={draft.title} />

          <DescriptionCheck
            key={item.id}
            text={draft.description}
            onChange={(value) => {
              // Saved at once, like the tags: a fix made here and then left for the next card would be lost.
              setDraft({ ...draft, description: value });
              commit({ description: value });
            }}
            game={item.game}
            compact
          >
            <div onBlur={() => commit({ description: draft.description })}>
              <TextArea
                label="Description"
                optional
                rows={4}
                spellCheck={false}
                value={draft.description}
                onChange={(value) => setDraft({ ...draft, description: value })}
                counter={`${utf8Bytes(draft.description)} / ${DESCRIPTION_MAX_BYTES} bytes`}
                counterOver={utf8Bytes(draft.description) > DESCRIPTION_MAX_BYTES}
              />
            </div>
          </DescriptionCheck>

          <GameField queueId={item.id} value={item.game} />
          <SourceField queueId={item.id} title={item.source_title} url={item.source_url} />

          <TagInput
            label="Tags"
            value={draft.tags}
            onChange={(tags) => {
              setDraft({ ...draft, tags });
              commit({ tags });
            }}
            counter={`${tagsCharCount(draft.tags)} / ${TAGS_MAX_CHARS}`}
            counterOver={tagsCharCount(draft.tags) > TAGS_MAX_CHARS}
          />

          <div className={styles.pair}>
            <Select
              label="Visibility"
              value={draft.privacy}
              onChange={(privacy: Privacy) => {
                setDraft({ ...draft, privacy });
                commit({ privacy });
              }}
              options={PRIVACY_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
              hint={privacyHint(draft.privacy)}
            />
            <Select
              label="Category"
              value={draft.category_id}
              onChange={(category_id) => {
                setDraft({ ...draft, category_id });
                commit({ category_id });
              }}
              options={VIDEO_CATEGORIES.map((category) => ({ value: category.id, label: category.label }))}
            />
          </div>

          <div className={styles.pair}>
            <Switch
              label="Tell subscribers"
              hint={item.posting_kind === 'rotation' ? 'Re-runs never notify subscribers.' : 'Sends the usual notification when the video goes live.'}
              checked={draft.notify_subscribers}
              onChange={(notify_subscribers) => {
                setDraft({ ...draft, notify_subscribers });
                commit({ notify_subscribers });
              }}
            />
            <Switch
              label="Made for kids"
              hint="YouTube turns off comments and some features on videos marked for kids."
              checked={draft.made_for_kids}
              onChange={(made_for_kids) => {
                setDraft({ ...draft, made_for_kids });
                commit({ made_for_kids });
              }}
            />
          </div>

          <ScheduleEditor key={item.id} item={item} label="Publishes" />

          <div className={styles.tools}>
            <Button
              size="small"
              icon={<Repeat size={14} />}
              onClick={() => actions[2]?.run()}
              title="A re-upload is a video already posted before, so it will not notify your subscribers"
            >
              {isReupload ? 'Counts as already posted' : 'Mark as already posted'}
              <span className={styles.key}>U</span>
            </Button>
            <Button
              size="small"
              icon={outOfRotation ? <RotateCw size={14} /> : <CircleSlash size={14} />}
              onClick={() => actions[3]?.run()}
              title="Whether ShortStack may queue this video again later"
            >
              {outOfRotation ? 'Allow re-runs' : 'No more re-runs'}
              <span className={styles.key}>O</span>
            </Button>
            <Button size="small" icon={<FolderOpen size={14} />} onClick={() => actions[4]?.run()}>
              Show in folder
              <span className={styles.key}>F</span>
            </Button>
            <Button
              size="small"
              icon={<History size={14} />}
              onClick={() => setPickingPast(true)}
              title="Copy the title, description and tags from something already on your channel"
            >
              Reuse past details
            </Button>
          </div>
        </div>

        {/* Beside the fields they fill, so a suggestion is taken without scrolling away from what it changes. */}
        <div className={styles.assist}>
          <AiAssistPanel
            key={`assist-${item.id}`}
            queueId={item.id}
            current={{ title: draft.title, description: draft.description, tags: draft.tags }}
            onAccept={acceptSuggestion}
            disabled={save.pending}
          />
          <VideoReadingPanel key={`reading-${item.id}`} queueId={item.id} />
          <HeardPanel key={`heard-${item.id}`} queueId={item.id} enabled={settings?.listen_enabled === true} />
        </div>
      </div>

      <PastUploadPicker
        open={pickingPast}
        onClose={() => setPickingPast(false)}
        onPick={(details, from) => {
          // Written into the draft, not saved: the user still reviews and saves it like anything else.
          const next = {
            ...draft,
            title: details.title,
            description: details.description,
            tags: details.tags,
            category_id: details.categoryId ?? draft.category_id
          };
          setDraft(next);
          commit({
            title: next.title,
            description: next.description,
            tags: next.tags,
            category_id: next.category_id
          });
          toast({ text: `Details copied from "${from.title}"` });
        }}
      />

      <div className={styles.decide}>
        <div className={styles.outcome}>
          <div className={styles.outcomeLine}>{outcome}</div>
          <div className={styles.outcomeNote}>
            {item.posting_kind === 'rotation'
              ? 'Re-runs never notify your subscribers.'
              : 'Nothing is uploaded until you approve it.'}
          </div>
        </div>
        <div className={styles.group}>
          <Button variant="secondary" icon={<X size={15} />} onClick={() => actions[1]?.run()}>
            Set aside
            <span className={`${styles.key} ${styles.dangerKey}`}>R</span>
          </Button>
          <Button variant="primary" icon={<Check size={15} />} onClick={() => actions[0]?.run()}>
            Approve
            <span className={styles.key}>A</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
