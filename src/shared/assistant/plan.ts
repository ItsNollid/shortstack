// What the assistant may say about the posting plan: what is waiting, the week ahead, and where the same game or
// the same long video lands back to back. Counted here from the queue, so no count is ever the model's.
import type { QueueItemDTO } from '../dto';
import type { FillPlan } from '../fillSchedule';
import { sourceKey } from '../sourceVideo';
import type { AssistantFact } from './types';

export type PlanItem = Pick<QueueItemDTO, 'id' | 'title' | 'state' | 'scheduled_for' | 'posting_kind' | 'game' | 'source_title'>;

const DAY_MS = 24 * 60 * 60_000;
const dayKey = (date: Date): string => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
const counted = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;
const are = (count: number): string => (count === 1 ? 'is' : 'are');
const listed = (words: readonly string[]): string =>
  words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1] as string}`;
const fact = (id: string, text: string): AssistantFact => ({ id, text, derived: false });

export function planFacts(items: readonly PlanItem[], fill: FillPlan | null, now: Date): AssistantFact[] {
  const waiting = items.filter((item) => item.state === 'pending').length;
  const undated = items.filter((item) => item.scheduled_for === null && item.state !== 'published' && item.state !== 'rejected').length;
  const facts: AssistantFact[] = [
    fact('plan-waiting', `${counted(waiting, 'video')} ${are(waiting)} waiting for approval.`),
    fact('plan-undated', `${counted(undated, 'video')} ${undated === 1 ? 'has' : 'have'} no publish time yet.`)
  ];

  const weekEnd = now.getTime() + 7 * DAY_MS;
  const week = items
    .filter((item) => item.scheduled_for !== null && item.state !== 'rejected')
    .filter((item) => {
      const time = Date.parse(item.scheduled_for as string);
      return time >= now.getTime() && time < weekEnd;
    })
    .sort((a, b) => Date.parse(a.scheduled_for as string) - Date.parse(b.scheduled_for as string));
  const fresh = week.filter((item) => item.posting_kind === 'new').length;
  facts.push(
    fact(
      'plan-week',
      `${counted(week.length, 'video')} ${are(week.length)} set to go out in the next seven days: ${fresh} new and ${counted(week.length - fresh, 're-run')}.`
    )
  );

  const busy = new Set(week.map((item) => dayKey(new Date(item.scheduled_for as string))));
  const empty: string[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    if (!busy.has(dayKey(day))) empty.push(day.toLocaleDateString('en-US', { weekday: 'long' }));
  }
  if (empty.length > 0) facts.push(fact('plan-empty-days', `Nothing is set to go out on ${listed(empty)}.`));

  const backToBack = (label: string, keyOf: (item: PlanItem) => string | null, id: string): void => {
    for (let index = 1; index < week.length; index += 1) {
      const before = week[index - 1] as PlanItem;
      const after = week[index] as PlanItem;
      const key = keyOf(before);
      if (key !== null && key === keyOf(after)) {
        facts.push(fact(`${id}-${index}`, `Two videos from the same ${label} go out back to back: "${before.title}" then "${after.title}".`));
      }
    }
  };
  backToBack('game', (item) => (item.game === null ? null : item.game.trim().toLowerCase()), 'plan-same-game');
  backToBack('long video', (item) => sourceKey(item.source_title), 'plan-same-source');

  const first = fill?.assignments[0];
  if (fill !== null && first !== undefined) {
    facts.push(fact('plan-fill', `Fill the calendar would give ${counted(fill.assignments.length, 'video')} a time, the first at ${first.at}.`));
  }
  return facts;
}
