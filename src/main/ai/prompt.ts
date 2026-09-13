// What the model is actually told. The first version passed a filename and nothing else, so it was
// guessing: it had never seen the video and had no idea what this channel's descriptions look like.
// Everything here exists to replace guessing with evidence.
import { tagVocabulary, withoutOneOffTags, type TagVocabulary } from '../../shared/channelTags';
import type { PastUpload } from '../../shared/pastUploads';

export interface VideoFacts {
  filename: string;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
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
  if (video.durationSeconds !== null) lines.push(`Length: ${Math.round(video.durationSeconds)} seconds`);
  if (video.width !== null && video.height !== null) lines.push(`Frame: ${video.width}x${video.height}`);
  if (video.currentTitle !== undefined && video.currentTitle.trim() !== '') {
    lines.push(`Working title: ${video.currentTitle.trim()}`);
  }
  if (video.currentDescription !== undefined && video.currentDescription.trim() !== '') {
    lines.push(`Existing description: ${truncate(video.currentDescription.trim(), EXAMPLE_DESCRIPTION_CHARS)}`);
  }
  lines.push(
    hasFrames
      ? 'Still frames from this video are attached, in the order they happen. Look at them: name the game, the map or mode, and what is happening.'
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
    examples.length > 0
      ? 'Description: copy the shape of the example descriptions exactly, and use at least as many hashtags as they do. If they are blocks of hashtags, write a block of hashtags for this video, using the specific game, map, mode and topic rather than generic words.'
      : 'Description: a short line about the video, then a block of at least ten specific hashtags covering the game, map, mode and topic.',
    'Tags: 10 to 20 search phrases someone would actually type. Specific beats broad: name the game and the mode rather than "gaming".',
    ...(vocabulary.standing.length > 0
      ? [
          `This channel puts these on everything, so they belong here too: ${vocabulary.standing.join(' ')}`,
          'Every other hashtag has to be something you can actually see. Do not invent a round number, a map name or a score.'
        ]
      : examples.length > 0
        ? ['The hashtags in the examples belong to those videos. Reuse one only if it is also true of this one.']
        : []),
    'Do not invent facts you cannot see. If you are unsure which game it is, describe what is happening instead of naming the wrong one.',
    '',
    'Reply with only a JSON object with the keys "title", "description" and "tags", where "tags" is an array of at least 10 strings. No other text.'
  ].join('\n');
}
