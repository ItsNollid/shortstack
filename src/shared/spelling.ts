// Spelling that is useful on a gaming Short rather than merely correct.
//
// An ordinary spell checker is no use here, for two reasons. Hashtags are words run together, so it
// flags every one of them. And its suggestions are ranked for prose: measured against the bundled
// English dictionary, its first suggestion for "mroe" was "roe", for "teh" was "ten", and for "thier"
// was "thief" — fine to offer, wrong to apply without asking. For a word it had never seen, like
// "gamertag", it took 0.4 seconds to suggest nothing, which is a stall on every keystroke.
//
// So the dictionary is asked only the cheap question — is this a word, a couple of microseconds — and
// everything else is built here: every one-keystroke slip of a word, checked against the dictionary,
// ranked by how people actually mistype, and marked safe to apply only when one fix is clearly meant.
import { COMMON_SHORT_WORDS, COMMON_TYPOS, TWO_LETTER_WORDS } from './gamingWords';

/** The dictionary, reduced to the one question worth asking it. */
export interface WordList {
  correct(word: string): boolean;
}

/** How a suggestion differs from what was typed, most likely mistake first. */
export type EditKind = 'swap' | 'double' | 'split' | 'insert' | 'delete' | 'replace';

export interface SpellingAdvice {
  /** Best first. Empty when nothing plausible is close. */
  suggestions: string[];
  /** Only when one fix is clearly the one meant, so "Fix all" may apply it without asking. */
  confident: boolean;
}

interface Candidate {
  value: string;
  kind: EditKind;
  /** Where in the typed text the slip was. */
  at: number;
}

interface Stretch {
  start: number;
  end: number;
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const KIND_RANK: Record<EditKind, number> = { swap: 0, double: 1, split: 2, insert: 3, delete: 4, replace: 5 };
/** Past this there are too many edits to check while someone types, and nobody mistypes a word that long by one letter. */
const MAX_EDIT_LENGTH = 24;
const MAX_PIECE_LENGTH = 24;
const MAX_SUGGESTIONS = 4;
const MEMO_LIMIT = 5000;
/** A stretch of hashtag shorter than this that is not a word is nearly always an initialism — #bts — not a typo. */
const MIN_TYPO_STRETCH = 4;

function remember<V>(memo: Map<string, V>, key: string, value: V): V {
  if (memo.size >= MEMO_LIMIT) memo.clear();
  memo.set(key, value);
  return value;
}

const capitalise = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

/** A suggestion in the shape of what was typed: "Mroe" becomes "More", "MROE" becomes "MORE". */
export function matchCase(typed: string, suggestion: string): string {
  const letters = typed.replace(/[^\p{L}]/gu, '');
  if (letters.length > 1 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()) {
    return suggestion.toUpperCase();
  }
  return /^\p{Lu}/u.test(typed) ? capitalise(suggestion) : suggestion;
}

const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const ROW_OFFSET = [0, 0.3, 0.8];
const KEY_POSITION = new Map<string, { x: number; y: number }>();
KEY_ROWS.forEach((row, y) => {
  [...row].forEach((letter, column) => KEY_POSITION.set(letter, { x: column + (ROW_OFFSET[y] ?? 0), y }));
});
const VOWELS: ReadonlySet<string> = new Set(['a', 'e', 'i', 'o', 'u']);

/**
 * Whether one letter typed for another is a slip: a neighbouring key, or one vowel for another, as in
 * "definately". Anything further is a different word, not a mistake. Measured: without this,
 * #shortsviralkaisekare was "corrected" to #shortsviralkaiserare, a k typed for an r two rows away.
 */
function isSlip(typed: string, meant: string): boolean {
  if (VOWELS.has(typed) && VOWELS.has(meant)) return true;
  const from = KEY_POSITION.get(typed);
  const to = KEY_POSITION.get(meant);
  return from !== undefined && to !== undefined && Math.abs(from.y - to.y) <= 1 && Math.abs(from.x - to.x) <= 1.1;
}

/** Every string one slip away: two neighbours swapped, one letter dropped or added, a neighbouring key hit. */
function oneSlipAway(word: string): Candidate[] {
  const out: Candidate[] = [];
  for (let at = 0; at < word.length - 1; at += 1) {
    if (word[at] === word[at + 1]) continue;
    out.push({ value: word.slice(0, at) + word.charAt(at + 1) + word.charAt(at) + word.slice(at + 2), kind: 'swap', at });
  }
  for (let at = 0; at < word.length; at += 1) {
    // Dropping one of a pair — "untill" to "until" — is its own, far more likely, mistake.
    const pair = word[at] === word[at - 1] || word[at] === word[at + 1];
    out.push({ value: word.slice(0, at) + word.slice(at + 1), kind: pair ? 'double' : 'delete', at });
  }
  for (let at = 0; at <= word.length; at += 1) {
    for (const letter of LETTERS) {
      const pair = letter === word[at - 1] || letter === word[at];
      out.push({ value: word.slice(0, at) + letter + word.slice(at), kind: pair ? 'double' : 'insert', at });
    }
  }
  for (let at = 0; at < word.length; at += 1) {
    const typed = word.charAt(at);
    for (const letter of LETTERS) {
      if (letter !== typed && isSlip(typed, letter)) {
        out.push({ value: word.slice(0, at) + letter + word.slice(at + 1), kind: 'replace', at });
      }
    }
  }
  return out;
}

const isLetters = (piece: string): boolean => /^\p{L}+$/u.test(piece);
/** One- and two-letter pieces: fine in pack-a-punch, a sign of forcing when a split needs many. */
const tinyPieces = (pieces: readonly string[]): number => pieces.filter((piece) => isLetters(piece) && piece.length <= 2).length;

/** Whether one piece of a split spans the whole stretch, as a corrected word should. */
function onePieceCovers(pieces: readonly string[], start: number, end: number): boolean {
  let at = 0;
  for (const piece of pieces) {
    if (at <= start && at + piece.length >= end) return true;
    at += piece.length;
  }
  return false;
}

/**
 * Whether a prose suggestion is clearly the one meant. A single candidate is, for any word long
 * enough to have been meant as something. So is the only swap in a longer word — measured, "recieve",
 * "thier" and "zombeis" each had exactly one — but not in a short one, where swaps collide with real
 * words: the only swap in "alot" is "alto".
 */
function clearWinner(ranked: readonly Candidate[], length: number): boolean {
  if (ranked.length === 1) return length >= 4;
  const swaps = ranked.filter((candidate) => candidate.kind === 'swap').length;
  if (swaps === 1) return length >= 5;
  return swaps === 0 && length >= 4 && ranked.filter((candidate) => candidate.kind === 'double').length === 1;
}

export class Lexicon {
  private readonly words: WordList;
  private extra: ReadonlySet<string> = new Set();
  private readonly known = new Map<string, boolean>();
  private readonly splits = new Map<string, string[] | null>();
  private readonly wordAdvice = new Map<string, SpellingAdvice>();
  private readonly hashtagAdvice = new Map<string, SpellingAdvice | null>();

