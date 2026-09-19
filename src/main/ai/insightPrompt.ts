// What the model is told when asked to advise on a channel.
//
// It is never shown the analytics. Everything numeric has already been worked out in
// shared/insights.ts and arrives as finished sentences, because an 8B model asked to find a pattern
// in a table produces confident arithmetic that is wrong, and confident wrong advice about someone's
// channel is worse than no advice.
//
// So its job is narrow: take findings it cannot check and turn them into things to do. The
// instructions are mostly about what it may not do — invent a number, add a fact, or pad the answer
// when the findings are thin.
import { CHANGE_FORMATS, parseAction, type ChannelAction } from '../../shared/channelActions';
import { GOAL_WORDS, type InsightGoal } from '../../shared/insightGoal';
import type { Brief } from '../../shared/insights';

export interface InsightPromptInput {
  brief: Brief;
  channelName: string | null;
  /** What the person is trying to grow, which decides what "better" means. */
  goal: InsightGoal;
  /** How they post, so advice is about what they can actually change. */
  context?: string;
  /** What the schedule is now, so a move can name a time that is actually there. */
  currentTimes?: { newLane: readonly string[]; rotationLane: readonly string[] };
}


export function buildInsightPrompt(input: InsightPromptInput): string {
  const channel = input.channelName ?? 'this channel';
  const lines = [
    `You are advising the person who runs the YouTube Shorts channel "${channel}". They care most about ${GOAL_WORDS[input.goal]}.`,
    '',
    'These findings were measured from their own uploads. They are the only facts you have, and they are already correct — you do not need to check them and you cannot add to them.',
    ''
  ];

  if (input.brief.usable.length === 0) {
    lines.push('There are no usable findings yet. The channel has not posted enough, or has not varied what it does enough, for anything to be measured.');
  } else {
    for (const fact of input.brief.usable) {
      const strength = fact.confidence === 'weak' ? ' (based on few videos, so treat it as a hint)' : '';
      lines.push(`[${fact.id}] ${fact.statement}${strength}`);
    }
  }

  if (input.brief.missing.length > 0) {
    lines.push('', 'These could not be measured yet:');
    for (const fact of input.brief.missing) lines.push(`- ${fact.statement}`);
  }

  if (input.currentTimes !== undefined) {
    lines.push('', `Current posting times — new videos: ${input.currentTimes.newLane.join(', ') || 'none'}; re-runs: ${input.currentTimes.rotationLane.join(', ') || 'none'}.`);
  }

  if (input.context !== undefined && input.context.trim() !== '') {
    lines.push('', 'How they work:', input.context.trim());
  }

  lines.push(
    '',
    `Based on ${input.brief.videoCount} videos.`,
    '',
    '--- What to write ---',
    'Write at most four recommendations. Each one is a thing to do differently, in one or two sentences.',
    'Each carries "basedOn", the label in square brackets of the finding it comes from. Do not restate the finding or repeat its numbers — ShortStack shows the finding itself underneath, word for word, so anything you write about it can only introduce a mistake.',
    'Where a finding is missing, the recommendation is how to find it out — usually by deliberately varying one thing for a few weeks so there is something to compare.',
    'Do not put numbers in your recommendation at all. If a finding says something makes little difference, do not recommend doing it.',
    'Do not give generic YouTube advice. "Post consistently" and "make good thumbnails" are true of every channel and help nobody.',
    'If there is too little to go on, say so in one sentence and recommend only what would produce the missing evidence.',
    '',
    '',
    '--- Changes you may ask for ---',
    'A recommendation may carry a "change", which ShortStack will offer as a button. It has to be one of these exactly, and nothing else is accepted:',
    ...CHANGE_FORMATS,
    'The "new" lane is first postings; "rotation" is videos posted again. Their current times are above.',
    'Leave "change" out entirely when a recommendation is not one of these. Most good advice is not — "record more of the game that converts" is a real recommendation with no change attached, and inventing one to fill the field is worse than leaving it empty.',
    '',
    'Reply with only a JSON object: {"headline": string, "recommendations": [{"action": string, "basedOn": string, "change": object or omitted}]}. "headline" is one sentence summing up where this channel stands, with no numbers in it. No other text.'
  );

  return lines.join('\n');
}

export interface Recommendation {
  action: string;
  /** The id of the finding this came from. The reason shown to the user is that finding's own
   *  wording, not the model's: asked to restate a finding, it produced one percentage and put it on
   *  three unrelated recommendations, two of which it did not describe. */
  basedOn: string;
  /** Only ever one of the listed kinds, validated here. Absent for advice software cannot act on. */
  change?: ChannelAction;
}

export interface ChannelAdvice {
  headline: string;
  recommendations: Recommendation[];
}

const asText = (value: unknown, limit: number): string =>
  typeof value === 'string' ? value.replace(/[<>]/g, '').trim().slice(0, limit) : '';

/**
 * The model is asked for a shape; whether it returns one is a separate question. Anything that is
 * not a recommendation with both halves is dropped rather than shown half-empty.
 */
export function sanitizeAdvice(raw: unknown, knownFactIds: readonly string[] = []): ChannelAdvice | null {
  if (raw === null || typeof raw !== 'object') return null;
  const record = raw as { headline?: unknown; recommendations?: unknown };

  const headline = asText(record.headline, 300);
  const list = Array.isArray(record.recommendations) ? record.recommendations : [];
  const recommendations = list
    .map((entry) => {
      const item = (entry ?? {}) as { action?: unknown; basedOn?: unknown; change?: unknown };
      // Anything that is not one of the listed actions with sound parameters becomes no action at
      // all, rather than a button that does something nobody asked for.
      const change = parseAction(item.change);
      // The findings are labelled "[time-of-day]" and the model hands the label back with its
      // brackets still on. Refusing that would be punishing it for copying the formatting it was
      // shown, which is the one thing it did right.
      const basedOn = asText(item.basedOn, 60).replace(/^\[+|\]+$/g, '').trim();
      return {
        action: asText(item.action, 400),
        // A label that names no finding is no better than one the model made up.
        basedOn: knownFactIds.length === 0 || knownFactIds.includes(basedOn) ? basedOn : '',
        ...(change === null ? {} : { change })
      };
    })
    .filter((entry) => entry.action !== '' && entry.basedOn !== '')
    .slice(0, 4);

  if (headline === '' && recommendations.length === 0) return null;
  return { headline, recommendations };
}
