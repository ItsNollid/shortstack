import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, FolderOpen, Pencil, Repeat, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { QueueItemDTO } from '../../../shared/dto';
import type { Result } from '../../../shared/ipc';
import { formatDuration, formatFileSize, presentState, shortsWarning } from '../../../shared/presentation';
import { needsReview, positionAfterChange, progress, step } from '../../../shared/review';
import { PageHeader } from '../../components/PageHeader';
import { Banner, Button, EmptyState, StatusPill } from '../../components/ui';
import { useRequestApproval } from '../../app/approval';
import { useToast } from '../../app/toast';
import { useApiMutation, useApiQuery } from '../../hooks/useApi';
import styles from './Review.module.css';

const readQueue = (): Promise<Result<QueueItemDTO[]>> => window.api.queueList();

interface Action {
  key: string;
  label: string;
  icon: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  run: (item: QueueItemDTO) => void;
}

export function Review(): React.JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const requestApproval = useRequestApproval();
  const queue = useApiQuery(readQueue, { key: 'queue', invalidateOn: ['queue:changed'] });
  const [index, setIndex] = useState(0);
  const startedWith = useRef<number | null>(null);

  const pending = useMemo(() => (queue.data ?? []).filter((item) => needsReview(item.state)), [queue.data]);

  // The size of the job when this session started, so progress counts down rather than jumping
  // around as the list shrinks.
  if (startedWith.current === null && queue.data !== null) startedWith.current = pending.length;

  useEffect(() => {
    setIndex((current) => positionAfterChange(current, pending.length));
  }, [pending.length]);

  const item = pending[index] ?? null;

  const reject = useApiMutation((ids: number[]) => window.api.queueReject(ids));
  const markReupload = useApiMutation((ids: number[]) => window.api.rotationMarkPublishedBefore(ids, true));
  const pauseRotation = useApiMutation((ids: number[]) => window.api.rotationSetPaused(ids, true));

  const move = (delta: number): void => setIndex((current) => step(current, delta, pending.length));

  const actions: Action[] = [
    {
      key: 'a',
      label: 'Approve',
      icon: <Check size={15} />,
      variant: 'primary',
      run: (current) => requestApproval([current])
    },
    {
      key: 'r',
      label: 'Reject',
      icon: <X size={15} />,
      variant: 'danger',
      run: (current) => {
        void reject.run([current.id]).then((done) => {
          if (done !== null) toast({ text: `${current.title} rejected` });
        });
      }
    },
    {
      key: 'u',
      label: 'Re-upload',
      icon: <Repeat size={15} />,
      run: (current) => {
        void markReupload.run([current.id]).then((done) => {
          if (done !== null) toast({ text: `${current.title} marked as a re-upload — it will not notify subscribers` });
        });
        move(1);
      }
    },
    {
      key: 'e',
      label: 'Edit',
      icon: <Pencil size={15} />,
      run: (current) => navigate(`/video/${current.id}`)
    },
    {
      key: 'f',
      label: 'Show file',
      icon: <FolderOpen size={15} />,
      run: (current) => void window.api.revealFile(current.id)
    }
  ];

  // Keyboard first: this screen exists to get through hundreds of videos quickly, and reaching for
  // the mouse for every one is the thing that makes that slow.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target !== null && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (item === null) return;

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        move(1);
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        move(-1);
        return;
      }
      const action = actions.find((entry) => entry.key === event.key.toLowerCase());
      if (action !== undefined) {
        event.preventDefault();
        action.run(item);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const total = startedWith.current ?? 0;
  const counted = progress(index, pending.length, total);
  const problem = queue.error ?? reject.error ?? markReupload.error ?? pauseRotation.error;

  if (item === null) {
    return (
      <>
        <PageHeader title="Review" />
        <EmptyState icon={<Check size={24} />} title="Nothing waiting">
          Every video has had a decision. Anything new from the folder will turn up here.
        </EmptyState>
      </>
    );
  }

  const warning = shortsWarning(item.duration_s, item.width, item.height);
  const state = presentState(item.state, item.attention_code);

  return (
    <div className={styles.screen}>
      <div className={styles.head}>
        <span className={styles.count}>
          {counted.position} <span className={styles.of}>of {counted.total}</span>
        </span>
        <span className={styles.spacer} />
        <Button size="small" icon={<ChevronLeft size={14} />} aria-label="Previous" onClick={() => move(-1)} />
        <Button size="small" icon={<ChevronRight size={14} />} aria-label="Next" onClick={() => move(1)} />
      </div>

      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${total === 0 ? 0 : (counted.done / total) * 100}%` }} />
      </div>

      {problem !== null && (
        <Banner kind="danger" title="That did not work">
          {problem}
        </Banner>
      )}

      <div className={styles.card}>
        <div className={styles.preview}>{formatDuration(item.duration_s)}</div>

        <div className={styles.body}>
          <div className={styles.title}>{item.title}</div>
          <div className={styles.file}>{item.filename}</div>

          <div className={styles.meta}>
            <StatusPill state={item.state} attentionCode={item.attention_code} />
            <span className={styles.file}>
              {item.width === null || item.height === null ? 'Unknown size' : `${item.width}×${item.height}`} ·{' '}
              {formatFileSize(item.file_size)} · {item.privacy}
            </span>
          </div>

          {warning !== null && <Banner kind="warning" title="Not a Short">{warning}</Banner>}
          {item.posting_kind === 'rotation' && (
            <Banner kind="info" title={`Re-run, posting ${item.postings}`}>
              This will not notify your subscribers.
            </Banner>
          )}
          {state.hint !== '' && <div className={styles.hint}>{state.hint}</div>}

          {item.description !== '' && <div className={styles.description}>{item.description}</div>}

          <div className={styles.actions}>
            {actions.map((action) => (
              <Button
                key={action.key}
                variant={action.variant ?? 'secondary'}
                icon={action.icon}
                onClick={() => action.run(item)}
              >
                {action.label}
                <span className={styles.key}>{action.key.toUpperCase()}</span>
              </Button>
            ))}
          </div>

          <div className={styles.hint}>Arrow keys move between videos. Nothing uploads until you approve it.</div>
        </div>
      </div>
    </div>
  );
}
