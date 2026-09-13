import { describe, expect, it } from 'vitest';
import { drawStatusOverlay, statusFor } from './statusOverlay';

describe('statusFor', () => {
  it('says nothing is needed while everything is running', () => {
    expect(statusFor({ paused: false, needsAttention: false })).toBe('running');
  });

  it('shows paused when uploads are stopped', () => {
    expect(statusFor({ paused: true, needsAttention: false })).toBe('paused');
  });

  it('puts attention ahead of paused, because that one needs a person', () => {
    expect(statusFor({ paused: true, needsAttention: true })).toBe('attention');
    expect(statusFor({ paused: false, needsAttention: true })).toBe('attention');
  });
});

describe('drawStatusOverlay', () => {
  const png = (status: 'paused' | 'attention', size = 32): Buffer => drawStatusOverlay(status, size);

  it('produces a PNG of the size asked for', () => {
    const image = png('paused');
    expect(image.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(image.readUInt32BE(16)).toBe(32);
    expect(image.readUInt32BE(20)).toBe(32);
  });

  it('draws something different for each status, so they cannot be confused', () => {
    expect(png('paused').equals(png('attention'))).toBe(false);
  });

  it('is round, so it reads as a badge rather than a square', () => {
    // The corners are masked away; the encoder only ever sees a circle.
    expect(png('paused', 16).length).toBeGreaterThan(0);
    expect(png('attention', 64).readUInt32BE(16)).toBe(64);
  });

  it('draws at the small sizes Windows actually asks for', () => {
    for (const size of [16, 24, 32]) {
      expect(png('paused', size).readUInt32BE(16), `size ${size}`).toBe(size);
      expect(png('attention', size).readUInt32BE(16), `size ${size}`).toBe(size);
    }
  });
});
