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
import { GOAL_WORDS, type InsightGoal } from '../../shared/insightGoal';
import type { Brief } from '../../shared/insights';

export interface InsightPromptInput {
  brief: Brief;
  channelName: string | null;
  /** What the person is trying to grow, which decides what "better" means. */
  goal: InsightGoal;
  /** How they post, so advice is about what they can actually change. */
  context?: string;
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
      lines.push(`- ${fact.statement}${strength}`);
    }
  }

  if (input.brief.missing.length > 0) {
    lines.push('', 'These could not be measured yet:');
    for (const fact of input.brief.missing) lines.push(`- ${fact.statement}`);
  }

  if (input.context !== undefined && input.context.trim() !== '') {
    lines.push('', 'How they work:', input.context.trim());
  }

  lines.push(
    '',
    `Based on ${input.brief.videoCount} videos.`,
    '',
    '--- What to write ---',
    'Write at most four recommendations. Each one is a thing to do differently, in one or two sentences, and each must point back to one of the findings above.',
    'Where a finding is missing, the recommendation is how to find it out — usually by deliberately varying one thing for a few weeks so there is something to compare.',
    'Do not invent numbers. Do not state any fact that is not above. If a finding says something makes little difference, do not recommend doing it.',
    'Do not give generic YouTube advice. "Post consistently" and "make good thumbnails" are true of every channel and help nobody.',
    'If there is too little to go on, say so in one sentence and recommend only what would produce the missing evidence.',
    '',
    'Reply with only a JSON object: {"headline": string, "recommendations": [{"action": string, "because": string}]}. "headline" is one sentence summing up where this channel stands. No other text.'
  );

  return lines.join('\n');
}

export interface Recommendation {
  action: string;
  because: string;
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
export function sanitizeAdvice(raw: unknown): ChannelAdvice | null {
  if (raw === null || typeof raw !== 'object') return null;
  const record = raw as { headline?: unknown; recommendations?: unknown };

  const headline = asText(record.headline, 300);
  const list = Array.isArray(record.recommendations) ? record.recommendations : [];
  const recommendations = list
    .map((entry) => {
      const item = (entry ?? {}) as { action?: unknown; because?: unknown };
      return { action: asText(item.action, 400), because: asText(item.because, 400) };
    })
    .filter((entry) => entry.action !== '' && entry.because !== '')
    .slice(0, 4);

  if (headline === '' && recommendations.length === 0) return null;
  return { headline, recommendations };
}
