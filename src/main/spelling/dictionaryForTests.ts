// The real dictionary, for tests that measure what a person will actually see. Kept out of the shared
// folder because it reads files, which only the Node side of the project can do.
import { readFileSync } from 'fs';
import * as path from 'path';
import nspell from 'nspell';
import { checkerVocabulary } from '../../shared/descriptionCheck';
import { Lexicon, type WordList } from '../../shared/spelling';

let words: WordList | null = null;

/** The lexicon the app builds: the bundled English dictionary, the checker's own words, and any names given. */
export function realLexicon(names: readonly string[] = []): Lexicon {
  if (words === null) {
    const folder = path.join(process.cwd(), 'node_modules', 'dictionary-en');
    words = nspell(readFileSync(path.join(folder, 'index.aff'), 'utf8'), readFileSync(path.join(folder, 'index.dic'), 'utf8'));
  }
  return new Lexicon(words, checkerVocabulary(names));
}