  constructor(words: WordList, extra: Iterable<string> = []) {
    this.words = words;
    this.setExtra(extra);
  }

  /** Words known on top of the dictionary: gaming terms, the channel's name, the person's own list. */
  setExtra(extra: Iterable<string>): void {
    const next = new Set([...extra].map((word) => word.trim().toLowerCase()).filter((word) => word !== ''));
    if (next.size === this.extra.size && [...next].every((word) => this.extra.has(word))) return;
    this.extra = next;
    this.known.clear();
    this.splits.clear();
    this.wordAdvice.clear();
    this.hashtagAdvice.clear();
  }

  /** Whether a word is spelled correctly, however it is capitalised. */
  knows(word: string): boolean {
    const cached = this.known.get(word);
    if (cached !== undefined) return cached;
    const lower = word.toLowerCase();
    const result =
      this.extra.has(lower) ||
      this.words.correct(word) ||
      this.words.correct(lower) ||
      // Names the dictionary keeps capitalised, typed in lower case inside a hashtag: #thankyoudonald.
      this.words.correct(capitalise(lower)) ||
      // Initialisms it keeps in capitals: #btsfunnymoments.
      (lower.length <= 4 && this.words.correct(lower.toUpperCase()));
    return remember(this.known, word, result);
  }

  /** Advice for a word in a sentence that the dictionary does not know. */
  suggest(word: string): SpellingAdvice {
    const cached = this.wordAdvice.get(word);
    return cached ?? remember(this.wordAdvice, word, this.adviseWord(word));
  }

  /**
   * A hashtag's body as the words it is made of — "blackops3zombies" as black, ops, 3, zombies — or
   * null when it cannot be read as words. Fewest pieces wins, so #packapunch is pack-a-punch.
   */
  segment(body: string): string[] | null {
    const key = body.toLowerCase();
    const cached = this.splits.get(key);
    if (cached !== undefined) return cached;
    if (this.extra.has(key)) return remember(this.splits, key, [key]);

    const best: Array<string[] | null> = Array.from({ length: key.length + 1 }, () => null);
    best[0] = [];
    for (let end = 1; end <= key.length; end += 1) {
      for (let start = Math.max(0, end - MAX_PIECE_LENGTH); start < end; start += 1) {
        const before = best[start];
        if (before === null || before === undefined) continue;
        const piece = key.slice(start, end);
        if (!this.isPiece(piece)) continue;
        const candidate = [...before, piece];
        const current = best[end];
        if (
          current === null ||
          current === undefined ||
          candidate.length < current.length ||
          (candidate.length === current.length && tinyPieces(candidate) < tinyPieces(current))
        ) {
          best[end] = candidate;
        }
      }
    }
    return remember(this.splits, key, best[key.length] ?? null);
  }

