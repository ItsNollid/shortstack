import * as zlib from 'zlib';
import { describe, expect, it } from 'vitest';
import { BRAND_CORAL, brandIconPng, drawBrandIcon, encodePng } from './brandIcon';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pixelAt = (pixels: Buffer, size: number, x: number, y: number) => {
  const offset = (y * size + x) * 4;
  return { r: pixels[offset], g: pixels[offset + 1], b: pixels[offset + 2], a: pixels[offset + 3] };
};

describe('encodePng', () => {
  it('writes a real PNG with the right header', () => {
    const png = encodePng(2, 2, Buffer.alloc(16, 255));
    expect(png.subarray(0, 8)).toEqual(PNG_SIGNATURE);
    expect(png.toString('latin1', 12, 16)).toBe('IHDR');
    expect(png.readUInt32BE(16)).toBe(2);
    expect(png.readUInt32BE(20)).toBe(2);
    expect(png[24]).toBe(8);
    expect(png[25]).toBe(6);
    expect(png.subarray(png.length - 8, png.length - 4).toString('latin1')).toBe('IEND');
  });

  it('round-trips the pixels through the compressed data', () => {
    const size = 4;
    const pixels = drawBrandIcon(size);
    const png = encodePng(size, size, pixels);
    const start = png.indexOf(Buffer.from('IDAT', 'latin1')) + 4;
    const length = png.readUInt32BE(start - 8);
    const raw = zlib.inflateSync(png.subarray(start, start + length));
    // One filter byte per row, then the row's pixels.
    expect(raw.length).toBe((size * 4 + 1) * size);
    expect(raw[0]).toBe(0);
    expect(raw.subarray(1, 1 + size * 4)).toEqual(pixels.subarray(0, size * 4));
  });

  it('refuses a pixel buffer that does not match the size', () => {
    expect(() => encodePng(2, 2, Buffer.alloc(4))).toThrow(/does not match/);
  });
});

describe('brand mark', () => {
  it('is coral in the body and transparent at the corners', () => {
    const size = 64;
    const pixels = drawBrandIcon(size);
    const middleLeft = pixelAt(pixels, size, 4, size / 2);
    expect(middleLeft).toMatchObject({ ...BRAND_CORAL, a: 255 });
    expect(pixelAt(pixels, size, 0, 0).a).toBe(0);
  });

  it('draws three light bars across the mark', () => {
    const size = 64;
    const pixels = drawBrandIcon(size);
    const column = size / 2;
    let bands = 0;
    let inBand = false;
    for (let y = 0; y < size; y += 1) {
      const light = pixelAt(pixels, size, column, y).r > 200 && pixelAt(pixels, size, column, y).g > 200;
      if (light && !inBand) bands += 1;
      inBand = light;
    }
    expect(bands).toBe(3);
  });

  it('renders at every size the app and installer need', () => {
    for (const size of [16, 24, 32, 48, 256, 512]) {
      const png = brandIconPng(size);
      expect(png.subarray(0, 8)).toEqual(PNG_SIGNATURE);
      expect(png.readUInt32BE(16)).toBe(size);
    }
  });
});
