// What ShortStack will do on the user's behalf once they approve, spelled out before they agree.
// YouTube's Developer Policies require express consent and a clear description of those actions,
// so the wording is derived from the actual selection rather than written once and hoped over.
import type { Privacy, UploadMethod } from './queue';

export interface ApprovalSubject {
  id: number;
  title: string;
  privacy: Privacy;
  scheduled_for: string | null;
}

export interface ApprovalPlan {
  /** One line per thing that will happen without further input. */
  actions: string[];
  /** True when at least one video will get a publish time chosen by ShortStack. */
  usesAutomaticSlots: boolean;
}

export function approvalPlan(
  items: readonly ApprovalSubject[],
  uploadMethod: UploadMethod,
  channelTitle: string | null
): ApprovalPlan {
  const channel = channelTitle ?? 'your connected channel';
  const actions: string[] = [];

  const publicItems = items.filter((item) => item.privacy === 'public');
  const otherItems = items.filter((item) => item.privacy !== 'public');
  const undated = publicItems.filter((item) => item.scheduled_for === null);

  if (uploadMethod === 'assisted') {
    actions.push(`ShortStack will prepare each video and walk you through uploading it to ${channel} in YouTube Studio.`);
    actions.push('Nothing is uploaded without you doing it yourself.');
  } else {
    actions.push(`ShortStack will upload each video to ${channel} as private, without asking again.`);
    if (publicItems.length > 0) {
      actions.push('Each public video is then set to publish at its time, by YouTube, even if this computer is off.');
    }
  }

  if (undated.length > 0) {
    actions.push(
      undated.length === items.length
        ? 'Each video gets the next free time from your daily schedule.'
        : `${undated.length} of them get the next free time from your daily schedule.`
    );
  }

  if (otherItems.length > 0) {
    actions.push(
      `${otherItems.length === items.length ? 'These videos are' : `${otherItems.length} of them are`} unlisted or private, so they are uploaded straight away and never scheduled.`
    );
  }

  return { actions, usesAutomaticSlots: undated.length > 0 };
}