  /**
   * Advice for a hashtag that looks misspelled, or null when it reads as words or nothing better is
   * close. Silence is the default on purpose: a brand or a name the dictionary has never heard of is
   * not a mistake, and flagging one on every video teaches a person to ignore the checker.
   */
  hashtag(body: string): SpellingAdvice | null {
    const key = body.toLowerCase().replace(/_/g, '');
    if (this.hashtagAdvice.has(key)) return this.hashtagAdvice.get(key) ?? null;
    return remember(this.hashtagAdvice, key, this.adviseHashtag(key));
  }

  private adviseWord(word: string): SpellingAdvice {
    const lower = word.toLowerCase();
    const typo = COMMON_TYPOS[lower];
    if (typo !== undefined) return { suggestions: [matchCase(word, typo)], confident: true };
    if (lower.length > MAX_EDIT_LENGTH || !/^[a-z]+$/.test(lower)) return { suggestions: [], confident: false };

    const found = new Map<string, Candidate>();
    const consider = (candidate: Candidate): void => {
      const had = found.get(candidate.value);
      if (had === undefined || KIND_RANK[candidate.kind] < KIND_RANK[had.kind]) found.set(candidate.value, candidate);
    };
    for (const candidate of oneSlipAway(lower)) {
      if (candidate.value.length >= 2 && this.knows(candidate.value)) consider(candidate);
    }
    // Two words with the space left out: "subscribenow".
    for (let at = 1; at < lower.length; at += 1) {
      if (this.standsAlone(lower.slice(0, at)) && this.standsAlone(lower.slice(at))) {
        consider({ value: `${lower.slice(0, at)} ${lower.slice(at)}`, kind: 'split', at });
      }
    }

    const ranked = [...found.values()].sort(
      (a, b) =>
        KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
        // People rarely get the first letter wrong.
        Number(b.value.charAt(0) === lower.charAt(0)) - Number(a.value.charAt(0) === lower.charAt(0)) ||
        a.value.localeCompare(b.value)
    );
    return {
      suggestions: ranked.slice(0, MAX_SUGGESTIONS).map((candidate) => matchCase(word, candidate.value)),
      confident: clearWinner(ranked, lower.length)
    };
  }

  private adviseHashtag(key: string): SpellingAdvice | null {
    if (key.length > MAX_EDIT_LENGTH || !/^[a-z0-9]+$/.test(key)) return null;

    // Where the typo must be. A hashtag that splits cleanly has none; one that only splits by leaning
    // on scraps has it among the scraps; one that does not split has it in its one unreadable stretch.
    const pieces = this.segment(key);
    const stretch = pieces === null ? this.typoStretch(key) : this.forcedStretch(pieces);
    if (stretch === null) return null;
    const ceiling = pieces === null ? Number.POSITIVE_INFINITY : pieces.length - 1;

    const found = new Map<string, { kind: EditKind; pieces: string[] }>();
    for (const candidate of oneSlipAway(key)) {
      if (candidate.at < stretch.start || candidate.at > stretch.end) continue;
      const had = found.get(candidate.value);
      if (had !== undefined) {
        if (KIND_RANK[candidate.kind] < KIND_RANK[had.kind]) had.kind = candidate.kind;
        continue;
      }
      const split = this.segment(candidate.value);
      if (split === null || split.length > ceiling || this.forcedStretch(split) !== null) continue;
      // The fix is a word, not a new arrangement of scraps: one piece has to span what was wrong.
      const shift = candidate.value.length - key.length;
      if (!onePieceCovers(split, stretch.start, stretch.end + shift)) continue;
      found.set(candidate.value, { kind: candidate.kind, pieces: split });
    }
    if (found.size === 0) return null;

    const ranked = [...found.entries()]
      .map(([value, detail]) => ({ value, ...detail }))
      .sort(
        (a, b) =>
          tinyPieces(a.pieces) - tinyPieces(b.pieces) ||
          a.pieces.length - b.pieces.length ||
          KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
          a.value.localeCompare(b.value)
      );
    const best = ranked[0] as (typeof ranked)[number];
    const next = ranked[1];
    const confident =
      next === undefined ||
      tinyPieces(best.pieces) < tinyPieces(next.pieces) ||
      (tinyPieces(best.pieces) === tinyPieces(next.pieces) && best.pieces.length < next.pieces.length);
    return { suggestions: ranked.slice(0, MAX_SUGGESTIONS).map((candidate) => candidate.value), confident };
  }

