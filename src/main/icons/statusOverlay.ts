// The small badge Windows draws in the corner of the taskbar button. It used to be the channel
// picture, which the button already shows — a picture on top of the same picture. It now carries
// what the icon cannot: whether ShortStack is stopped or wants something.
import { encodePng } from '../brandIcon';
import { circleMask, solidRgba } from './circle';

export type IconStatus = 'running' | 'paused' | 'attention';

const PAUSE = { r: 0xf5, g: 0xb9, b: 0x4a };
const ATTENTION = { r: 0xff, g: 0x6b, b: 0x61 };
const INK = { r: 0x0f, g: 0x0f, b: 0x0f };

/** Which badge, if any, a given state deserves. Attention outranks paused: it needs a person. */
export function statusFor(state: { paused: boolean; needsAttention: boolean }): IconStatus {
  if (state.needsAttention) return 'attention';
  return state.paused ? 'paused' : 'running';
}

const setPixel = (rgba: Buffer, size: number, x: number, y: number, colour: { r: number; g: number; b: number }): void => {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const at = (y * size + x) * 4;
  rgba[at] = colour.r;
  rgba[at + 1] = colour.g;
  rgba[at + 2] = colour.b;
};

const fillRect = (
  rgba: Buffer,
  size: number,
  x: number,
  y: number,
  width: number,
  height: number,
  colour: { r: number; g: number; b: number }
): void => {
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) setPixel(rgba, size, column, row, colour);
  }
};

/**
 * A filled circle with a mark on it, at the size Windows asks for overlays. Drawn by hand because
 * the app has no image library and does not need one for two glyphs.
 */
export function drawStatusOverlay(status: Exclude<IconStatus, 'running'>, size = 32): Buffer {
  const colour = status === 'paused' ? PAUSE : ATTENTION;
  const rgba = solidRgba(size, colour);

  if (status === 'paused') {
    // Two bars.
    const barWidth = Math.max(2, Math.round(size * 0.13));
    const barHeight = Math.round(size * 0.4);
    const top = Math.round((size - barHeight) / 2);
    const gap = Math.max(2, Math.round(size * 0.1));
    fillRect(rgba, size, Math.round(size / 2) - gap / 2 - barWidth, top, barWidth, barHeight, INK);
    fillRect(rgba, size, Math.round(size / 2) + gap / 2, top, barWidth, barHeight, INK);
  } else {
    // An exclamation: a stem and a dot.
    const stemWidth = Math.max(2, Math.round(size * 0.13));
    const stemHeight = Math.round(size * 0.32);
    const left = Math.round((size - stemWidth) / 2);
    fillRect(rgba, size, left, Math.round(size * 0.22), stemWidth, stemHeight, INK);
    fillRect(rgba, size, left, Math.round(size * 0.62), stemWidth, stemWidth, INK);
  }

  return encodePng(size, size, circleMask(rgba, size));
}
