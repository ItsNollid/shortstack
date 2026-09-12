// Draws the ShortStack mark and encodes it as PNG, with no image library and no binary asset in
// the repository. The old build passed nativeImage.createEmpty() to the tray, which is why the
// tray icon was invisible.
import * as zlib from 'zlib';

/** Deliberately not a play button: YouTube's branding guidelines forbid a confusable mark. */
export const BRAND_CORAL = { r: 0xff, g: 0x4e, b: 0x45 };
const INK = { r: 0xf1, g: 0xf1, b: 0xf1 };

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, payload: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), payload]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, checksum]);
}

/** Encodes straight RGBA pixels as a PNG. */
export function encodePng(width: number, height: number, rgba: Buffer): Buffer {
  if (rgba.length !== width * height * 4) throw new Error('Pixel buffer does not match the given size');

  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/** A coral rounded square with three stacked bars: short clips, stacked up. */
export function drawBrandIcon(size: number): Buffer {
  const pixels = Buffer.alloc(size * size * 4);
  const radius = size * 0.22;
  const barHeight = Math.max(1, Math.round(size * 0.1));
  const barGap = Math.max(1, Math.round(size * 0.07));
  const barsTop = Math.round(size * 0.27);
  const barLeft = Math.round(size * 0.26);
  const barRight = size - barLeft;

  const insideRoundedSquare = (x: number, y: number): boolean => {
    const nearestX = Math.min(Math.max(x, radius), size - radius);
    const nearestY = Math.min(Math.max(y, radius), size - radius);
    const dx = x - nearestX;
    const dy = y - nearestY;
    return dx * dx + dy * dy <= radius * radius;
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      if (!insideRoundedSquare(x + 0.5, y + 0.5)) continue;

      let colour = BRAND_CORAL;
      for (let bar = 0; bar < 3; bar += 1) {
        const top = barsTop + bar * (barHeight + barGap);
        if (y >= top && y < top + barHeight && x >= barLeft && x < barRight) colour = INK;
      }
      pixels[offset] = colour.r;
      pixels[offset + 1] = colour.g;
      pixels[offset + 2] = colour.b;
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

export function brandIconPng(size: number): Buffer {
  return encodePng(size, size, drawBrandIcon(size));
}
