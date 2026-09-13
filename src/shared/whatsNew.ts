// When to put the changelog in front of someone, and what to mark as read afterwards. Pure, because
// both mistakes here are annoying in opposite directions: showing an update notice on every launch
// forever, or never showing one at all.
import { CHANGELOG, legalChangesIn, unseenEntries, type ChangelogEntry } from './changelog';
import type { AppSettings } from './settings';

export interface WhatsNew {
  /** Entries to put in front of the user. Empty means show nothing. */
  show: ChangelogEntry[];
  /**
   * The version to record as read, or null if there is nothing to record. Written straight away
   * when there is nothing to show — a fresh install has no catching up to do, but must still be
   * marked, or the next update would replay the entire history.
   */
  markSeen: string | null;
}

export function whatsNew(
  settings: AppSettings | null,
  currentVersion: string,
  entries: readonly ChangelogEntry[] = CHANGELOG
): WhatsNew {
  if (settings === null) return { show: [], markSeen: null };
  if (settings.last_seen_version === currentVersion) return { show: [], markSeen: null };

  const show = unseenEntries(currentVersion, settings.last_seen_version, entries);
  return { show, markSeen: currentVersion };
}

/** What to tell someone being asked to agree again, rather than making them diff two documents. */
export function legalChangesSince(
  acceptedVersion: string | null,
  currentVersion: string,
  entries: readonly ChangelogEntry[] = CHANGELOG
): string[] {
  // A first agreement is not a change to explain.
  if (acceptedVersion === null) return [];
  return legalChangesIn(unseenEntries(currentVersion, acceptedVersion, entries));
}
