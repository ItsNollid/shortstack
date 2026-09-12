// Enough geometry to draw a small line chart as plain SVG. Pure, so the shapes can be tested, and
// no charting library for one series of daily numbers.

/** A round number at or above the highest value, so the axis reads 0–500 rather than 0–487. */
export function niceMax(values: readonly number[]): number {
  const highest = Math.max(0, ...values);
  if (highest === 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(highest));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= highest) return candidate;
  }
  return 10 * magnitude;
}

export interface PlotArea {
  width: number;
  height: number;
  /** Space left below the line for labels. */
  padding?: number;
}

export function plotPoints(values: readonly number[], area: PlotArea, max = niceMax(values)): Array<[number, number]> {
  const padding = area.padding ?? 0;
  const usable = area.height - padding;
  if (values.length === 0) return [];
  if (values.length === 1) return [[area.width / 2, usable - (values[0] as number) / max * usable]];

  const step = area.width / (values.length - 1);
  return values.map((value, index) => [index * step, usable - (value / max) * usable]);
}

const round = (value: number): string => (Math.round(value * 100) / 100).toString();

export function linePath(points: ReadonlyArray<[number, number]>): string {
  if (points.length === 0) return '';
  return points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${round(x)},${round(y)}`).join(' ');
}

/** The same line closed down to the baseline, for the tinted fill underneath. */
export function areaPath(points: ReadonlyArray<[number, number]>, baseline: number): string {
  if (points.length === 0) return '';
  const first = points[0] as [number, number];
  const last = points[points.length - 1] as [number, number];
  return `${linePath(points)} L${round(last[0])},${round(baseline)} L${round(first[0])},${round(baseline)} Z`;
}
