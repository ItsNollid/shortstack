// Whether a title promises something to watch that the stills say is not there.
//
// Titles on this channel are mostly a line someone says, or a joke — "ALRIGHT GUYS IM GOING TO BED",
// "Thank you Donald J Trump" — and those fit whatever is on screen. Asking the model whether a title
// "fits" would flag every one of them. So the check is narrow and in code: a few words that only make
// sense describing play, against the scenes the model already reported, and only when no still shows
// play at all. Five stills can miss one moment in a clip full of play; they cannot miss play entirely.
import { COVER_SCENES, type Scene, type VideoReport } from './videoReading';

/** Words that describe something happening in a game. Case does not matter. */
const PROMISES: readonly RegExp[] = [
  /\bclutch(?:ed|ing)?\b/i,
  /\b1\s?v\s?[1-9]\b/i,
  /\baced?\b/i,
  /\bhead ?shots?\b/i,
  /\b(?:no|quick) ?scoped?\b/i,
  /\btrick ?shots?\b/i,
  /\bspeed ?run(?:s|ning)?\b/i,
  /\bworld record\b/i,
  /\b(?:double|triple|quad|penta|multi) ?kills?\b/i,
  /\bkill ?streaks?\b/i,
  /\bnuked?\b/i,
  /\bhigh rounds?\b/i,
  /\bround \d{2,3}\b/i,
  /\beaster ?eggs?\b/i,
  /\bboss ?fights?\b/i,
  /\bcomeback\b/i,
  /\bflawless\b/i,
  /\bvictory royale\b/i,
  /\bsnip(?:e|ed|ing)\b/i,
  /\bgameplay\b/i
];

/** The first words in a title that promise play, exactly as they are written there, or null. */
export function titlePromise(title: string): string | null {
  let first: { at: number; text: string } | null = null;
  for (const pattern of PROMISES) {
    const match = pattern.exec(title);
    if (match !== null && (first === null || match.index < first.at)) first = { at: match.index, text: match[0] };
  }
  return first?.text ?? null;
}

export interface TitleScreenMismatch {
  /** The words in the title that promise play. */
  promise: string;
  /** How many stills were looked at. */
  stills: number;
  /** What they showed instead, in the order the video shows it. */
  shown: Scene[];
}

/** Fewer stills than this say too little about a whole clip for their silence to mean anything. */
const MIN_STILLS = 3;

export function checkTitleAgainstScreen(title: string, report: VideoReport | null): TitleScreenMismatch | null {
  if (report === null || report.stills.length < MIN_STILLS) return null;
  // A face reacting counts as showing play: that is what a reaction is to.
  if (report.stills.some((still) => COVER_SCENES.has(still.scene))) return null;
  const promise = titlePromise(title);
  if (promise === null) return null;
  const inOrder = [...report.stills].sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
  return { promise, stills: report.stills.length, shown: [...new Set(inOrder.map((still) => still.scene))] };
}
