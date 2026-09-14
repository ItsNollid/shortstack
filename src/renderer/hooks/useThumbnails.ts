// Draws the stills for every video that has none yet, one at a time in the background. Chromium is
// already decoding these files for the preview, so the frames come from the same place; this does it
// once per file and hands the results to the main process to keep.
//
// One pass produces two things from the same seeks: the small PNG poster the lists show, and a
// larger JPEG strip the local model reads. Decoding these files is the expensive part, so doing it
// twice for the same frames would be wasteful.
import { useEffect, useRef } from 'react';

const POSTER_WIDTH = 216;
/** Wide enough that a model can read a scoreboard or a killfeed, which is often the only clue. */
const STILL_WIDTH = 512;
const STILL_QUALITY = 0.82;
/** Matches MAX_FRAMES in src/main/media/frames.ts. */
const STILL_COUNT = 3;
const PER_VIDEO_TIMEOUT_MS = 20_000;

/**
 * Several points rather than one. Any single moment can land on a fade or a cut: a fixed second in
 * produced frames averaging 20 of 255, and a quarter of the way in produced one that was pure black.
 * Sampling and keeping the liveliest frame is the difference between a thumbnail and a dark square.
 */
const SAMPLE_POINTS = [0.15, 0.35, 0.55, 0.75];

/**
 * The opening, in seconds, and deliberately not the liveliest moments: whether the first second of a
 * Short holds a viewer is decided by what is actually there, fade and all. Matches MAX_OPENING_FRAMES.
 */
const OPENING_SECONDS = [0.25, 1];

interface Sample {
  poster: Uint8Array | null;
  still: Uint8Array | null;
  score: number;
  time: number;
}

export interface Stills {
  poster: Uint8Array | null;
  strip: Uint8Array[];
  /** Seconds into the video for each strip still, in the same order. */
  times: number[];
  opening: Uint8Array[];
  openingTimes: number[];
  duration: number | null;
}

const encode = async (canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Uint8Array | null> => {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  return blob === null ? null : new Uint8Array(await blob.arrayBuffer());
};

const seekTo = async (video: HTMLVideoElement, seconds: number): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('seek timed out')), 5000);
    video.onseeked = () => {
      window.clearTimeout(timer);
      resolve();
    };
    video.currentTime = seconds;
  });

/**
 * How much there is to look at: average brightness, reduced when the frame is nearly one flat
 * colour, so a blown-out white card does not beat an actual scene.
 */
function interest(pixels: Uint8ClampedArray): number {
  let total = 0;
  let min = 255;
  let max = 0;
  for (let index = 0; index < pixels.length; index += 16) {
    const value = (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3;
    total += value;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const average = total / (pixels.length / 16);
  const range = max - min;
  return average * Math.min(1, range / 64);
}

async function drawStills(queueId: number): Promise<Stills> {
  const nothing: Stills = { poster: null, strip: [], times: [], opening: [], openingTimes: [], duration: null };
  const video = document.createElement('video');
  // Must be set before src, and is what makes the frames readable back out of the canvas.
  video.crossOrigin = 'anonymous';
  video.src = `ss-media://video/${queueId}`;
  video.muted = true;
  video.preload = 'auto';

  const overall = window.setTimeout(() => video.removeAttribute('src'), PER_VIDEO_TIMEOUT_MS);

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('could not decode'));
      video.load();
    });

    if (video.videoWidth === 0 || video.videoHeight === 0) return nothing;
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const latest = Math.max(0, duration - 0.1);
    const shape = (width: number): HTMLCanvasElement => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = Math.round((width * video.videoHeight) / video.videoWidth);
      return canvas;
    };

    const small = shape(POSTER_WIDTH);
    const large = shape(STILL_WIDTH);
    const smallContext = small.getContext('2d', { willReadFrequently: true });
    const largeContext = large.getContext('2d');
    if (smallContext === null || largeContext === null) return nothing;

    const samples: Sample[] = [];
    for (const point of SAMPLE_POINTS) {
      const time = Math.min(duration * point, latest);
      try {
        await seekTo(video, time);
      } catch {
        continue;
      }
      smallContext.drawImage(video, 0, 0, small.width, small.height);
      const score = interest(smallContext.getImageData(0, 0, small.width, small.height).data);

      // The poster only needs encoding when this frame is the best so far; the strip wants them all.
      const best = samples.reduce((top, sample) => Math.max(top, sample.score), -1);
      const poster = score > best ? await encode(small, 'image/png') : null;
      largeContext.drawImage(video, 0, 0, large.width, large.height);
      samples.push({ poster, still: await encode(large, 'image/jpeg', STILL_QUALITY), score, time: video.currentTime });
    }

    const opening: Uint8Array[] = [];
    const openingTimes: number[] = [];
    for (const second of OPENING_SECONDS) {
      if (second > latest) break;
      try {
        await seekTo(video, second);
      } catch {
        continue;
      }
      largeContext.drawImage(video, 0, 0, large.width, large.height);
      const still = await encode(large, 'image/jpeg', STILL_QUALITY);
      if (still === null) continue;
      opening.push(still);
      openingTimes.push(video.currentTime);
    }

    // Keep the liveliest few, but hand them over in the order they happen: a model reading three
    // stills should be seeing the video move forward, not shuffled.
    const withStills = samples.filter((sample) => sample.still !== null);
    const keep = new Set([...withStills].sort((left, right) => right.score - left.score).slice(0, STILL_COUNT));
    const kept = withStills.filter((sample) => keep.has(sample));

    // A poster is only encoded when its frame beats everything before it, so the last one is the best.
    const posters = samples.map((sample) => sample.poster).filter((poster) => poster !== null);

    return {
      poster: posters.at(-1) ?? null,
      strip: kept.map((sample) => sample.still as Uint8Array),
      times: kept.map((sample) => sample.time),
      opening,
      openingTimes,
      duration: duration > 0 ? duration : null
    };
  } catch {
    return nothing;
  } finally {
    window.clearTimeout(overall);
    video.removeAttribute('src');
    video.load();
  }
}

/**
 * Runs once per mount and works through whatever is missing. Sequential on purpose: decoding several
 * videos at once competes with the one the user is actually looking at.
 */
export function useThumbnailBackfill(enabled: boolean): void {
  const running = useRef(false);

  useEffect(() => {
    if (!enabled || running.current) return;
    running.current = true;
    let cancelled = false;

    void (async () => {
      const missing = await window.api.thumbnailsMissing();
      if (!missing.ok) return;

      for (const queueId of missing.data) {
        if (cancelled) return;
        const { poster, strip, times, opening, openingTimes, duration } = await drawStills(queueId);
        if (poster !== null) await window.api.thumbnailSave(queueId, poster);
        if (strip.length > 0) await window.api.framesSave(queueId, strip, { times, opening, openingTimes, duration });
      }
    })().finally(() => {
      running.current = false;
    });

    return () => {
      cancelled = true;
    };
  }, [enabled]);
}
