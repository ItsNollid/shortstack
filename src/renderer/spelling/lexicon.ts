// The dictionary is half a megabyte and takes a quarter of a second to read, so it loads the first
// time a description box appears rather than when the app starts, and only once however many boxes
// there are.
import { useEffect, useState } from 'react';
import { Lexicon } from '../../shared/spelling';

let loading: Promise<Lexicon> | null = null;

function loadLexicon(): Promise<Lexicon> {
  if (loading === null) {
    const started = Promise.all([
      import('nspell'),
      import('../../../node_modules/dictionary-en/index.aff?raw'),
      import('../../../node_modules/dictionary-en/index.dic?raw')
    ]).then(([spell, aff, dic]) => new Lexicon(spell.default(aff.default, dic.default)));
    // A failed load is tried again next time rather than remembered forever.
    started.catch(() => {
      loading = null;
    });
    loading = started;
  }
  return loading;
}

export interface LoadedLexicon {
  /** Null until the dictionary has loaded. */
  lexicon: Lexicon | null;
  failed: boolean;
  /** Changes whenever the known words do, for memos that depend on what the lexicon knows. */
  version: string;
}

/** The shared lexicon once loaded, knowing the given words on top of its dictionary. */
export function useLexicon(words: readonly string[]): LoadedLexicon {
  const [lexicon, setLexicon] = useState<Lexicon | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    loadLexicon().then(
      (loaded) => {
        if (live) setLexicon(loaded);
      },
      () => {
        if (live) setFailed(true);
      }
    );
    return () => {
      live = false;
    };
  }, []);

  // One lexicon serves every box, so its words are set before the check that uses them. Setting the
  // same words again costs a comparison and nothing else.
  if (lexicon !== null) lexicon.setExtra(words);
  return { lexicon, failed, version: words.join('\n') };
}
