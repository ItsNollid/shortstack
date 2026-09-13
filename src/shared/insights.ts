// Working out what a channel's own numbers actually say, before any model is involved.
//
// The division of labour here is the whole point. An 8B model running on a desktop cannot do
// arithmetic over a table without inventing numbers, and asking it to find a pattern in raw
// analytics produces confident nonsense. So everything measurable is measured here, in code, with
// its sample size attached — and the model is given the finished facts to phrase and prioritise,
// never the table.
//
// The second rule is that not knowing is an answer. A channel that has only ever posted at 9am
// cannot be told a better hour by anyone, and saying so is more useful than a recommendation built
// on two videos.

import { detectGame } from './games';

export interface VideoStat {
  videoId: string;
  title: string;
  description: string;
  tags: readonly string[];
  /** ISO timestamp of when it went public. */
  publishedAt: string;
  views: number;
  /** 0-100. */
  averageViewPercentage: number;
  likes: number;
  subscribersGained: number;
}

export type Confidence = 'strong' | 'weak' | 'insufficient';

export interface Fact {
  /** Stable id, so the UI and tests can name one without matching on prose. */
  id: string;
  /** What was measured, in words, with the numbers in it. Written here, not by a model. */
  statement: string;
  /** How many videos this rests on. */
  sampleSize: number;
  confidence: Confidence;
}

/** Below this, a comparison is noise. Two videos beating three others is not a finding. */
export const MIN_PER_GROUP = 3;
const STRONG_PER_GROUP = 8;
/** A difference smaller than this is not worth acting on even when the sample is large. */
const MEANINGFUL_LIFT = 0.2;

export const median = (values: readonly number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2 : (sorted[middle] as number);
};

const confidenceFor = (smallest: number): Confidence =>
  smallest < MIN_PER_GROUP ? 'insufficient' : smallest < STRONG_PER_GROUP ? 'weak' : 'strong';

export interface Group {
  key: string;
  label: string;
  videos: VideoStat[];
}

