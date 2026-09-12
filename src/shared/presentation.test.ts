import { describe, expect, it } from 'vitest';
import { ATTENTION_CODES, QUEUE_STATES } from './queue';
import {
  formatDuration,
  formatFileSize,
  formatRelativeTime,
  presentAttention,
  presentState,
  shortsWarning
} from './presentation';

describe('presentState', () => {
  it('has copy for every state the backend can produce', () => {
    for (const state of QUEUE_STATES) {
      const shown = presentState(state);
      expect(shown.label.length).toBeGreaterThan(0);
      expect(shown.hint.length).toBeGreaterThan(0);
    }
  });

  it('never says "YouTube" in a way that claims to be YouTube itself', () => {
    // Branding policy III.I.1: describing the service is fine, impersonating it is not.
    for (const state of QUEUE_STATES) {
      expect(presentState(state).label.toLowerCase()).not.toContain('youtube studio');
    }
  });

  it('replaces the generic attention label with the specific problem', () => {
    const generic = presentState('needs_attention');
    const specific = presentState('needs_attention', 'file_missing');
    expect(generic.label).not.toEqual(specific.label);
    expect(specific.label).toBe('File missing');
    expect(specific.tone).toBe('attention');
  });

  it('ignores an attention code on states that are not asking for attention', () => {
    expect(presentState('published', 'file_missing').label).toBe('Published');
  });
});

describe('presentAttention', () => {
  it('has copy for every attention code', () => {
    for (const code of ATTENTION_CODES) {
      const shown = presentAttention(code);
      expect(shown.label.length).toBeGreaterThan(0);
      expect(shown.hint.length).toBeGreaterThan(0);
    }
  });

  it('warns about double-posting for the codes where a retry is dangerous', () => {
    for (const code of ['possible_duplicate', 'legacy_unrecorded_upload'] as const) {
      expect(presentAttention(code).action).toContain('Link the video');
    }
  });
});

describe('formatDuration', () => {
  it('pads seconds', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(9)).toBe('0:09');
    expect(formatDuration(600)).toBe('10:00');
  });

  it('shows a dash rather than lying about unknown durations', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(-1)).toBe('—');
    expect(formatDuration(Number.NaN)).toBe('—');
  });
});

describe('formatFileSize', () => {
  it('keeps small numbers readable and large ones short', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(157 * 1024 * 1024)).toBe('157 MB');
    expect(formatFileSize(3 * 1024 * 1024 * 1024)).toBe('3.0 GB');
  });

  it('shows a dash for unknown sizes', () => {
    expect(formatFileSize(null)).toBe('—');
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-03-01T12:00:00.000Z');

  it('describes the future and the past', () => {
    expect(formatRelativeTime('2026-03-01T15:00:00.000Z', now)).toContain('3 hour');
    expect(formatRelativeTime('2026-02-27T12:00:00.000Z', now)).toContain('2 day');
  });

  it('handles missing and unparseable timestamps', () => {
    expect(formatRelativeTime(null, now)).toBe('—');
    expect(formatRelativeTime('not a date', now)).toBe('—');
  });
});

describe('shortsWarning', () => {
  it('flags clips YouTube will not treat as Shorts', () => {
    expect(shortsWarning(200, 1080, 1920)).toContain('3 minutes');
    expect(shortsWarning(30, 1920, 1080)).toContain('Landscape');
  });

  it('stays quiet for a vertical clip under three minutes', () => {
    expect(shortsWarning(45, 1080, 1920)).toBeNull();
    expect(shortsWarning(null, null, null)).toBeNull();
  });
});
