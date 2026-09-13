import { describe, expect, it } from 'vitest';
import { DRAFT_FIELDS, checkDraftFields, describeDraftFields, toggleDraftField } from './draftFields';

describe('checkDraftFields', () => {
  it('accepts any non-empty choice of the three', () => {
    expect(checkDraftFields(['title', 'description', 'tags'])).toBeNull();
    expect(checkDraftFields(['description'])).toBeNull();
    expect(checkDraftFields(['tags', 'title'])).toBeNull();
  });

  // Drafting nothing is what the switch is for; an empty choice with the switch on would fail quietly.
  it('refuses an empty choice', () => {
    expect(checkDraftFields([])).toMatch(/at least one/);
  });

  it('refuses anything that is not one of the three', () => {
    expect(checkDraftFields(['title', 'thumbnail'])).toMatch(/Only the title, description and tags/);
  });

  it('refuses the same one twice', () => {
    expect(checkDraftFields(['tags', 'tags'])).toMatch(/only be chosen once/);
  });
});

describe('describeDraftFields', () => {
  it('reads naturally for one, two or all three', () => {
    expect(describeDraftFields(['tags'])).toBe('tags');
    expect(describeDraftFields(['description', 'tags'])).toBe('a description and tags');
    expect(describeDraftFields(['title', 'description', 'tags'])).toBe('a title, a description and tags');
  });

  it('always names them in the order they appear on a video', () => {
    expect(describeDraftFields(['tags', 'title'])).toBe('a title and tags');
  });

  it('says nothing is written when nothing is chosen', () => {
    expect(describeDraftFields([])).toBe('nothing');
  });
});

describe('toggleDraftField', () => {
  it('unticks one that was ticked, and ticks one that was not', () => {
    expect(toggleDraftField(['title', 'description', 'tags'], 'title')).toEqual(['description', 'tags']);
    expect(toggleDraftField(['description'], 'tags')).toEqual(['description', 'tags']);
  });

  it('keeps the choice in display order however it was built', () => {
    expect(toggleDraftField(['tags'], 'title')).toEqual(['title', 'tags']);
  });

  it('starts from all three, in order', () => {
    expect(DRAFT_FIELDS).toEqual(['title', 'description', 'tags']);
  });
});
