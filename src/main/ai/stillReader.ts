// Asks the local model what one still shows. One frame per request on purpose: measured on
// qwen3-vl:8b, one frame took 3 seconds and three took 29, so five stills asked about one at a time is
// quicker than two asked about together — and each answer stands on its own evidence.
import { SCENES, parseStillReading, type StillReading } from '../../shared/videoReading';
import { generateJson, type AiResult, type OllamaDeps } from './ollamaClient';

/**
 * The scene descriptions are what made the verdict on the opening right. Without "scenery behind a player
 * list is still a lobby", the Black Ops 3 lobby — a campfire in a forest — came back as gameplay.
 */
export function stillPrompt(): string {
  return [
    'You are looking at one still frame from a YouTube Short on a gaming channel. Captions may be laid over the frame; judge what is behind them.',
    'Reply with only a JSON object with these keys:',
    `"scene": exactly one of ${SCENES.map((scene) => `"${scene}"`).join(', ')} — what fills the frame.`,
    '  gameplay: the game being played, seen as the player sees it.',
    '  lobby: a waiting room, party screen, player list or server browser before a match. Scenery behind a player list is still a lobby.',
    '  menu: a game menu, a settings screen or a game launcher.',
    '  loading: a loading screen.',
    '  black: black or nearly empty, apart from any captions.',
    '  face: mostly a person or a webcam.',
    '  text: mostly words or a title card, not counting captions.',
    '  other: none of these, such as a desktop or a web page.',
    '"appeal": a whole number from 1 to 5 — how likely this frame is to make someone stop scrolling if it were the cover. 5 is clear action or a striking moment; 1 is nothing happening.',
    '"what": what is happening, in at most 12 words. Never use a player name, gamertag or anything typed in chat.'
  ].join('\n');
}

export interface StillQuestion {
  model: string;
  thinking?: boolean;
  image: Buffer;
  part: string;
  time: number | null;
}

export async function readStill(question: StillQuestion, deps: OllamaDeps): Promise<AiResult<StillReading>> {
  const answer = await generateJson(
    {
      model: question.model,
      prompt: stillPrompt(),
      images: [question.image.toString('base64')],
      thinking: question.thinking,
      // Low: this is a description of evidence, not writing.
      temperature: 0.1
    },
    deps
  );
  if (!answer.ok) return answer;
  const reading = parseStillReading(answer.value);
  return reading === null
    ? { ok: false, code: 'bad_output', reason: 'The model did not describe the still in a usable way' }
    : { ok: true, value: { part: question.part, time: question.time, ...reading } };
}
