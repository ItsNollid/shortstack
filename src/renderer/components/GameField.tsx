import React, { useEffect, useId, useState } from 'react';
import { GAMES } from '../../shared/games';
import type { Result } from '../../shared/ipc';
import { useApiMutation, useApiQuery } from '../hooks/useApi';
import styles from './GameField.module.css';

const readKnown = (): Promise<Result<string[]>> => window.api.gamesKnown();

/**
 * Free text with suggestions rather than a fixed list. The built-in names cover the common cases and
 * whatever this channel has already used is added to them, but a list that cannot be typed past
 * would be wrong the first time someone records something nobody thought of — and half of what this
 * channel plays is exactly that.
 */
export function GameField({ queueId, value }: { queueId: number; value: string | null }): React.JSX.Element {
  const listId = useId();
  const known = useApiQuery(readKnown, { key: 'games-known', invalidateOn: ['queue:changed'] });
  const save = useApiMutation((game: string | null) => window.api.videoSetGame(queueId, game));
  const [draft, setDraft] = useState(value ?? '');

  // The field follows the video it is showing, not the one it was first drawn for. The Review screen
  // keeps it mounted while it moves to the next video, and without this the box went on showing the
  // previous video's game — and on blur, compared that stale text against the new video's value,
  // saw a difference, and saved the previous video's game onto the new one.
  useEffect(() => {
    setDraft(value ?? '');
  }, [queueId, value]);

  // Suggestions this channel has actually used come first: they are the likelier answer.
  const suggestions = [...new Set([...(known.data ?? []), ...GAMES.map((game) => game.name)])];

  const commit = (): void => {
    const cleaned = draft.trim();
    if (cleaned === (value ?? '')) return;
    void save.run(cleaned === '' ? null : cleaned);
  };

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={listId}>
        Game
      </label>
      <input
        id={listId}
        className={styles.input}
        list={`${listId}-options`}
        value={draft}
        placeholder="Counter-Strike 2"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
      <datalist id={`${listId}-options`}>
        {suggestions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <div className={styles.hint}>
        {save.error ??
          (value === null
            ? 'Say which game and the model stops guessing from the picture, which it does badly.'
            : 'Used when writing the title and tags, and when working out which game does best.')}
      </div>
    </div>
  );
}
