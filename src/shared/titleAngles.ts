// The kinds of title the local model offers, so the channel's own numbers can say which kind works.
//
// Three, because they are the three ways a clip on a channel like this gets titled: what someone said or
// how they took it, what happened in the game, or the joke in it. Closed, because a style only the model
// can name is a style Analytics cannot count.

export const TITLE_ANGLES = ['reaction', 'play', 'joke'] as const;
export type TitleAngle = (typeof TITLE_ANGLES)[number];

/** Above each offered title. */
export const ANGLE_LABELS: Record<TitleAngle, string> = {
  reaction: 'The reaction',
  play: 'The play',
  joke: 'The joke'
};

/** Inside a sentence: "titles about the reaction". */
export const ANGLE_NOUNS: Record<TitleAngle, string> = {
  reaction: 'the reaction',
  play: 'the play',
  joke: 'the joke'
};

/** What the model is told each kind means. */
export const ANGLE_BRIEFS: Record<TitleAngle, string> = {
  reaction: 'what someone says or how they react, often as a quote',
  play: 'what happens in the game',
  joke: 'the funny side of the clip'
};

export const isTitleAngle = (value: unknown): value is TitleAngle =>
  typeof value === 'string' && (TITLE_ANGLES as readonly string[]).includes(value);

/** Shared words out of all the words in either title, at or above which an edit keeps the style. */
const KEEP_OVERLAP = 0.5;

const words = (title: string): Set<string> =>
  new Set(
    title
      .toLowerCase()
      .replace(/['’]/g, '')
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word !== '')
  );

/**
 * Whether a title, once edited, is still the one its style was recorded for. A typo fixed or a word
 * added keeps it; a title written over does not, and counting that under the old style would teach
 * Analytics the wrong lesson.
 */
export function keepsAngle(before: string, after: string): boolean {
  const was = words(before);
  const now = words(after);
  if (was.size === 0 || now.size === 0) return false;
  let shared = 0;
  for (const word of was) if (now.has(word)) shared += 1;
  return shared / new Set([...was, ...now]).size >= KEEP_OVERLAP;
}

/** The kinds in the order to offer them: the one this channel's numbers favour first, when they favour one. */
export function orderAngles(leader: TitleAngle | null): TitleAngle[] {
  return leader === null ? [...TITLE_ANGLES] : [leader, ...TITLE_ANGLES.filter((angle) => angle !== leader)];
}
