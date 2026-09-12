import { describe, expect, it } from 'vitest';
import { encodePng } from '../brandIcon';
import { avatarUrlAtSize, bgraToRgba, circleMask, icoFromPngs, solidRgba } from './circle';

const WHITE = { r: 0xff, g: 0xff, b: 0xff };
const alphaAt = (rgba: Buffer, size: number, x: number, y: number): number =>
  rgba[(y * size + x) * 4 + 3] as number;

describe('bgraToRgba', () => {
  it('swaps the blue and red channels and leaves alpha alone', () => {
    const bgra = Buffer.from([0x11, 0x22, 0x33, 0x44]);
    expect([...bgraToRgba(bgra)]).toEqual([0x33, 0x22, 0x11, 0x44]);
  });
});

describe('circleMask', () => {
  const size = 32;
  const masked = circleMask(solidRgba(size, WHITE), size);

  it('keeps the middle and removes the corners', () => {
    expect(alphaAt(masked, size, 16, 16)).toBe(255);
    expect(alphaAt(masked, size, 0, 0)).toBe(0);
    expect(alphaAt(masked, size, size - 1, 0)).toBe(0);
    expect(alphaAt(masked, size, size - 1, size - 1)).toBe(0);
  });

  it('softens the edge instead of cutting it, which is what avoids a staircase at 16px', () => {
    const small = circleMask(solidRgba(16, WHITE), 16);
    const edges: number[] = [];
    for (let x = 0; x < 16; x += 1) edges.push(alphaAt(small, 16, x, 8));
    expect(edges.some((alpha) => alpha > 0 && alpha < 255)).toBe(true);
  });

  it('leaves colour untouched, only alpha', () => {
    expect(masked[(16 * size + 16) * 4]).toBe(0xff);
    expect(masked[(16 * size + 16) * 4 + 1]).toBe(0xff);
    expect(masked[(16 * size + 16) * 4 + 2]).toBe(0xff);
  });

  it('respects an inset, so a ring can be drawn outside the picture', () => {
    const inset = circleMask(solidRgba(size, WHITE), size, 4);
    expect(alphaAt(inset, size, 1, 16)).toBe(0);
    expect(alphaAt(masked, size, 1, 16)).toBeGreaterThan(0);
  });

  it('does not change the buffer it was given', () => {
    const source = solidRgba(8, WHITE);
    const before = Buffer.from(source);
    circleMask(source, 8);
    expect(source.equals(before)).toBe(true);
  });
});

describe('icoFromPngs', () => {
  const png16 = encodePng(16, 16, circleMask(solidRgba(16, WHITE), 16));
  const png256 = encodePng(256, 256, circleMask(solidRgba(256, WHITE), 256));

  it('writes a header Windows will accept', () => {
    const ico = icoFromPngs([{ size: 16, png: png16 }]);
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(1);
    expect(ico[6]).toBe(16);
    expect(ico.readUInt32LE(6 + 8)).toBe(png16.length);
    expect(ico.readUInt32LE(6 + 12)).toBe(22);
  });

  it('records 256 as zero, because the field is one byte wide', () => {
    const ico = icoFromPngs([{ size: 256, png: png256 }]);
    expect(ico[6]).toBe(0);
    expect(ico[7]).toBe(0);
  });

  it('points each entry at its own bytes', () => {
    const ico = icoFromPngs([
      { size: 16, png: png16 },
      { size: 256, png: png256 }
    ]);
    const firstOffset = ico.readUInt32LE(6 + 12);
    const secondOffset = ico.readUInt32LE(6 + 16 + 12);
    expect(firstOffset).toBe(6 + 32);
    expect(secondOffset).toBe(firstOffset + png16.length);
    expect(ico.subarray(secondOffset, secondOffset + png256.length).equals(png256)).toBe(true);
  });

  it('refuses sizes it cannot record', () => {
    expect(() => icoFromPngs([])).toThrow();
    expect(() => icoFromPngs([{ size: 512, png: png256 }])).toThrow();
  });
});

describe('avatarUrlAtSize', () => {
  it('asks YouTube for the size the icon actually needs', () => {
    expect(avatarUrlAtSize('https://yt3.googleusercontent.com/abc=s88-c-k-c0x00ffffff-no-rj', 256)).toBe(
      'https://yt3.googleusercontent.com/abc=s256-c-k-no-rj'
    );
  });

  it('leaves a URL alone when it carries no size', () => {
    const plain = 'https://example.test/avatar.png';
    expect(avatarUrlAtSize(plain, 256)).toBe(plain);
  });
});
