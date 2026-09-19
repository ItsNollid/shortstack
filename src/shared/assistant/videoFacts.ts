// What the assistant may say about one video: where it stands, and what ShortStack's own checks found. The
// creator's own words — the title, what was said — are quoted and labelled, so a title that reads like an
// instruction is still read as a title.
import type { QueueItemDTO } from '../dto';
import { presentAttention, presentState, shortsWarning } from '../presentation';
import { SCENE_NOUNS, joinScenes } from '../sceneCopy';
import { ANGLE_LABELS } from '../titleAngles';
import { checkTitleAgainstScreen } from '../titlePromise';
import type { VideoReport } from '../videoReading';
import type { AssistantFact } from './types';

export type VideoFactsItem = Pick<
  QueueItemDTO,
  | 'title'
  | 'description'
  | 'tags'
  | 'state'
  | 'attention_code'
  | 'last_error'
  | 'next_attempt_at'
  | 'title_angle'
  | 'duration_s'
  | 'width'
  | 'height'
  | 'game'
  | 'posting_kind'
>;

/** The creator's words inside double quotes, with their own double quotes softened so the quotation stays whole. */
const quote = (text: string): string => `"${text.replace(/"/g, "'")}"`;

const fact = (id: string, text: string): AssistantFact => ({ id, text, derived: false });

export function videoFacts(item: VideoFactsItem, report: VideoReport | null, speech: string | null): AssistantFact[] {
  const state = presentState(item.state, item.attention_code);
  const facts: AssistantFact[] = [
    fact('video-state', `Where it stands: ${state.label}. ${state.hint}`),
    fact('video-title', `The creator’s title: ${quote(item.title)}.`),
    fact(
      'video-kind',
      item.posting_kind === 'rotation' ? 'This posting is a re-run of a video already posted.' : 'This posting is the first time this video goes out.'
    )
  ];
  if (item.title_angle !== null) facts.push(fact('video-angle', `The title is of the kind "${ANGLE_LABELS[item.title_angle]}".`));
  if (item.game !== null) facts.push(fact('video-game', `The game: ${quote(item.game)}.`));
  if (item.description.trim() === '') facts.push(fact('video-no-description', 'It has no description yet.'));
  if (item.tags.length === 0) facts.push(fact('video-no-tags', 'It has no tags yet.'));
  const warning = shortsWarning(item.duration_s, item.width, item.height);
  if (warning !== null) facts.push(fact('video-not-short', warning));

  if (report === null) {
    facts.push(fact('video-unread', 'ShortStack has not looked at the stills of this video yet.'));
  } else {
    if (report.hook !== null) {
      facts.push(
        fact(
          'video-hook',
          report.hook.weak
            ? `The first second shows ${SCENE_NOUNS[report.hook.scene]}, with nothing happening yet — a weak opening.`
            : `The first second already shows ${SCENE_NOUNS[report.hook.scene]}: ${report.hook.what}`
        )
      );
    }
    if (report.cover !== null) {
      facts.push(fact('video-cover', `The best cover frame found shows ${SCENE_NOUNS[report.cover.scene]}: ${report.cover.what}`));
    }
    const mismatch = checkTitleAgainstScreen(item.title, report);
    if (mismatch !== null) {
      facts.push(
        fact(
          'video-title-mismatch',
          `The title promises ${quote(mismatch.promise)}, but the ${mismatch.stills} stills looked at show only ${joinScenes(mismatch.shown)}.`
        )
      );
    }
  }
  if (speech !== null && speech.trim() !== '') facts.push(fact('video-speech', `What is said in it, heard by ShortStack: ${quote(speech)}`));
  return facts;
}

/** Why a video that failed or needs a look is where it is, and what would move it. */
export function stuckFacts(item: VideoFactsItem): AssistantFact[] {
  const facts: AssistantFact[] = [];
  if (item.attention_code !== null) {
    const attention = presentAttention(item.attention_code);
    facts.push(fact('stuck-reason', `Why it is stuck: ${attention.label}. ${attention.hint}`));
    if (attention.action !== null) facts.push(fact('stuck-action', `What would fix it: ${attention.action}.`));
  }
  if (item.last_error !== null) facts.push(fact('stuck-error', `The last error was: ${quote(item.last_error)}.`));
  if (item.next_attempt_at !== null) facts.push(fact('stuck-retry', `ShortStack will try again at ${item.next_attempt_at}.`));
  return facts;
}
