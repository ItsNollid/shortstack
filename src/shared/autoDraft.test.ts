import { describe, expect, it } from 'vitest';
import type { QueueItemDTO } from './dto';
import { canAutoDraft, draftSkipReason, pickForDraft } from './autoDraft';

const item = (over: Partial<QueueItemDTO> = {}): QueueItemDTO =>
  ({
    id: 1,
    state: 'pending',
    missing: false,
    ai_drafted_at: null,
    metadata_edited_at: null,
    ...over
  }) as QueueItemDTO;

describe('draftSkipReason', () => {
  it('drafts a scanned video nobody has touched', () => {
    expect(draftSkipReason(item(), true)).toBeNull();
    expect(draftSkipReason(item({ state: 'approved' }), true)).toBeNull();
  });

  it('does nothing at all when the setting is off', () => {
    expect(draftSkipReason(item(), false)).toBe('off');
  });

  // The rule the whole feature rests on: what a person wrote is theirs.
  it('never writes over details someone edited', () => {
    expect(draftSkipReason(item({ metadata_edited_at: '2026-09-12T10:00:00.000Z' }), true)).toBe('edited');
  });

  it('does not draft the same posting twice', () => {
    expect(draftSkipReason(item({ ai_drafted_at: '2026-09-12T10:00:00.000Z' }), true)).toBe('drafted');
  });

  it('leaves alone anything already on its way to YouTube', () => {
    for (const state of ['awaiting_manual_upload', 'uploading', 'uploaded', 'scheduled', 'published'] as const) {
      expect(draftSkipReason(item({ state }), true), state).toBe('state');
    }
  });

  it('leaves alone what is rejected, failed or waiting on a decision', () => {
    for (const state of ['rejected', 'failed', 'needs_attention'] as const) {
      expect(draftSkipReason(item({ state }), true), state).toBe('state');
    }
  });

  it('skips a file that is no longer on disk', () => {
    expect(draftSkipReason(item({ missing: true }), true)).toBe('missing');
  });
});

describe('pickForDraft', () => {
  const queue = [
    item({ id: 3 }),
    item({ id: 1 }),
    item({ id: 2, metadata_edited_at: '2026-09-12T10:00:00.000Z' }),
    item({ id: 4 })
  ];

  it('takes the oldest first, so a scanned folder is worked through in order', () => {
    expect(pickForDraft(queue, true, 2).map((entry) => entry.id)).toEqual([1, 3]);
  });

  it('respects the limit and the setting', () => {
    expect(pickForDraft(queue, true, 10)).toHaveLength(3);
    expect(pickForDraft(queue, true, 0)).toEqual([]);
    expect(pickForDraft(queue, false, 10)).toEqual([]);
  });
});

describe('canAutoDraft', () => {
  it('is the same question, asked as a yes or no', () => {
    expect(canAutoDraft(item(), true)).toBe(true);
    expect(canAutoDraft(item({ missing: true }), true)).toBe(false);
  });
});
