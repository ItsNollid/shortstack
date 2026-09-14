// The long video a Short was cut from. The YouTube link comes first: it identifies the video, and
// ShortStack gets its title from YouTube. A name typed by hand is only for a long video that is not up
// yet, and once one Short from it is linked, every Short with that name is linked too.
import React, { useEffect, useId, useRef, useState } from 'react';
import type { Result } from '../../shared/ipc';
import type { SourceVideo } from '../../shared/sourceVideo';
import { parseVideoId } from '../../shared/youtubeUrl';
import { useApiMutation, useApiQuery } from '../hooks/useApi';
import styles from './GameField.module.css';
import own from './SourceField.module.css';

const readKnown = (): Promise<Result<SourceVideo[]>> => window.api.sourcesKnown();

export function SourceField({ queueId, title, url }: { queueId: number; title: string | null; url: string | null }): React.JSX.Element {
  const id = useId();
  const known = useApiQuery(readKnown, { key: 'sources-known', invalidateOn: ['queue:changed'] });
  const save = useApiMutation((source: { title: string; link: string } | null) => window.api.videoSetSource(queueId, source));
  const [link, setLink] = useState(url ?? '');
  const [name, setName] = useState(url === null ? (title ?? '') : '');
  const [naming, setNaming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const previous = useRef({ queueId, title, url });

  useEffect(() => {
    const before = previous.current;
    previous.current = { queueId, title, url };
    if (before.queueId !== queueId) {
      // Another video: start again from its own values. Review keeps this mounted while it moves on,
      // and boxes that kept the last video's text would save it onto the next one.
      setLink(url ?? '');
      setName(url === null ? (title ?? '') : '');
      setNaming(false);
      setProblem(null);
      return;
    }
    // The same video, changed by a save: follow it only where a box still shows the old value, so what
    // is being typed is never replaced.
    setLink((draft) => (draft === (before.url ?? '') ? (url ?? '') : draft));
    setName((draft) => (draft === (before.url === null ? (before.title ?? '') : '') ? (url === null ? (title ?? '') : '') : draft));
  }, [queueId, title, url]);

  const sources = known.data ?? [];
  const linkedSources = sources.filter((source): source is { title: string; url: string } => source.url !== null);
  const error = save.error ?? problem;
  // The name box is for a long video that is not up: shown when asked for, when this Short already has a
  // name and no link, or when YouTube could not be asked for the title of a pasted link.
  const showName = url === null && (naming || title !== null || save.error !== null);

  const run = (source: { title: string; link: string } | null, sentLink: string): void => {
    void save.run(source).then((saved) => {
      if (saved === null) return;
      // Shown the way it was stored, one form of link, unless it has been typed over since.
      setLink((draft) => (draft.trim() === sentLink ? (saved.source_url ?? '') : draft));
    });
  };

  const commitLink = (): void => {
    const next = link.trim();
    if (next === (url ?? '')) return;
    if (next === '') {
      // Taking the link away keeps the name, so the Shorts stay grouped.
      if (url !== null) run(title === null ? null : { title, link: '' }, '');
      return;
    }
    if (parseVideoId(next) === null) {
      setProblem('That is not a YouTube video link');
      return;
    }
    setProblem(null);
    // A name given before the long video was up goes along, in case YouTube cannot be asked for the title.
    run({ title: url === null ? name.trim() : '', link: next }, next);
  };

  const commitName = (): void => {
    const next = name.trim();
    if (next === (url === null ? (title ?? '') : '') && save.error === null) return;
    if (next === '') {
      if (title !== null) run(null, '');
      return;
    }
    const pasted = parseVideoId(link.trim()) === null ? '' : link.trim();
    run({ title: next, link: pasted }, pasted);
  };

  const blurOnEnter = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') event.currentTarget.blur();
  };

  const hint =
    url !== null
      ? 'Given to the model as context, and in the Studio steps as the related video.'
      : title !== null
        ? `Paste its link once it is up. Every Short named “${title}” gets it too.`
        : 'Paste the link to the long video this was cut from. ShortStack gets its title from YouTube.';

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={`${id}-link`}>
        Long video on YouTube
      </label>
      <input
        id={`${id}-link`}
        className={styles.input}
        list={`${id}-links`}
        value={link}
        placeholder="Paste its link: https://youtu.be/…"
        onChange={(event) => setLink(event.target.value)}
        onBlur={commitLink}
        onKeyDown={blurOnEnter}
      />
      <datalist id={`${id}-links`}>
        {linkedSources.map((source) => (
          <option key={source.url} value={source.url}>
            {source.title}
          </option>
        ))}
      </datalist>
      {url !== null && title !== null && (
        <div className={own.linked}>
          <span className={own.linkedLabel}>On YouTube as </span>
          {title}
        </div>
      )}

      {showName ? (
        <>
          <label className={styles.label} htmlFor={`${id}-name`}>
            Name for now
          </label>
          <input
            id={`${id}-name`}
            className={styles.input}
            list={`${id}-names`}
            value={name}
            placeholder="Until it is on YouTube"
            onChange={(event) => setName(event.target.value)}
            onBlur={commitName}
            onKeyDown={blurOnEnter}
          />
          <datalist id={`${id}-names`}>
            {sources.map((source) => (
              <option key={source.title} value={source.title} />
            ))}
          </datalist>
        </>
      ) : (
        url === null && (
          <button type="button" className={own.toggle} onClick={() => setNaming(true)}>
            Not on YouTube yet? Name it for now
          </button>
        )
      )}

      <div className={styles.hint}>{error ?? hint}</div>
    </div>
  );
}
