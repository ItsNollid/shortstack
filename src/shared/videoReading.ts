// What the local model made of a video's stills, and what ShortStack concludes from it.
//
// The model is only asked what one still shows: a scene from a closed list, how likely the frame is to
// stop someone scrolling, and a few words. The conclusions are drawn here — which still makes the best
// cover, and whether the video opens on something worth staying for.
//
// Not which game it is. Measured on this channel's own clips, the model called the Black Ops 3 Zombies
// lobby Rust, Phasmophobia or Counter-Strike in most stills, and asked to copy out the words on screen
// that named the game, it made those up as well — "Phasmophobia", read off a lobby with no such word on
// it. A game suggested from the picture was wrong more often than right, so the game comes from the
// person and the file name instead.

export const SCENES = ['gameplay', 'menu', 'lobby', 'loading', 'black', 'face', 'text', 'other'] as const;
export type Scene = (typeof SCENES)[number];

/** Where a still came from: "s0" to "s2" from across the clip, "o0" and "o1" from its first second. */
export type StillPart = string;

export interface StillReading {
  part: StillPart;
  /** Seconds into the video, when known. */
  time: number | null;
  scene: Scene;
  /** 1 to 5: how likely this frame is to make someone stop scrolling. */
  appeal: number;
  what: string;
}

export interface CoverChoice {
  part: StillPart;
  time: number | null;
  scene: Scene;
  what: string;
}

export interface HookVerdict {
  /** True when nothing is happening yet in the opening second. */
  weak: boolean;
  scene: Scene;
  what: string;
  time: number | null;
}

export interface VideoReport {
  model: string;
  readAt: string;
  stills: StillReading[];
  cover: CoverChoice | null;
  hook: HookVerdict | null;
}

/** Frames worth a cover: the game being played, or a face reacting to it. */
export const COVER_SCENES: ReadonlySet<Scene> = new Set(['gameplay', 'face']);
/**
 * Openings where nothing has happened yet. A Short that starts on one gives a viewer nothing to stay for.
 * Measured on four of this channel's clips, the verdict matched what is really on screen in all four.
 */
const DEAD_OPENINGS: ReadonlySet<Scene> = new Set(['black', 'loading', 'menu', 'lobby']);
const MAX_WHAT_CHARS = 90;

export const isOpeningStill = (part: StillPart): boolean => part.startsWith('o');

/** What the model said about one still, checked against the closed list, or null when it is not usable. */
export function parseStillReading(raw: unknown): Omit<StillReading, 'part' | 'time'> | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;

  const scene = typeof record.scene === 'string' ? record.scene.trim().toLowerCase() : '';
  if (!(SCENES as readonly string[]).includes(scene)) return null;

  const score = typeof record.appeal === 'number' ? record.appeal : Number(record.appeal);
  const appeal = Number.isFinite(score) ? Math.min(5, Math.max(1, Math.round(score))) : 1;

  const what =
    typeof record.what === 'string'
      ? record.what.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_WHAT_CHARS)
      : '';
  return { scene: scene as Scene, appeal, what };
}

/**
 * The still to use as the cover: the most eye-catching moment of play or reaction. When no still shows
 * either, the most eye-catching of the rest, and the screen says so. Never a black frame.
 */
export function pickCover(stills: readonly StillReading[]): CoverChoice | null {
  const strip = stills.filter((still) => !isOpeningStill(still.part) && still.scene !== 'black');
  if (strip.length === 0) return null;
  const preferred = strip.filter((still) => COVER_SCENES.has(still.scene));
  const pool = preferred.length > 0 ? preferred : strip;
  const best = [...pool].sort((a, b) => b.appeal - a.appeal || (a.time ?? 0) - (b.time ?? 0))[0] as StillReading;
  return { part: best.part, time: best.time, scene: best.scene, what: best.what };
}

/** Whether the first second gives a viewer anything, judged from the stills taken in it. */
export function judgeHook(stills: readonly StillReading[]): HookVerdict | null {
  const opening = stills.filter((still) => isOpeningStill(still.part)).sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
  if (opening.length === 0) return null;
  const weak = opening.every((still) => DEAD_OPENINGS.has(still.scene));
  const shown = weak
    ? (opening[opening.length - 1] as StillReading)
    : (opening.find((still) => !DEAD_OPENINGS.has(still.scene)) as StillReading);
  return { weak, scene: shown.scene, what: shown.what, time: shown.time };
}

export function buildReport(model: string, readAt: string, stills: readonly StillReading[]): VideoReport {
  return { model, readAt, stills: [...stills], cover: pickCover(stills), hook: judgeHook(stills) };
}

/** "0:07", the way Studio's frame picker counts. */
export function clipTime(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return null;
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
