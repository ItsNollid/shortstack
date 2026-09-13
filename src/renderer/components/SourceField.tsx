// The long video a Short was cut from: its title, with the long videos already named offered first, and
// its YouTube link. Picking one used before fills in its link, since Shorts are cut from one in a batch.
import React, { useEffect, useId, useRef, useState } from 'react';
import type { Result } from '../../shared/ipc';
import { checkSource, type SourceVideo } from '../../shared/sourceVideo';
import { useApiMutation, useApiQuery } from '../hooks/useApi';
import styles from './GameField.module.css';

const readKnown = (): Promise<Result<SourceVideo[]>> => window.api.sourcesKnown();

export function SourceField({ queueId, title, url }: { queueId: number; title: string | null; url: string | null }): React.JSX.Element {
  const id = useId();
  const known = useApiQuery(readKnown, { key: 'sources-known', invalidateOn: ['queue:changed'] });
  const save = useApiMutation((source: { title: string; link: string } | null) => window.api.videoSetSource(queueId, source));
  const [draftTitle, setDraftTitle] = useState(title ?? '');
  const [draftLink, setDraftLink] = useState(url ?? '');
  const previous = useRef({ queueId, title, url });

  useEffect(() => {
    const before = previous.current;
    previous.current = { queueId, title, url };
    if (before.queueId !== queueId) {
      // Another video: start again from its own values. Review keeps this mounted while it moves on,
      // and boxes that kept the last video's text would save it onto the next one.
      setDraftTitle(title ?? '');
      setDraftLink(url ?? '');
      return;
    }
    // The same video, changed by a save: follow it only where a box still shows the old value, so what
    // is being typed is never replaced. Measured: the title saved on the way to the link box refreshed
    // both, and emptied the link that was being typed into it at that moment.
    setDraftTitle((draft) => (draft === (before.title ?? '') ? (title ?? '') : draft));
    setDraftLink((draft) => (draft === (before.url ?? '') ? (url ?? '') : draft));
  }, [queueId, title, url]);

  const sources = known.data ?? [];
  const typedSomething = draftTitle.trim() !== '' || draftLink.trim() !== '';
  const checked = typedSomething ? checkSource({ title: draftTitle, link: draftLink }) : null;
  const problem = checked !== null && !checked.ok ? checked.problem : null;

  const chooseTitle = (value: string): void => {
    setDraftTitle(value);
    const match = sources.find((source) => source.title.toLowerCase() === value.trim().toLowerCase());
    if (match !== undefined && match.url !== null && draftLink.trim() === '') setDraftLink(match.url);
  };

  const commit = (): void => {
    const nextTitle = draftTitle.trim();
    const nextLink = draftLink.trim();
    if (nextTitle === '' && nextLink === '') {
      if (title !== null || url !== null) void save.run(null);
      return;
    }
    const result = checkSource({ title: nextTitle, link: nextLink });
    if (!result.ok) return;
    // Compared as it would be stored, so a link pasted in another form is not saved again on every blur.
    if (result.source.title === (title ?? '') && result.source.url === url) return;
    void save.run({ title: nextTitle, link: nextLink }).then((saved) => {
      if (saved === null) return;
      // Shown the way it was stored, one form of link, unless it has been typed over since.
      setDraftLink((draft) => (draft.trim() === nextLink ? (saved.source_url ?? '') : draft));
    });
  };

  const blurOnEnter = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') event.currentTarget.blur();
  };

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={`${id}-title`}>
        From long video
      </label>
      <input
        id={`${id}-title`}
        className={styles.input}
        list={`${id}-options`}
        value={draftTitle}
        placeholder="The long video this was cut from"
        onChange={(event) => chooseTitle(event.target.value)}
        onBlur={commit}
        onKeyDown={blurOnEnter}
      />
      <datalist id={`${id}-options`}>
        {sources.map((source) => (
          <option key={source.title} value={source.title} />
        ))}
      </datalist>

      <label className={styles.label} htmlFor={`${id}-link`}>
        Its YouTube link
      </label>
      <input
        id={`${id}-link`}
        className={styles.input}
        value={draftLink}
        placeholder="https://youtu.be/…"
        onChange={(event) => setDraftLink(event.target.value)}
        onBlur={commit}
        onKeyDown={blurOnEnter}
      />

      <div className={styles.hint}>
        {save.error ??
          problem ??
          (title === null
            ? 'Say which long video this came from: the model gets the context, and the Studio steps can link it as the related video.'
            : url === null
              ? 'Add its link and the Studio steps include it as the related video.'
              : 'Given to the model as context, and in the Studio steps as the related video.')}
      </div>
    </div>
  );
}
