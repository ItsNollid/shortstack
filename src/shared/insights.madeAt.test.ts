import { describe, expect, it } from 'vitest';
import { parseBrief } from './insights';

describe('when saved findings were made', () => {
  it('keeps the date they were worked out', () => {
    const raw = JSON.stringify({ usable: [], missing: [], videoCount: 12, tooEarly: true, madeAt: '2026-09-18T10:00:00.000Z' });
    expect(parseBrief(raw)?.madeAt).toBe('2026-09-18T10:00:00.000Z');
  });

  it('reads findings saved before the date was kept, without one', () => {
    const raw = JSON.stringify({ usable: [], missing: [], videoCount: 12, tooEarly: true });
    expect(parseBrief(raw)).not.toHaveProperty('madeAt');
  });
});