/** Median views per group, best first, with groups too small to mean anything left in and marked. */
export function rankGroups(groups: readonly Group[]): Array<{ label: string; median: number; count: number }> {
  return groups
    .map((group) => ({ label: group.label, median: median(group.videos.map((video) => video.views)), count: group.videos.length }))
    .sort((left, right) => right.median - left.median);
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Local time, because a posting schedule is set in the hours the person actually lives in. */
export const publishHour = (video: VideoStat): number => new Date(video.publishedAt).getHours();
export const publishWeekday = (video: VideoStat): number => new Date(video.publishedAt).getDay();

function groupBy(videos: readonly VideoStat[], key: (video: VideoStat) => string, label: (key: string) => string): Group[] {
  const buckets = new Map<string, VideoStat[]>();
  for (const video of videos) {
    const bucket = key(video);
    const existing = buckets.get(bucket);
    if (existing === undefined) buckets.set(bucket, [video]);
    else existing.push(video);
  }
  return [...buckets.entries()].map(([bucketKey, list]) => ({ key: bucketKey, label: label(bucketKey), videos: list }));
}

const HOUR_BANDS: ReadonlyArray<{ label: string; from: number; to: number }> = [
  { label: 'early morning (5am to 9am)', from: 5, to: 9 },
  { label: 'the morning (9am to noon)', from: 9, to: 12 },
  { label: 'the afternoon (noon to 5pm)', from: 12, to: 17 },
  { label: 'the evening (5pm to 9pm)', from: 17, to: 21 },
  { label: 'late (9pm to 1am)', from: 21, to: 25 },
  { label: 'the small hours (1am to 5am)', from: 1, to: 5 }
];

const bandFor = (hour: number): string => {
  const wrapped = hour === 0 ? 24 : hour;
  return (
    HOUR_BANDS.find((band) => (wrapped >= band.from && wrapped < band.to) || (hour >= band.from && hour < band.to))?.label ??
    'the small hours (1am to 5am)'
  );
};

/**
 * Whether the times a channel posts at differ enough to compare at all. A channel that has only
 * ever posted in one band has no evidence about any other, and no amount of analysis invents it.
 */
export function timeOfDayFact(videos: readonly VideoStat[]): Fact {
  const groups = groupBy(videos, (video) => bandFor(publishHour(video)), (key) => key).filter(
    (group) => group.videos.length >= MIN_PER_GROUP
  );

  if (groups.length < 2) {
    return {
      id: 'time-of-day',
      statement:
        groups.length === 0
          ? `There are not yet ${MIN_PER_GROUP} videos posted in any one part of the day, so nothing can be said about timing.`
          : `Everything with enough videos to judge was posted in ${groups[0]?.label}. There is nothing to compare it against, so posting at other times for a while is the only way to find out whether it matters.`,
      sampleSize: videos.length,
      confidence: 'insufficient'
    };
  }

  const ranked = rankGroups(groups);
  const best = ranked[0] as { label: string; median: number; count: number };
  const worst = ranked[ranked.length - 1] as { label: string; median: number; count: number };
  const lift = worst.median === 0 ? 0 : (best.median - worst.median) / worst.median;
  const smallest = Math.min(...groups.map((group) => group.videos.length));

  if (lift < MEANINGFUL_LIFT) {
    return {
      id: 'time-of-day',
      statement: `Posting time makes little difference so far: ${best.label} gets a median of ${Math.round(best.median)} views against ${Math.round(worst.median)} for ${worst.label}.`,
      sampleSize: videos.length,
      confidence: confidenceFor(smallest)
    };
  }

  return {
    id: 'time-of-day',
    statement: `Videos posted in ${best.label} get a median of ${Math.round(best.median)} views, against ${Math.round(worst.median)} for ${worst.label} — ${Math.round(lift * 100)}% higher, across ${best.count} and ${worst.count} videos.`,
    sampleSize: videos.length,
    confidence: confidenceFor(smallest)
  };
}

export function weekdayFact(videos: readonly VideoStat[]): Fact {
  const groups = groupBy(
    videos,
    (video) => String(publishWeekday(video)),
    (key) => WEEKDAYS[Number(key)] ?? 'an unknown day'
  ).filter((group) => group.videos.length >= MIN_PER_GROUP);

  if (groups.length < 2) {
    return {
      id: 'weekday',
      statement: `No day of the week yet has ${MIN_PER_GROUP} videos to compare against another.`,
      sampleSize: videos.length,
      confidence: 'insufficient'
    };
  }

  const ranked = rankGroups(groups);
  const best = ranked[0] as { label: string; median: number; count: number };
  const worst = ranked[ranked.length - 1] as { label: string; median: number; count: number };
  return {
    id: 'weekday',
    statement: `${best.label} is the best day so far at a median of ${Math.round(best.median)} views (${best.count} videos); ${worst.label} is the weakest at ${Math.round(worst.median)} (${worst.count} videos).`,
    sampleSize: videos.length,
    confidence: confidenceFor(Math.min(...groups.map((group) => group.videos.length)))
  };
}

const hasQuestion = (title: string): boolean => title.includes('?');
const isShouted = (title: string): boolean => {
  const letters = [...title].filter((character) => /\p{L}/u.test(character));
  if (letters.length === 0) return false;
  return letters.filter((character) => character === character.toUpperCase()).length / letters.length > 0.8;
};

/** A two-way split, reported only when both sides have enough videos to stand on. */
function splitFact(
  id: string,
  videos: readonly VideoStat[],
  predicate: (video: VideoStat) => boolean,
  yes: string,
  no: string
): Fact {
  const withIt = videos.filter(predicate);
  const without = videos.filter((video) => !predicate(video));
  const smallest = Math.min(withIt.length, without.length);

  if (smallest < MIN_PER_GROUP) {
    return {
      id,
      statement: `Not enough videos on both sides to say whether ${yes} does better than ${no} — ${withIt.length} against ${without.length}.`,
      sampleSize: videos.length,
      confidence: 'insufficient'
    };
  }

  const withMedian = median(withIt.map((video) => video.views));
  const withoutMedian = median(without.map((video) => video.views));
  const better = withMedian >= withoutMedian;
  const high = better ? withMedian : withoutMedian;
  const low = better ? withoutMedian : withMedian;
  const lift = low === 0 ? 0 : (high - low) / low;

  if (lift < MEANINGFUL_LIFT) {
    return {
      id,
      statement: `It makes no real difference whether ${yes} or ${no}: ${Math.round(withMedian)} against ${Math.round(withoutMedian)} median views.`,
      sampleSize: videos.length,
      confidence: confidenceFor(smallest)
    };
  }

  return {
    id,
    statement: `Videos where ${better ? yes : no} get a median of ${Math.round(high)} views against ${Math.round(low)} where ${better ? no : yes} — ${Math.round(lift * 100)}% higher, across ${withIt.length} and ${without.length} videos.`,
    sampleSize: videos.length,
    confidence: confidenceFor(smallest)
  };
}

export const questionTitleFact = (videos: readonly VideoStat[]): Fact =>
  splitFact('question-title', videos, (video) => hasQuestion(video.title), 'the title asks a question', 'it does not');

export const shoutedTitleFact = (videos: readonly VideoStat[]): Fact =>
  splitFact('shouted-title', videos, (video) => isShouted(video.title), 'the title is in capitals', 'it is not');

/** Retention against views, which is the question of whether the algorithm is rewarding the hook. */
export function retentionFact(videos: readonly VideoStat[]): Fact {
  const usable = videos.filter((video) => video.averageViewPercentage > 0);
  if (usable.length < MIN_PER_GROUP * 2) {
    return {
      id: 'retention',
      statement: `Only ${usable.length} videos have retention figures, which is too few to compare.`,
      sampleSize: usable.length,
      confidence: 'insufficient'
    };
  }

  const sorted = [...usable].sort((left, right) => right.averageViewPercentage - left.averageViewPercentage);
  const half = Math.floor(sorted.length / 2);
  const topHalf = sorted.slice(0, half);
  const bottomHalf = sorted.slice(half);
  const topViews = median(topHalf.map((video) => video.views));
  const bottomViews = median(bottomHalf.map((video) => video.views));
  const topRetention = median(topHalf.map((video) => video.averageViewPercentage));
  const bottomRetention = median(bottomHalf.map((video) => video.averageViewPercentage));

  return {
    id: 'retention',
    statement: `The half of videos people watch furthest through (median ${topRetention.toFixed(0)}%) get ${Math.round(topViews)} views; the half they drop out of soonest (median ${bottomRetention.toFixed(0)}%) get ${Math.round(bottomViews)}.`,
    sampleSize: usable.length,
    confidence: confidenceFor(half)
  };
}

/** Which hashtags show up on the videos that did well, and which only on the ones that did not. */
export function tagFact(videos: readonly VideoStat[], topFraction = 0.25): Fact {
  if (videos.length < MIN_PER_GROUP * 2) {
    return {
      id: 'tags',
      statement: `Too few videos to tell which topics do better — ${videos.length} so far.`,
      sampleSize: videos.length,
      confidence: 'insufficient'
    };
  }

  const sorted = [...videos].sort((left, right) => right.views - left.views);
  const cut = Math.max(1, Math.round(sorted.length * topFraction));
  const top = sorted.slice(0, cut);
  const rest = sorted.slice(cut);

  const share = (group: readonly VideoStat[], tag: string): number =>
    group.length === 0 ? 0 : group.filter((video) => video.tags.some((each) => each.toLowerCase() === tag)).length / group.length;

  const allTags = new Set(videos.flatMap((video) => video.tags.map((tag) => tag.toLowerCase())));
  const standouts = [...allTags]
    .map((tag) => ({ tag, lift: share(top, tag) - share(rest, tag), uses: videos.filter((video) => video.tags.some((each) => each.toLowerCase() === tag)).length }))
    .filter((entry) => entry.uses >= MIN_PER_GROUP && entry.lift > 0.2)
    .sort((left, right) => right.lift - left.lift)
    .slice(0, 3);

  if (standouts.length === 0) {
    return {
      id: 'tags',
      statement: 'No topic stands out as doing better than the rest yet.',
      sampleSize: videos.length,
      confidence: confidenceFor(cut)
    };
  }

  return {
    id: 'tags',
    statement: `These appear far more often on the best videos than the rest: ${standouts.map((entry) => `${entry.tag} (on ${Math.round(entry.lift * 100)}% more of them)`).join(', ')}.`,
    sampleSize: videos.length,
    confidence: confidenceFor(cut)
  };
}

/**
 * Subscribers per thousand views. Reach and conversion are different questions, and a video can
 * answer one well and the other not at all: something that travels a long way on the Shorts feed and
 * turns nobody into a subscriber is a different problem from one nobody sees.
 */
export const subscribersPerThousand = (video: VideoStat): number =>
  video.views === 0 ? 0 : (video.subscribersGained / video.views) * 1000;

/** Which game does best — the largest lever there is, because it decides what gets recorded next. */
export function gameFact(videos: readonly VideoStat[]): Fact {
  const byGame = new Map<string, VideoStat[]>();
  let identified = 0;

  for (const video of videos) {
    const game = detectGame({ title: video.title, description: video.description, tags: video.tags });
    if (game === null) continue;
    identified += 1;
    const existing = byGame.get(game);
    if (existing === undefined) byGame.set(game, [video]);
    else existing.push(video);
  }

  const usable = [...byGame.entries()].filter(([, list]) => list.length >= MIN_PER_GROUP);
  if (usable.length < 2) {
    return {
      id: 'game',
      statement:
        usable.length === 0
          ? `No game yet has ${MIN_PER_GROUP} videos that can be identified from their titles and tags.`
          : `Only ${usable[0]?.[0]} has enough videos to judge, so there is nothing to compare it against yet.`,
      sampleSize: identified,
      confidence: 'insufficient'
    };
  }

  const ranked = usable
    .map(([game, list]) => ({
      game,
      views: median(list.map((video) => video.views)),
      subs: median(list.map(subscribersPerThousand)),
      count: list.length
    }))
    .sort((left, right) => right.views - left.views);

  const best = ranked[0] as (typeof ranked)[number];
  const worst = ranked[ranked.length - 1] as (typeof ranked)[number];
  const bestForSubs = [...ranked].sort((left, right) => right.subs - left.subs)[0] as (typeof ranked)[number];

  // Reach and subscribers are different questions, and the answer is often a different game.
  const reach = `${best.game} gets the most views: a median of ${Math.round(best.views)} across ${best.count} videos, against ${Math.round(worst.views)} for ${worst.game}.`;
  const subs =
    bestForSubs.game === best.game
      ? ` It also brings the most subscribers, at ${bestForSubs.subs.toFixed(1)} per thousand views.`
      : ` But ${bestForSubs.game} brings more subscribers per view: ${bestForSubs.subs.toFixed(1)} per thousand against ${best.subs.toFixed(1)}.`;

  return {
    id: 'game',
    statement: reach + subs,
    sampleSize: identified,
    confidence: confidenceFor(Math.min(...usable.map(([, list]) => list.length)))
  };
}

/** What a view is worth in subscribers, and whether the videos that travel furthest convert. */
export function conversionFact(videos: readonly VideoStat[]): Fact {
  const usable = videos.filter((video) => video.views > 0);
  if (usable.length < MIN_PER_GROUP * 2) {
    return {
      id: 'conversion',
      statement: `Too few videos with views to say what turns people into subscribers — ${usable.length} so far.`,
      sampleSize: usable.length,
      confidence: 'insufficient'
    };
  }

  const sorted = [...usable].sort((left, right) => right.views - left.views);
  const half = Math.floor(sorted.length / 2);
  const mostSeen = median(sorted.slice(0, half).map(subscribersPerThousand));
  const leastSeen = median(sorted.slice(half).map(subscribersPerThousand));
  const overall = median(usable.map(subscribersPerThousand));

  const note =
    mostSeen < leastSeen * 0.8
      ? ' The ones that travel furthest convert worst, which is what reaching strangers looks like.'
      : mostSeen > leastSeen * 1.25
        ? ' The ones that travel furthest also convert best.'
        : '';

  return {
    id: 'conversion',
    statement: `A video earns ${overall.toFixed(1)} subscribers per thousand views.${note}`,
    sampleSize: usable.length,
    confidence: confidenceFor(half)
  };
}

/** Whether posting closer together or further apart goes with doing better. */
export function cadenceFact(videos: readonly VideoStat[]): Fact {
  const sorted = [...videos]
    .filter((video) => !Number.isNaN(Date.parse(video.publishedAt)))
    .sort((left, right) => Date.parse(left.publishedAt) - Date.parse(right.publishedAt));

  if (sorted.length < MIN_PER_GROUP * 2 + 1) {
    return {
      id: 'cadence',
      statement: 'Not enough uploads yet to say whether posting closer together or further apart matters.',
      sampleSize: sorted.length,
      confidence: 'insufficient'
    };
  }

  const gaps = sorted.slice(1).map((video, index) => ({
    video,
    hours: (Date.parse(video.publishedAt) - Date.parse((sorted[index] as VideoStat).publishedAt)) / 3_600_000
  }));
  // Split by rank, not by value. Someone who uploads a batch and then goes quiet has gaps clustered
  // at two numbers, and a split on the median value puts every one of them on the same side.
  const byGap = [...gaps].sort((left, right) => left.hours - right.hours);
  const half = Math.floor(byGap.length / 2);
  const shortest = byGap.slice(0, half);
  const longest = byGap.slice(byGap.length - half);
  const shortestHours = median(shortest.map((gap) => gap.hours));
  const longestHours = median(longest.map((gap) => gap.hours));

  // Evenly spaced uploads have nothing to compare: both halves are the same gap.
  if (half < MIN_PER_GROUP || longestHours <= shortestHours * 1.5) {
    return {
      id: 'cadence',
      statement: 'Uploads are too evenly spaced to compare a short gap against a long one.',
      sampleSize: sorted.length,
      confidence: 'insufficient'
    };
  }

  const soonAfter = shortest.map((gap) => gap.video);
  const longAfter = longest.map((gap) => gap.video);

  const soonViews = median(soonAfter.map((video) => video.views));
  const longViews = median(longAfter.map((video) => video.views));
  const smaller = Math.min(soonViews, longViews);
  const lift = smaller === 0 ? 0 : Math.abs(soonViews - longViews) / smaller;

  if (lift < MEANINGFUL_LIFT) {
    return {
      id: 'cadence',
      statement: `How long you leave between uploads makes little difference: ${Math.round(soonViews)} views after a short gap against ${Math.round(longViews)} after a long one.`,
      sampleSize: sorted.length,
      confidence: confidenceFor(Math.min(soonAfter.length, longAfter.length))
    };
  }

  return {
    id: 'cadence',
    statement: `Videos posted ${soonViews > longViews ? 'sooner' : 'later'} after the previous one do better: ${Math.round(Math.max(soonViews, longViews))} views against ${Math.round(smaller)}, split at a gap of ${Math.round(shortestHours)} hours against ${Math.round(longestHours)}.`,
    sampleSize: sorted.length,
    confidence: confidenceFor(Math.min(soonAfter.length, longAfter.length))
  };
}

/** Everything measurable, in the order a person would want to read it. */
export function allFacts(videos: readonly VideoStat[]): Fact[] {
  return [
    gameFact(videos),
    conversionFact(videos),
    timeOfDayFact(videos),
    weekdayFact(videos),
    retentionFact(videos),
    cadenceFact(videos),
    questionTitleFact(videos),
    shoutedTitleFact(videos),
    tagFact(videos)
  ];
}

/** What to hand a model: the findings worth acting on, and an honest count of what is missing. */
export interface Brief {
  usable: Fact[];
  missing: Fact[];
  videoCount: number;
  /** True when there is so little to go on that advice would be invention. */
  tooEarly: boolean;
}

export function buildBrief(videos: readonly VideoStat[]): Brief {
  const facts = allFacts(videos);
  const usable = facts.filter((fact) => fact.confidence !== 'insufficient');
  return {
    usable,
    missing: facts.filter((fact) => fact.confidence === 'insufficient'),
    videoCount: videos.length,
    tooEarly: usable.length === 0
  };
}
