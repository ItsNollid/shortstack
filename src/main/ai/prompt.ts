// What the model is actually told. The first version passed a filename and nothing else, so it was
// guessing: it had never seen the video and had no idea what this channel's descriptions look like.
// Everything here exists to replace guessing with evidence.
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
}


const EXAMPLE_LIMIT = 4;
/** Long enough to show the pattern, short enough to leave the model room to think. */
const EXAMPLE_DESCRIPTION_CHARS = 600;

const truncate = (value: string, limit: number): string =>
  value.length <= limit ? value : `${value.slice(0, limit)}…`;

function renderExamples(examples: readonly PastUpload[]): string[] {
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
    if (example.description.trim() !== '') {
      lines.push(`Description: ${truncate(example.description.trim(), EXAMPLE_DESCRIPTION_CHARS)}`);
    }
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
      ? 'Still frames from this video are attached. Look at them: name the game, the map or mode, and what is happening.'
      : 'No frames are available, so work from the file name and the examples.'
  );
  lines.push('');
  return lines;
}

export function buildPrompt(input: PromptInput): string {
  const channel = input.channelName ?? 'this channel';
  const examples = renderExamples(input.examples);

  return [
    `You write titles, descriptions and tags for YouTube Shorts on the channel "${channel}".`,
    '',
    ...examples,
    ...renderVideo(input.video, input.hasFrames),
    '--- What to write ---',
    'Title: under 100 characters. Same voice as the examples. No surrounding quotes, no "Title:" prefix.',
    examples.length > 0
      ? 'Description: copy the shape of the example descriptions exactly. If they are blocks of hashtags, write a block of hashtags for this video, using the specific game, map, mode and topic rather than generic words.'
      : 'Description: a short line about the video, then a block of specific hashtags covering the game, map, mode and topic.',
    'Tags: 10 to 20 search phrases someone would actually type. Specific beats broad: name the game and the mode rather than "gaming".',
    'Do not invent facts you cannot see. If you are unsure which game it is, describe what is happening instead of naming the wrong one.',
    '',
    'Reply with only a JSON object with the keys "title", "description" and "tags" (an array of strings). No other text.'
  ].join('\n');
}
