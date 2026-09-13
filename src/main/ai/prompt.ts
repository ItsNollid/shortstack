// What the model is actually told. The first version passed a filename and nothing else, so it was
// guessing: it had never seen the video and had no idea what this channel's descriptions look like.
// Everything here exists to replace guessing with evidence.
import { tagVocabulary, withoutOneOffTags, type TagVocabulary } from '../../shared/channelTags';
import type { PastUpload } from '../../shared/pastUploads';

export interface VideoFacts {
  /** The long video this Short was cut from, when the person has said. */
  sourceTitle?: string | null;
  filename: string;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  /** The game, when the user has said. Named rather than guessed at. */
  game?: string | null;
  /** Whatever is already in the form, which is often the best clue about the subject. */
  currentTitle?: string;
  currentDescription?: string;
}

export interface PromptInput {
  video: VideoFacts;
  channelName: string | null;
  /** Published videos from this channel, used as examples of its voice and its tag vocabulary. */
  examples: readonly PastUpload[];
  /** True when frames are being sent alongside, so the prompt can refer to them. */
  hasFrames: boolean;
  /**
   * What this channel's own numbers say about titles and topics. Measured elsewhere; passed in as
   * finished sentences so the model writing a title is told what has actually worked here, rather
   * than being left to infer it from four examples.
   */
  findings?: readonly { statement: string }[];
  /** Names never to use, given so the model avoids them in the first place. They are removed afterwards either way. */
  blockedNames?: readonly string[];
}


const EXAMPLE_LIMIT = 4;
/** Long enough to show the pattern, short enough to leave the model room to think. */
const EXAMPLE_DESCRIPTION_CHARS = 600;

const truncate = (value: string, limit: number): string =>
  value.length <= limit ? value : `${value.slice(0, limit)}…`;

function renderExamples(examples: readonly PastUpload[], vocabulary: TagVocabulary): string[] {
  const usable = examples.filter((example) => example.title.trim() !== '').slice(0, EXAMPLE_LIMIT);
  if (usable.length === 0) return [];

  const lines = [
    'Here are real uploads from this channel. Match their voice, their formatting and the kind of',
    'words they use. This is the single most important instruction: the new metadata should look as',
    'though the same person wrote it.',
    ''
  ];
  usable.forEach((example, index) => {
    lines.push(`--- Example ${index + 1} ---`);
    lines.push(`Title: ${example.title}`);
    // Shown with the one-video hashtags removed. Asking a model not to copy what it can see does
    // not work: given an example ending in #round100 it put #round50 on a lobby screen, and a
    // blunter instruction only changed which number it invented.
    const description = withoutOneOffTags(example.description.trim(), vocabulary);
    if (description !== '') lines.push(`Description: ${truncate(description, EXAMPLE_DESCRIPTION_CHARS)}`);
    if (example.tags.length > 0) lines.push(`Tags: ${example.tags.join(', ')}`);
    lines.push('');
  });
  return lines;
}

function renderVideo(video: VideoFacts, hasFrames: boolean): string[] {
  const lines = ['--- The new video ---', `File name: ${video.filename}`];
  // Named, not guessed. Shown the same lobby frame four times, qwen3-vl:8b answered The Last of Us,
  // Left 4 Dead, ARK and The Forest — so when the user has said, the model is told and not asked.
  if (video.game !== undefined && video.game !== null && video.game.trim() !== '') {
    lines.push(`Game: ${video.game.trim()}`);
  }
  if (video.sourceTitle !== undefined && video.sourceTitle !== null && video.sourceTitle.trim() !== '') {
    // Context, not a title to copy: a Short has to make sense to someone who never saw the long video.
    lines.push(`Cut from the long video: ${video.sourceTitle.trim()}`);
  }
  if (video.durationSeconds !== null) lines.push(`Length: ${Math.round(video.durationSeconds)} seconds`);
  if (video.width !== null && video.height !== null) lines.push(`Frame: ${video.width}x${video.height}`);
  if (video.currentTitle !== undefined && video.currentTitle.trim() !== '') {
    lines.push(`Working title: ${video.currentTitle.trim()}`);
  }
  if (video.currentDescription !== undefined && video.currentDescription.trim() !== '') {
    lines.push(`Existing description: ${truncate(video.currentDescription.trim(), EXAMPLE_DESCRIPTION_CHARS)}`);
  }
  const knowsGame = video.game !== undefined && video.game !== null && video.game.trim() !== '';
  lines.push(
    hasFrames
      ? knowsGame
        ? 'Still frames from this video are attached, in the order they happen. The game is already named above and is correct — do not contradict it. Use the frames for the map, the mode and what is happening.'
        : 'Still frames from this video are attached, in the order they happen. Look at them: name the game, the map or mode, and what is happening.'
      : knowsGame
        ? 'No frames are available. The game above is correct; work from it, the file name and the examples.'
        : 'No frames are available, so work from the file name and the examples.'
  );
  lines.push('');
  return lines;
}

export function buildPrompt(input: PromptInput): string {
  const channel = input.channelName ?? 'this channel';
  const vocabulary = tagVocabulary(input.examples.map((example) => example.description));
  const examples = renderExamples(input.examples, vocabulary);

  return [
    `You write titles, descriptions and tags for YouTube Shorts on the channel "${channel}".`,
    '',
    ...examples,
    ...renderVideo(input.video, input.hasFrames),
    // Placed after the video and before the instructions, so it reads as "and here is what works
    // here" rather than as another example to copy from.
    ...((input.findings ?? []).length > 0
      ? [
          '--- What has worked on this channel ---',
          ...(input.findings ?? []).map((finding) => `- ${finding.statement}`),
          'These were measured from this channel. Write in a way that fits them.',
          ''
        ]
      : []),
    '--- What to write ---',
    'Title: under 100 characters. Same voice as the examples. No surrounding quotes, no "Title:" prefix.',
    // No description. On this channel it is a block of hashtags for search and nothing else, and
    // asked to write one the model copied old hashtags, invented round numbers or wrote "#gaming".
    // It is assembled in code from the game, these topics and the channel's habits instead.
    'Topics: 3 to 6 things someone would actually search for about this clip, one or two words each — a play, a mode, a map, a weapon, a joke. They become hashtags, so keep them short and specific. Leave out the name of the game, which is added separately, and leave out anything generic like "gaming", "funny moments" or "epic", and filler like "moment", "scene" or "clip".',
    // Measured: shown a lobby with a player list, the model offered the channel's own name and a
    // friend's gamertag as topics and tags. Visible, yes; searched for, never; and not ours to use.
    'Never use a name read off the screen — player names, gamertags, usernames, channel names, or anything typed in chat. They are visible, but nobody searches for them, and they belong to other people. This applies to topics and tags alike.',
    ...((input.blockedNames ?? []).length > 0
      ? [`In particular, never use any of these names, in the title, the topics or the tags: ${(input.blockedNames ?? []).join(', ')}.`]
      : []),
    'Tags: 10 to 20 search phrases someone would actually type. Specific beats broad: name the game and the mode rather than "gaming".',
    'Do not invent facts you cannot see: no round numbers, scores or map names unless they are on screen. If you are unsure which game it is, describe what is happening instead of naming the wrong one.',
    '',
    'Reply with only a JSON object with the keys "title", "topics" and "tags", where "topics" is an array of 3 to 6 strings and "tags" is an array of at least 10 strings. No other text.'
  ].join('\n');
}
