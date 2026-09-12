import { describe, expect, it } from 'vitest';
import { approvalPlan, type ApprovalSubject } from './consent';

const item = (over: Partial<ApprovalSubject> = {}): ApprovalSubject => ({
  id: 1,
  title: 'A clip',
  privacy: 'public',
  scheduled_for: null,
  ...over
});

describe('approvalPlan', () => {
  it('promises no automatic upload in assisted mode', () => {
    const plan = approvalPlan([item()], 'assisted', 'My Channel');
    expect(plan.actions.join(' ')).toContain('walk you through uploading');
    expect(plan.actions.join(' ')).toContain('without you doing it yourself');
    expect(plan.actions.join(' ')).not.toContain('without asking again');
  });

  it('says plainly that API mode uploads without asking again, and names the channel', () => {
    const plan = approvalPlan([item()], 'api', 'My Channel');
    expect(plan.actions[0]).toContain('My Channel');
    expect(plan.actions[0]).toContain('without asking again');
  });

  it('falls back to a neutral phrase when no channel name is known', () => {
    expect(approvalPlan([item()], 'api', null).actions[0]).toContain('your connected channel');
  });

  it('mentions automatic slots only for public videos that have no time yet', () => {
    expect(approvalPlan([item()], 'api', 'C').usesAutomaticSlots).toBe(true);
    expect(approvalPlan([item({ scheduled_for: '2026-04-01T10:00:00.000Z' })], 'api', 'C').usesAutomaticSlots).toBe(false);
    expect(approvalPlan([item({ privacy: 'private' })], 'api', 'C').usesAutomaticSlots).toBe(false);
  });

  it('counts the affected videos when a selection is mixed', () => {
    const plan = approvalPlan(
      [item({ id: 1 }), item({ id: 2, scheduled_for: '2026-04-01T10:00:00.000Z' }), item({ id: 3, privacy: 'unlisted' })],
      'api',
      'C'
    );
    expect(plan.actions.join(' ')).toContain('1 of them get the next free time');
    expect(plan.actions.join(' ')).toContain('1 of them are unlisted or private');
  });
});
