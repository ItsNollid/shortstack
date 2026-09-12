// Visibility is a choice the user must always be able to make and understand (Required Minimum
// Functionality for uploads), so the wording lives beside the other shared copy.
import type { Privacy } from './queue';

export const PRIVACY_OPTIONS: ReadonlyArray<{ value: Privacy; label: string; hint: string }> = [
  { value: 'public', label: 'Public', hint: 'Anyone can watch it. Only public videos can be scheduled.' },
  { value: 'unlisted', label: 'Unlisted', hint: 'Only people with the link can watch it. Uploaded straight away, not scheduled.' },
  { value: 'private', label: 'Private', hint: 'Only you can watch it. Uploaded straight away, not scheduled.' }
];

export function privacyHint(privacy: Privacy): string {
  return PRIVACY_OPTIONS.find((option) => option.value === privacy)?.hint ?? '';
}
