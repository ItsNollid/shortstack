// Draws a poster frame for every video that has none yet, one at a time in the background.
// Chromium is already decoding these files for the preview, so the frame comes from the same place;
// this does it once per file and hands the result to the main process to keep.
import { useEffect, useRef } from 'react';

const FRAME_WIDTH = 216;
const PER_VIDEO_TIMEOUT_MS = 15_000;

/**
 * Several points rather than one. Any single moment can land on a fade or a cut: a fixed second in
 * produced frames averaging 20 of 255, and a quarter of the way in produced one that was pure black.
 * Sampling and keeping the liveliest frame is the difference between a thumbnail and a dark square.
 */
const SAMPLE_POINTS = [0.15, 0.35, 0.55, 0.75];

interface Frame {
  png: Uint8Array;
  score: number;
}

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

async function drawPoster(queueId: number): Promise<Uint8Array | null> {
  const video = document.createElement('video');
  // Must be set before src, and is what makes the frame readable back out of the canvas.
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

    if (video.videoWidth === 0 || video.videoHeight === 0) return null;
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;

    const canvas = document.createElement('canvas');
    canvas.width = FRAME_WIDTH;
    canvas.height = Math.round((FRAME_WIDTH * video.videoHeight) / video.videoWidth);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) return null;

    let best: Frame | null = null;
    for (const point of SAMPLE_POINTS) {
      try {
        await seekTo(video, Math.min(duration * point, Math.max(0, duration - 0.1)));
      } catch {
        continue;
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const score = interest(context.getImageData(0, 0, canvas.width, canvas.height).data);
      if (best !== null && score <= best.score) continue;

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (blob !== null) best = { png: new Uint8Array(await blob.arrayBuffer()), score };
    }
    return best?.png ?? null;
  } catch {
    return null;
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
        const png = await drawPoster(queueId);
        if (png !== null) await window.api.thumbnailSave(queueId, png);
      }
    })().finally(() => {
      running.current = false;
    });

    return () => {
      cancelled = true;
    };
  }, [enabled]);
}
