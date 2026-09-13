// What a channel is being grown for. It decides what "better" means in every comparison, so it is
// a setting rather than an assumption: a channel chasing reach and one chasing subscribers should
// be told different things about the same numbers.

export type InsightGoal = 'reach_and_subscribers' | 'views' | 'subscribers' | 'watch_time';

export const GOAL_LABELS: Record<InsightGoal, string> = {
  reach_and_subscribers: 'Reach and subscribers',
  views: 'Reach as many people as possible',
  subscribers: 'Turn viewers into subscribers',
  watch_time: 'Keep people watching longer'
};

/** How the goal is put to the model, in the second person it is writing for. */
export const GOAL_WORDS: Record<InsightGoal, string> = {
  reach_and_subscribers:
    'reaching as many new people as possible, and turning enough of them into subscribers to be worth it — both, and they often pull in different directions',
  views: 'reaching as many people as possible',
  subscribers: 'turning viewers into subscribers',
  watch_time: 'keeping people watching for longer'
};
