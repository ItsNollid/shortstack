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
    version: '1.3.0',
    date: '2026-09-18',
    headline: 'Suggestions that have watched and listened, a Review page that finishes a video, and posting to TikTok and Instagram',
    changes: [
      'ShortStack looks at stills from across a video: it offers a cover frame from the moments that are actually play rather than a menu, and says whether the first second shows anything worth staying for.',
      'A title that promises a kill, a clutch or a fail is checked against what those stills show, so a title the video does not deliver is pointed out before you publish it.',
      'Titles are offered as options of different kinds — a question, a number, a plain claim — and Analytics works out which kind your channel does best with, so later suggestions lean that way.',
      'Re-runs can be drafted afresh, under a title that posting has never gone out with before, instead of repeating the one that already ran.',
      'ShortStack can listen to what is said in a video and use it for titles, all on this computer. It stays off until you switch it on, and the engine and the model are downloaded from Settings, which says which one suits your computer.',
      'Post to TikTok and Instagram with the same help YouTube gets: a copy of the video in the format each one takes, the details laid out to paste, their site opened for you, and the link to your post kept with the video afterwards. Choose per video, or switch it on for everything new.',
      'The Review page now holds everything the queue does — title, description, tags, visibility, publish time, platforms and every check — so a video can be finished there and never opened again.',
      'A suggested description or set of tags can be added to the start or the end of what you already wrote, instead of only replacing it.',
      'One button fills the calendar: every video without a time gets the next free one from your daily times, listed before anything changes and undone from the message afterwards. It never approves or uploads anything.',
      'Your channel details are confirmed with YouTube while ShortStack is connected, and deleted if access is taken away or a month goes by without confirming them. The privacy policy always said so; now the app does it.',
      'Findings on Analytics are labelled as ShortStack’s own calculations rather than YouTube’s figures, and Settings only accepts an Ollama address on this computer, which is what the privacy policy promises.',
      'An update arrives as one release rather than two half-finished ones.'
    ],
    legal: [
      'Listening is new. With it switched on, the sound of a video is turned into text by whisper.cpp on this computer, and what was said is kept here with the video. None of it is uploaded anywhere.',
      'Posting to TikTok and Instagram is new. ShortStack makes a copy of the video in the format those platforms take, keeps it on this computer, and opens their sites in your browser for you to post. It never signs in to them or sends them anything itself.',
      'Downloading a listening engine or model contacts GitHub and Hugging Face, and only when you ask for that download. Nothing from your videos goes with it.',
      'The policy now says what your analytics are used for: ShortStack works out findings from them for you alone, labels them as its own estimates, and gives them only to the model on your computer. They are never shared, sold or used to train an AI model.'
    ]
  },
  {
    version: '1.2.0',
    date: '2026-09-13',
    headline: 'Descriptions, tags and titles you can trust, and a schedule you can change from anywhere',
    changes: [
      'Descriptions are built from hashtags for the game and what happens in the clip, and tags from the ways the game is spelled, instead of being written by the model. Nothing names another game or someone on your never-use list.',
      'Say which game a video is, and the model stops guessing from the picture. Say which long video a Short was cut from — paste its link and ShortStack gets the title from YouTube — and the model gets the context and the Studio steps include it as the related video.',
      'A checker under every description finds spelling, grammar and hashtag mistakes — repeats, commas, another app’s hashtags, a hashtag YouTube cuts short — with Fix all and Undo.',
      'Choose which details automatic drafting writes, and list names it must never use, such as friends’ gamertags read off the screen.',
      'Set or change a video’s publish time from the video itself or in Review, not only by dragging it on the Calendar.',
      'Videos uploaded in YouTube Studio are noticed while the scheduler is paused, a desktop reminder comes when one is due within two hours, and looking for them costs a few hundred units a day instead of more than half your allowance.',
      'Analytics goes deeper, works out what your own videos have in common, and can suggest changes you apply with one button. It pulls when you press Refresh or on a timer you choose, instead of every time the page opens.',
      'Settings shows how much of the daily YouTube allowance is left and what it still buys, and can keep Shorts from the same long video from all going out on one day.',
      'House style for titles and descriptions — capitals, a prefix or suffix, a footer, a hashtag limit — all optional, and one button brings videos already waiting into line.',
      'A saved setting that can no longer be used is shown with the reason, instead of being quietly ignored. A description footer saved before the 40-hashtag limit can be put back and cleaned up.',
      'The local model no longer times out on models that think before answering, and suggestions are written with your channel’s own recent findings in mind.',
      'Only the newest three database backups are kept, and dialogs are announced by name to screen readers.'
    ]
  },
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