  /**
   * The one stretch of an unreadable hashtag that is not words, with as much as possible read around
   * it, widened over any scraps beside it — "funnymoemnts" reads funny, Moe, and "mnts", and the typo
   * sits in "moemnts". Null when there are several stretches, or one too short to be a misspelled word:
   * both mean it was never English, and a guess would only be noise.
   */
  private typoStretch(key: string): Stretch | null {
    interface Reading {
      unknown: number;
      parts: Array<Stretch & { word: boolean }>;
    }
    const best: Array<Reading | undefined> = [{ unknown: 0, parts: [] }];
    const better = (a: Reading, b: Reading | undefined): boolean =>
      b === undefined || a.unknown < b.unknown || (a.unknown === b.unknown && a.parts.length < b.parts.length);

    for (let end = 1; end <= key.length; end += 1) {
      let chosen: Reading | undefined;
      const previous = best[end - 1];
      if (previous !== undefined) {
        const last = previous.parts[previous.parts.length - 1];
        const parts =
          last !== undefined && !last.word && last.end === end - 1
            ? [...previous.parts.slice(0, -1), { ...last, end }]
            : [...previous.parts, { start: end - 1, end, word: false }];
        chosen = { unknown: previous.unknown + 1, parts };
      }
      for (let start = Math.max(0, end - MAX_PIECE_LENGTH); start < end; start += 1) {
        const before = best[start];
        if (before === undefined || !this.isPiece(key.slice(start, end))) continue;
        const reading = { unknown: before.unknown, parts: [...before.parts, { start, end, word: true }] };
        if (better(reading, chosen)) chosen = reading;
      }
      best[end] = chosen;
    }

    const parts = best[key.length]?.parts ?? [];
    const scrap = (part: (typeof parts)[number]): boolean =>
      part.word && part.end - part.start <= 3 && isLetters(key.slice(part.start, part.end));

    // Unreadable bits with only scraps between them are one typo read in pieces. Measured: "zombeis"
    // reads as z, OMB, e, is — the dictionary knows OMB — which is two unreadable bits, but one slip.
    const stretches: Stretch[] = [];
    let open: Stretch | null = null;
    let unreadable = false;
    for (const part of parts) {
      if (!part.word || scrap(part)) {
        if (open === null) open = { start: part.start, end: part.end };
        else open.end = part.end;
        unreadable = unreadable || !part.word;
      } else {
        if (open !== null && unreadable) stretches.push(open);
        open = null;
        unreadable = false;
      }
    }
    if (open !== null && unreadable) stretches.push(open);

    const only = stretches.length === 1 ? (stretches[0] as Stretch) : null;
    return only !== null && only.end - only.start >= MIN_TYPO_STRETCH ? only : null;
  }

  /**
   * Where a split leans on scraps: "subscirbe" reads as subs + cir + be. Real hashtags have short words
   * in them — pack-a-punch, how-to-go — but not an unusual three-letter one against another short
   * piece. Null when the split is sound.
   */
  private forcedStretch(pieces: readonly string[]): Stretch | null {
    const short = (piece: string | undefined): boolean => piece !== undefined && isLetters(piece) && piece.length <= 3;
    let offset = 0;
    for (let at = 0; at < pieces.length - 1; at += 1) {
      const left = pieces[at] as string;
      const right = pieces[at + 1] as string;
      if (short(left) && short(right) && (this.unusual(left) || this.unusual(right))) {
        let start = offset;
        let first = at;
        while (short(pieces[first - 1])) {
          first -= 1;
          start -= (pieces[first] as string).length;
        }
        let end = offset + left.length + right.length;
        let last = at + 1;
        while (short(pieces[last + 1])) {
          last += 1;
          end += (pieces[last] as string).length;
        }
        return { start, end };
      }
      offset += left.length;
    }
    return null;
  }

  private isPiece(piece: string): boolean {
    if (/^\p{N}+$/u.test(piece)) return true;
    if (!isLetters(piece)) return this.extra.has(piece);
    if (piece.length === 1) return piece === 'a' || piece === 'i';
    if (piece.length === 2) return TWO_LETTER_WORDS.has(piece) || this.extra.has(piece);
    return this.knows(piece);
  }

  private standsAlone(part: string): boolean {
    if (part.length === 1) return part === 'a' || part === 'i';
    if (part.length === 2) return TWO_LETTER_WORDS.has(part);
    return this.knows(part);
  }

  private unusual(piece: string): boolean {
    return piece.length === 3 && !COMMON_SHORT_WORDS.has(piece) && !this.extra.has(piece);
  }
}
