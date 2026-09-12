import { describe, expect, it } from 'vitest';
import type { QueueEvent } from '../main/domain/queueState';
import {
  ACTIVITY_ACTIONS,
  actorOf,
  activityText,
  activityLabel,
  isProblem,
  type ActivityAction
} from './activityCopy';

// Compile-time guard: any event the state machine can log must have copy here. Adding an event
// without a label would fail this line, not surface as a blank row in History.
type Unlabelled = Exclude<QueueEvent['type'], ActivityAction>;
const _everyEventIsLabelled: Unlabelled extends never ? true : never = true;

describe('activity copy', () => {
  it('labels every action the state machine records', () => {
    expect(_everyEventIsLabelled).toBe(true);
    for (const action of ACTIVITY_ACTIONS) {
      expect(activityLabel(action).length).toBeGreaterThan(0);
      expect(activityLabel(action)).not.toContain('_');
    }
  });

  it('separates what ShortStack did from what the user did', () => {
    expect(actorOf('approve')).toBe('you');
    expect(actorOf('reject')).toBe('you');
    expect(actorOf('edit_metadata')).toBe('you');
    expect(actorOf('auto_slot')).toBe('shortstack');
    expect(actorOf('begin_upload')).toBe('shortstack');
    expect(actorOf('upload_completed')).toBe('shortstack');
  });

  it('falls back to readable text for an action it has never seen', () => {
    expect(activityLabel('something_new')).toBe('something new');
    expect(actorOf('something_new')).toBe('you');
  });

  it('marks the actions that mean something went wrong', () => {
    expect(isProblem('upload_failed')).toBe(true);
    expect(isProblem('missed_slot')).toBe(true);
    expect(isProblem('approve')).toBe(false);
  });
});

describe('activityText', () => {
  it('shows the detail, which is the sentence written when it happened', () => {
    expect(activityText('upload_failed', 'Upload failed: network unreachable')).toBe(
      'Upload failed: network unreachable'
    );
    expect(activityText('auto_slot', 'Automatically scheduled to publish at 18:00')).toBe(
      'Automatically scheduled to publish at 18:00'
    );
  });

  it('falls back to the label when no detail was recorded', () => {
    expect(activityText('approve', null)).toBe('Approved');
    expect(activityText('approve', '   ')).toBe('Approved');
  });
});
