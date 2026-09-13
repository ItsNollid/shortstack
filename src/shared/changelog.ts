// What changed, in the app rather than in a file nobody opens. Typed rather than Markdown so the
// "what have I not read yet" question is answerable, and so a release that changes the terms says
// so in the same place it says everything else.
import { compareVersions, isNewer } from './version';

export interface ChangelogEntry {
  version: string;
  /** ISO date. Shown, and used for nothing else, so an approximate one is fine. */
  date: string;
  headline: string;
  changes: readonly string[];
  /**
   * Set when this release changed the privacy policy or terms. The app re-asks for agreement on
   * its own whenever LEGAL_VERSION moves; this is what tells the person why they are being asked.
   */
  legal?: readonly string[];
}

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    version: '1.1.0',
    date: '2026-09-13',
    headline: 'Suggestions that have seen the video, and drafting that runs on its own',
    changes: [
      'Suggestions now go to the model with your channel’s own recent uploads as examples, the video’s details, and three stills taken from across the clip — instead of just the file name.',
      'Models are chosen from a list of what Ollama has installed, marked by whether they can see the video, with a button that loads one and tells you if it will not run.',
      'A new switch drafts titles, descriptions and tags for new videos automatically. It never writes over details you have edited yourself.',
      'The calendar marks videos YouTube is holding, so a time it has agreed to is no longer indistinguishable from a plan kept on this computer.',
      'Reusing the details of a video you published before, from a searchable list of your past uploads.',
      'Settings shows which build you are running, and the launcher closes the app before rebuilding it.'
    ]
  },
  {
    version: '1.0.0',
    date: '2026-09-12',
    headline: 'First working version',
    changes: [
      'Watches a folder of finished Shorts, and nothing leaves it without your approval.',
      'Schedules by dragging onto a calendar, with YouTube publishing at the time even when this computer is off.',
      'Re-posts videos on a rotation without notifying subscribers, so the same video reaches new people.',
      'Uploads either through YouTube Studio with ShortStack guiding you, or directly once your API audit passes.'
    ],
    legal: ['The privacy policy and terms of use were published for the first time.']
  }
];

/** Newest first, which is the order it is written in and the order it should be read in. */
export const sortedChangelog = (entries: readonly ChangelogEntry[] = CHANGELOG): ChangelogEntry[] =>
  [...entries].sort((left, right) => compareVersions(right.version, left.version));

/**
 * Entries the person has not seen. A null lastSeen means a fresh install rather than an upgrade —
 * showing someone the entire history of an app they have just met is noise, so it shows nothing.
 */
export function unseenEntries(
  currentVersion: string,
  lastSeen: string | null,
  entries: readonly ChangelogEntry[] = CHANGELOG
): ChangelogEntry[] {
  if (lastSeen === null) return [];
  return sortedChangelog(entries).filter(
    (entry) => isNewer(entry.version, lastSeen) && compareVersions(entry.version, currentVersion) <= 0
  );
}

/** The legal notes out of a set of entries, which is what a re-agreement screen should explain. */
export const legalChangesIn = (entries: readonly ChangelogEntry[]): string[] =>
  entries.flatMap((entry) => [...(entry.legal ?? [])]);
