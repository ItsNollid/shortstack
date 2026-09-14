import { describe, expect, it } from 'vitest';
import { approvalPlan } from './consent';

const item = (platforms?: Array<'youtube' | 'tiktok' | 'instagram'>) => ({ id: 1, title: 'Clip', privacy: 'public' as const, scheduled_for: '2026-09-15T18:00:00.000Z', platforms });

describe('approving a video that also goes to TikTok or Instagram', () => {
  it('says the person posts it there themselves, and that nothing is posted for them', () => {
    const plan = approvalPlan([item(['youtube', 'tiktok', 'instagram'])], 'assisted', 'Nollid');
    expect(plan.actions).toContain('You post it to TikTok and Instagram yourself: ShortStack makes a file they take and writes the caption. Nothing is posted there for you.');
  });

  it('names only the platforms in the selection', () => {
    const plan = approvalPlan([item(['youtube']), item(['youtube', 'instagram'])], 'assisted', 'Nollid');
    expect(plan.actions).toContain('You post them to Instagram yourself: ShortStack makes a file it takes and writes the caption. Nothing is posted there for you.');
  });

  it('says nothing about other platforms for a YouTube-only video', () => {
    expect(approvalPlan([item(['youtube']), item()], 'api', 'Nollid').actions.join(' ')).not.toContain('TikTok');
  });
});
