// Turning a square channel picture into the round icon Windows shows. Pure: pixels in, pixels out,
// so the shape and the edges can be tested without Electron, a window, or a network.

/** Electron's nativeImage.toBitmap() hands back BGRA; PNG wants RGBA. */
export function bgraToRgba(bgra: Buffer): Buffer {
  const rgba = Buffer.allocUnsafe(bgra.length);
  for (let index = 0; index < bgra.length; index += 4) {
    rgba[index] = bgra[index + 2] as number;
    rgba[index + 1] = bgra[index + 1] as number;
    rgba[index + 2] = bgra[index] as number;
    rgba[index + 3] = bgra[index + 3] as number;
  }
  return rgba;
}

/**
 * Masks a square RGBA image to a circle, with a soft edge so it does not look sawn out at 16px.
 * Alpha ramps across the last pixel of the radius rather than switching, which is what stops the
 * staircase on small icons.
 */
export function circleMask(rgba: Buffer, size: number, inset = 0): Buffer {
  const out = Buffer.from(rgba);
  const centre = (size - 1) / 2;
  const radius = size / 2 - inset;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x - centre, y - centre);
      const coverage = Math.min(1, Math.max(0, radius - distance + 0.5));
      const alpha = out[(y * size + x) * 4 + 3] as number;
      out[(y * size + x) * 4 + 3] = Math.round(alpha * coverage);
    }
  }
  return out;
}

/** A flat square of one colour, used as the ground for a badge or a placeholder. */
export function solidRgba(size: number, colour: { r: number; g: number; b: number }): Buffer {
  const rgba = Buffer.alloc(size * size * 4);
  for (let index = 0; index < rgba.length; index += 4) {
    rgba[index] = colour.r;
    rgba[index + 1] = colour.g;
    rgba[index + 2] = colour.b;
    rgba[index + 3] = 0xff;
  }
  return rgba;
}

/**
 * A Windows .ico wrapping one or more PNGs. Vista onwards reads PNG-compressed entries directly,
 * so the images go in untouched: no BMP conversion, no palette.
 */
export function icoFromPngs(entries: ReadonlyArray<{ size: number; png: Buffer }>): Buffer {
  if (entries.length === 0) throw new Error('An .ico needs at least one image');
  if (entries.some((entry) => entry.size < 1 || entry.size > 256)) {
    throw new Error('.ico images must be between 1 and 256 pixels');
  }

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(16 * entries.length);
  let offset = header.length + directory.length;

  entries.forEach((entry, index) => {
    const at = index * 16;
    // 256 is written as 0: the field is one byte and 256 does not fit in it.
    directory[at] = entry.size === 256 ? 0 : entry.size;
    directory[at + 1] = entry.size === 256 ? 0 : entry.size;
    directory[at + 2] = 0; // colours in palette
    directory[at + 3] = 0; // reserved
    directory.writeUInt16LE(1, at + 4); // colour planes
    directory.writeUInt16LE(32, at + 6); // bits per pixel
    directory.writeUInt32LE(entry.png.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += entry.png.length;
  });

  return Buffer.concat([header, directory, ...entries.map((entry) => entry.png)]);
}

/** YouTube avatar URLs carry their size in the path; asking for the size we need avoids upscaling
 *  an 88px thumbnail into a 256px icon. */
export function avatarUrlAtSize(url: string, size: number): string {
  return /=s\d+[^/]*$/.test(url) ? url.replace(/=s\d+[^/]*$/, `=s${size}-c-k-no-rj`) : url;
}
