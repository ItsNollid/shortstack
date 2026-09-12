import { describe, expect, it } from 'vitest';
import { areaPath, linePath, niceMax, plotPoints } from './chart';

describe('niceMax', () => {
  it('rounds up to something a person would choose', () => {
    expect(niceMax([487])).toBe(500);
    expect(niceMax([12])).toBe(20);
    expect(niceMax([1])).toBe(1);
    expect(niceMax([2100])).toBe(2500);
  });

  it('never returns zero, so nothing is ever divided by it', () => {
    expect(niceMax([])).toBe(1);
    expect(niceMax([0, 0])).toBe(1);
  });

  it('ignores negatives rather than inverting the scale', () => {
    expect(niceMax([-5, 3])).toBe(5);
  });
});

describe('plotPoints', () => {
  const area = { width: 100, height: 50 };

  it('spreads the values across the full width', () => {
    const points = plotPoints([1, 2, 3], area, 3);
    expect(points.map(([x]) => x)).toEqual([0, 50, 100]);
  });

  it('puts the largest value at the top and zero on the baseline', () => {
    const points = plotPoints([0, 10], area, 10);
    expect(points[0]?.[1]).toBe(50);
    expect(points[1]?.[1]).toBe(0);
  });

  it('leaves room below when asked', () => {
    const points = plotPoints([0], { width: 100, height: 50, padding: 10 }, 10);
    expect(points[0]?.[1]).toBe(40);
  });

  it('centres a lone value instead of pinning it to the left edge', () => {
    expect(plotPoints([5], area, 10)[0]?.[0]).toBe(50);
  });

  it('has nothing to draw for no values', () => {
    expect(plotPoints([], area)).toEqual([]);
  });
});

describe('paths', () => {
  it('draws a line through every point', () => {
    expect(linePath([[0, 10], [5, 0]])).toBe('M0,10 L5,0');
  });

  it('closes the area down to the baseline', () => {
    expect(areaPath([[0, 10], [5, 0]], 20)).toBe('M0,10 L5,0 L5,20 L0,20 Z');
  });

  it('draws nothing rather than an empty path element', () => {
    expect(linePath([])).toBe('');
    expect(areaPath([], 20)).toBe('');
  });
});
