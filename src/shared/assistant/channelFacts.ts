// What the assistant may say about the channel as a whole: the findings Analytics saved, as written, and how old
// they are. Nothing here is worked out afresh; the findings were worked out when Analytics last pulled.
import type { Brief } from '../insights';
import type { AssistantFact } from './types';

/** Past this, findings are said to be old. A week of posting can move them. */
export const STALE_AFTER_MS = 7 * 24 * 60 * 60_000;

export function channelFacts(brief: Brief | null, now: Date): AssistantFact[] {
  if (brief === null) {
    return [{ id: 'channel-none', text: 'Nothing has been measured about this channel yet: Analytics has not been refreshed.', derived: false }];
  }

  const facts: AssistantFact[] = [];
  const age = brief.madeAt === undefined ? Number.NaN : now.getTime() - Date.parse(brief.madeAt);
  // Findings without a date were saved before dates were kept, so they are at least that old.
  if (!Number.isFinite(age) || age > STALE_AFTER_MS) {
    facts.push({
      id: 'channel-stale',
      text: 'These findings are more than a week old; refreshing Analytics would bring them up to date.',
      derived: false
    });
  }
  if (brief.tooEarly) {
    facts.push({
      id: 'channel-too-early',
      text: `There is too little to go on yet: only ${brief.videoCount} videos, and nothing stands out among them.`,
      derived: false
    });
  }
  for (const finding of brief.usable) {
    const strength = finding.confidence === 'weak' ? 'a weak finding, from few videos' : 'a strong finding';
    facts.push({
      id: `finding:${finding.id}`,
      text: `${finding.statement} (${strength}, across ${finding.sampleSize} videos)`,
      derived: true
    });
  }
  for (const finding of brief.missing) {
    facts.push({ id: `missing:${finding.id}`, text: `Not measured yet: ${finding.statement}`, derived: false });
  }
  return facts;
}
